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

// Bottoni quick bar (e menu ⋯) → delegano ai corrispondenti desktop
["move", "special", "rotate", "stance", "endturn", "firstaid", "undo"].forEach(
  (action) => {
    document.getElementById("qb-" + action).addEventListener("click", () => {
      document.getElementById("btn-" + action).click();
    });
  },
);

// Menu ⋯: azioni meno frequenti in una fila sopra la quick bar. Si chiude
// dopo una scelta o toccando altrove
function setQuickMoreOpen(open) {
  document.body.classList.toggle("qb-more-open", open);
  document.getElementById("qb-more").classList.toggle("active", open);
}

document.getElementById("qb-more").addEventListener("click", () => {
  sfx("click");
  setQuickMoreOpen(!document.body.classList.contains("qb-more-open"));
});

document.getElementById("qb-more-menu").addEventListener("click", (e) => {
  if (e.target.closest("button")) setQuickMoreOpen(false);
});

document.addEventListener("click", (e) => {
  if (!document.body.classList.contains("qb-more-open")) return;
  if (e.target.closest("#qb-more, #qb-more-menu")) return;
  setQuickMoreOpen(false);
});

// Quick bar Attacca: a pannello chiuso le schede armi non si vedono, quindi
// con più armi utilizzabili si apre il selettore della quick weapons bar.
// Se nessuna arma può sparare ma una è da ricaricare, il bottone ricarica
// (come le schede armi scariche)
document.getElementById("qb-attack").addEventListener("click", () => {
  const u = G.selectedUnit;
  if (attackSlotReloads(u)) {
    reloadWeapon(u);
    return;
  }
  if (!u || u.ap < 1 || !canAttack(u)) return;
  sfx("click");
  const usable = (u.weapons || []).filter((w) => weaponUsable(u, w));
  if (usable.length > 1) setActionMode("weapon_select");
  else setActionMode("attack", usable[0] ?? null);
});

