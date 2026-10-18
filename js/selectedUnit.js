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
      ${t("unit_panel.tile", { label: tileLabel })}
    </div>
    <div class="status-chips">${unitStatusChips(u, def).join("")}</div>`;
  // Armi e munizioni: nelle schede armi del pannello azioni (tabs.js)
}

// Chip di stato: icona + etichetta breve, la spiegazione completa nel tooltip
const CHIP_COLORS = {
  good: "143,209,106",
  info: "170,221,255",
  warn: "224,160,64",
  bad: "255,80,60",
  neutral: "200,190,150",
  gold: "240,192,48",
};

function statusChip(icon, label, tone, title = "") {
  const rgb = CHIP_COLORS[tone] || CHIP_COLORS.neutral;
  const tt = title ? ` title="${title.replace(/"/g, "&quot;")}"` : "";
  return `<span class="chip" style="--chip:${rgb}"${tt}>${icon} ${label}</span>`;
}

function unitStatusChips(u, def) {
  const c = [];
  const stance = u.stance || "stand";
  // Abilità speciale (le classi senza non hanno il chip)
  if (unitSpecial(u))
    c.push(
      u.specialUsed
        ? statusChip("⚡", t("units.chips.special_used"), "neutral", t("units.status.special_used"))
        : statusChip("⚡", def.specialLabel, "gold", t("units.status.special_available", { label: def.specialLabel })),
    );
  // Postura e occultamento
  c.push(statusChip(STANCE_ICONS[stance], t(`stances.${stance}`), "neutral", stanceSummary(stance)));
  if (isConcealed(u))
    c.push(statusChip("🌿", t("units.chips.concealed"), "good", t("units.status.concealed")));
  else if (u.exposed && stance !== "stand" && isConcealingTile(u.col, u.row))
    c.push(statusChip("👁", t("units.chips.exposed"), "bad", t("units.status.exposed")));
  // Reazioni attive
  if (u.overwatch)
    c.push(statusChip("🔭", t("units.chips.overwatch"), "info", t("units.status.in_overwatch")));
  if (u.suppression)
    c.push(statusChip("🔥", t("units.chips.suppression"), "warn", t("units.status.in_suppression")));
  // Munizioni
  const ws = u.weapons || [];
  if (ws.some((w) => w.shotsPerTurn && (w.shotsThisTurn || 0) >= w.shotsPerTurn))
    c.push(statusChip("🎯", t("units.chips.shot_used"), "neutral", t("units.status.shot_used")));
  if (ws.some(weaponEmpty))
    c.push(
      reloadableWeapon(u)
        ? statusChip("🔄", t("units.chips.need_reload"), "warn", t("units.status.need_reload"))
        : statusChip("✕", t("units.chips.out_of_ammo"), "bad", t("units.status.out_of_ammo")),
    );
  // Ferite, morale, emorragia
  const wl = woundLevel(u);
  if (wl > 0)
    c.push(
      statusChip(
        "🤕",
        t(wl > 1 ? "units.chips.wounded_severe" : "units.chips.wounded"),
        wl > 1 ? "bad" : "warn",
        t(wl > 1 ? "units.status.wounded_severe" : "units.status.wounded", {
          atk: woundAttackPenalty(u),
          ap: WOUND_MOVE_EXTRA,
        }),
      ),
    );
  if (u.shaken)
    c.push(statusChip("⚠", t("units.chips.shaken"), "bad", t("units.status.shaken")));
  if (u.bleeding)
    c.push(statusChip("🩸", t("units.chips.bleeding"), "bad", t("units.status.bleeding", { n: BLEED_PER_TURN })));
  // Missione
  if (u.carriesPilot)
    c.push(statusChip("✈", t("units.chips.pilot"), "gold", t("units.status.carry_pilot")));
  return c;
}

function updateSelInfo() {
  const u = G.selectedUnit;
  document.getElementById("sel-info").innerHTML = selInfoHTML(u);
  document.getElementById("mob-sel-info").innerHTML = selInfoHTML(u);
}
