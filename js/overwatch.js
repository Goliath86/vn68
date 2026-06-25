// ── OVERWATCH ──────────────────────────────────────────────────────────
function checkOverwatch(enemy) {
  for (const ow of G.overwatchList) {
    if (!ow.alive || ow.overwatchFired) continue;
    if (!isTileVisibleFromUnit(ow, enemy.col, enemy.row)) continue;
    const owDef = UNIT_CLASSES[ow.cls];
    if (dist(ow, enemy) <= owDef.range) {
      ow.overwatchFired = true;
      log(
        t("log.overwatch_fire", {
          name: ow.name,
          target: enemy.name,
        }),
        "combat",
      );
      sfxShoot(ow.cls, unitWeapon(ow));
      addFX(
        "overwatch",
        {
          owCol: ow.col,
          owRow: ow.row,
          tCol: enemy.col,
          tRow: enemy.row,
        },
        700,
      );
      const owRange = dist(ow, enemy);
      const owPenalty = Math.floor((owRange - 1) / 2);
      const owAtk = Math.max(1, owDef.attack - owPenalty);
      if (owPenalty > 0)
        log(
          t("log.sniper_range_penalty", {
            range: owRange,
            atk: owAtk,
            penalty: owPenalty,
          }),
          "combat",
        );
      const dv = rollDice(2);
      showDiceResult(dv, t("log.overwatch_dice_context", { name: ow.name }));
      const roll = diceSum(dv) + owAtk;
      const sv = rollD6() + coverBonus(enemy.col, enemy.row);
      const dmg = Math.max(0, roll - sv);
      if (dmg > 0) {
        enemy.hp -= dmg;
        log(t("log.hit_damage", { dmg }), "combat");
        addFX("hit", { col: enemy.col, row: enemy.row, dmg }, 700);
        if (enemy.hp <= 0) {
          enemy.hp = 0;
          enemy.alive = false;
          log(
            t("log.unit_eliminated", {
              name: enemy.name,
            }),
            "combat",
          );
          addFX("death", { col: enemy.col, row: enemy.row }, 1100);
        }
      }
    }
  }
}
