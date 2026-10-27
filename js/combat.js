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

  // ATK e DEF con tutti i modificatori (attackBreakdown, condiviso con l'anteprima)
  const melee = !!weapon?.melee;
  const { knife, ms, sector, rangePenalty, atkVal, defStat, defCover, defVal } =
    attackBreakdown(attacker, defender, weapon, isEnemy);
  if (sector !== "front" && !knife)
    log(t(`log.attack_${sector}`, { name: defender.name }), "combat");

  if (!isEnemy) {
    const woundPen = woundAttackPenalty(attacker) * (knife ? MELEE.woundMult : 1);
    if (woundPen > 0)
      log(
        t("log.wound_atk_penalty", {
          name: attacker.name,
          penalty: woundPen,
        }),
        "combat",
      );
    if (knife)
      log(
        t(`log.melee_guard_${ms.sector}`, { name: defender.name, guard: ms.guard }),
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
  const margin = hit - save;
  const dmg = knife ? (margin > 0 ? defender.hp : 0) : Math.max(0, margin);
  // Statistiche: precisione reale contro probabilità attesa (stessa formula)
  statAttack(!isEnemy, diceOdds(atkVal, defVal, defender.hp).pHit, dmg, sector);

  const sniper = isMarksman(attacker);
  // Il tiratore si gira verso il bersaglio prima di sparare: con le
  // animazioni sparo ed effetti partono a girata finita (animations.js)
  const lead = aimTurnLead(attacker, defender, isEnemy);
  faceToward(attacker, defender);
  // Colpo/mancato/morte (effetti e suoni) partono all'arrivo del tracciante
  // (corpo a corpo: a metà del fendente)
  const impact = lead + (melee ? MELEE_IMPACT_MS : shotImpactDelay(sniper));
  if (lead) setTimeout(() => sfxShoot(attacker.cls, weapon), lead);
  else sfxShoot(attacker.cls, weapon);
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
    lead,
  );

  const defBreakdown =
    knife && ms.guard > 0
      ? `${defDice}+${defStat}DEF+${ms.guard}GRD=${save}`
      : defCover > 0
        ? `${defDice}+${defStat}DEF+${defCover}COV=${save}`
        : `${defDice}+${defStat}DEF=${save}`;

  const result =
    dmg > 0
      ? knife
        ? t("log.melee_kill")
        : t("log.attack_hit", { dmg })
      : t("log.attack_miss");

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
    applyAttackDamage(attacker, defender, dmg, isEnemy, weapon, impact);
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
    if (knife) meleeStruggle(attacker, defender, margin, weapon, impact);
  }

  faceAfterShot(attacker, defender);
  if (!isEnemy) {
    // Il VC bersagliato si allerta sempre; lo sparo allerta chi lo sente
    alertVcToward(defender, attacker);
    const noise = weaponNoise(attacker, weapon ?? unitFireWeapon(attacker));
    makeNoise(attacker, noise);
    revealShooter(attacker, noise);
  }

  // Tutorial: attacco del giocatore (arma, corpo a corpo, lato, esito)
  if (!isEnemy)
    tutorialEvent("attack", {
      cls: attacker.cls,
      weapon: weapon?.id ?? null,
      melee,
      sector,
      hit: dmg > 0,
      kill: !defender.alive,
    });

  updateUI();
  render();

  // Assalto all'arma bianca riuscito: l'unità avanza nel tile del VC ucciso
  if (melee && !isEnemy && !defender.alive)
    await meleeAdvance(attacker, defender, impact);

  return dmg > 0;
}

