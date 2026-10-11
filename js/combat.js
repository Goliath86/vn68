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

  // Orientamento del bersaglio: dal lato copertura dimezzata, alle spalle
  // copertura nulla e +1 ATK (vale per entrambe le parti)
  const sector = facingSector(defender, attacker);
  // Postura: bonus ATK di chi spara (US) e DEF di chi è bersagliato (US);
  // ferite: malus ATK di chi spara (US)
  const atkVal =
    Math.max(
      1,
      (weapon?.atk ?? atkDef.attack) - rangePenalty - woundAttackPenalty(attacker),
    ) +
    rearAttackBonus(attacker, defender) +
    stanceAttackBonus(attacker, weapon);
  const defCover = effectiveCover(attacker, defender);
  if (sector !== "front")
    log(t(`log.attack_${sector}`, { name: defender.name }), "combat");
  const defStat = isEnemy
    ? (UNIT_CLASSES[defender.cls]?.defense ?? 1) +
      stanceDefenseBonus(defender, attacker)
    : getEnemyStats(defender).defense;
  const defVal = defStat + defCover;

  if (!isEnemy) {
    if (woundAttackPenalty(attacker) > 0)
      log(
        t("log.wound_atk_penalty", {
          name: attacker.name,
          penalty: woundAttackPenalty(attacker),
        }),
        "combat",
      );
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
  // Statistiche: precisione reale contro probabilità attesa (stessa formula)
  statAttack(!isEnemy, diceOdds(atkVal, defVal, defender.hp).pHit, dmg, sector);

  const sniper = !!attacker.cls?.startsWith("sniper");
  const melee = !!weapon?.melee;
  // Colpo/mancato/morte (effetti e suoni) partono all'arrivo del tracciante
  // (corpo a corpo: a metà del fendente)
  const impact = melee ? MELEE_IMPACT_MS : shotImpactDelay(sniper);
  sfxShoot(attacker.cls, weapon);
  addFX(
    melee ? "slash" : "shot",
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
    melee ? MELEE_FX_MS : SHOT_FX_MS,
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
        enemy: !isEnemy,
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
      if (!isEnemy && weapon?.melee) statAdd("meleeKills");
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
    } else if (isEnemy) {
      // Difensore US sopravvissuto: morale (scosso sotto il 30%) ed emorragia
      afterUnitDamage(defender, dmg);
    }
  } else {
    // Corpo a corpo mancato: niente rimbalzo del proiettile, il VC schiva
    if (!melee) sfxAt("miss", impact);
    addFX(
      "miss",
      {
        col: defender.col,
        row: defender.row,
        fromCol: attacker.col,
        fromRow: attacker.row,
        enemy: !isEnemy,
        blast: melee,
      },
      800,
      impact,
    );
  }

  faceAfterShot(attacker, defender);
  if (!isEnemy) {
    // Il VC bersagliato si allerta sempre; lo sparo allerta chi lo sente
    alertVcToward(defender, attacker);
    const noise = weaponNoise(attacker, weapon ?? unitFireWeapon(attacker));
    makeNoise(attacker, noise);
    revealShooter(attacker, noise);
  }

  updateUI();
  render();

  // Assalto all'arma bianca riuscito: l'unità avanza nel tile del VC ucciso
  if (melee && !isEnemy && !defender.alive)
    await meleeAdvance(attacker, defender, impact);

  return dmg > 0;
}

const MELEE_FX_MS = 450; // durata del fendente
const MELEE_IMPACT_MS = 180; // ms tra l'inizio del fendente e il colpo
const MELEE_ADVANCE_DELAY_MS = 450; // pausa dopo il colpo, mentre il VC cade

// Dopo un'uccisione all'arma bianca l'unità occupa il tile del nemico, senza
// costo AP. Il movimento non è annullabile. Si salta se nel frattempo
// l'unità si è mossa o il tile è stato occupato.
async function meleeAdvance(unit, victim, impact) {
  const col = victim.col,
    row = victim.row;
  const fromCol = unit.col,
    fromRow = unit.row;
  await sleep(impact + MELEE_ADVANCE_DELAY_MS);
  if (
    G.phase !== "player" ||
    !unit.alive ||
    unit.col !== fromCol ||
    unit.row !== fromRow ||
    isOccupied(col, row)
  )
    return;
  log(t("log.melee_advance", { name: unit.name }), "combat");
  await moveUnit(unit, col, row, 0);
  G.lastMove = null;
  // Le evidenziazioni di una modalità aperta nel frattempo partono dal tile vecchio
  if (G.selectedUnit === unit && G.actionMode) setActionMode(null);
  updateUI();
}

// Anteprima attacco del giocatore: probabilità di colpire e danno medio, calcolati
// esattamente sulla stessa formula di resolveCombat (2d6+ATK vs DEF+COV+1d6)
function attackOdds(attacker, defender, weapon) {
  const def = UNIT_CLASSES[attacker.cls];
  const range = dist(attacker, defender);
  const atkVal =
    Math.max(
      1,
      (weapon?.atk ?? def.attack) -
        weaponRangePenalty(attacker, weapon, range) -
        woundAttackPenalty(attacker),
    ) +
    rearAttackBonus(attacker, defender) +
    stanceAttackBonus(attacker, weapon);
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
        (isEnemyAttacking || hitHidden || isEnemyVisible(e)),
    ),
  ];

  sfxShoot(attacker.cls, weapon);
  addFX("explosion", { col: tc, row: tr, aoe: weapon.aoe }, 1300);
  // Statistiche: artiglieria (hitHidden), esplosivi US, RPG VC
  statAdd(isEnemyAttacking ? "aoeVc" : hitHidden ? "artillery" : "aoeUs");
  // Esplosione US: il rumore parte dal punto d'impatto (e il lancio svela chi lancia)
  if (!isEnemyAttacking) {
    const noise = weaponNoise(attacker, weapon);
    makeNoise({ col: tc, row: tr }, noise);
    revealShooter(attacker, noise);
  }

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
      ? (UNIT_CLASSES[def.cls]?.defense ?? 1) + stanceAoeDefenseBonus(def)
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
      // Statistiche: danno inflitto/subito; US colpiti da esplosivi US = fuoco amico
      if (isUS) statAdd(isEnemyAttacking ? "vcDmg" : "friendlyFire", dmg);
      else if (!isEnemyAttacking) statAdd("usDmg", dmg);
      sfx("hit");
      addFX(
        "hit",
        {
          col: def.col,
          row: def.row,
          dmg,
          fromCol: tc,
          fromRow: tr,
          enemy: !isUS,
        },
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
      } else if (isUS) {
        afterUnitDamage(def, dmg);
      }
    } else {
      sfx("miss");
      addFX(
        "miss",
        {
          col: def.col,
          row: def.row,
          fromCol: tc,
          fromRow: tr,
          blast: true,
          enemy: !isUS,
        },
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
