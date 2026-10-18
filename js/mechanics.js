// ── MECCANICHE TATTICHE ────────────────────────────────────────────────
// Orientamento, trappole VC, fumogeni, supporto d'artiglieria, missioni
// notturne e morale VC. Lo stato runtime vive in G.missionState (traps,
// smokes, artillery, night) così finisce automaticamente nel salvataggio.

// ── ORIENTAMENTO ───────────────────────────────────────────────────────
// Ogni unità (US e VC) guarda in una delle 4 direzioni (unit.facing:
// 0=N 1=E 2=S 3=O). Rispetto a chi guarda, ogni tile cade in un settore:
// fronte (cono di 90°), retro (cono di 90° opposto) o lato (il resto).
// Attacco dal lato: copertura dimezzata. Dalle spalle: copertura nulla e +1 ATK.
const FACING_DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const REAR_ATK_BONUS = 1;
const VC_REAR_ALERT_DISTANCE = 2;

// Direzione cardinale da `from` verso `to` (asse dominante; null se coincidono)
function facingToward(from, to) {
  const dx = to.col - from.col,
    dy = to.row - from.row;
  if (!dx && !dy) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 1 : 3;
  return dy > 0 ? 2 : 0;
}

function faceToward(unit, to) {
  const f = facingToward(unit, to);
  if (f !== null) unit.facing = f;
}

// Settore di `unit` in cui si trova `from`: "front" | "side" | "rear"
// (`facing` opzionale: per valutare una direzione diversa da quella attuale)
function facingSector(unit, from, facing = unit.facing) {
  const [fx, fy] = FACING_DIRS[facing ?? 2];
  const dx = from.col - unit.col,
    dy = from.row - unit.row;
  const fwd = dx * fx + dy * fy;
  const lat = Math.abs(dx * fy - dy * fx);
  if (fwd > 0 && lat <= fwd) return "front";
  if (fwd < 0 && lat <= -fwd) return "rear";
  return fwd === 0 && lat === 0 ? "front" : "side";
}

// Orientamento iniziale: verso il baricentro delle zone di spawn VC
function initialFacing(pos) {
  const md = G.mapData;
  const zones = md.vcSpawnZones || [];
  const target = zones.length
    ? {
        col: zones.reduce((s, z) => s + (z.colMin + z.colMax) / 2, 0) / zones.length,
        row: zones.reduce((s, z) => s + (z.rowMin + z.rowMax) / 2, 0) / zones.length,
      }
    : { col: md.cols / 2, row: md.rows / 2 };
  return facingToward(pos, target) ?? 2;
}

// Copertura del bersaglio contro un attacco diretto, secondo il lato da cui arriva
function effectiveCover(attacker, target) {
  const cover = coverBonus(target.col, target.row);
  const sector = facingSector(target, attacker);
  if (sector === "rear") return 0;
  return sector === "side" ? Math.floor(cover / 2) : cover;
}

function rearAttackBonus(attacker, target) {
  return facingSector(target, attacker) === "rear" ? REAR_ATK_BONUS : 0;
}

// Dopo uno scambio di colpi chi spara guarda il bersaglio e il bersaglio,
// se sopravvive, si gira verso chi lo ha attaccato
function faceAfterShot(attacker, defender) {
  faceToward(attacker, defender);
  if (defender.alive) faceToward(defender, attacker);
}

// ── RUMORE ─────────────────────────────────────────────────────────────
// Ogni azione rumorosa della squadra (sparo, esplosione, demolizione) allerta
// i VC entro un raggio (Manhattan, il suono passa attraverso il terreno), che
// si girano verso la fonte. Il raggio delle armi è il campo `noise` in config.
const DEFAULT_NOISE = 4;
const DEFAULT_AOE_NOISE = 6;
const DEMOLITION_NOISE = 6;
const FIRE_NOISE = 2;

function weaponNoise(unit, weapon) {
  // Partite salvate prima del campo `noise`: si legge dal config attuale
  const cfg = (WEAPONS_CONFIG[unit?.cls] || []).find((w) => w.id === weapon?.id);
  return (
    weapon?.noise ?? cfg?.noise ?? (weapon?.aoe ? DEFAULT_AOE_NOISE : DEFAULT_NOISE)
  );
}

// Allerta un VC verso `src` (bersaglio colpito o rumore udito)
function alertVcToward(enemy, src) {
  if (!enemy.alive || enemy.alerted) return false;
  enemy.alerted = true;
  faceToward(enemy, src);
  addFX("spot", { col: enemy.col, row: enemy.row, relay: true }, 900);
  return true;
}

function makeNoise(src, radius) {
  if (!(radius > 0)) return;
  addFX("noise", { col: src.col, row: src.row, radius }, 1000);
  let heard = 0;
  for (const e of G.enemies) {
    if (dist(e, src) > radius) continue;
    // Il log conta solo i VC visibili, per non rivelare quelli nel FOW
    // (le statistiche invece li contano tutti)
    if (!alertVcToward(e, src)) continue;
    statAdd("noiseAlerts");
    if (isTileVisible(e.col, e.row)) heard++;
  }
  if (heard) log(t("log.noise_alert", { count: heard }), "enemy");
}

// Spari VC: allertano gli altri VC entro il raggio di rumore dell'arma
// (campo `noise`, come per la squadra), che si girano verso il bersaglio,
// cioè dove si combatte. Disattivabile per mappa con "vcNoise": false.
// L'onda sonora si disegna solo se il tiratore è visibile, per non rivelarlo;
// il log conta solo i VC allertati in vista.
function makeVcNoise(shooter, target, weapon) {
  if (G.mapData?.vcNoise === false) return;
  const radius = weaponNoise(shooter, weapon);
  if (!(radius > 0)) return;
  if (isTileVisible(shooter.col, shooter.row))
    addFX("noise", { col: shooter.col, row: shooter.row, radius, vc: true }, 1000);
  let heard = 0;
  for (const e of G.enemies) {
    if (e === shooter || dist(e, shooter) > radius) continue;
    if (!alertVcToward(e, target)) continue;
    statAdd("vcNoiseAlerts");
    if (isTileVisible(e.col, e.row)) heard++;
  }
  if (heard) log(t("log.vc_noise_alert", { count: heard }), "enemy");
}

// ── MISSIONI NOTTURNE ──────────────────────────────────────────────────
// Penalità separate: i VC conoscono il terreno e sparano corto (gittata 2),
// quindi la vista ridotta li limita poco; con 2 anche per i soldati la
// squadra restava cieca (simulatore: 3–8% di vittorie contro 18–24% di giorno)
const NIGHT_VISION_PENALTY = 1;
const VC_NIGHT_PENALTY = 2;
const VC_ALERT_DISTANCE = 5;

