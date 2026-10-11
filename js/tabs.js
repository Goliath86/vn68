function switchTab(name) {
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === name));

  document
    .querySelectorAll(".tab-pane")
    .forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

function collapseSheet() {
  document.body.classList.add("sheet-collapsed");
  resizeCanvas();
}

function expandSheet() {
  document.body.classList.remove("sheet-collapsed");
  resizeCanvas();
}

document
  .getElementById("btn-collapse-sheet")
  .addEventListener("click", collapseSheet);

document.getElementById("qb-expand").addEventListener("click", expandSheet);

document
  .getElementById("sheet-handle")
  .addEventListener("click", collapseSheet);

// Bottoni quick bar → delegano ai corrispondenti desktop
["move", "attack", "special", "rotate", "stance", "reload", "endturn"].forEach((action) => {
  document.getElementById("qb-" + action).addEventListener("click", () => {
    document.getElementById("btn-" + action).click();
  });
});

// Quick weapons bar (mobile, sheet collassata): scelta arma dopo "Attacca" e conferma AoE.
// La visibilità effettiva è gestita da CSS (body.sheet-collapsed + .active + media query)
function updateQuickWeaponsBar(u) {
  const bar = document.getElementById("quick-weapons-bar");
  if (!bar) return;

  const cancelBtn = `<button class="btn qwb-btn qwb-cancel" data-qwb="cancel">✕</button>`;
  let html = "";

  if (G.actionMode === "weapon_select" && u) {
    (u.weapons || []).forEach((w, i) => {
      const hasAmmo = weaponUsable(u, w);
      const ammoStr = weaponAmmoLabel(w);
      const aoeStr = w.aoe ? ` · AoE${w.aoe}` : "";
      html += `<button class="btn qwb-btn" ${!hasAmmo ? "disabled" : ""} data-widx="${i}">
<span class="qwb-name">${w.label} ${ammoStr}</span>
<span class="qwb-stats">ATK${w.atk} · RNG${w.range}${aoeStr} · 🔊${weaponNoise(u, w)}</span>
</button>`;
    });
    html += cancelBtn;
  } else if (G.actionMode === "stance" && u) {
    const cur = u.stance || "stand";
    STANCE_ORDER.forEach((s) => {
      html += `<button class="btn qwb-btn" ${s === cur ? "disabled" : ""} data-stance="${s}">
<span class="qwb-name">${STANCE_ICONS[s]} ${t(`stances.${s}`)}</span>
<span class="qwb-stats">${stanceSummary(s)}</span>
</button>`;
    });
    html += cancelBtn;
  } else if (G.actionMode === "aoe_confirm" && G.pendingAoe) {
    const w = G.pendingAoe.weapon;
    html = `<button class="btn btn-attack qwb-btn" data-qwb="confirm">
<span class="qwb-name">${t("weapons.confirm_aoe")}</span>
<span class="qwb-stats">${w.label} · AoE ${w.aoe}</span>
</button>${cancelBtn}`;
  }

  bar.innerHTML = html;
  bar.classList.toggle("active", html !== "");
  // Classe sul body: il CSS riserva lo spazio della barra sotto al canvas
  const wasActive = document.body.classList.contains("qwb-active");
  document.body.classList.toggle("qwb-active", html !== "");
  if (wasActive !== (html !== "")) resizeCanvas();
  if (!html) return;

  bar.querySelectorAll("[data-widx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const w = G.selectedUnit?.weapons?.[+btn.dataset.widx];
      if (w) {
        sfx("click");
        setActionMode("attack", w);
      }
    });
  });
  bindStanceButtons(bar);
  bar.querySelector('[data-qwb="confirm"]')?.addEventListener("click", () => {
    sfx("click");
    confirmAoeAttack();
  });
  bar.querySelector('[data-qwb="cancel"]')?.addEventListener("click", () => {
    sfx("click");
    setActionMode(null);
    updateUI();
  });
}

// Modificatori di una postura in breve, es. "ATK+1 · DEF+1 · VIS−1 · MOV+1AP"
function stanceSummary(stance) {
  const s = STANCES[stance];
  const parts = [];
  if (s.atk) parts.push(`ATK+${s.atk}`);
  if (s.def) parts.push(`DEF+${s.def}`);
  if (s.vision) parts.push(`VIS−${s.vision}`);
  if (s.crawl) parts.push(t("stances.crawl"));
  else if (s.moveExtra) parts.push(`MOV+${s.moveExtra}AP`);
  return parts.length ? parts.join(" · ") : t("stances.no_mods");
}