// Danno di un attacco diretto (o di una colluttazione) a `target`, con
// effetti, eventuale eliminazione e conseguenze. targetIsUS: il bersaglio è
// un soldato della squadra. Restituisce true se il bersaglio è morto.
function applyAttackDamage(attacker, target, dmg, targetIsUS, weapon, impact) {
  sfxAt("hit", impact);
  addFX(
    "hit",
    {
      col: target.col,
      row: target.row,
      dmg,
      fromCol: attacker.col,
      fromRow: attacker.row,
      enemy: !targetIsUS,
    },
    800,
    impact,
  );
  target.hp -= dmg;
  if (target.hp > 0) {
    // Difensore US sopravvissuto: morale (scosso sotto il 30%) ed emorragia
    if (targetIsUS) afterUnitDamage(target, dmg);
    return false;
  }
  target.hp = 0;
  target.alive = false;
  dropPilot(target);
  sfxAt("death", impact);
  log(t("log.unit_eliminated", { name: target.name }), "combat");
  if (!targetIsUS) {
    if (G.missionType === "search_destroy")
      G.missionState.kills = (G.missionState.kills || 0) + 1;
    if (weapon?.melee) statAdd("meleeKills");
    creditKill(attacker);
    tutorialEvent("kill", { id: target.id, how: "attack" });
  }
  addFX(
    "death",
    { col: target.col, row: target.row, cls: target.cls, enemy: !targetIsUS, stance: pieceStance(target), facing: target.facing },
    1400,
    impact,
  );
  return true;
}

