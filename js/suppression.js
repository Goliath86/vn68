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
      isTileVisibleFromUnit(sup, enemy.col, enemy.row) &&
      !allyBlockingFire(sup, enemy) &&
      hasRoundLoaded(unitFireWeapon(sup))
    ) {
      // Ogni raffica di soppressione consuma un colpo del caricatore
      const sw = unitFireWeapon(sup);
      if (sw?.mag) sw.loaded = Math.max(0, (sw.loaded ?? sw.mag) - 1);
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
      const noise = weaponNoise(sup, unitFireWeapon(sup));
      makeNoise(sup, noise);
      revealShooter(sup, noise);
      break;
    }
  }
}