function bindStanceButtons(root) {
  root.querySelectorAll("[data-stance]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      changeStance(G.selectedUnit, btn.dataset.stance);
    });
  });
}

function updateActionButtons() {
  const u = G.selectedUnit;
  const isPlayer = G.phase === "player";
  const hasUnit = u && u.alive;
  const hasAP = hasUnit && u.ap > 0;
  const hasEnemy = G.enemies.some((e) => e.alive);

  const specLabel = hasUnit
    ? t("buttons.special_with_label", {
        label: UNIT_CLASSES[u.cls].specialLabel,
      })
    : t("buttons.special");

  const hasMM = G.actionMode === "move";

  const hasAM = G.actionMode === "attack";

  const hasSM = G.actionMode === "special";

  const hasRM = G.actionMode === "rotate";

  // Aggiorna sia i controlli desktop che mobile in un colpo
  const pairs = [
    ["btn-move", "mob-btn-move"],
    ["btn-attack", "mob-btn-attack"],
    ["btn-special", "mob-btn-special"],
    ["btn-rotate", "mob-btn-rotate"],
    ["btn-stance", "mob-btn-stance"],
    ["btn-reload", "mob-btn-reload"],
    ["btn-endturn", "mob-btn-endturn"],
    //["btn-dice", "mob-btn-dice"],
  ];

  pairs.forEach(([did, mid]) => {
    [did, mid].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      if (id.includes("move")) {
        el.disabled = !(isPlayer && hasAP);
        el.style.borderColor = hasMM ? "var(--highlight)" : "";
      }

      if (id.includes("attack")) {
        const inPick =
          G.actionMode === "weapon_select" || G.actionMode === "aoe_confirm";
        el.disabled =
          !(isPlayer && hasAP && hasEnemy && canAttack(u)) || inPick;
        el.style.borderColor =
          hasAM || G.actionMode === "weapon_select" ? "var(--highlight)" : "";
      }

      if (id.includes("special")) {
        el.disabled = !(
          isPlayer &&
          hasAP &&
          !u?.specialUsed &&
          !u?.shaken &&
          !specialBlockedByAmmo(u)
        );
        el.style.borderColor = hasSM ? "var(--highlight)" : "";
        el.textContent = specLabel;
      }

      // Rotazione: gratuita (anche a 0 AP), una volta per turno
      if (id.includes("rotate")) {
        el.disabled = !(isPlayer && hasUnit && !u.rotated);
        el.style.borderColor = hasRM ? "var(--highlight)" : "";
      }

      // Ricarica: arma con caricatore non pieno e riserva; evidenziata se scarica
      if (id.includes("reload")) {
        const rw = hasUnit ? reloadableWeapon(u) : null;
        el.disabled =
          !canReload(u) ||
          G.actionMode === "weapon_select" ||
          G.actionMode === "aoe_confirm";
        el.style.borderColor =
          rw && weaponEmpty(rw) && !el.disabled ? "var(--red)" : "";
        el.textContent = rw
          ? t("buttons.reload_with", { ap: weaponReloadAp(rw) })
          : t("buttons.reload");
      }

      // Postura: primo cambio del turno gratuito, poi 1 AP
      if (id.includes("stance")) {
        const cur = (hasUnit && u.stance) || "stand";
        el.disabled =
          !canChangeStance(u) ||
          G.actionMode === "weapon_select" ||
          G.actionMode === "aoe_confirm";
        el.style.borderColor =
          G.actionMode === "stance" ? "var(--highlight)" : "";
        el.textContent = t("buttons.stance_with", {
          icon: STANCE_ICONS[cur],
          label: t(`stances.${cur}`),
        });
      }

      if (id.includes("endturn")) {
        el.disabled =
          !isPlayer || !!G.pendingDice || G.actionMode === "aoe_confirm";
      }

      if (id.includes("dice")) {
        el.disabled = !isPlayer;
      }
    });
  });

  ["btn-undo", "mob-btn-undo"].forEach((id) => {
    const el = document.getElementById(id);
    if (el)
      el.disabled =
        !canUndoMove() ||
        G.actionMode === "weapon_select" ||
        G.actionMode === "aoe_confirm";
  });

  // Sync disabled state ai bottoni della quick bar
  [
    ["btn-move", "qb-move"],
    ["btn-attack", "qb-attack"],
    ["btn-special", "qb-special"],
    ["btn-rotate", "qb-rotate"],
    ["btn-stance", "qb-stance"],
    ["btn-reload", "qb-reload"],
    ["btn-endturn", "qb-endturn"],
  ].forEach(([src, dst]) => {
    const s = document.getElementById(src),
      d = document.getElementById(dst);
    if (s && d) d.disabled = s.disabled;
  });
  const qbStanceIcon = document.getElementById("qb-stance-icon");
  if (qbStanceIcon)
    qbStanceIcon.textContent = STANCE_ICONS[(hasUnit && u.stance) || "stand"];

  updateQuickWeaponsBar(hasUnit ? u : null);

  // Weapon picker e AoE confirm
  const pickerEl = document.getElementById("weapon-picker");
  const mobPickerEl = document.getElementById("mob-weapon-picker");
  if (!pickerEl) return;

  if (G.actionMode === "weapon_select" && hasUnit) {
    const ws = u.weapons || [];
    let html = `<div style="font-size:10px;color:var(--paper-dark);margin-bottom:3px">${t("weapons.pick_prompt")}</div>`;
    ws.forEach((w, i) => {
      const hasAmmo = weaponUsable(u, w);
      const ammoStr = weaponAmmoLabel(w);
      const aoeStr = w.aoe ? ` · AoE${w.aoe}` : "";
      html += `<button class="btn btn-weapon" ${!hasAmmo ? "disabled" : ""} data-widx="${i}">${w.label} ${ammoStr} · ATK${w.atk} · RNG${w.range}${aoeStr} · 🔊${weaponNoise(u, w)}</button>`;
    });
    [pickerEl, mobPickerEl].forEach((el) => {
      if (!el) return;
      el.innerHTML = html;
      el.style.display = "flex";
      el.querySelectorAll("[data-widx]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (btn.disabled) return;
          const w = G.selectedUnit?.weapons?.[+btn.dataset.widx];
          if (w) {
            sfx("click");
            setActionMode("attack", w);
            //updateUI();
          }
        });
      });
    });
  } else if (G.actionMode === "stance" && hasUnit) {
    const cur = u.stance || "stand";
    const cost = stanceChangeCost(u);
    let html = `<div style="font-size:10px;color:var(--paper-dark);margin-bottom:3px">${t(
      "stances.pick_prompt",
      { cost: cost ? t("stances.cost_ap", { n: cost }) : t("stances.cost_free") },
    )}</div>`;
    STANCE_ORDER.forEach((s) => {
      html += `<button class="btn btn-weapon" ${s === cur ? "disabled" : ""} data-stance="${s}">${STANCE_ICONS[s]} ${t(`stances.${s}`)} · ${stanceSummary(s)}</button>`;
    });
    [pickerEl, mobPickerEl].forEach((el) => {
      if (!el) return;
      el.innerHTML = html;
      el.style.display = "flex";
      bindStanceButtons(el);
    });
  } else if (G.actionMode === "aoe_confirm" && G.pendingAoe) {
    const w = G.pendingAoe.weapon;
    const html = `<div style="font-size:10px;color:#ffaa33;margin-bottom:3px">${w.label} · AoE ${w.aoe}</div>
<button class="btn btn-attack" data-aoe="confirm">${t("weapons.confirm_aoe")}</button>
<button class="btn" data-aoe="cancel">${t("weapons.cancel_aoe")}</button>`;
    [pickerEl, mobPickerEl].forEach((el) => {
      if (!el) return;
      el.innerHTML = html;
      el.style.display = "flex";
      el.querySelector('[data-aoe="confirm"]')?.addEventListener(
        "click",
        () => {
          sfx("click");
          confirmAoeAttack();
        },
      );
      el.querySelector('[data-aoe="cancel"]')?.addEventListener("click", () => {
        sfx("click");
        setActionMode(null);
        updateUI();
      });
    });
  } else {
    [pickerEl, mobPickerEl].forEach((el) => {
      if (!el) return;
      el.innerHTML = "";
      el.style.display = "none";
    });
  }
}