// Coltello fallito: colluttazione. Di poco (margine ≥ MELEE.struggleMargin)
// il VC resta ferito e a volte anche l'aggressore; altrimenti il VC para e
// contrattacca. Numeri in mechanics.js:MELEE
function meleeStruggle(attacker, defender, margin, weapon, impact) {
  let selfDmg = 0;
  if (margin >= MELEE.struggleMargin) {
    log(t("log.melee_struggle", { name: attacker.name, vc: defender.name }), "combat");
    // Un VC già ferito può morire nella colluttazione (e non contrattacca)
    if (applyAttackDamage(attacker, defender, MELEE.struggleVcDmg, false, weapon, impact))
      return;
    if (Math.random() < MELEE.struggleSelfChance) selfDmg = MELEE.counterDmg;
  } else {
    log(t("log.melee_parried", { name: attacker.name, vc: defender.name }), "combat");
    selfDmg =
      margin <= MELEE.heavyCounterMargin ? MELEE.heavyCounterDmg : MELEE.counterDmg;
  }
  if (!selfDmg) return;
  statAdd("vcDmg", Math.min(selfDmg, attacker.hp));
  log(t("log.melee_wounded", { name: attacker.name, dmg: selfDmg }), "combat");
  if (applyAttackDamage(defender, attacker, selfDmg, true, null, impact))
    checkGameOver();
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

// ATK e DEF di un attacco diretto con le voci che li compongono, usati sia da
// resolveCombat sia dall'anteprima. isEnemy: attacca un VC. Ogni voce è
// [chiave odds.*, valore]; le voci a 0 non contano (formatOddsMods le salta).
//  - orientamento del bersaglio: dal lato copertura dimezzata, alle spalle
//    copertura nulla e +1 ATK (vale per entrambe le parti)
//  - postura: bonus ATK di chi spara (US) e DEF di chi è bersagliato (US)
//  - ferite: malus ATK di chi spara (US), prima del minimo di 1
//  - gittata: armi con rangePenalty (default cecchino), -1 ATK ogni 2 tile
//  - coltello della squadra: guardia del VC al posto della copertura, colpo
//    a segno = uccisione, colluttazione se fallisce (mechanics.js:MELEE)
function attackBreakdown(attacker, defender, weapon, isEnemy = false) {
  const knife = !!weapon?.melee && !isEnemy;
  const sector = facingSector(defender, attacker);
  const rear = rearAttackBonus(attacker, defender);
  if (knife) {
    const ms = meleeStats(attacker, defender, weapon);
    return {
      knife, ms, sector, rangePenalty: 0,
      atkVal: ms.atk, defStat: ms.defStat, defCover: 0, defVal: ms.def,
      atkMods: [
        ["weapon", Math.max(1, weapon?.atk ?? 1)],
        ["wound", -woundAttackPenalty(attacker) * MELEE.woundMult],
        ["rear", rear],
      ],
      defMods: [["base", ms.defStat], [`guard_${sector}`, ms.guard]],
    };
  }
  const atkDef = isEnemy ? getEnemyStats(attacker) : UNIT_CLASSES[attacker.cls];
  const base = weapon?.atk ?? atkDef.attack;
  const rangePenalty = isEnemy
    ? 0
    : weaponRangePenalty(attacker, weapon, dist(attacker, defender));
  const wound = woundAttackPenalty(attacker);
  const raw = base - rangePenalty - wound;
  const stanceAtk = stanceAttackBonus(attacker, weapon);
  const atkVal = Math.max(1, raw) + rear + stanceAtk;
  const defBase = isEnemy
    ? (UNIT_CLASSES[defender.cls]?.defense ?? 1)
    : getEnemyStats(defender).defense;
  const stanceDef = isEnemy ? stanceDefenseBonus(defender, attacker) : 0;
  const defStat = defBase + stanceDef;
  const defCover = effectiveCover(attacker, defender);
  // Copertura del tile annullata alle spalle: la voce resta visibile a 0
  const tileCover = coverBonus(defender.col, defender.row);
  return {
    knife, ms: null, sector, rangePenalty,
    atkVal, defStat, defCover, defVal: defStat + defCover,
    atkMods: [
      ["weapon", base],
      ["range", -rangePenalty],
      ["wound", -wound],
      ["min", Math.max(1, raw) - raw],
      ["rear", rear],
      ["stance", stanceAtk],
    ],
    defMods: [
      ["base", defBase],
      ["stance", stanceDef],
      sector === "rear" && tileCover > 0
        ? ["cover_rear", 0]
        : [sector === "side" ? "cover_side" : "cover", defCover],
    ],
  };
}

// Voci di un attacco in breve, es. "arma 2 · spalle +1": il primo valore
// (arma/base) senza segno, le voci a 0 saltate (tranne la copertura annullata)
function formatOddsMods(mods) {
  return mods
    .filter(([k, v], i) => i === 0 || v !== 0 || k === "cover_rear")
    .map(([k, v], i) => {
      const val = i === 0 || k === "cover_rear" ? `${v}` : v > 0 ? `+${v}` : `−${-v}`;
      return k === "cover_rear" ? t("odds.cover_rear") : `${t(`odds.${k}`)} ${val}`;
    })
    .join(" · ");
}

// Scomposizione completa su una riga: "ATK 3 (arma 2 · spalle +1) vs DEF 2 (…)"
function oddsBreakdownText(b) {
  return t("odds.breakdown", {
    atk: b.atkVal,
    atkMods: formatOddsMods(b.atkMods),
    def: b.defVal,
    defMods: formatOddsMods(b.defMods),
  });
}

// Fascia di colore per una probabilità di colpire (etichette e pannelli)
const ODDS_GOOD = 0.75;
const ODDS_FAIR = 0.5;
function oddsColor(p) {
  return p >= ODDS_GOOD ? "#7ee07e" : p >= ODDS_FAIR ? "#ffe080" : "#ff7a6a";
}

// Anteprima attacco del giocatore: probabilità di colpire, danno medio e
// probabilità di uccidere, sulla stessa formula di resolveCombat
// (2d6+ATK vs DEF+COV+1d6). b: la scomposizione dei modificatori
function attackOdds(attacker, defender, weapon) {
  const b = attackBreakdown(attacker, defender, weapon);
  const o = diceOdds(b.atkVal, b.defVal, defender.hp);
  // Coltello: la probabilità di colpire è quella di uccidere
  if (b.knife) return { pHit: o.pHit, expDmg: o.pHit * defender.hp, pKill: o.pHit, b };
  return { ...o, b };
}

// DEF di un bersaglio contro un'esplosione: copertura piena del tile, per
// gli US anche il bonus di postura contro le esplosioni
function aoeDefense(def) {
  const isUS = G.units.includes(def);
  const defStat = isUS
    ? (UNIT_CLASSES[def.cls]?.defense ?? 1) + stanceAoeDefenseBonus(def)
    : getEnemyStats(def).defense;
  return { isUS, defStat, defCover: coverBonus(def.col, def.row) };
}

// Anteprima di un'esplosione US in (tc, tr): per ogni bersaglio nel raggio
// (soldati inclusi, VC solo se visibili) probabilità di colpire e uccidere
function aoeOdds(weapon, tc, tr, line = null) {
  // Napalm: chi si trova sui tile della linea (mechanics.js)
  if (weapon.napalm) return napalmOdds(weapon, line || [{ col: tc, row: tr }]);
  // Artiglieria: la salva si disperde, probabilità su tutti i colpi (mechanics.js)
  if (weapon.artillery) {
    const reach = artilleryScatter(weapon) + weapon.aoe;
    const near = (x) => x.alive && Math.abs(x.col - tc) <= reach && Math.abs(x.row - tr) <= reach;
    return artilleryOdds(weapon, tc, tr, [...G.units.filter(near), ...G.enemies.filter((e) => near(e) && isEnemyVisible(e))]);
  }
  const inBlast = (x) => x.alive && dist(x, { col: tc, row: tr }) <= weapon.aoe;
  return [...G.units.filter(inBlast), ...G.enemies.filter((e) => inBlast(e) && isEnemyVisible(e))]
    .map((target) => {
      const { isUS, defStat, defCover } = aoeDefense(target);
      return { target, isUS, ...diceOdds(weapon.atk, defStat + defCover, target.hp) };
    });
}

// ── CLASSI VC (constants.js:ENEMY_CLASSES) ─────────────────────────────
// Classe sconosciuta (es. salvataggio di una mod rimossa): guerrigliero
function enemyClass(cls) {
  return ENEMY_CLASSES[cls] || ENEMY_CLASSES.grunt;
}

function getEnemyStats(enemy) {
  return enemyClass(enemy.cls);
}

// Comportamento della classe: "rifleman" | "sniper" | "commander"
function enemyRole(enemy) {
  return enemyClass(enemy.cls).role || "rifleman";
}

// Tiratore scelto (un solo tracciante, più veloce): classe US "marksman" o
// VC di ruolo "sniper"
function isMarksman(unit) {
  if (ENEMY_CLASSES[unit?.cls]) return enemyRole(unit) === "sniper";
  return !!UNIT_CLASSES[unit?.cls]?.marksman;
}

function enemyName(cls) {
  const n = enemyClass(cls).name;
  if (typeof n === "number") return VC_NAMES[n] ?? VC_NAMES[0];
  if (n && typeof n === "object") return n[LANG] ?? n.it ?? VC_NAMES[0];
  return n || VC_NAMES[0];
}

// Pesi della composizione VC per la mappa corrente: "spawn" | "ambush" |
// "reinforcement" (constants.js:VC_MIX; le imboscate usano "vcMix" della
// mappa se manca "ambushMix")
function vcMix(kind) {
  const md = G.mapData || {};
  if (kind === "spawn") return md.vcMix || VC_MIX.spawn;
  if (kind === "ambush") return md.ambushMix || md.vcMix || VC_MIX.ambush;
  return md.reinforcementMix || VC_MIX.reinforcement;
}

// Classe estratta in proporzione ai pesi; con una sola classe non consuma
// numeri casuali
function pickEnemyClass(mix) {
  const entries = Object.entries(mix || {}).filter(([c, w]) => w > 0 && ENEMY_CLASSES[c]);
  if (!entries.length) return "grunt";
  if (entries.length === 1) return entries[0][0];
  let r = Math.random() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [c, w] of entries) {
    if (r < w) return c;
    r -= w;
  }
  return entries[entries.length - 1][0];
}

