/**
 * Return the weapon currently selected for a unit (or null if none configured)
 * @param {object} unit The unit object
 * @returns {object|null} The weapon currently selected for the unit, or null if none configured
 */
function unitWeapon(unit) {
  return unit.weapons && unit.weapons.length > 0
    ? unit.weapons[unit.weaponIdx ?? 0]
    : null;
}

/**
 * Arma di fuoco diretto di un'unità (usata da overwatch e soppressione):
 * prima arma non-AoE del loadout, o null se non configurata
 * @param {object} unit
 * @returns {object|null}
 */
function unitFireWeapon(unit) {
  return unit.weapons?.find((w) => !w.aoe) ?? null;
}

/**
 * Gittata di fuoco diretto di un'unità, fallback sulla gittata della classe
 * @param {object} unit
 * @returns {number}
 */
function unitFireRange(unit) {
  return unitFireWeapon(unit)?.range ?? UNIT_CLASSES[unit.cls].range;
}

/**
 * Penalità gittata (-1 ATK ogni 2 tile): campo `rangePenalty` dell'arma,
 * fallback sulla classe cecchino se l'arma non lo specifica
 * @param {object} unit
 * @param {object|null} weapon
 * @param {number} range distanza dal bersaglio
 * @returns {number}
 */
function weaponRangePenalty(unit, weapon, range) {
  const applies = weapon?.rangePenalty ?? unit.cls === "sniper";
  return applies ? Math.floor((range - 1) / 2) : 0;
}

/**
 * Gittata minima di un'arma: per le armi AoE, se non specificata, è aoe + 1
 * così chi lancia non può mai trovarsi nel raggio dell'esplosione
 * @param {object|null} weapon
 * @returns {number}
 */
function weaponMinRange(weapon) {
  if (weapon?.minRange != null) return weapon.minRange;
  return weapon?.aoe ? weapon.aoe + 1 : 0;
}
