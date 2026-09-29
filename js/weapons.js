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
 * Gittata minima di un'arma: per le armi AoE, se non specificata, è aoe + 1
 * così chi lancia non può mai trovarsi nel raggio dell'esplosione
 * @param {object|null} weapon
 * @returns {number}
 */
function weaponMinRange(weapon) {
  if (weapon?.minRange != null) return weapon.minRange;
  return weapon?.aoe ? weapon.aoe + 1 : 0;
}
