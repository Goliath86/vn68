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
  .getElementById("mob-btn-rotate")
  .addEventListener("click", () =>
    document.getElementById("btn-rotate").click(),
  );

document
  .getElementById("mob-btn-stance")
  .addEventListener("click", () =>
    document.getElementById("btn-stance").click(),
  );

document
  .getElementById("mob-btn-firstaid")
  .addEventListener("click", () =>
    document.getElementById("btn-firstaid").click(),
  );

document
  .getElementById("mob-btn-endturn")
  .addEventListener("click", () =>
    document.getElementById("btn-endturn").click(),
  );

document
  .getElementById("mob-btn-undo")
  .addEventListener("click", () => document.getElementById("btn-undo").click());

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

// Attacca: modalità attacco con l'arma predefinita (le altre armi si scelgono
// dalle schede armi, o dal selettore della barra rapida su mobile)
document.getElementById("btn-attack").addEventListener("click", () => {
  const u = G.selectedUnit;
  if (!u || u.ap < 1 || !canAttack(u)) return;
  sfx("click");
  setActionMode("attack", defaultAttackWeapon(u));
});

// Scheda arma: attacca con quell'arma (secondo click: annulla); se l'arma è
// scarica e c'è riserva, ricarica
function weaponCardAction(idx) {
  const u = G.selectedUnit;
  const w = u?.weapons?.[idx];
  if (!w || !u.alive || G.phase !== "player") return;
  if (weaponEmpty(w)) {
    if (canReload(u, w)) reloadWeapon(u, w);
    return;
  }
  if (u.ap < 1 || !weaponUsable(u, w)) return;
  sfx("click");
  const again = G.actionMode === "attack" && G.currentWeapon === w;
  setActionMode(again ? null : "attack", again ? null : w);
}

document.getElementById("btn-special").addEventListener("click", () => {
  if (
    !G.selectedUnit ||
    G.selectedUnit.ap < 1 ||
    G.selectedUnit.specialUsed ||
    G.selectedUnit.shaken ||
    specialBlockedByAmmo(G.selectedUnit)
  )
    return;

  const u = G.selectedUnit;
  if (u.cls === "assault") {
    // Fuoco Soppressivo immediato
    clearLastMove();
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
    clearLastMove();
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
document.getElementById("btn-rotate").addEventListener("click", () => {
  const u = G.selectedUnit;
  if (!u || !u.alive || u.rotated) return;
  sfx("click");
  // Secondo click sul bottone: esce dalla modalità
  setActionMode(G.actionMode === "rotate" ? null : "rotate");
});

document.getElementById("btn-stance").addEventListener("click", () => {
  const u = G.selectedUnit;
  if (!canChangeStance(u)) return;
  sfx("click");
  // Secondo click sul bottone: chiude il selettore
  setActionMode(G.actionMode === "stance" ? null : "stance");
});

document.getElementById("btn-firstaid").addEventListener("click", () => {
  const u = G.selectedUnit;
  if (!canFirstAid(u)) return;
  firstAid(u);
});

document.getElementById("btn-undo").addEventListener("click", () => {
  if (!canUndoMove()) return;
  sfx("click");
  undoLastMove();
});

// ── FINE TURNO (con conferma se restano AP) ────────────────────────────
const endTurnOverlay = document.getElementById("endturn-overlay");

function requestEndTurn() {
  if (G.phase !== "player" || G.pendingDice) return;
  const withAp = G.units.filter((u) => u.alive && u.ap > 0).length;
  if (withAp > 0) {
    document.getElementById("endturn-msg").textContent = t(
      "confirm.end_turn_ap",
      { n: withAp },
    );
    endTurnOverlay.classList.remove("hidden");
    return;
  }
  endPlayerTurn();
}

function closeEndTurnConfirm(confirmed) {
  endTurnOverlay.classList.add("hidden");
  if (confirmed) endPlayerTurn();
}

document.getElementById("btn-endturn").addEventListener("click", requestEndTurn);
document
  .getElementById("endturn-yes")
  .addEventListener("click", () => closeEndTurnConfirm(true));
document
  .getElementById("endturn-no")
  .addEventListener("click", () => closeEndTurnConfirm(false));

// Seleziona la prossima unità viva con AP (dir = 1 avanti, -1 indietro)
function selectNextUnit(dir) {
  const list = G.units.filter((u) => u.alive && u.ap > 0);
  if (!list.length) return;
  const cur = list.indexOf(G.selectedUnit);
  const next =
    cur === -1
      ? list[dir > 0 ? 0 : list.length - 1]
      : list[(cur + dir + list.length) % list.length];
  G.selectedUnit = next;
  setActionMode(null);
  updateUI();
}

// ── HOTKEYS DESKTOP ────────────────────────────────────────────────────
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  // Conferma fine turno aperta: Invio = sì, Esc = no, altri tasti ignorati
  if (!endTurnOverlay.classList.contains("hidden")) {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      closeEndTurnConfirm(e.key === "Enter");
    }
    return;
  }
  if (!G.mapData || G.phase !== "player" || G.pendingDice) return;
  const u = G.selectedUnit;
  if (e.key === "Tab") {
    e.preventDefault();
    selectNextUnit(e.shiftKey ? -1 : 1);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    document.getElementById("btn-undo").click();
    return;
  }
  switch (e.key.toLowerCase()) {
    case "u":
      document.getElementById("btn-undo").click();
      break;
    case "m":
      if (u && u.alive && u.ap > 0) document.getElementById("btn-move").click();
      break;
    case "a":
      if (u && u.alive && u.ap > 0 && canAttack(u))
        document.getElementById("btn-attack").click();
      break;
    case "s":
      if (u && u.alive && u.ap > 0 && !u.specialUsed)
        document.getElementById("btn-special").click();
      break;
    case "r":
      if (u && u.alive && !u.rotated) document.getElementById("btn-rotate").click();
      break;
    case "c":
      if (canChangeStance(u)) document.getElementById("btn-stance").click();
      break;
    case "l":
      if (canReload(u)) reloadWeapon(u);
      break;
    case "h":
      if (canFirstAid(u)) document.getElementById("btn-firstaid").click();
      break;
    case "enter":
      // preventDefault: evita il doppio click nativo se un bottone ha il focus
      e.preventDefault();
      document.getElementById("btn-endturn").click();
      break;
    case "escape":
      if (G.actionMode) {
        setActionMode(null);
        sfx("click");
      }
      break;
    default:
      // 1-9: scheda arma corrispondente
      if (/^[1-9]$/.test(e.key) && u?.weapons?.[+e.key - 1])
        weaponCardAction(+e.key - 1);
  }
});