// Nuovo VC della classe `cls`. o: name, hp, facing (default casuale),
// alerted, hold
function makeEnemy(id, cls, col, row, o = {}) {
  const def = enemyClass(cls);
  return {
    id,
    name: o.name ?? enemyName(cls),
    cls,
    col,
    row,
    hp: Math.min(def.hp, o.hp ?? def.hp),
    maxHp: def.hp,
    ap: def.ap,
    maxAp: def.ap,
    alive: true,
    alerted: !!o.alerted,
    hold: !!o.hold,
    facing: o.facing ?? rnd(0, 3),
    suppressed: false,
    vx: col,
    vy: row,
    weapons: buildWeapons(cls, G.missionState.vcCarrierCounts),
    weaponIdx: 0,
  };
}

// ── LANCIO A MANO (granate) ────────────────────────────────────────────
// Campo arma "scatter": raggio in tile del quadrato in cui la granata può
// finire al posto del tile scelto (1 = quadrato 3×3 centrato sul bersaglio:
// rami, lancio impreciso, rotolamenti); "scatterChance": probabilità di
// deviare, verso uno degli altri tile del quadrato a caso (default 0.5).
// Mai fuori mappa né su tile che bloccano la vista (muri, edifici, bunker:
// la granata ci rimbalza contro).
const SCATTER_CHANCE = 0.5;

