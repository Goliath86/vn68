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

// ── MISSIONI NOTTURNE ──────────────────────────────────────────────────
const NIGHT_VISION_PENALTY = 2;
const VC_ALERT_DISTANCE = 5;

function isNight() {
  return !!(G.missionState?.night || G.mapData?.night);
}

function nightPenalty() {
  return isNight()
    ? (G.mapData?.nightVisionPenalty ?? NIGHT_VISION_PENALTY)
    : 0;
}

// Raggio visivo di un'unità US (ridotto di notte, minimo 1)
function unitVision(unit) {
  return Math.max(1, UNIT_CLASSES[unit.cls].vision - nightPenalty());
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
  return Math.max(2, VC_ALERT_DISTANCE - nightPenalty());
}

// Come sopra, ma secondo il lato da cui arriva l'unità US: piena davanti,
// -1 ai lati, solo a distanza ravvicinata alle spalle
function vcAlertDistanceFrom(enemy, unit) {
  const base = vcAlertDistance();
  const sector = facingSector(enemy, unit);
  if (sector === "rear") return Math.min(base, VC_REAR_ALERT_DISTANCE);
  if (sector === "side") return Math.max(VC_REAR_ALERT_DISTANCE, base - 1);
  return base;
}

// ── FUMOGENI ───────────────────────────────────────────────────────────
// Un tile con fumo blocca la linea di vista; chi è dentro vede e viene visto
// solo da distanza 1. Il fumo dura `weapon.smoke` turni (scade a fine turno VC)
function isSmoked(col, row) {
  return (G.missionState?.smokes || []).some(
    (s) => s.col === col && s.row === row,
  );
}

// Fumo tra due posizioni (usato dall'IA VC, che non considera il resto del LOS)
function smokeBlocks(from, to) {
  if (dist(from, to) > 1 && (isSmoked(from.col, from.row) || isSmoked(to.col, to.row)))
    return true;
  const line = getLineTiles(from.col, from.row, to.col, to.row);
  return line.slice(0, -1).some((t) => isSmoked(t.col, t.row));
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
// Armi con `artillery: true`: il colpo viene richiesto ora e cade all'inizio
// del turno giocatore successivo (dopo la mossa dei VC), su chiunque sia nell'area
function scheduleArtillery(caller, weapon, tc, tr) {
  const st = G.missionState;
  st.artillery = st.artillery || [];
  st.artillery.push({
    col: tc,
    row: tr,
    atk: weapon.atk,
    aoe: weapon.aoe,
    label: weapon.label,
    sound: weapon.sound,
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
    log(t("log.artillery_impact", { col: s.col, row: s.row }), "combat");
    await resolveAoeCombat(
      { cls: s.callerCls, name: s.callerName },
      { atk: s.atk, aoe: s.aoe, label: s.label, sound: s.sound },
      s.col,
      s.row,
      false,
      true,
    );
    await sleep(400);
  }
}

// ── TRAPPOLE VC ────────────────────────────────────────────────────────
// Nascoste finché un geniere non arriva a distanza 1; scattano quando un
// soldato US ci passa sopra (il movimento si ferma lì). I VC ne sono immuni.
const TRAP_TYPES = { punji: { dmg: 2 }, mine: { dmg: 4 } };
const TRAP_MIN_START_DIST = 4; // distanza minima dalle posizioni di partenza

function initTraps() {
  const md = G.mapData;
  const traps = [];
  const free = (col, row) =>
    isTilePassable(col, row) &&
    !isOccupied(col, row) &&
    !traps.some((t) => t.col === col && t.row === row);
  const make = (col, row, type, dmg) => ({
    col,
    row,
    type: TRAP_TYPES[type] ? type : "punji",
    dmg: dmg ?? TRAP_TYPES[type]?.dmg ?? TRAP_TYPES.punji.dmg,
    revealed: false,
  });

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
    sfx("death");
    log(t("log.unit_eliminated", { name: unit.name }), "combat");
    addFX(
      "death",
      { col: unit.col, row: unit.row, cls: unit.cls, enemy: false },
      1400,
    );
    checkGameOver();
  } else if (!unit.shaken && unit.hp / unit.maxHp < 0.3) {
    unit.shaken = true;
    log(t("log.unit_shaken", { name: unit.name }), "combat");
  }
}

function disarmTrap(engineer, trap) {
  removeTrap(trap);
  engineer.ap -= 1;
  engineer.specialUsed = true;
  sfx("click");
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
