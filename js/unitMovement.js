/**
 * Moves a unit to a specified column and row, consuming AP if necessary.
 * @param {object} unit The unit to move
 * @param {number} toCol Column to move to
 * @param {number} toRow Row to move to
 * @param {number} apCost AP cost of the move
 */
async function moveUnit(unit, toCol, toRow, apCost) {
  sfx("move");

  const fromCol = unit.col, fromRow = unit.row;
  // Stato prima del movimento, per consentire l'annullamento (vedi undoLastMove)
  const prevAp = unit.ap;
  const seenBefore = visibleEnemyIds();
  const missionBefore = JSON.stringify(G.missionState);
  G.lastMove = null;
  unit.col = toCol;
  unit.row = toRow;

  //addFX("move", { fromCol: unit.col, fromRow: unit.row, toCol, toRow }, 500);
  await animateEnemyMove(unit, fromCol, fromRow, toCol, toRow);

  unit.ap = Math.max(0, unit.ap - apCost);

  log(
    t("log.unit_move", {
      name: unit.name,
      col: toCol,
      row: toRow,
      ap: apCost,
    }),
  );

  if (G.missionType === "rescue_pilot") {
    const st = G.missionState;

    if (
      !st.pilotFound &&
      unit.col === st.pilotCol &&
      unit.row === st.pilotRow
    ) {
      st.pilotFound = true;
      unit.carriesPilot = true;
      log(t("log.pilot_found", { name: unit.name }), "success");
    }

    if (
      st.pilotFound &&
      unit.carriesPilot &&
      unit.col === st.extractCol &&
      unit.row === st.extractRow
    ) {
      st.pilotExtracted = true;
      log(t("log.pilot_extracted"), "success");
      checkVictory();
    }
  }

  if (G.missionType === "recon") {
    for (const pt of G.missionState.points || []) {
      if (!pt.scouted && dist(unit, pt) <= 1) {
        pt.scouted = true;
        const zoneLabel =
          missionObjLabel("recon", G.missionState.points.indexOf(pt)) ??
          pt.label;
        log(t("log.zone_scouted", { label: zoneLabel }), "success");
      }
    }
    checkVictory();
  }

  // Annullabile solo se il movimento non ha rivelato nuovi nemici
  // né cambiato lo stato della missione (pilota, zone ricognite, estrazione)
  if (G.fowEnabled) recomputeVisibility();
  const revealed = [...visibleEnemyIds()].some((id) => !seenBefore.has(id));
  if (
    G.phase === "player" &&
    !revealed &&
    JSON.stringify(G.missionState) === missionBefore
  ) {
    G.lastMove = { unit, fromCol, fromRow, prevAp };
  }

  updateUI();

  render();
}

function visibleEnemyIds() {
  return new Set(
    G.enemies
      .filter((e) => e.alive && isTileVisible(e.col, e.row))
      .map((e) => e.id),
  );
}

// Invalida l'annullamento: da chiamare dopo ogni azione che non sia un movimento
function clearLastMove() {
  G.lastMove = null;
}

function canUndoMove() {
  const lm = G.lastMove;
  return (
    !!lm &&
    G.phase === "player" &&
    lm.unit.alive &&
    G.units.includes(lm.unit) &&
    !isOccupied(lm.fromCol, lm.fromRow)
  );
}

function undoLastMove() {
  if (!canUndoMove()) return;
  const { unit, fromCol, fromRow, prevAp } = G.lastMove;
  G.lastMove = null;
  unit.col = fromCol;
  unit.row = fromRow;
  // L'animazione lascia vx/vy sulla destinazione: senza reset il render userebbe quelle
  delete unit.vx;
  delete unit.vy;
  unit.ap = prevAp;
  G.selectedUnit = unit;
  setActionMode(null);
  log(t("log.unit_move_undone", { name: unit.name }));
  updateUI();
}