function isNight() {
  return !!(G.missionState?.night || G.mapData?.night);
}

// Riduzione notturna della visione dei soldati
function nightPenalty() {
  return isNight()
    ? (G.mapData?.nightVisionPenalty ?? NIGHT_VISION_PENALTY)
    : 0;
}

// Riduzione notturna di allerta e vista dei VC
function vcNightPenalty() {
  return isNight() ? (G.mapData?.vcNightPenalty ?? VC_NIGHT_PENALTY) : 0;
}

// ── PIOGGIA ────────────────────────────────────────────────────────────
// Solo effetto visivo. Campo mappa "rain": true = piove per tutta la
// missione; { chance, minTurns, maxTurns, fromStart } = acquazzoni casuali
// tirati a inizio turno giocatore. Stato in G.missionState.rain (salvato).
const RAIN_DEFAULTS = { chance: 0.2, minTurns: 2, maxTurns: 4, fromStart: false };

function rainConfig() {
  const r = G.mapData?.rain;
  if (!r) return null;
  if (r === true) return { always: true };
  return { ...RAIN_DEFAULTS, ...r };
}

function isRaining() {
  return !!(G.missionState?.rain?.active || rainConfig()?.always);
}

function initRain() {
  const cfg = rainConfig();
  if (!cfg) return;
  const start = !!(cfg.always || cfg.fromStart);
  G.missionState.rain = {
    active: start,
    turnsLeft: start && !cfg.always ? rnd(cfg.minTurns, cfg.maxTurns) : 0,
  };
  if (start) log(t("log.rain_start"), "system");
}

// Inizio turno giocatore: l'acquazzone in corso cala, oppure ne parte uno
function tickRain() {
  const cfg = rainConfig();
  if (!cfg || cfg.always) return;
  const st = (G.missionState.rain ||= { active: false, turnsLeft: 0 });
  if (st.active) {
    if (--st.turnsLeft <= 0) {
      st.active = false;
      log(t("log.rain_stop"), "system");
    }
  } else if (Math.random() < cfg.chance) {
    st.active = true;
    st.turnsLeft = rnd(cfg.minTurns, cfg.maxTurns);
    log(t("log.rain_start"), "system");
  }
}

// ── METEO (pannello) ───────────────────────────────────────────────────
// Solo informativo: cielo coperto e temperatura, mostrati nel pannello
// meteo (ui.js:updateWeatherPanel). Campi mappa opzionali "temperature":
// { day: [min, max], night: [min, max] } in °C e "cloudy" (probabilità 0–1
// di cielo coperto). Stato in G.missionState.weather (salvato).
// Default: pianura del Sud Vietnam, stagione secca
const WEATHER_TEMPS = { day: [27, 34], night: [21, 26] };
const CLOUDY_CHANCE = 0.35;
const CLOUDY_SWITCH_CHANCE = 0.2;
const RAIN_COOLING = 3;
const CLOUD_COOLING = 1;

function weatherTempRange() {
  const key = isNight() ? "night" : "day";
  return G.mapData?.temperature?.[key] || WEATHER_TEMPS[key];
}

function initWeather() {
  const [lo, hi] = weatherTempRange();
  G.missionState.weather = {
    cloudy: Math.random() < (G.mapData?.cloudy ?? CLOUDY_CHANCE),
    temp: rnd(lo, hi),
  };
  return G.missionState.weather;
}

// Inizio turno giocatore (ai.js, dopo tickRain): le nuvole vanno e vengono,
// la temperatura oscilla di un grado entro l'intervallo
function tickWeather() {
  const w = G.missionState.weather || initWeather();
  if (!isRaining() && Math.random() < CLOUDY_SWITCH_CHANCE) w.cloudy = !w.cloudy;
  const [lo, hi] = weatherTempRange();
  w.temp = clamp(w.temp + rnd(-1, 1), lo, hi);
}

// { sky: "rain" | "cloudy" | "night" | "day", night, temp }; pioggia e nuvole
// abbassano la temperatura mostrata
function currentWeather() {
  if (!G.missionState) return null;
  const w = G.missionState.weather || initWeather();
  const night = isNight();
  const rain = isRaining();
  const sky = rain ? "rain" : w.cloudy ? "cloudy" : night ? "night" : "day";
  const temp = w.temp - (rain ? RAIN_COOLING : w.cloudy ? CLOUD_COOLING : 0);
  return { sky, night, temp };
}

// Raggio visivo di un'unità US (ridotto di notte e dalla postura, minimo 1)
function unitVision(unit) {
  return Math.max(
    1,
    UNIT_CLASSES[unit.cls].vision - nightPenalty() - unitStance(unit).vision,
  );
}

// Visione a cono: piena davanti, -1 ai lati, alle spalle al massimo 2 tile
// (e mai più che ai lati, così di notte il cono resta coerente)
const SIDE_VISION_PENALTY = 1;
const REAR_VISION = 2;

function unitVisionToward(unit, to, facing = unit.facing) {
  const v = unitVision(unit);
  const side = Math.max(1, v - SIDE_VISION_PENALTY);
  const sector = facingSector(unit, to, facing);
  if (sector === "rear") return Math.min(side, REAR_VISION);
  return sector === "side" ? side : v;
}

// Distanza a cui un VC in pattuglia si accorge della squadra
function vcAlertDistance() {
  return Math.max(2, VC_ALERT_DISTANCE - vcNightPenalty());
}

// Come sopra, ma secondo il lato da cui arriva l'unità US: piena davanti,
// -1 ai lati, solo a distanza ravvicinata alle spalle
// La postura bassa riduce ulteriormente la distanza (minimo 1)
function vcAlertDistanceFrom(enemy, unit) {
  const base = vcAlertDistance();
  const sector = facingSector(enemy, unit);
  let d = base;
  if (sector === "rear") d = Math.min(base, VC_REAR_ALERT_DISTANCE);
  else if (sector === "side") d = Math.max(VC_REAR_ALERT_DISTANCE, base - 1);
  return Math.max(1, d - unitStance(unit).spotRange);
}

