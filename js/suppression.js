function checkSuppression(enemy) {
  if (enemy.suppressed) return;

  for (const sup of G.suppressList) {
    if (!sup.alive) continue;

    if (dist(sup, enemy) <= unitFireRange(sup)) {
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
      break;
    }
  }
}
