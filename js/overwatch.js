// ── OVERWATCH ──────────────────────────────────────────────────────────
function checkOverwatch(enemy) {
  for (const ow of G.overwatchList) {
    if (!ow.alive || ow.overwatchFired) continue;

    if (!isTileVisibleFromUnit(ow, enemy.col, enemy.row)) continue;
    const owDef = UNIT_CLASSES[ow.cls];

    if (dist(ow, enemy) <= unitFireRange(ow)) {
      ow.overwatchFired = true;
      log(
        t("log.overwatch_fire", {
          name: ow.name,
          target: enemy.name,
        }),
        "combat",
      );

      sfxShoot(ow.cls, unitWeapon(ow));

      ow.hasShot = true;

      const owWeapon = unitFireWeapon(ow);
      const owRange = dist(ow, enemy);
      const owPenalty = weaponRangePenalty(ow, owWeapon, owRange);
      const owAtk = Math.max(1, (owWeapon?.atk ?? owDef.attack) - owPenalty);

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

      const roll = diceSum(dv) + owAtk;
      // Stessa formula di resolveCombat: DEF + copertura + 1d6
      const sv =
        rollD6() +
        getEnemyStats(enemy).defense +
        coverBonus(enemy.col, enemy.row);

      const dmg = Math.max(0, roll - sv);
      const owSniper = ow.cls === "sniper";
      // Colpo/morte partono all'arrivo del tracciante dell'overwatch
      const impact = shotImpactDelay(owSniper, OW_SHOT_MS);
      // FX dopo i dadi: il tracciante deve sapere se il colpo va a segno
      addFX(
        "overwatch",
        {
          owCol: ow.col,
          owRow: ow.row,
          tCol: enemy.col,
          tRow: enemy.row,
          hit: dmg > 0,
          sniper: owSniper,
          rounds: owWeapon?.rounds,
        },
        900,
      );
      if (dmg > 0) {
        enemy.hp -= dmg;
        log(t("log.hit_damage", { dmg }), "combat");
        addFX(
          "hit",
          {
            col: enemy.col,
            row: enemy.row,
            dmg,
            fromCol: ow.col,
            fromRow: ow.row,
            enemy: true,
          },
          700,
          impact,
        );
        if (enemy.hp <= 0) {
          enemy.hp = 0;
          enemy.alive = false;
          log(
            t("log.unit_eliminated", {
              name: enemy.name,
            }),
            "combat",
          );
          if (G.missionType === "search_destroy")
            G.missionState.kills = (G.missionState.kills || 0) + 1;
          addFX(
            "death",
            { col: enemy.col, row: enemy.row, cls: enemy.cls, enemy: true },
            1400,
            impact,
          );
        }
      }

      // TODO: set HasShot
    }
  }
}