// ── LINEA DI VISTA VC ──────────────────────────────────────────────────
// Stesse regole dei soldati (fowLos.js:isTileVisibleFromUnit): ogni tile
// intermedio a LOS parziale toglie 1 alla vista, terreno pieno e fumo la
// bloccano, chi è nel fumo vede ed è visto solo da distanza 1. La vista del
// VC è la sua distanza d'allerta (ridotta di notte); per sparare il bersaglio
// deve essere in gittata e in vista (il VC si gira verso chi colpisce, quindi
// per il fuoco non conta il cono).
function vcSees(from, to, sight = vcAlertDistance()) {
  const d = dist(from, to);
  if (d <= 1) return true;
  if (d > sight) return false;
  if (isSmoked(from.col, from.row) || isSmoked(to.col, to.row)) return false;
  return d + losRangePenalty(from.col, from.row, to.col, to.row) <= sight;
}

function vcCanFireAt(enemy, unit, range) {
  return dist(enemy, unit) <= range && vcSees(enemy, unit);
}

// Bersaglio di fuoco (cecchino VC): l'unità più vicina in gittata, in vista e individuata
// (la vista si controlla prima, così non si tira l'avvistamento per chi è
// dietro un muro)
function vcFireTarget(enemy, range) {
  return (
    G.units
      .filter((u) => u.alive)
      .sort((a, b) => dist(enemy, a) - dist(enemy, b))
      .find((u) => vcCanFireAt(enemy, u, range) && vcDetects(enemy, u)) ?? null
  );
}

// ── POSTURA ────────────────────────────────────────────────────────────
// In piedi / accucciato / sdraiato (unit.stance). Più si sta bassi più si
// mira e ci si ripara meglio, ma si vede meno e ci si muove a fatica.
//   atk        bonus ATK al fuoco diretto (non arma bianca), anche overwatch
//   def        bonus DEF contro il fuoco diretto (sdraiato: non a distanza 1)
//   aoeDef     bonus DEF contro esplosioni
//   vision     malus al raggio visivo
//   spotRange  malus alla distanza a cui i VC in pattuglia si accorgono di te
//   spotChance probabilità che un VC noti un'unità occultata (vedi sotto)
//   moveExtra  AP extra per ogni azione di movimento
//   crawl      striscia: un solo tile per azione di movimento
const STANCES = {
  stand: { atk: 0, def: 0, aoeDef: 0, vision: 0, spotRange: 0, spotChance: 1, moveExtra: 0 },
  crouch: { atk: 1, def: 1, aoeDef: 0, vision: 1, spotRange: 1, spotChance: 0.5, moveExtra: 1 },
  prone: { atk: 1, def: 2, aoeDef: 1, vision: 2, spotRange: 2, spotChance: 0.3, moveExtra: 1, crawl: true },
};
const STANCE_ORDER = ["stand", "crouch", "prone"];
const STANCE_ICONS = { stand: "🧍", crouch: "🧎", prone: "🐍" };

function unitStance(unit) {
  return STANCES[unit?.stance] || STANCES.stand;
}

// Bonus ATK della postura per un attacco diretto (l'arma bianca non ne beneficia)
function stanceAttackBonus(unit, weapon) {
  if (!G.units.includes(unit) || weapon?.melee) return 0;
  return unitStance(unit).atk;
}

// Bonus DEF della postura contro il fuoco diretto: chi è sdraiato è
// vulnerabile da vicino, quindi a distanza 1 vale solo il bonus accucciato
function stanceDefenseBonus(unit, attacker) {
  if (!G.units.includes(unit)) return 0;
  const s = unitStance(unit);
  if (s.crawl && attacker && dist(unit, attacker) <= 1) return STANCES.crouch.def;
  return s.def;
}

function stanceAoeDefenseBonus(unit) {
  return G.units.includes(unit) ? unitStance(unit).aoeDef : 0;
}

// Terreno che nasconde chi sta basso: vegetazione/macerie (LOS parziale) o
// copertura solida (≥2)
function isConcealingTile(col, row) {
  const t = getTileAt(col, row);
  return !!t && (t.losBlock === "partial" || (t.coverBonus || 0) >= 2);
}

// Occultata: postura bassa su terreno che nasconde e non scoperta (unit.exposed:
// ha sparato o è stata individuata; vale fino alla fine del turno VC)
function isConcealed(unit) {
  return (
    unit.alive &&
    unit.stance &&
    unit.stance !== "stand" &&
    !unit.exposed &&
    isConcealingTile(unit.col, unit.row)
  );
}

// Un VC si accorge di un'unità? Le unità occultate oltre distanza 1 sono
// invisibili fuori dalla vista del VC (distanza d'allerta e linea di vista)
// e, dentro, richiedono un tiro (spotChance della postura), uno per coppia
// VC/unità per turno. Se riesce l'unità è scoperta per tutti i VC fino alla
// fine del turno. Le unità non occultate sono note a tutti i VC in allerta
// (si muovono verso di loro anche senza vederle; per sparare serve la vista).
// `viewer` ({col,row,facing}): posizione da cui il VC guarda, di default la
// sua; l'IA tattica la usa per valutare i tile su cui potrebbe spostarsi.
function vcDetects(enemy, unit, viewer = enemy) {
  if (!unit.alive) return false;
  if (!isConcealed(unit) || dist(viewer, unit) <= 1) return true;
  if (!vcSees(viewer, unit, vcAlertDistanceFrom(viewer, unit))) return false;
  G.vcSpotRolls = G.vcSpotRolls || {};
  const key = enemy.id + ">" + unit.id;
  if (!(key in G.vcSpotRolls)) {
    const seen = Math.random() < unitStance(unit).spotChance;
    G.vcSpotRolls[key] = seen;
    statAdd(seen ? "spotted" : "unnoticed");
    if (seen) {
      unit.exposed = true;
      log(t("log.stance_spotted", { name: unit.name }), "enemy");
    } else if (isEnemyVisible(enemy)) {
      log(t("log.stance_unnoticed", { name: unit.name, vc: enemy.name }), "success");
    }
  }
  return G.vcSpotRolls[key];
}

// Unità US più vicina tra quelle di cui il VC si accorge (null se nessuna)
// (dal più vicino: non si tira per unità che non sarebbero comunque il bersaglio)
function nearestDetectedUnit(enemy) {
  return (
    G.units
      .filter((u) => u.alive)
      .sort((a, b) => dist(enemy, a) - dist(enemy, b))
      .find((u) => vcDetects(enemy, u)) ?? null
  );
}

