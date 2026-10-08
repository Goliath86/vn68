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

  // Penalità gittata (armi con rangePenalty, default cecchino): -1 ATK ogni 2 tile
  const rangePenalty = !isEnemy
    ? weaponRangePenalty(attacker, weapon, range)
    : 0;

  const atkVal = Math.max(1, (weapon?.atk ?? atkDef.attack) - rangePenalty);
  // Attacco US: copertura dimezzata se il bersaglio è fiancheggiato
  const defCover = isEnemy
    ? coverBonus(defender.col, defender.row)
    : effectiveCover(attacker, defender);
  if (!isEnemy && defCover < coverBonus(defender.col, defender.row))
    log(t("log.flanked", { name: defender.name }), "combat");
  const defStat = isEnemy
    ? (UNIT_CLASSES[defender.cls]?.defense ?? 1)
    : getEnemyStats(defender).defense;
  const defVal = defStat + defCover;

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
  }

  const diceVals = rollDice(2);
  const roll = diceSum(diceVals);
  const hit = roll + atkVal;
  const defDice = rollD6();
  const save = defVal + defDice;
  const dmg = Math.max(0, hit - save);

  const sniper = !!attacker.cls?.startsWith("sniper");
  // Colpo/mancato/morte (effetti e suoni) partono all'arrivo del tracciante
  const impact = shotImpactDelay(sniper);
  sfxShoot(attacker.cls, weapon);
  addFX(
    "shot",
    {
      fromCol: attacker.col,
      fromRow: attacker.row,
      toCol: defender.col,
      toRow: defender.row,
      enemy: isEnemy,
      hit: dmg > 0,
      sniper,
      rounds: weapon?.rounds,
    },
    SHOT_FX_MS,
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
    sfxAt("hit", impact);
    addFX(
      "hit",
      {
        col: defender.col,
        row: defender.row,
        dmg,
        fromCol: attacker.col,
        fromRow: attacker.row,
      },
      800,
      impact,
    );
    defender.hp -= dmg;
    if (defender.hp <= 0) {
      defender.hp = 0;
      defender.alive = false;
      sfxAt("death", impact);
      log(t("log.unit_eliminated", { name: defender.name }), "combat");
      if (!isEnemy && G.missionType === "search_destroy") {
        G.missionState.kills = (G.missionState.kills || 0) + 1;
      }
      addFX(
        "death",
        {
          col: defender.col,
          row: defender.row,
          cls: defender.cls,
          enemy: !isEnemy,
        },
        1400,
        impact,
      );
    } else if (isEnemy && !defender.shaken) {
      // Morale: il difensore (unità US) è scosso se sotto 30% HP
      const maxHp = UNIT_CLASSES[defender.cls]?.hp ?? defender.maxHp;
      if (defender.hp / maxHp < 0.3) {
        defender.shaken = true;
        log(t("log.unit_shaken", { name: defender.name }), "combat");
      }
    }
  } else {
    sfxAt("miss", impact);
    addFX(
      "miss",
      {
        col: defender.col,
        row: defender.row,
        fromCol: attacker.col,
        fromRow: attacker.row,
      },
      800,
      impact,
    );
  }

  updateUI();
  render();
  return dmg > 0;
}

// Anteprima attacco del giocatore: probabilità di colpire e danno medio, calcolati
// esattamente sulla stessa formula di resolveCombat (2d6+ATK vs DEF+COV+1d6)
function attackOdds(attacker, defender, weapon) {
  const def = UNIT_CLASSES[attacker.cls];
  const range = dist(attacker, defender);
  const atkVal = Math.max(
    1,
    (weapon?.atk ?? def.attack) - weaponRangePenalty(attacker, weapon, range),
  );
  const defVal =
    getEnemyStats(defender).defense + effectiveCover(attacker, defender);
  let hits = 0,
    dmgSum = 0;
  for (let a = 1; a <= 6; a++)
    for (let b = 1; b <= 6; b++)
      for (let d = 1; d <= 6; d++) {
        const dmg = Math.max(0, a + b + atkVal - (defVal + d));
        if (dmg > 0) hits++;
        dmgSum += dmg;
      }
  return { pHit: hits / 216, expDmg: dmgSum / 216 };
}

function getEnemyStats(enemy) {
  if (enemy.cls === "sniper_vc")
    return { attack: 3, range: 4, defense: 0, move: 2 };
  if (enemy.cls === "commander")
    return { attack: 3, range: 2, defense: 1, move: 3 };
  return { attack: 2, range: 2, defense: 0, move: 3 };
}

// Risolve un attacco AoE (granata/RPG): dado attacco auto, ogni bersaglio tira difesa singolarmente.
// hitHidden: colpisce anche i VC nascosti nel FOW (artiglieria)
async function resolveAoeCombat(
  attacker,
  weapon,
  tc,
  tr,
  isEnemyAttacking,
  hitHidden = false,
) {
  // Armi speciali: fumogeno (nessun danno) e richiesta d'artiglieria (colpo ritardato)
  if (weapon.smoke) return deploySmoke(attacker, weapon, tc, tr);
  if (weapon.artillery) return scheduleArtillery(attacker, weapon, tc, tr);

  const diceVals = rollDice(2);
  const roll = diceSum(diceVals);
  const hit = roll + weapon.atk;

  // L'esplosione colpisce chiunque nel raggio, US e VC (fuoco amico incluso).
  // Sui lanci del giocatore i VC nascosti nel FOW restano esclusi per non rivelarli.
  const inBlast = (x) => x.alive && dist(x, { col: tc, row: tr }) <= weapon.aoe;
  const defenders = [
    ...G.units.filter(inBlast),
    ...G.enemies.filter(
      (e) =>
        inBlast(e) &&
        (isEnemyAttacking || hitHidden || isTileVisible(e.col, e.row)),
    ),
  ];

  sfxShoot(attacker.cls, weapon);
  addFX("explosion", { col: tc, row: tr, aoe: weapon.aoe }, 1300);

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
    const isUS = G.units.includes(def);
    const defCover = coverBonus(def.col, def.row);
    const defStat = isUS
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
      addFX(
        "hit",
        { col: def.col, row: def.row, dmg, fromCol: tc, fromRow: tr },
        800,
      );
      def.hp -= dmg;
      if (def.hp <= 0) {
        def.hp = 0;
        def.alive = false;
        sfx("death");
        log(t("log.unit_eliminated", { name: def.name }), "combat");
        if (!isUS && !isEnemyAttacking && G.missionType === "search_destroy")
          G.missionState.kills = (G.missionState.kills || 0) + 1;
        addFX(
          "death",
          { col: def.col, row: def.row, cls: def.cls, enemy: !isUS },
          1400,
        );
        anyKill = true;
      } else if (isUS && !def.shaken) {
        const maxHp = UNIT_CLASSES[def.cls]?.hp ?? def.maxHp;
        if (def.hp / maxHp < 0.3) {
          def.shaken = true;
          log(t("log.unit_shaken", { name: def.name }), "combat");
        }
      }
    } else {
      sfx("miss");
      addFX(
        "miss",
        { col: def.col, row: def.row, fromCol: tc, fromRow: tr, blast: true },
        800,
      );
    }
  }

  updateUI();
  render();

  if (anyKill) await sleep(500);
  // Lancio del giocatore: anche sconfitta possibile (fuoco amico sull'ultima unità)
  if (!isEnemyAttacking) checkGameOver();
}
