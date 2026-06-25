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
["move", "attack", "special", "endturn"].forEach((action) => {
  document.getElementById("qb-" + action).addEventListener("click", () => {
    document.getElementById("btn-" + action).click();
  });
});

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

  // Aggiorna sia i controlli desktop che mobile in un colpo
  const pairs = [
    ["btn-move", "mob-btn-move"],
    ["btn-attack", "mob-btn-attack"],
    ["btn-special", "mob-btn-special"],
    ["btn-endturn", "mob-btn-endturn"],
    ["btn-dice", "mob-btn-dice"],
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
        const hasAmmo =
          !u?.weapons?.length ||
          u.weapons.some((w) => w.ammo === null || w.ammo > 0);
        const inPick =
          G.actionMode === "weapon_select" || G.actionMode === "aoe_confirm";
        el.disabled =
          !(
            isPlayer &&
            hasAP &&
            hasEnemy &&
            !(u?.cls === "sniper" && u?.hasShot) &&
            hasAmmo
          ) || inPick;
        el.style.borderColor =
          hasAM || G.actionMode === "weapon_select" ? "var(--highlight)" : "";
      }
      if (id.includes("special")) {
        el.disabled = !(isPlayer && hasAP && !u?.specialUsed && !u?.shaken);
        el.style.borderColor = hasSM ? "var(--highlight)" : "";
        el.textContent = specLabel;
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

  // Sync disabled state ai bottoni della quick bar
  [
    ["btn-move", "qb-move"],
    ["btn-attack", "qb-attack"],
    ["btn-special", "qb-special"],
    ["btn-endturn", "qb-endturn"],
  ].forEach(([src, dst]) => {
    const s = document.getElementById(src),
      d = document.getElementById(dst);
    if (s && d) d.disabled = s.disabled;
  });

  // Weapon picker e AoE confirm
  const pickerEl = document.getElementById("weapon-picker");
  const mobPickerEl = document.getElementById("mob-weapon-picker");
  if (!pickerEl) return;

  if (G.actionMode === "weapon_select" && hasUnit) {
    const ws = u.weapons || [];
    let html = `<div style="font-size:10px;color:var(--paper-dark);margin-bottom:3px">${t("weapons.pick_prompt")}</div>`;
    ws.forEach((w, i) => {
      const hasAmmo = w.ammo === null || w.ammo > 0;
      const ammoStr =
        w.ammo === null
          ? t("weapons.ammo_inf")
          : t("weapons.ammo_tag", { n: w.ammo });
      const aoeStr = w.aoe ? ` · AoE${w.aoe}` : "";
      html += `<button class="btn btn-weapon" ${!hasAmmo ? "disabled" : ""} data-widx="${i}">${w.label} ${ammoStr} · ATK${w.atk} · RNG${w.range}${aoeStr}</button>`;
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
            updateUI();
          }
        });
      });
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

  // Badge "dado richiesto" sul tab
  const tabDice = document.getElementById("tab-btn-dice");
  if (tabDice) {
    tabDice.classList.toggle("needs-dice", !!G.pendingDice);
  }
}