// ── FERITE E SANGUINAMENTO (solo unità US) ─────────────────────────────
// Ferito (HP ≤ 60%): −1 ATK e +1 AP per ogni azione di movimento.
// Grave (HP < 30%, coincide con "scosso"): −2 ATK, stesso sovraccosto.
// Ogni colpo che fa danno può causare un'emorragia (unit.bleeding): a inizio
// turno l'unità perde 1 HP e può morire dissanguata, a meno che l'emorragia
// non si fermi da sola (BLEED_STOP_CHANCE, campo mappa `bleedStopChance`).
// Il medico la ferma sempre (sugli altri). Primo soccorso: una volta per
// missione ogni soldato può medicarsi da solo (+2 HP, non ferma l'emorragia)
// consumando tutti gli AP.
const WOUND_THRESHOLD = 0.6;
const SEVERE_WOUND_THRESHOLD = 0.3;
const WOUND_MOVE_EXTRA = 1;
const BLEED_PER_TURN = 1;
// Probabilità che un'emorragia si fermi da sola a inizio turno (senza danno
// in quel turno). Senza, chi era lontano dal medico moriva quasi sempre: un
// terzo dei caduti morti dissanguati (simulatore, 2026-10-16)
const BLEED_STOP_CHANCE = 1 / 3;
const FIRST_AID_HEAL = 2;

// Probabilità di emorragia in base al danno: 1→35%, 2→50%, 3→65%, 4+→80%
function bleedChance(dmg) {
  return Math.min(0.8, 0.2 + 0.15 * dmg);
}

function woundLevel(unit) {
  if (!unit?.alive || !G.units.includes(unit)) return 0;
  const r = unit.hp / unit.maxHp;
  if (r < SEVERE_WOUND_THRESHOLD) return 2;
  return r <= WOUND_THRESHOLD ? 1 : 0;
}

// Malus ATK delle ferite (applicato prima del minimo di 1)
function woundAttackPenalty(unit) {
  return woundLevel(unit);
}

// ── CORPO A CORPO (coltello US) ────────────────────────────────────────
// Stesso tiro (2d6 + ATK contro DEF + 1d6) ma: un colpo a segno uccide; al
// posto della copertura conta la guardia del VC, che dipende da quanto vede
// l'aggressore (fronte/fianco/spalle); le ferite pesano il doppio. Se il
// colpo fallisce c'è una colluttazione: di poco (margine ≥ struggleMargin)
// il VC resta ferito e l'aggressore a volte; altrimenti il VC para e
// contrattacca (danno doppio se il margine è ≤ heavyCounterMargin).
const MELEE = {
  guard: { front: 5, side: 3, rear: 0 },
  woundMult: 2,
  struggleMargin: -1,
  struggleVcDmg: 1,
  struggleSelfChance: 0.5,
  counterDmg: 1,
  heavyCounterMargin: -4,
  heavyCounterDmg: 2,
};

// ATK e DEF di un attacco col coltello di `attacker` (US) contro `defender` (VC)
function meleeStats(attacker, defender, weapon) {
  const sector = facingSector(defender, attacker);
  // Il malus delle ferite si applica dopo il minimo di 1, così i due livelli
  // di ferita restano distinti anche con un'arma da ATK 2
  const atk =
    Math.max(1, weapon?.atk ?? 1) -
    woundAttackPenalty(attacker) * MELEE.woundMult +
    rearAttackBonus(attacker, defender);
  const defStat = getEnemyStats(defender).defense;
  const guard = MELEE.guard[sector] ?? 0;
  return { atk, def: defStat + guard, defStat, guard, sector };
}

// AP extra per ogni azione di movimento: postura + ferite
function moveActionExtra(unit) {
  return (
    (unitStance(unit).moveExtra || 0) +
    (woundLevel(unit) > 0 ? WOUND_MOVE_EXTRA : 0)
  );
}

// Morale: un'unità US sotto la soglia grave diventa "scossa"
function checkShaken(unit) {
  if (!unit.alive || unit.shaken || !G.units.includes(unit)) return;
  if (unit.hp / unit.maxHp >= SEVERE_WOUND_THRESHOLD) return;
  unit.shaken = true;
  log(t("log.unit_shaken", { name: unit.name }), "combat");
}

// Dopo un danno a un'unità US sopravvissuta: morale ed emorragia
// (unico punto usato da combattimento diretto, esplosioni e trappole)
function afterUnitDamage(unit, dmg, alwaysBleed = false) {
  checkShaken(unit);
  maybeStartBleeding(unit, dmg, alwaysBleed);
}

// Dopo un danno a un'unità US ancora viva: possibile emorragia
// (alwaysBleed: trappole punji)
function maybeStartBleeding(unit, dmg, alwaysBleed = false) {
  if (!unit.alive || unit.bleeding || !G.units.includes(unit)) return;
  if (!alwaysBleed && Math.random() >= bleedChance(dmg)) return;
  unit.bleeding = true;
  statAdd("bleedStarts");
  log(t("log.bleeding_start", { name: unit.name }), "combat");
}

// A inizio turno giocatore le unità sanguinanti perdono HP (o l'emorragia si ferma)
function tickBleeding() {
  const stopChance = G.mapData?.bleedStopChance ?? BLEED_STOP_CHANCE;
  for (const u of G.units) {
    if (!u.alive || !u.bleeding) continue;
    if (Math.random() < stopChance) {
      u.bleeding = false;
      statAdd("bleedSelfStop");
      log(t("log.bleeding_self_stop", { name: u.name }), "success");
      continue;
    }
    statAdd("bleedDmg", Math.min(u.hp, BLEED_PER_TURN));
    u.hp = Math.max(0, u.hp - BLEED_PER_TURN);
    addFX(
      "hit",
      { col: u.col, row: u.row, dmg: BLEED_PER_TURN, enemy: false },
      800,
    );
    if (u.hp <= 0) {
      u.alive = false;
      dropPilot(u);
      u.bleeding = false;
      statAdd("bledOut");
      sfx("death");
      log(t("log.bled_out", { name: u.name }), "combat");
      addFX("death", { col: u.col, row: u.row, cls: u.cls, enemy: false }, 1400);
      continue;
    }
    log(
      t("log.bleeding_tick", { name: u.name, dmg: BLEED_PER_TURN, hp: u.hp, max: u.maxHp }),
      "combat",
    );
    checkShaken(u);
  }
  checkGameOver();
}

function canFirstAid(u) {
  return (
    !!u &&
    u.alive &&
    G.phase === "player" &&
    G.units.includes(u) &&
    !u.firstAidUsed &&
    u.ap >= 1 &&
    u.hp < u.maxHp
  );
}

