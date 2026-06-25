// Restituisce l'arma attualmente selezionata (o null se nessuna configurata)
function unitWeapon(unit) {
  return unit.weapons && unit.weapons.length > 0
    ? unit.weapons[unit.weaponIdx ?? 0]
    : null;
}
