async function resolveCombat(
  attacker,
  defender,
  isEnemy = false,
  weapon = null,
) {
  const atkDef = isEnemy ? getEnemyStats(attacker) : UNIT_CLASSES[attacker.cls];
  const range = dist(attacker, defender);
  const maxRange = weapon?.range ?? atkDef.range;

  if (range > maxRange) {
    log(
      t("log.out_of_range", {
        name: attacker.name,
        range,
        max: maxRange,
      }),
      "combat",
    );
    return false;
  }

  // Penalità gittata cecchino: -1 ATK ogni 2 tile di distanza
  const rangePenalty =
    !isEnemy && attacker.cls === "sniper" ? Math.floor((range - 1) / 2) : 0;
  const atkVal = Math.max(1, (weapon?.atk ?? atkDef.attack) - rangePenalty);
  const defCover = coverBonus(defender.col, defender.row);
  const defStat = isEnemy
    ? (UNIT_CLASSES[defender.cls]?.defense ?? 1)
    : getEnemyStats(defender).defense;
  const defVal = defStat + defCover;

  let diceVals;
  if (!isEnemy) {
    if (rangePenalty > 0)
      log(
        t("log.sniper_range_penalty", {
          range,
          atk: atkVal,
          penalty: rangePenalty,
        }),
        "combat",
      );
    log(
      t("log.attack_prompt", {
        attacker: attacker.name,
        defender: defender.name,
      }),
      "combat",
    );
    diceVals = await waitForDice(
      2,
      t("log.attack_dice_context", { name: attacker.name }),
    );
  } else {
    diceVals = rollDice(2);
    showDiceResult(diceVals, t("log.vc_attack_auto", { name: attacker.name }));
  }

  const roll = diceSum(diceVals);
  const hit = roll + atkVal;
  const defDice = rollD6();
  const save = defVal + defDice;
  const dmg = Math.max(0, hit - save);

  sfxShoot(attacker.cls, weapon);
  addFX(
    "shot",
    {
      fromCol: attacker.col,
      fromRow: attacker.row,
      toCol: defender.col,
      toRow: defender.row,
    },
    600,
  );

  const defBreakdown =
    defCover > 0
      ? `${defDice}+${defStat}DEF+${defCover}COV=${save}`
      : `${defDice}+${defStat}DEF=${save}`;
  const result = dmg > 0 ? t("log.attack_hit", { dmg }) : t("log.attack_miss");
  log(
    t("log.attack_result", {
      dice: diceVals.join("+"),
      roll,
      atk: atkVal,
      defBreakdown,
      result,
    }),
    dmg > 0 ? "combat" : "",
  );

  if (dmg > 0) {
    sfx("hit");
    addFX("hit", { col: defender.col, row: defender.row, dmg }, 800);
    defender.hp -= dmg;
    if (defender.hp <= 0) {
      defender.hp = 0;
      defender.alive = false;
      sfx("death");
      log(t("log.unit_eliminated", { name: defender.name }), "combat");
      if (!isEnemy && G.missionType === "search_destroy") {
        G.missionState.kills = (G.missionState.kills || 0) + 1;
      }
      addFX("death", { col: defender.col, row: defender.row }, 1100);
    } else if (isEnemy && !defender.shaken) {
      // Morale: il difensore (unità US) è scosso se sotto 30% HP
      const maxHp = UNIT_CLASSES[defender.cls]?.hp ?? defender.maxHp;
      if (defender.hp / maxHp < 0.3) {
        defender.shaken = true;
        log(t("log.unit_shaken", { name: defender.name }), "combat");
      }
    }
  } else {
    sfx("miss");
    addFX("miss", { col: defender.col, row: defender.row }, 600);
  }

  updateUI();
  render();
  return dmg > 0;
}

function getEnemyStats(enemy) {
  if (enemy.cls === "sniper_vc")
    return { attack: 3, range: 4, defense: 0, move: 2 };
  if (enemy.cls === "commander")
    return { attack: 3, range: 2, defense: 1, move: 3 };
  return { attack: 2, range: 2, defense: 0, move: 3 };
}

// Risolve un attacco AoE (granata/RPG): dado attacco auto, ogni bersaglio tira difesa singolarmente
async function resolveAoeCombat(attacker, weapon, tc, tr, isEnemyAttacking) {
  const diceVals = rollDice(2);
  const roll = diceSum(diceVals);
  const hit = roll + weapon.atk;

  const defenders = isEnemyAttacking
    ? G.units.filter(
        (u) => u.alive && dist(u, { col: tc, row: tr }) <= weapon.aoe,
      )
    : G.enemies.filter(
        (e) =>
          e.alive &&
          dist(e, { col: tc, row: tr }) <= weapon.aoe &&
          isTileVisible(e.col, e.row),
      );

  sfxShoot(attacker.cls, weapon);
  addFX("explosion", { col: tc, row: tr }, 1300);
  showDiceResult(
    diceVals,
    t("log.aoe_dice_context", {
      weapon: weapon.label,
      name: attacker.name,
    }),
  );

  if (!defenders.length) {
    log(
      t("log.aoe_no_targets", {
        name: attacker.name,
        weapon: weapon.label,
      }),
      "combat",
    );
    updateUI();
    render();
    return;
  }
  log(
    t("log.aoe_attack", {
      name: attacker.name,
      weapon: weapon.label,
      targets: defenders.length,
    }),
    "combat",
  );

  let anyKill = false;
  for (const def of defenders) {
    const defCover = coverBonus(def.col, def.row);
    const defStat = isEnemyAttacking
      ? (UNIT_CLASSES[def.cls]?.defense ?? 1)
      : getEnemyStats(def).defense;
    const defDice = rollD6();
    const save = defStat + defCover + defDice;
    const dmg = Math.max(0, hit - save);

    const defBreakdown =
      defCover > 0
        ? `${defDice}+${defStat}DEF+${defCover}COV=${save}`
        : `${defDice}+${defStat}DEF=${save}`;
    log(
      t("log.aoe_target_result", {
        name: def.name,
        defBreakdown,
        result: dmg > 0 ? t("log.attack_hit", { dmg }) : t("log.attack_miss"),
      }),
      dmg > 0 ? "combat" : "",
    );

    if (dmg > 0) {
      sfx("hit");
      addFX("hit", { col: def.col, row: def.row, dmg }, 800);
      def.hp -= dmg;
      if (def.hp <= 0) {
        def.hp = 0;
        def.alive = false;
        sfx("death");
        log(t("log.unit_eliminated", { name: def.name }), "combat");
        if (!isEnemyAttacking && G.missionType === "search_destroy")
          G.missionState.kills = (G.missionState.kills || 0) + 1;
        addFX("death", { col: def.col, row: def.row }, 1100);
        anyKill = true;
      } else if (isEnemyAttacking && !def.shaken) {
        const maxHp = UNIT_CLASSES[def.cls]?.hp ?? def.maxHp;
        if (def.hp / maxHp < 0.3) {
          def.shaken = true;
          log(t("log.unit_shaken", { name: def.name }), "combat");
        }
      }
    } else {
      sfx("miss");
      addFX("miss", { col: def.col, row: def.row }, 600);
    }
  }

  updateUI();
  render();
  if (anyKill) await sleep(500);
  if (!isEnemyAttacking) checkVictory();
}