document.getElementById("qb-reload").addEventListener("click", () => {
  const u = G.selectedUnit;
  if (canReload(u)) reloadWeapon(u);
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
      const aoeStr = weaponAreaTag(w);
      html += `<button class="btn qwb-btn" ${!hasAmmo ? "disabled" : ""} data-widx="${i}">
<span class="qwb-name">${weaponLabel(w)} ${ammoStr}</span>
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
<span class="qwb-stats">${weaponLabel(w)}${weaponAreaTag(w)} · ${aoeSummaryText()}</span>
</button>${cancelBtn}`;
  } else if (G.actionMode === "attack" && G.currentWeapon?.napalm) {
    html = `<span class="qwb-stats" style="align-self:center">${napalmPromptText()}</span>${cancelBtn}`;
  } else if (aimedOdds(u)) {
    const o = aimedOdds(u);
    html = `<button class="btn btn-attack qwb-btn" data-qwb="fire">
<span class="qwb-name" style="color:${oddsColor(o.pHit)}">${t("odds.fire")} · ${oddsSummaryText(o)}</span>
<span class="qwb-stats">${oddsBreakdownText(o.b)}</span>
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
  bar.querySelector('[data-qwb="fire"]')?.addEventListener("click", () => {
    if (G.aimTarget) fireAtTarget(G.aimTarget);
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

// Schede armi dell'unità selezionata (desktop e pannello mobile): click =
// attacca con quell'arma; un'arma scarica con riserva diventa "Ricarica"
function weaponBarHTML(u, withKeys) {
  if (!u?.alive || !u.weapons?.length) return "";
  const isPlayer = G.phase === "player";
  const hasEnemy = G.enemies.some((e) => e.alive);
  const inPick =
    G.actionMode === "weapon_select" || G.actionMode === "aoe_confirm";
  return u.weapons
    .map((w, i) => {
      const empty = weaponEmpty(w);
      const reload = empty && weaponNeedsReload(w);
      const enabled = reload
        ? canReload(u, w) && !inPick
        : isPlayer && u.ap > 0 && hasEnemy && weaponUsable(u, w) && !inPick;
      const active =
        (G.actionMode === "attack" || G.actionMode === "aoe_confirm") &&
        (G.currentWeapon === w || G.pendingAoe?.weapon === w);
      const stats = reload
        ? t("buttons.reload_with", { ap: weaponReloadAp(w) })
        : `ATK${w.atk} · RNG${w.range}${weaponAreaTag(w)} · 🔊${weaponNoise(u, w)}`;
      const cls = `btn weapon-card${active ? " active" : ""}${empty ? " empty" : ""}`;
      const key = withKeys && i < 9 ? ` data-key="${i + 1}"` : "";
      return `<button class="${cls}" data-wcard="${i}"${key} ${enabled ? "" : "disabled"}>
<span class="wc-top"><span class="wc-name">${weaponLabel(w)}</span><span class="wc-ammo">${weaponAmmoLabel(w)}</span></span>
<span class="wc-stats">${stats}</span>
</button>`;
    })
    .join("");
}

function renderWeaponBars(u) {
  [
    ["weapon-bar", true],
    ["mob-weapon-bar", false],
  ].forEach(([id, withKeys]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = weaponBarHTML(u, withKeys);
    el.querySelectorAll("[data-wcard]").forEach((btn) =>
      btn.addEventListener("click", () => weaponCardAction(+btn.dataset.wcard)),
    );
  });
}

// Azioni secondarie a icone: visibili solo se disponibili. Ogni voce:
// [id senza prefisso, disponibile, titolo, evidenziata, icona]
function updateIconActions(u, hasUnit, isPlayer, inPick) {
  const cur = (hasUnit && u.stance) || "stand";
  const stanceCost = hasUnit ? stanceChangeCost(u) : 0;
  const acts = [
    ["rotate", isPlayer && hasUnit && !u.rotated, t("buttons.rotate"), G.actionMode === "rotate", "⟳"],
    [
      "stance",
      canChangeStance(u),
      `${t("buttons.stance_with", { icon: STANCE_ICONS[cur], label: t(`stances.${cur}`) })} (${
        stanceCost ? t("stances.cost_ap", { n: stanceCost }) : t("stances.cost_free")
      })`,
      G.actionMode === "stance",
      STANCE_ICONS[cur],
    ],
    ["firstaid", canFirstAid(u), t("buttons.first_aid"), false, "🩹"],
    ["undo", canUndoMove(), t("buttons.undo_move"), false, "↶"],
  ];
  [
    ["btn-", "icon-actions", true],
    ["mob-btn-", "mob-icon-actions", false],
  ].forEach(([prefix, rowId, desktop]) => {
    let any = false;
    for (const [id, avail, title, hl, icon] of acts) {
      const el = document.getElementById(prefix + id);
      if (!el) continue;
      el.style.display = avail ? "" : "none";
      el.disabled = !avail || inPick;
      el.style.borderColor = hl ? "var(--highlight)" : "";
      el.title = desktop && el.dataset.key ? `${title} [${el.dataset.key}]` : title;
      const ic = el.querySelector(".ic");
      if (ic) ic.textContent = icon;
      if (avail) any = true;
    }
    const row = document.getElementById(rowId);
    if (row) row.style.display = any ? "" : "none";
  });
}

// Il bottone Attacca della quick bar diventa Ricarica quando l'unità non ha
// armi che possano sparare ma può ricaricarne una
function attackSlotReloads(u) {
  return !!u?.alive && !canAttack(u) && canReload(u);
}

function updateQuickAttackSlot(u, inPick) {
  const btn = document.getElementById("qb-attack");
  if (!btn) return;
  const reload = attackSlotReloads(u) && !inPick;
  if (reload) btn.disabled = false;
  btn.querySelector(".qb-icon").textContent = reload ? "🔄" : "🎯";
  const label = btn.querySelector(".qb-label");
  label.dataset.i18n = reload ? "buttons.reload_mobile" : "buttons.attack_mobile";
  label.textContent = t(label.dataset.i18n);
}

// Menu ⋯: mostra solo le azioni disponibili; ⋯ disabilitato se non ce n'è
// nessuna e segnalato da un pallino quando c'è un'arma da ricaricare
function updateQuickMoreMenu(u, inPick) {
  const reloadOnAttack = attackSlotReloads(u);
  const items = [
    ["stance", canChangeStance(u)],
    ["reload", !!u && canReload(u) && !reloadOnAttack],
    ["firstaid", canFirstAid(u)],
    ["undo", canUndoMove()],
  ];
  let any = false;
  for (const [id, avail] of items) {
    const el = document.getElementById("qb-" + id);
    if (!el) continue;
    el.style.display = avail ? "" : "none";
    el.disabled = !avail || inPick;
    if (avail) any = true;
  }
  const stanceIcon = document.getElementById("qb-stance-icon");
  if (stanceIcon) stanceIcon.textContent = STANCE_ICONS[u?.stance || "stand"];

  const more = document.getElementById("qb-more");
  more.disabled = !any || inPick;
  more.classList.toggle(
    "qb-badge",
    !!u && canReload(u) && !reloadOnAttack && !more.disabled,
  );
  // Un selettore (armi, postura, AoE) occupa lo stesso spazio: chiude il menu
  if (more.disabled || G.actionMode === "stance") setQuickMoreOpen(false);
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

  const inPick =
    G.actionMode === "weapon_select" || G.actionMode === "aoe_confirm";
  const atkWeapon = hasUnit ? defaultAttackWeapon(u) : null;

  // Aggiorna sia i controlli desktop che mobile in un colpo
  const pairs = [
    ["btn-move", "mob-btn-move"],
    ["btn-attack", "mob-btn-attack"],
    ["btn-special", "mob-btn-special"],
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

      // Attacca: con l'arma predefinita, il cui nome compare sul bottone
      if (id.includes("attack")) {
        el.disabled =
          !(isPlayer && hasAP && hasEnemy && canAttack(u)) || inPick;
        el.style.borderColor =
          (hasAM && G.currentWeapon === atkWeapon) ||
          G.actionMode === "weapon_select"
            ? "var(--highlight)"
            : "";
        el.textContent = atkWeapon
          ? t("buttons.attack_with", { weapon: weaponLabel(atkWeapon) })
          : t("buttons.attack");
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

      if (id.includes("endturn")) {
        el.disabled =
          !isPlayer || !!G.pendingDice || G.throwing || G.actionMode === "aoe_confirm";
      }

      if (id.includes("dice")) {
        el.disabled = !isPlayer;
      }
    });
  });

  // Azioni secondarie (rotazione, postura, primo soccorso, annulla) e schede armi
  updateIconActions(u, hasUnit, isPlayer, inPick);
  renderWeaponBars(hasUnit ? u : null);

  // Sync disabled state ai bottoni della quick bar
  [
    ["btn-move", "qb-move"],
    ["btn-attack", "qb-attack"],
    ["btn-special", "qb-special"],
    ["btn-rotate", "qb-rotate"],
    ["btn-endturn", "qb-endturn"],
  ].forEach(([src, dst]) => {
    const s = document.getElementById(src),
      d = document.getElementById(dst);
    if (s && d) d.disabled = s.disabled;
  });
  updateQuickAttackSlot(u, inPick);
  updateQuickMoreMenu(u, inPick);

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
      const aoeStr = weaponAreaTag(w);
      html += `<button class="btn btn-weapon" ${!hasAmmo ? "disabled" : ""} data-widx="${i}">${weaponLabel(w)} ${ammoStr} · ATK${w.atk} · RNG${w.range}${aoeStr} · 🔊${weaponNoise(u, w)}</button>`;
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
    const html = `<div style="font-size:10px;color:#ffaa33;margin-bottom:3px">${weaponLabel(w)}${weaponAreaTag(w)} · ${aoeSummaryText()}</div>
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
  } else if (aimedOdds(u)) {
    // Touch: bersaglio puntato, scomposizione e conferma del tiro
    const o = aimedOdds(u);
    const html = `<div style="font-size:11px;color:${oddsColor(o.pHit)};margin-bottom:2px">${G.aimTarget.name} · ${oddsSummaryText(o)}</div>
<div style="font-size:10px;color:var(--paper-dark);margin-bottom:3px">${oddsBreakdownText(o.b)}</div>
<button class="btn btn-attack" data-aim="fire">${t("odds.fire")}</button>
<button class="btn" data-aim="cancel">${t("weapons.cancel_aoe")}</button>`;
    [pickerEl, mobPickerEl].forEach((el) => {
      if (!el) return;
      el.innerHTML = html;
      el.style.display = "flex";
      el.querySelector('[data-aim="fire"]')?.addEventListener("click", () => {
        if (G.aimTarget) fireAtTarget(G.aimTarget);
      });
      el.querySelector('[data-aim="cancel"]')?.addEventListener("click", () => {
        sfx("click");
        setActionMode(null);
        updateUI();
      });
    });
  } else if (G.actionMode === "attack" && G.currentWeapon?.napalm) {
    // Napalm: istruzioni per i due click (inizio e fine della linea)
    const html = `<div style="font-size:10px;color:#ffaa33;margin-bottom:3px">${napalmPromptText()}</div>
<button class="btn" data-aoe="cancel">${t("weapons.cancel_aoe")}</button>`;
    [pickerEl, mobPickerEl].forEach((el) => {
      if (!el) return;
      el.innerHTML = html;
      el.style.display = "flex";
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

function napalmPromptText() {
  const w = G.currentWeapon;
  return G.pendingAoe
    ? t("weapons.napalm_pick_end", { n: napalmLength(w) })
    : t("weapons.napalm_pick_start", { weapon: weaponLabel(w) });
}

// Probabilità del bersaglio puntato col primo tap (null se non c'è o non è
// più attaccabile)
function aimedOdds(u) {
  const e = G.aimTarget;
  if (!u?.alive || G.actionMode !== "attack" || !e || !G.attackable.includes(e))
    return null;
  return attackOdds(u, e, G.currentWeapon);
}

// "84% · danno 3.7 · uccide 40%"
function oddsSummaryText(o) {
  return t("odds.summary", {
    pct: Math.round(o.pHit * 100),
    dmg: o.expDmg.toFixed(1),
    kill: Math.round(o.pKill * 100),
  });
}

// Bersagli dell'esplosione in attesa di conferma, con avviso di fuoco amico
function aoeSummaryText() {
  const { col, row, weapon, line } = G.pendingAoe;
  const odds = aoeOdds(weapon, col, row, line);
  const vc = odds.filter((o) => !o.isUS).length;
  const us = odds.length - vc;
  const parts = [t("odds.aoe_targets", { n: vc })];
  if (us) parts.push(t("odds.aoe_friendly", { n: us }));
  return parts.join(" · ");
}
