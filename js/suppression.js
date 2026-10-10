// Fuoco soppressivo: copre fronte e lati (non le spalle), con linea di vista
function suppressionCovers(sup, target) {
  return (
    dist(sup, target) <= unitFireRange(sup) &&
    facingSector(sup, target) !== "rear"
  );
}

function checkSuppression(enemy) {
  if (enemy.suppressed) return;

  for (const sup of G.suppressList) {
    if (!sup.alive) continue;

    if (
      suppressionCovers(sup, enemy) &&
      isTileVisibleFromUnit(sup, enemy.col, enemy.row)
    ) {
      enemy.suppressed = true;
      enemy.ap = 0;

      log(
        t("log.suppression_fire", {
          name: sup.name,
          target: enemy.name,
        }),
        "combat",
      );

      addFX(
        "suppression",
        {
          supCol: sup.col,
          supRow: sup.row,
          tCol: enemy.col,
          tRow: enemy.row,
        },
        1200,
      );

      sfxShoot(sup.cls, unitWeapon(sup));
      alertVcToward(enemy, sup);
      makeNoise(sup, weaponNoise(sup, unitFireWeapon(sup)));
      break;
    }
  }
}
