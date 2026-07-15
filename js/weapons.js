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
