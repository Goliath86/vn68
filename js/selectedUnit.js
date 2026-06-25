function selInfoHTML(u) {
  if (!u || !u.alive)
    return `<div style="font-size:11px;color:var(--paper-dark)">${t("units.no_unit_selected_long")}</div>`;
  const def = UNIT_CLASSES[u.cls];
  const tileLabel =
    mt(`tileLabels.${getTileAt(u.col, u.row)?.id}`) ??
    getTileAt(u.col, u.row)?.label ??
    "?";
  return `
    <div class="si-name" style="font-family:var(--ui-font);font-size:15px;font-weight:600;color:var(--highlight)">${u.name}</div>
    <div class="si-stats" style="font-size:10px;color:var(--paper-dark);line-height:1.7;margin-top:3px">
      ${t("unit_panel.stats", { class: def.name, atk: def.attack, def: def.defense, rng: def.range })}<br>
      ${t("unit_panel.status", { hp: u.hp, maxHp: u.maxHp, ap: u.ap, maxAp: AP_PER_TURN, col: u.col, row: u.row })}<br>
      ${t("unit_panel.tile", { label: tileLabel })}<br>
      ${
        u.specialUsed
          ? `<span style="color:var(--red)">${t("units.status.special_used")}</span>`
          : `<span style="color:var(--highlight)">${t("units.status.special_available", { label: def.specialLabel })}</span>`
      }
      ${u.overwatch ? `<br><span style="color:#aaddff">${t("units.status.in_overwatch")}</span>` : ""}
      ${u.suppression ? `<br><span style="color:#ffaa33">${t("units.status.in_suppression")}</span>` : ""}
      ${u.cls === "sniper" && u.hasShot ? `<br><span style="color:var(--red)">${t("units.status.shot_used")}</span>` : ""}
      ${u.shaken ? `<br><span style="color:#ff5028;font-weight:700">${t("units.status.shaken")}</span>` : ""}
      ${u.carriesPilot ? `<br><span style="color:var(--yellow)">${t("units.status.carry_pilot")}</span>` : ""}
      ${
        u.weapons && u.weapons.length > 0
          ? "<br>" +
            u.weapons
              .map((w) => {
                const depleted = w.ammo !== null && w.ammo <= 0;
                const ammoStr =
                  w.ammo === null
                    ? t("weapons.ammo_inf")
                    : t("weapons.ammo_tag", { n: w.ammo });
                const aoeStr = w.aoe ? ` AoE${w.aoe}` : "";
                return `<span style="color:${depleted ? "var(--red)" : "var(--paper-dark)"}">${w.label}${aoeStr} ${ammoStr}</span>`;
              })
              .join(" · ")
          : ""
      }
    </div>`;
}

function updateSelInfo() {
  const u = G.selectedUnit;
  document.getElementById("sel-info").innerHTML = selInfoHTML(u);
  document.getElementById("mob-sel-info").innerHTML = selInfoHTML(u);
}