// Primo soccorso: +2 HP, una volta per missione, consuma tutti gli AP
function firstAid(u) {
  if (!canFirstAid(u)) return;
  const healed = Math.min(FIRST_AID_HEAL, u.maxHp - u.hp);
  clearLastMove();
  u.hp += healed;
  u.ap = 0;
  u.firstAidUsed = true;
  statAdd("firstAid");
  tutorialEvent("firstaid", { cls: u.cls });
  if (u.shaken && u.hp / u.maxHp >= SEVERE_WOUND_THRESHOLD) {
    u.shaken = false;
    log(t("log.unit_recovered", { name: u.name }), "success");
  }
  sfx("heal");
  addFX("heal", { col: u.col, row: u.row, amount: healed }, 1400);
  log(
    t(u.bleeding ? "log.first_aid_bleeding" : "log.first_aid", {
      name: u.name,
      healed,
      current: u.hp,
      max: u.maxHp,
    }),
    "success",
  );
  setActionMode(null);
  updateUI();
  render();
}

// ── LINEA DI TIRO ──────────────────────────────────────────────────────
// Un compagno sui tile intermedi della linea di tiro la blocca (si rischia
// di colpirlo), a meno che non sia sdraiato: si spara sopra di lui.
// Vale per attacchi diretti, overwatch e fuoco soppressivo US (non per le AoE).
function allyBlockingFire(shooter, to) {
  const line = getLineTiles(shooter.col, shooter.row, to.col, to.row);
  for (const tl of line.slice(0, -1)) {
    const ally = G.units.find(
      (u) =>
        u.alive && u !== shooter && u.col === tl.col && u.row === tl.row,
    );
    if (ally && ally.stance !== "prone") return ally;
  }
  return null;
}

// Primo tile che blocca del tutto la vista lungo la linea (terreno "full" o fumo)
function firstLosBlockTile(from, to) {
  const line = getLineTiles(from.col, from.row, to.col, to.row);
  for (const tl of line.slice(0, -1)) {
    if (isSmoked(tl.col, tl.row) || getTileAt(tl.col, tl.row)?.losBlock === "full")
      return tl;
  }
  return null;
}

// Perché `shooter` può o non può colpire il tile `to` con il fuoco diretto:
// { status: "clear"|"ally"|"los"|"vision"|"range", block?: {col,row}, ally? }
// Usato dal raggio di mira su desktop (render.js)
function fireLineStatus(shooter, to, weapon) {
  const d = dist(shooter, to);
  const ally = allyBlockingFire(shooter, to);
  if (ally) return { status: "ally", block: ally, ally };
  if (!isTileVisibleFromUnit(shooter, to.col, to.row)) {
    if (d > unitVisionToward(shooter, to)) return { status: "vision" };
    return { status: "los", block: firstLosBlockTile(shooter, to) };
  }
  const range = weapon?.range ?? UNIT_CLASSES[shooter.cls].range;
  if (d > range) return { status: "range" };
  return { status: "clear" };
}

// Sparare (azione rumorosa) svela la posizione fino alla fine del turno VC
function revealShooter(unit, noise) {
  if (noise > 0 && G.units.includes(unit)) unit.exposed = true;
}

// ── FUMOGENI ───────────────────────────────────────────────────────────
// Un tile con fumo blocca la linea di vista; chi è dentro vede e viene visto
// solo da distanza 1. Il fumo dura `weapon.smoke` turni (scade a fine turno VC)
function isSmoked(col, row) {
  return (G.missionState?.smokes || []).some(
    (s) => s.col === col && s.row === row,
  );
}

function deploySmoke(thrower, weapon, tc, tr) {
  const st = G.missionState;
  st.smokes = st.smokes || [];
  for (let c = 0; c < G.mapData.cols; c++) {
    for (let r = 0; r < G.mapData.rows; r++) {
      if (dist({ col: c, row: r }, { col: tc, row: tr }) > weapon.aoe) continue;
      const cur = st.smokes.find((s) => s.col === c && s.row === r);
      if (cur) cur.turnsLeft = Math.max(cur.turnsLeft, weapon.smoke);
      else st.smokes.push({ col: c, row: r, turnsLeft: weapon.smoke });
    }
  }
  sfxShoot(thrower.cls, weapon);
  makeNoise({ col: tc, row: tr }, weaponNoise(thrower, weapon));
  log(
    t("log.smoke_deployed", {
      name: thrower.name,
      weapon: weapon.label,
      turns: weapon.smoke,
    }),
    "system",
  );
  _startTileAnimLoop();
  updateUI();
  render();
}

function tickSmokes() {
  const st = G.missionState;
  if (!st.smokes?.length) return;
  st.smokes.forEach((s) => s.turnsLeft--);
  st.smokes = st.smokes.filter((s) => s.turnsLeft > 0);
}

// ── SUPPORTO D'ARTIGLIERIA ─────────────────────────────────────────────
// Armi con `artillery: true`: la salva viene richiesta ora e cade all'inizio
// del turno giocatore successivo (dopo la mossa dei VC), su chiunque sia
// nell'area. Campi arma: "shells" (colpi della salva, numero o [min, max]),
// "scatter" (raggio in tile del quadrato in cui cade ogni colpo, più probabile
// verso il centro), "aoe"/"atk" di ogni singolo colpo. Ogni colpo distrugge
// il tile su cui cade (blastTile).
const ARTILLERY = {
  shells: [5, 6],
  scatter: 2,
  intervalMs: [380, 650], // cadenza tra un colpo e l'altro
  fireTurns: 2, // incendio sulla vegetazione colpita (come l'incendio del geniere)
};

function artilleryScatter(weapon) {
  return weapon.scatter ?? ARTILLERY.scatter;
}

function artilleryShells(weapon) {
  const s = weapon.shells ?? ARTILLERY.shells;
  return Array.isArray(s) ? s : [s, s];
}

// Punti di caduta possibili attorno a (tc, tr) con il loro peso: per asse
// s+1-|d| (distribuzione triangolare), solo tile dentro la mappa
function artilleryLandings(tc, tr, s) {
  const out = [];
  for (let dr = -s; dr <= s; dr++)
    for (let dc = -s; dc <= s; dc++) {
      if (!getTileAt(tc + dc, tr + dr)) continue;
      out.push({ col: tc + dc, row: tr + dr, w: (s + 1 - Math.abs(dc)) * (s + 1 - Math.abs(dr)) });
    }
  return out;
}

function artilleryLanding(tc, tr, s) {
  const opts = artilleryLandings(tc, tr, s);
  let r = Math.random() * opts.reduce((a, o) => a + o.w, 0);
  for (const o of opts) if ((r -= o.w) < 0) return o;
  return opts[opts.length - 1] || { col: tc, row: tr };
}

