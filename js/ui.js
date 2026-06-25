// Bottone dado mobile
document.getElementById("mob-btn-dice").addEventListener("click", () => {
  document.getElementById("btn-dice").click(); // delega al handler desktop
});

// Bottoni azione mobile — delegano al corrispondente desktop
document
  .getElementById("mob-btn-move")
  .addEventListener("click", () => document.getElementById("btn-move").click());
document
  .getElementById("mob-btn-attack")
  .addEventListener("click", () =>
    document.getElementById("btn-attack").click(),
  );
document
  .getElementById("mob-btn-special")
  .addEventListener("click", () =>
    document.getElementById("btn-special").click(),
  );
document
  .getElementById("mob-btn-endturn")
  .addEventListener("click", () =>
    document.getElementById("btn-endturn").click(),
  );
function objPanelHTML() {
  const type = G.missionType;
  const st = G.missionState;
  if (!type)
    return `<div style="font-size:11px;color:var(--paper-dark)">${t("objective_panel.no_mission")}</div>`;
  const mtype = MISSION_TYPES[type];
  let html = `<div style="font-family:var(--ui-font);font-size:13px;color:${mtype.color};font-weight:600;margin-bottom:6px">${mtype.icon} ${mtype.label}</div>`;
  if (type === "recon") {
    (st.points || []).forEach((pt, i) => {
      const lbl = missionObjLabel("recon", i) ?? pt.label;
      html += `<div class="obj-item"><div class="obj-dot" style="background:${pt.scouted ? "#44aa66" : "#88aaff"}"></div>${lbl} ${pt.scouted ? "✓" : ""}</div>`;
    });
  }
  if (type === "search_destroy") {
    html += `<div class="obj-item"><div class="obj-dot" style="background:#ff8888"></div>${t("objective_panel.kills", { kills: st.kills || 0, needed: st.needed || 0 })}</div>`;
  }
  if (type === "rescue_pilot") {
    let pilotStatus, pilotColor;
    if (st.pilotFound) {
      pilotColor = "#44aa66";
      pilotStatus = st.pilotExtracted
        ? t("objective_panel.pilot_extracted")
        : t("objective_panel.pilot_found");
    } else if (isTileVisible(st.pilotCol, st.pilotRow)) {
      pilotColor = "#ffcc44";
      pilotStatus = t("objective_panel.pilot_missing");
    } else {
      pilotColor = "#888";
      pilotStatus = t("objective_panel.pilot_unknown");
    }
    html += `<div class="obj-item"><div class="obj-dot" style="background:${pilotColor}"></div>${pilotStatus}</div>`;
  }
  if (type === "capture_objective") {
    (st.objectives || []).forEach((obj, i) => {
      const lbl = missionObjLabel("capture_objective", i) ?? obj.label;
      const status = obj.controlled
        ? t("objective_panel.hold_controlled", {
            label: lbl,
            held: obj.heldTurns || 0,
            total: obj.holdTurns || 2,
          })
        : t("objective_panel.hold_uncontrolled", {
            label: lbl,
            held: obj.heldTurns || 0,
            total: obj.holdTurns || 2,
          });
      html += `<div class="obj-item"><div class="obj-dot" style="background:${obj.controlled ? "#44aa66" : "#f0c030"}"></div>${status}</div>`;
    });
  }
  return html;
}

function updateObjectivePanel() {
  const html = objPanelHTML();
  document.getElementById("obj-panel").innerHTML = html;
  document.getElementById("mob-obj-panel").innerHTML = html;
}

function updateUI() {
  updateUnitList();
  updateSelInfo();
  updateActionButtons();
  updateObjectivePanel();
}

// ── PLAYER ACTION HANDLERS ─────────────────────────────────────────────
document.getElementById("btn-move").addEventListener("click", () => {
  if (!G.selectedUnit || G.selectedUnit.ap < 1) return;
  sfx("click");
  setActionMode("move");
});
document.getElementById("btn-attack").addEventListener("click", () => {
  const u = G.selectedUnit;
  if (!u || u.ap < 1) return;
  sfx("click");
  const usable = (u.weapons || []).filter((w) => w.ammo === null || w.ammo > 0);
  if (usable.length > 1) {
    setActionMode("weapon_select");
  } else {
    setActionMode("attack", usable[0] ?? null);
  }
});
document.getElementById("btn-special").addEventListener("click", () => {
  if (
    !G.selectedUnit ||
    G.selectedUnit.ap < 1 ||
    G.selectedUnit.specialUsed ||
    G.selectedUnit.shaken
  )
    return;
  const u = G.selectedUnit;
  if (u.cls === "assault") {
    // Fuoco Soppressivo immediato
    u.suppression = true;
    u.ap -= 1;
    u.specialUsed = true;
    if (!G.suppressList.find((s) => s.id === u.id)) G.suppressList.push(u);
    sfx("overwatch");
    log(t("log.suppression_set", { name: u.name }), "system");
    updateUI();
    render();
    return;
  }
  if (u.cls === "sniper") {
    // Overwatch immediato
    u.overwatch = true;
    u.ap -= 1;
    u.specialUsed = true;
    if (!G.overwatchList.find((o) => o.id === u.id)) G.overwatchList.push(u);
    sfx("overwatch");
    log(t("log.overwatch_set", { name: u.name }), "system");
    updateUI();
    render();
    return;
  }
  setActionMode("special");
});
document.getElementById("btn-endturn").addEventListener("click", endPlayerTurn);

// ── HOTKEYS DESKTOP ────────────────────────────────────────────────────
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (G.phase !== "player" || G.pendingDice) return;
  const u = G.selectedUnit;
  switch (e.key.toLowerCase()) {
    case "m":
      if (u && u.alive && u.ap > 0) document.getElementById("btn-move").click();
      break;
    case "a":
      if (u && u.alive && u.ap > 0 && !(u.cls === "sniper" && u.hasShot))
        document.getElementById("btn-attack").click();
      break;
    case "s":
      if (u && u.alive && u.ap > 0 && !u.specialUsed)
        document.getElementById("btn-special").click();
      break;
    case "enter":
      document.getElementById("btn-endturn").click();
      break;
    case "escape":
      if (G.actionMode) {
        setActionMode(null);
        sfx("click");
      }
      break;
  }
});