function throwLanding(weapon, tc, tr) {
  const s = weapon.scatter || 0;
  if (!s || Math.random() >= (weapon.scatterChance ?? SCATTER_CHANCE)) return { col: tc, row: tr };
  const options = [];
  for (let dr = -s; dr <= s; dr++)
    for (let dc = -s; dc <= s; dc++) {
      if (!dc && !dr) continue;
      const tile = getTileAt(tc + dc, tr + dr);
      if (tile && tile.losBlock !== "full") options.push({ col: tc + dc, row: tr + dr });
    }
  return options.length ? pick(options) : { col: tc, row: tr };
}

// Lancio del giocatore: punto di caduta (con deviazione), animazione ad
// arco con rimbalzi (animations.js:_drawGrenadeThrow), poi l'esplosione.
// Durante il volo G.throwing blocca le altre azioni.
async function throwAoe(attacker, weapon, tc, tr) {
  // Artiglieria: "scatter" è la dispersione della salva, non del lancio
  const land = weapon.artillery ? { col: tc, row: tr } : throwLanding(weapon, tc, tr);
  if (weapon.thrown) {
    G.throwing = true;
    updateUI();
    // Braccio che carica dietro la spalla: la granata parte al rilascio
    unitGesture(attacker, "throw");
    await sleep(gestureLeadMs("throw"));
    const plan = planGrenadeThrow(attacker, { col: tc, row: tr }, land);
    addFX("grenade", plan, plan.ms);
    await sleep(plan.ms);
    G.throwing = false;
  }
  if (land.col !== tc || land.row !== tr) {
    statAdd("grenadeScatter");
    log(t("log.grenade_scatter", { name: attacker.name, weapon: weaponLabel(weapon) }), "combat");
  }
  await resolveAoeCombat(attacker, weapon, land.col, land.row, false);
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

  // Napalm: niente esplosione né cratere, le fiamme le disegna resolveNapalm
  if (weapon.napalm) {
    sfx("napalm");
  } else {
    sfxShoot(attacker.cls, weapon);
    // Lanciarazzi e simili: rinculo di chi spara (le granate sono già partite)
    if (!weapon.thrown && !hitHidden) unitRecoil(attacker);
    // big: cratere più largo per l'artiglieria (animations.js:addCrater)
    addFX("explosion", { col: tc, row: tr, aoe: weapon.aoe, big: hitHidden }, 1300);
  }
  // Statistiche: esplosivi US, RPG VC (l'artiglieria conta le salve, mechanics.js)
  if (!hitHidden) statAdd(isEnemyAttacking ? "aoeVc" : "aoeUs");
  // Esplosione US: il rumore parte dal punto d'impatto (e il lancio svela chi lancia)
  if (!isEnemyAttacking) {
    const noise = weaponNoise(attacker, weapon);
    makeNoise({ col: tc, row: tr }, noise);
    revealShooter(attacker, noise);
  }

  if (!defenders.length) {
    // Colpi della salva d'artiglieria a vuoto: niente riga di log per ognuno
    if (!hitHidden) log(
      t("log.aoe_no_targets", {
        name: attacker.name,
        weapon: weaponLabel(weapon),
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
      weapon: weaponLabel(weapon),
      targets: defenders.length,
    }),
    "combat",
  );

  let anyKill = false;
  for (const def of defenders) {
    const { isUS, defStat, defCover: cover } = aoeDefense(def);
    // Il napalm cola dentro ogni riparo: niente copertura del terreno
    const defCover = weapon.napalm ? 0 : cover;
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
        dropPilot(def);
        sfx("death");
        log(t("log.unit_eliminated", { name: def.name }), "combat");
        if (!isUS && !isEnemyAttacking && G.missionType === "search_destroy")
          G.missionState.kills = (G.missionState.kills || 0) + 1;
        if (!isUS && !isEnemyAttacking) {
          creditKill(attacker);
          tutorialEvent("kill", { id: def.id, how: "aoe" });
        }
        addFX(
          "death",
          { col: def.col, row: def.row, cls: def.cls, enemy: !isUS, stance: pieceStance(def), facing: def.facing },
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
