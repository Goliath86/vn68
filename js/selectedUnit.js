function selInfoHTML(u) {
  if (!u || !u.alive)
    return `<div style="font-size:11px;color:var(--paper-dark)">${t("units.no_unit_selected_long")}</div>`;

  const def = UNIT_CLASSES[u.cls];
  // ATK/RNG mostrati: valori dell'arma equipaggiata (come in combattimento), fallback sulla classe
  const weapon = unitWeapon(u);
  const atk = weapon?.atk ?? def.attack;
  const rng = weapon?.range ?? def.range;
  const tileLabel =
    mt(`tileLabels.${getTileAt(u.col, u.row)?.id}`) ??
    getTileAt(u.col, u.row)?.label ??
    "?";

  return `
    <div class="si-name" style="font-family:var(--ui-font);font-size:15px;font-weight:600;color:var(--highlight)">${u.name}</div>
    <div class="si-stats" style="font-size:10px;color:var(--paper-dark);line-height:1.7;margin-top:3px">
      ${t("unit_panel.stats", { class: def.name, atk, def: def.defense, rng })}<br>
      ${t("unit_panel.status", { hp: u.hp, maxHp: u.maxHp, ap: u.ap, maxAp: AP_PER_TURN, col: u.col, row: u.row })}<br>
      ${t("unit_panel.tile", { label: tileLabel })}<br>
      ${t("unit_panel.stance", { icon: STANCE_ICONS[u.stance || "stand"], label: t(`stances.${u.stance || "stand"}`) })}${
        isConcealed(u)
          ? ` · <span style="color:#8fd16a">${t("units.status.concealed")}</span>`
          : u.exposed && u.stance && u.stance !== "stand" && isConcealingTile(u.col, u.row)
            ? ` · <span style="color:var(--red)">${t("units.status.exposed")}</span>`
            : ""
      }<br>
      ${
        u.specialUsed
          ? `<span style="color:var(--red)">${t("units.status.special_used")}</span>`
          : `<span style="color:var(--highlight)">${t("units.status.special_available", { label: def.specialLabel })}</span>`
      }
      ${u.overwatch ? `<br><span style="color:#aaddff">${t("units.status.in_overwatch")}</span>` : ""}
      ${u.suppression ? `<br><span style="color:#ffaa33">${t("units.status.in_suppression")}</span>` : ""}
      ${(u.weapons || []).some((w) => w.shotsPerTurn && (w.shotsThisTurn || 0) >= w.shotsPerTurn) ? `<br><span style="color:var(--red)">${t("units.status.shot_used")}</span>` : ""}
      ${(u.weapons || []).some(weaponEmpty) ? `<br><span style="color:var(--red)">${t(reloadableWeapon(u) ? "units.status.need_reload" : "units.status.out_of_ammo")}</span>` : ""}
      ${u.shaken ? `<br><span style="color:#ff5028;font-weight:700">${t("units.status.shaken")}</span>` : ""}
      ${woundLevel(u) > 0 ? `<br><span style="color:#e0a040">${t(woundLevel(u) > 1 ? "units.status.wounded_severe" : "units.status.wounded", { atk: woundAttackPenalty(u), ap: WOUND_MOVE_EXTRA })}</span>` : ""}
      ${u.bleeding ? `<br><span style="color:#ff3030;font-weight:700">${t("units.status.bleeding", { n: BLEED_PER_TURN })}</span>` : ""}
      ${u.carriesPilot ? `<br><span style="color:var(--yellow)">${t("units.status.carry_pilot")}</span>` : ""}
    </div>`;
  // Armi e munizioni: nelle schede armi del pannello azioni (tabs.js)
}

function updateSelInfo() {
  const u = G.selectedUnit;
  document.getElementById("sel-info").innerHTML = selInfoHTML(u);
  document.getElementById("mob-sel-info").innerHTML = selInfoHTML(u);
}