// Anteprima della salva (combat.js:aoeOdds): probabilità che almeno un colpo
// colpisca ciascun bersaglio, sommando i punti di caduta che lo prendono nel
// raggio; uccisione approssimata come colpi indipendenti
function artilleryOdds(weapon, tc, tr, targets) {
  const opts = artilleryLandings(tc, tr, artilleryScatter(weapon));
  const total = opts.reduce((a, o) => a + o.w, 0) || 1;
  const [lo, hi] = artilleryShells(weapon);
  const n = (lo + hi) / 2;
  return targets
    .map((target) => {
      const pIn = opts.filter((o) => dist(o, target) <= weapon.aoe).reduce((a, o) => a + o.w, 0) / total;
      if (!pIn) return null;
      const { isUS, defStat, defCover } = aoeDefense(target);
      const one = diceOdds(weapon.atk, defStat + defCover, target.hp);
      return {
        target,
        isUS,
        ...one,
        pHit: 1 - (1 - pIn * one.pHit) ** n,
        pKill: 1 - (1 - pIn * one.pKill) ** n,
        expDmg: one.expDmg * pIn * n,
      };
    })
    .filter(Boolean);
}

function scheduleArtillery(caller, weapon, tc, tr) {
  const st = G.missionState;
  st.artillery = st.artillery || [];
  st.artillery.push({
    col: tc,
    row: tr,
    atk: weapon.atk,
    aoe: weapon.aoe,
    shells: artilleryShells(weapon),
    scatter: artilleryScatter(weapon),
    label: weapon.label,
    sound: weapon.sound,
    noise: weaponNoise(caller, weapon),
    callerCls: caller.cls,
    callerName: caller.name,
  });
  sfx("click");
  log(
    t("log.artillery_called", { name: caller.name, col: tc, row: tr }),
    "system",
  );
  updateUI();
  render();
}

async function resolveArtillery() {
  const strikes = G.missionState.artillery || [];
  G.missionState.artillery = [];
  for (const s of strikes) {
    if (G.phase === "gameover") return;
    // Salvataggi precedenti alla salva: valori di default
    const [lo, hi] = s.shells || ARTILLERY.shells;
    const shells = rnd(lo, hi);
    log(t("log.artillery_impact", { col: s.col, row: s.row, shells }), "combat");
    statAdd("artillery");
    for (let i = 0; i < shells; i++) {
      if (G.phase === "gameover") return;
      const land = artilleryLanding(s.col, s.row, s.scatter ?? ARTILLERY.scatter);
      // Prima il tile (il bersaglio si difende con la copertura che resta),
      // poi l'esplosione col suo cratere
      blastTile(land.col, land.row);
      await resolveAoeCombat(
        { cls: s.callerCls, name: s.callerName },
        { atk: s.atk, aoe: s.aoe, label: s.label, sound: s.sound, noise: s.noise },
        land.col,
        land.row,
        false,
        true,
      );
      await sleep(rnd(...ARTILLERY.intervalMs));
    }
    await sleep(300);
  }
}

// ── DISTRUZIONE DEL TERRENO ────────────────────────────────────────────
// Tile colpito in pieno da un proiettile d'artiglieria: la vegetazione
// (burnable) diventa terra bruciata e prende fuoco, muri, edifici e bunker
// crollano in macerie, gli altri demolibili seguono demolishResult. Campo del
// tipo di tile "blastResult": chiave del tile risultante (false = indistruttibile).
// I tile risultanti mancanti nella mappa vengono aggiunti (BLAST_TILE_TYPES).
const BLAST_RUBBLE_IDS = new Set(["building", "temple", "wall", "wall_breach", "bunker"]);
const BLAST_TILE_TYPES = {
  scorched: {
    type: { id: "scorched", label: "Terra bruciata", moveCost: 1, coverBonus: 1, color: "#3b3328" },
    text: { it: "Terra bruciata", en: "Scorched earth" },
  },
  debris: {
    type: { id: "debris", label: "Macerie", moveCost: 2, coverBonus: 2, color: "#6a5040", losBlock: "partial" },
    text: { it: "Macerie", en: "Rubble" },
  },
};

// Chiave del tile con quell'id nella mappa, aggiungendolo se manca
function blastTileKey(id) {
  const md = G.mapData;
  const found = Object.keys(md.tileTypes).find((k) => md.tileTypes[k].id === id);
  if (found) return found;
  const def = BLAST_TILE_TYPES[id];
  const key = def && [..."ZYXWVUQKLNHE0123456789"].find((k) => !md.tileTypes[k]);
  if (!key) return null;
  md.tileTypes[key] = { ...def.type };
  md.translations ||= {};
  for (const [lang, label] of Object.entries(def.text)) {
    const tr = (md.translations[lang] ||= {});
    tr.tileLabels ||= {};
    tr.tileLabels[id] ??= label;
  }
  return key;
}

function blastTile(col, row) {
  const md = G.mapData;
  const tile = getTileAt(col, row);
  if (!tile) return;
  let key = null;
  if (tile.blastResult !== undefined) key = tile.blastResult || null;
  else if (tile.burnable) key = blastTileKey("scorched");
  else if (BLAST_RUBBLE_IDS.has(tile.id)) key = blastTileKey("debris");
  else if (tile.demolishable) key = tile.demolishResult || null;
  if (!key || !md.tileTypes[key] || md.grid[row][col] === key) return;

  setTileType(col, row, key);
  const label = mt(`tileLabels.${tile.id}`) ?? tile.label;
  if (tile.burnable) {
    igniteTile(col, row, ARTILLERY.fireTurns);
    log(t("log.artillery_burn", { label, col, row }), "combat");
  } else {
    log(t("log.artillery_destroyed", { label, col, row }), "combat");
  }
}

// Cambia il tipo di un tile in partita (artiglieria, napalm)
function setTileType(col, row, key) {
  G.mapData.grid[row][col] = key;
  const st = G.missionState;
  // Mappe con immagine di sfondo: il tile nuovo va ridisegnato sopra (render.js)
  if (!(st.blasted ||= []).some((b) => b.col === col && b.row === row)) st.blasted.push({ col, row });
  invalidateTerrainCache();
  if (G.fowEnabled) recomputeVisibility();
}

