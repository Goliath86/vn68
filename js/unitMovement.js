/**
 * Moves a unit to a specified column and row, consuming AP if necessary.
 * @param {object} unit The unit to move
 * @param {number} toCol Column to move to
 * @param {number} toRow Row to move to
 * @param {number} apCost AP cost of the move
 */
function moveUnit(unit, toCol, toRow, apCost) {
  sfx("move");

  addFX("move", { fromCol: unit.col, fromRow: unit.row, toCol, toRow }, 500);

  unit.col = toCol;
  unit.row = toRow;
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

  updateUI();

  render();
}
