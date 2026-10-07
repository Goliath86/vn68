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
 * Gittata minima di un'arma: per le armi AoE, se non specificata, è aoe + 1
 * così chi lancia non può mai trovarsi nel raggio dell'esplosione
 * @param {object|null} weapon
 * @returns {number}
 */
function weaponMinRange(weapon) {
  if (weapon?.minRange != null) return weapon.minRange;
  return weapon?.aoe ? weapon.aoe + 1 : 0;
}