// Incendio su un tile (già in fiamme: dura almeno `turns` turni)
function igniteTile(col, row, turns) {
  const fire = G.activeFires.find((f) => f.col === col && f.row === row);
  if (fire) fire.turnsLeft = Math.max(fire.turnsLeft, turns);
  else G.activeFires.push({ col, row, turnsLeft: turns });
  _startTileAnimLoop();
}

// ── ATTACCO AEREO AL NAPALM ────────────────────────────────────────────
// Armi con `napalm: true`: il geniere sceglie una linea di tile (primo click
// l'inizio, secondo la fine, anche in diagonale, al massimo "length" tile).
// All'inizio del turno giocatore successivo un aereo la sorvola in quella
// direzione (ombra che attraversa tutta la mappa, animations.js) e sgancia sui
// tile uno dopo l'altro: ogni tile prende fuoco (non acqua e muri; la
// vegetazione diventa terra bruciata) e chi ci si trova subisce un attacco
// "atk" senza copertura del terreno, VC nascosti compresi.
const NAPALM = {
  length: 5,
  fireTurns: 2,
};
const NAPALM_DIRS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

function napalmLength(w) {
  return w?.length ?? NAPALM.length;
}

// Fini possibili della linea che parte da `start`: gli 8 versi, entro la mappa
function napalmEndTiles(start, w) {
  const out = [];
  for (const [dc, dr] of NAPALM_DIRS)
    for (let k = 1; k < napalmLength(w); k++) {
      const col = start.col + dc * k;
      const row = start.row + dr * k;
      if (!getTileAt(col, row)) break;
      out.push({ col, row });
    }
  return out;
}

// Tile da `a` a `b` compresi (b sulla stessa riga, colonna o diagonale)
function napalmLine(a, b) {
  const dc = Math.sign(b.col - a.col);
  const dr = Math.sign(b.row - a.row);
  const n = Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row));
  return Array.from({ length: n + 1 }, (_, i) => ({ col: a.col + dc * i, row: a.row + dr * i }));
}

// Inizio già scelto, si sta scegliendo la fine
function napalmPickingEnd() {
  return G.actionMode === "attack" && !!G.currentWeapon?.napalm && !!G.pendingAoe;
}

// Anteprima verso il tile sotto il mouse, se è una fine valida
function napalmHoverLine() {
  const h = G.hoveredTile;
  if (!napalmPickingEnd() || !h || !G.attackable.some((t) => t.col === h.col && t.row === h.row)) return null;
  return napalmLine(G.pendingAoe, h);
}

function napalmOdds(weapon, line) {
  const on = (x) => x.alive && line.some((t) => t.col === x.col && t.row === x.row);
  return [...G.units.filter(on), ...G.enemies.filter((e) => on(e) && isEnemyVisible(e))].map((target) => {
    const { isUS, defStat } = aoeDefense(target);
    return { target, isUS, ...diceOdds(weapon.atk, defStat, target.hp) };
  });
}

function scheduleNapalm(caller, weapon, line) {
  if (!line?.length) return;
  const st = G.missionState;
  (st.napalm ||= []).push({
    line,
    atk: weapon.atk,
    label: weapon.label,
    noise: weaponNoise(caller, weapon),
    callerCls: caller.cls,
    callerName: caller.name,
  });
  const a = line[0];
  const b = line[line.length - 1];
  sfx("click");
  log(t("log.napalm_called", { name: caller.name, c1: a.col, r1: a.row, c2: b.col, r2: b.row }), "system");
  updateUI();
  render();
}

// Tile colpito dal napalm: fuoco, e la vegetazione diventa terra bruciata
function napalmTile(col, row) {
  const tile = getTileAt(col, row);
  if (!tile || tile.impassable || WATER_IDS.has(tile.id)) return;
  if (tile.burnable && tile.blastResult !== false) {
    const key = blastTileKey("scorched");
    if (key) setTileType(col, row, key);
  }
  igniteTile(col, row, NAPALM.fireTurns);
}

async function resolveNapalm() {
  const strikes = G.missionState.napalm || [];
  G.missionState.napalm = [];
  for (const s of strikes) {
    if (G.phase === "gameover") return;
    log(t("log.napalm_incoming"), "combat");
    statAdd("napalm");
    // Volo dell'ombra: istanti di passaggio sopra ciascun tile (animations.js)
    const plan = planNapalmFlight(s.line);
    addFX("napalmPlane", plan, plan.ms);
    sfx("jet");
    const t0 = performance.now();
    for (let i = 0; i < s.line.length; i++) {
      if (G.phase === "gameover") return;
      const { col, row } = s.line[i];
      await sleep(Math.max(0, t0 + plan.dropAt[i] - performance.now()));
      addFX("napalm", { col, row, dir: plan.angle }, NAPALM_FX_MS);
      napalmTile(col, row);
      await resolveAoeCombat(
        { cls: s.callerCls, name: s.callerName },
        { atk: s.atk, aoe: 0, napalm: true, label: s.label, noise: s.noise },
        col,
        row,
        false,
        true,
      );
    }
    // L'aereo esce dalla mappa prima che il turno continui
    await sleep(Math.max(0, t0 + plan.ms - performance.now()));
  }
}

// ── TRAPPOLE VC ────────────────────────────────────────────────────────
// Nascoste finché un geniere non arriva a distanza 1; scattano quando un
// soldato US ci passa sopra (il movimento si ferma lì). I VC ne sono immuni.
const TRAP_TYPES = { punji: { dmg: 2 }, mine: { dmg: 4 } };
const TRAP_MIN_START_DIST = 4; // distanza minima dalle posizioni di partenza

function makeTrap(col, row, type, dmg, revealed = false) {
  return {
    col,
    row,
    type: TRAP_TYPES[type] ? type : "punji",
    dmg: dmg ?? TRAP_TYPES[type]?.dmg ?? TRAP_TYPES.punji.dmg,
    revealed,
  };
}

// Trappola aggiunta durante la partita (VC che la piazzano: guerrilla.js)
function addTrap(col, row, type, revealed = false) {
  const st = G.missionState;
  st.traps = st.traps || [];
  const trap = makeTrap(col, row, type, undefined, revealed);
  st.traps.push(trap);
  return trap;
}

function initTraps() {
  const md = G.mapData;
  const traps = [];
  const free = (col, row) =>
    isTilePassable(col, row) &&
    !isOccupied(col, row) &&
    !traps.some((t) => t.col === col && t.row === row);
  const make = makeTrap;

  for (const tr of md.traps || []) {
    if (free(tr.col, tr.row)) traps.push(make(tr.col, tr.row, tr.type, tr.dmg));
  }

  // Trappole casuali: in trapZones se definite, altrimenti ovunque lontano dalla partenza
  const starts = md.playerStart || [];
  const zones = md.trapZones;
  for (let a = 0, placed = 0; a < 400 && placed < (md.trapCount || 0); a++) {
    const zone = zones?.length ? pick(zones) : null;
    const col = zone ? rnd(zone.colMin, zone.colMax) : rnd(0, md.cols - 1);
    const row = zone ? rnd(zone.rowMin, zone.rowMax) : rnd(0, md.rows - 1);
    if (!free(col, row)) continue;
    if (starts.some((s) => dist(s, { col, row }) < TRAP_MIN_START_DIST))
      continue;
    traps.push(make(col, row, pick(["punji", "punji", "mine"])));
    placed++;
  }
  G.missionState.traps = traps;
}

function trapAt(col, row) {
  return (G.missionState?.traps || []).find(
    (t) => t.col === col && t.row === row,
  );
}

function isKnownTrap(col, row) {
  return !!trapAt(col, row)?.revealed;
}

function trapLabel(trap) {
  return t(`traps.${trap.type}`);
}

function removeTrap(trap) {
  G.missionState.traps = G.missionState.traps.filter((t) => t !== trap);
}

// I genieri vivi individuano le trappole a distanza 1
function revealTrapsAroundEngineers() {
  for (const eng of G.units.filter((u) => u.alive && u.cls === "engineer")) {
    for (const trap of G.missionState.traps || []) {
      if (trap.revealed || dist(eng, trap) > 1) continue;
      trap.revealed = true;
      tutorialEvent("trapFound", { col: trap.col, row: trap.row });
      addFX("spot", { col: trap.col, row: trap.row, kind: "trap" }, 1100);
      log(
        t("log.trap_revealed", {
          name: eng.name,
          trap: trapLabel(trap),
          col: trap.col,
          row: trap.row,
        }),
        "success",
      );
    }
  }
}

// Prima trappola nascosta lungo il percorso verso (toCol,toRow):
// restituisce { trap, col, row, cost } con il costo AP fino alla trappola
function hiddenTrapOnPath(unit, toCol, toRow) {
  const path = getPath(unit.col, unit.row, toCol, toRow);
  if (!path) return null;
  let cost = 0;
  for (let i = 1; i < path.length; i++) {
    const { col, row } = path[i];
    cost += moveCost(col, row);
    const trap = trapAt(col, row);
    if (trap && !trap.revealed && !isOccupied(col, row, unit.id))
      return { trap, col, row, cost };
  }
  return null;
}

function triggerTrap(unit, trap) {
  removeTrap(trap);
  statAdd("traps");
  statAdd("trapDmg", Math.min(unit.hp, trap.dmg));
  sfx(trap.type === "mine" ? "demolition" : "hit");
  addFX(
    trap.type === "mine" ? "explosion" : "hit",
    { col: unit.col, row: unit.row, dmg: trap.dmg },
    1000,
  );
  log(
    t("log.trap_triggered", {
      name: unit.name,
      trap: trapLabel(trap),
      dmg: trap.dmg,
    }),
    "combat",
  );
  unit.hp -= trap.dmg;
  if (unit.hp <= 0) {
    unit.hp = 0;
    unit.alive = false;
    dropPilot(unit);
    sfx("death");
    log(t("log.unit_eliminated", { name: unit.name }), "combat");
    addFX(
      "death",
      { col: unit.col, row: unit.row, cls: unit.cls, enemy: false },
      1400,
    );
    checkGameOver();
  } else {
    // Le punte delle punji causano sempre un'emorragia
    afterUnitDamage(unit, trap.dmg, trap.type === "punji");
  }
}

function disarmTrap(engineer, trap) {
  removeTrap(trap);
  engineer.ap -= 1;
  engineer.specialUsed = true;
  tutorialEvent("special", { cls: engineer.cls, kind: "disarm" });
  sfx("disarm");
  addFX("demolition", { col: trap.col, row: trap.row, success: true }, 1000);
  log(
    t("log.trap_disarmed", { name: engineer.name, trap: trapLabel(trap) }),
    "success",
  );
  updateUI();
  render();
}

// ── MORALE VC ──────────────────────────────────────────────────────────
// Un VC sotto il 30% HP (una volta sola) o vicino a un comandante caduto
// va in rotta: per VC_ROUT_TURNS attivazioni ripiega e non attacca
const VC_ROUT_TURNS = 2;
const COMMANDER_ROUT_RADIUS = 4;

function checkVcMorale() {
  for (const cmd of G.enemies) {
    if (cmd.cls !== "commander" || cmd.alive || cmd.moraleHandled) continue;
    cmd.moraleHandled = true;
    const near = G.enemies.filter(
      (e) => e.alive && dist(e, cmd) <= COMMANDER_ROUT_RADIUS,
    );
    near.forEach((e) => (e.routed = Math.max(e.routed || 0, VC_ROUT_TURNS)));
    if (near.length)
      log(t("log.vc_commander_down", { count: near.length }), "success");
  }
  for (const e of G.enemies) {
    if (!e.alive || e.moraleBroken || e.hp / e.maxHp >= 0.3) continue;
    e.moraleBroken = true;
    e.routed = Math.max(e.routed || 0, VC_ROUT_TURNS);
    log(t("log.vc_routed", { name: e.name }), "success");
  }
}

// Attivazione di un VC in rotta: si allontana dalla squadra cercando copertura
async function routedActivation(enemy, stats) {
  const tiles = vcReachableTiles(enemy, Math.min(enemy.ap, stats.move));
  const score = (tl) => {
    const u = nearestLiveUnit(tl);
    return (
      (u ? dist(tl, u) : 0) * 3 +
      coverBonus(tl.col, tl.row) -
      tl.cost * 0.1
    );
  };
  const dest = tiles.reduce((b, tl) => (score(tl) > score(b) ? tl : b));
  if (dest.cost > 0) {
    const fromCol = enemy.col,
      fromRow = enemy.row;
    enemy.col = dest.col;
    enemy.row = dest.row;
    enemy.ap = Math.max(0, enemy.ap - dest.cost);
    await animateEnemyMove(enemy, fromCol, fromRow, enemy.col, enemy.row);
    checkOverwatch(enemy);
    checkSuppression(enemy);
  }
  const u = nearestLiveUnit(enemy);
  log(
    t("log.vc_retreat", { name: enemy.name, dist: u ? dist(enemy, u) : "-" }),
    "enemy",
  );
  enemy.routed--;
}
