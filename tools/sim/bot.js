// Bot del giocatore per la simulazione headless (caricato da env.js nel
// contesto del gioco, dopo tutti gli script: usa le stesse funzioni globali e
// le stesse regole dell'interfaccia, senza barare sulla nebbia di guerra
// tranne che per cercare l'ultimo VC quando non ne vede più nessuno).
//
// Comportamento, per unità (prima le più arretrate rispetto all'obiettivo):
//  - medico: cura un compagno adiacente ferito o sanguinante
//  - spara se ha un tiro abbastanza buono (granate solo su più VC)
//  - ricarica se l'arma è vuota
//  - altrimenti si sposta: avanza verso l'obiettivo, cerca copertura e una
//    posizione di tiro, resta vicino alla squadra, evita i VC noti
//  - a fine attivazione si gira verso la minaccia più vicina, si accuccia se
//    è in contatto, il cecchino va in overwatch e l'assalto in soppressione
const SIM_BOT = {
  minShotPHit: 0.3, // probabilità minima di colpire per sparare
  minShotValue: 0.8, // ...oppure valore (danno atteso + 2×p. uccisione)
  progressWeight: 1.5, // per AP di avvicinamento all'obiettivo
  contactProgressWeight: 1, // idem con VC noti entro contactDist
  contactDist: 8,
  coverWeight: 1,
  exposurePenalty: 1.5, // per VC noto che vede il tile ed è in gittata
  shotPosWeight: 3, // per valore del miglior tiro dal tile
  cohesionDist: 3, // distanza massima dal compagno più vicino senza penalità
  cohesionPenalty: 1.5,
  medicLeadPenalty: 4, // medico davanti a tutti gli altri
  stallBoost: 0.5, // progresso ×(1 + boost × turni fermo senza sparare)
  memoryTurns: 3, // un VC non più visto resta una minaccia per tanti turni
  maxTurns: 40,
};

// VC visti: id → { col, row, e, turn } (ultima posizione nota e quando)
let _simSeen = new Map();
let _simExplore = null;
let _simFields = new Map();

function simReset() {
  _simSeen = new Map();
  _simExplore = null;
  _simFields = new Map();
}

function simUpdateSeen() {
  if (G.fowEnabled) recomputeVisibility();
  for (const e of G.enemies) {
    if (!e.alive) _simSeen.delete(e.id);
    else if (isEnemyVisible(e)) _simSeen.set(e.id, { col: e.col, row: e.row, e, turn: G.turn });
  }
  for (const [id, p] of _simSeen) {
    if (isEnemyVisible(p.e)) continue;
    // Ultima posizione nota in vista senza il VC, o notizia troppo vecchia: dimenticala
    if (isTileVisible(p.col, p.row) || G.turn - p.turn > SIM_BOT.memoryTurns) _simSeen.delete(id);
  }
}

function simKnownEnemies() {
  return [..._simSeen.values()].filter((p) => p.e.alive);
}

// Campo delle distanze (in AP) da `goal` su tutta la mappa, ignorando le unità
function simField(goal) {
  const key = `${goal.col},${goal.row}`;
  if (_simFields.has(key)) return _simFields.get(key);
  const md = G.mapData;
  const d = new Map([[key, 0]]);
  const queue = [{ col: goal.col, row: goal.row, c: 0 }];
  while (queue.length) {
    queue.sort((a, b) => a.c - b.c);
    const cur = queue.shift();
    if (cur.c > (d.get(`${cur.col},${cur.row}`) ?? Infinity)) continue;
    for (const [dc, dr] of FACING_DIRS) {
      const nc = cur.col + dc,
        nr = cur.row + dr;
      if (nc < 0 || nr < 0 || nc >= md.cols || nr >= md.rows) continue;
      const tile = getTileAt(nc, nr);
      if (!tile || tile.impassable) continue;
      // Il costo è quello del tile da cui si esce verso l'obiettivo
      const c = cur.c + (getTileAt(cur.col, cur.row)?.moveCost || 1);
      const k = `${nc},${nr}`;
      if (c < (d.get(k) ?? Infinity)) {
        d.set(k, c);
        queue.push({ col: nc, row: nr, c });
      }
    }
  }
  _simFields.set(key, d);
  return d;
}

const _simFd = (field, p) => field.get(`${p.col},${p.row}`) ?? 999;

function simCentroid(list) {
  const n = list.length || 1;
  return {
    col: Math.round(list.reduce((s, u) => s + u.col, 0) / n),
    row: Math.round(list.reduce((s, u) => s + u.row, 0) / n),
  };
}

// Punti da esplorare in cerca di VC: centri delle zone di spawn e d'imboscata
function simExploreTargets() {
  if (!_simExplore) {
    const md = G.mapData;
    _simExplore = [...(md.vcSpawnZones || []), ...(md.vcAmbushZones || [])].map((z) => ({
      col: Math.round((z.colMin + z.colMax) / 2),
      row: Math.round((z.rowMin + z.rowMax) / 2),
    }));
  }
  const live = G.units.filter((u) => u.alive);
  _simExplore = _simExplore.filter((p) => !live.some((u) => dist(u, p) <= 2));
  return _simExplore;
}

const _simNearest = (from, list) =>
  list.reduce((b, p) => (!b || dist(from, p) < dist(from, b) ? p : b), null);

// Obiettivo della squadra: { tile, exact } (exact: un soldato deve salirci)
function simSquadGoal() {
  const st = G.missionState;
  const live = G.units.filter((u) => u.alive);
  const mid = simCentroid(live);
  switch (G.missionType) {
    case "recon": {
      const p = _simNearest(mid, (st.points || []).filter((p) => !p.scouted));
      if (p) return { tile: p, exact: false };
      break;
    }
    case "rescue_pilot": {
      if (!st.pilotFound) return { tile: { col: st.pilotCol, row: st.pilotRow }, exact: true };
      return { tile: { col: st.extractCol, row: st.extractRow }, exact: true, carrier: true };
    }
    case "capture_objective": {
      const o = (st.objectives || []).find((o) => o.heldTurns < (o.holdTurns || 2));
      if (o) return { tile: o, exact: true, hold: true };
      break;
    }
  }
  // Search & destroy (e ripiego): VC noti, poi zone da esplorare, poi l'ultimo VC
  const known = _simNearest(mid, simKnownEnemies());
  if (known) return { tile: known, exact: false, hunt: true };
  const ex = _simNearest(mid, simExploreTargets());
  if (ex) return { tile: ex, exact: false, hunt: true };
  const any = _simNearest(mid, G.enemies.filter((e) => e.alive && !e.inTunnel));
  return { tile: any ?? mid, exact: false, hunt: true };
}

// Il soldato che deve salire sul tile dell'obiettivo (pilota, estrazione, obiettivo)
function simRunner(goal) {
  const live = G.units.filter((u) => u.alive);
  if (goal.carrier) return live.find((u) => u.carriesPilot) ?? null;
  const field = simField(goal.tile);
  return live.reduce((b, u) => (!b || _simFd(field, u) < _simFd(field, b) ? u : b), null);
}

// Miglior tiro diretto di `u` da `from` (posizione ipotetica) con le armi usabili
function simBestDirect(u, from = u) {
  const fake = from === u ? u : { ...u, col: from.col, row: from.row };
  let best = null;
  for (const w of u.weapons || []) {
    if (isAreaWeapon(w) || !weaponUsable(u, w)) continue;
    for (const e of G.enemies) {
      if (!e.alive || dist(fake, e) > (w.range ?? UNIT_CLASSES[u.cls].range)) continue;
      if (!isEnemyVisible(e) && !(from !== u && _simSeen.has(e.id))) continue;
      if (from === u) {
        if (!unitSeesEnemy(u, e)) continue;
      } else {
        fake.facing = facingToward(fake, e) ?? fake.facing;
        if (!isTileVisibleFromUnit(fake, e.col, e.row)) continue;
      }
      if (allyBlockingFire(fake, e)) continue;
      const o = attackOdds(fake, e, w);
      const value = o.expDmg + 2 * o.pKill;
      if (!best || value > best.value) best = { w, target: e, value, pHit: o.pHit };
    }
  }
  return best;
}

// Miglior lancio AoE: almeno 2 VC colpibili, senza mettere a rischio la squadra
function simBestAoe(u) {
  let best = null;
  for (const w of u.weapons || []) {
    if (!w.aoe || w.smoke || w.artillery || !weaponUsable(u, w)) continue;
    const minR = weaponMinRange(w);
    const cands = new Map();
    for (const e of G.enemies) {
      if (!e.alive || !isEnemyVisible(e)) continue;
      for (let dc = -w.aoe; dc <= w.aoe; dc++)
        for (let dr = -w.aoe; dr <= w.aoe; dr++) {
          const p = { col: e.col + dc, row: e.row + dr };
          const d = dist(u, p);
          if (d >= minR && d <= w.range) cands.set(`${p.col},${p.row}`, p);
        }
    }
    for (const p of cands.values()) {
      const odds = aoeOdds(w, p.col, p.row);
      const vc = odds.filter((o) => !o.isUS);
      if (vc.length < 2) continue;
      const value =
        vc.reduce((s, o) => s + o.expDmg + 2 * o.pKill, 0) -
        odds.filter((o) => o.isUS).reduce((s, o) => s + 3 * o.expDmg + 10 * o.pKill, 0);
      if (!best || value > best.value) best = { w, tile: p, value };
    }
  }
  return best;
}

function simSelect(u) {
  G.selectedUnit = u;
  setActionMode(null);
}

async function simFire(u, shot) {
  simSelect(u);
  setActionMode("attack", shot.w);
  if (!G.attackable.includes(shot.target)) {
    setActionMode(null);
    return false;
  }
  clearLastMove();
  u.ap -= 1;
  consumeShot(shot.w);
  await resolveCombat(u, shot.target, false, shot.w);
  setActionMode(null);
  return true;
}

async function simThrow(u, aoe) {
  simSelect(u);
  G.pendingAoe = { col: aoe.tile.col, row: aoe.tile.row, weapon: aoe.w };
  clearLastMove();
  u.ap -= 1;
  consumeShot(aoe.w);
  // Stessa deviazione del lancio del giocatore, senza animazione
  const land = throwLanding(aoe.w, aoe.tile.col, aoe.tile.row);
  if (land.col !== aoe.tile.col || land.row !== aoe.tile.row) statAdd("grenadeScatter");
  await resolveAoeCombat(u, aoe.w, land.col, land.row, false);
  setActionMode(null);
  return true;
}

async function simHeal(u) {
  if (unitSpecial(u) !== "heal" || u.specialUsed || u.shaken || u.ap < 1) return false;
  const ally = G.units
    .filter((a) => a.alive && a !== u && dist(a, u) <= 1 && (a.bleeding || a.maxHp - a.hp >= 2))
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  if (!ally) return false;
  simSelect(u);
  setActionMode("special");
  clearLastMove();
  await handleSpecialAction(ally.col, ally.row);
  setActionMode(null);
  return true;
}

// Geniere: disinnesca una trappola individuata o sigilla un tunnel adiacente
async function simEngineerWork(u) {
  if (unitSpecial(u) !== "demolition" || u.specialUsed || u.shaken || u.ap < 1) return false;
  const tile = FACING_DIRS.map(([dc, dr]) => ({ col: u.col + dc, row: u.row + dr })).find(
    (p) => isKnownTrap(p.col, p.row) || isKnownTunnel(p.col, p.row),
  );
  if (!tile) return false;
  simSelect(u);
  setActionMode("special");
  clearLastMove();
  await handleSpecialAction(tile.col, tile.row);
  setActionMode(null);
  return true;
}

// VC noti che vedrebbero il tile e lo avrebbero in gittata
function simExposure(tile) {
  let n = 0;
  for (const p of simKnownEnemies()) {
    const range = getEnemyStats(p.e).range;
    if (dist(p, tile) <= range + 1 && losRangePenalty(p.col, p.row, tile.col, tile.row) !== Infinity)
      n++;
  }
  return n;
}

function simChooseMove(u, goal, runner) {
  const known = simKnownEnemies();
  const contact = known.some((p) => dist(p, u) <= SIM_BOT.contactDist);
  const budget = contact && u.ap >= 2 ? u.ap - 1 : u.ap;
  const reach = getReachable(u, budget);
  const field = simField(goal.tile);
  const others = G.units.filter((o) => o.alive && o !== u);
  const T = SIM_BOT;
  const pw =
    (contact ? T.contactProgressWeight : T.progressWeight) * (1 + T.stallBoost * (u.simStill || 0));
  const isRunner = runner === u && goal.exact;

  let best = null;
  for (const [k, cost] of Object.entries(reach)) {
    const [col, row] = k.split(",").map(Number);
    const tile = { col, row };
    let fd = _simFd(field, tile);
    // Chi non deve salire sull'obiettivo si ferma a un passo
    if (!isRunner && goal.exact && fd === 0) fd = 2;
    let s = -fd * pw;
    if (isRunner) s -= fd * T.progressWeight * 2;
    s += coverBonus(col, row) * T.coverWeight;
    s -= simExposure(tile) * T.exposurePenalty;
    if (contact && cost < u.ap) {
      const shot = simBestDirect(u, tile);
      if (shot && shot.pHit >= T.minShotPHit) s += shot.value * T.shotPosWeight;
    }
    if (others.length) {
      const near = Math.min(...others.map((o) => dist(o, tile)));
      if (near > T.cohesionDist) s -= (near - T.cohesionDist) * T.cohesionPenalty;
      // Il medico non fa da apripista: resta dietro al più avanzato
      if (unitSpecial(u) === "heal" && !isRunner && fd < Math.min(...others.map((o) => _simFd(field, o))))
        s -= T.medicLeadPenalty;
    }
    s -= cost * 0.05; // a parità, risparmia AP
    if (!best || s > best.s) best = { col, row, cost, s };
  }
  return best;
}

function simFaceThreat(u, goal) {
  if (u.rotated) return;
  const threat = _simNearest(u, simKnownEnemies());
  const to = threat ?? goal.tile;
  const f = facingToward(u, to);
  if (f === null || f === u.facing) return;
  const [dc, dr] = FACING_DIRS[f];
  rotateUnit(u, u.col + dc, u.row + dr);
}

async function simUnitTurn(u, goal, runner) {
  simSelect(u);
  let moved = false,
    acted = false;
  const start = { col: u.col, row: u.row };
  for (let guard = 0; guard < 8 && u.alive && G.phase === "player" && u.ap > 0; guard++) {
    simUpdateSeen();
    if ((await simHeal(u)) || (await simEngineerWork(u))) {
      acted = true;
      continue;
    }

    const aoe = simBestAoe(u);
    const shot = simBestDirect(u);
    if (aoe && (!shot || aoe.value > shot.value * 1.5) && aoe.value >= 2) {
      await simThrow(u, aoe);
      acted = true;
      continue;
    }
    if (shot && (shot.pHit >= SIM_BOT.minShotPHit || shot.value >= SIM_BOT.minShotValue)) {
      if (await simFire(u, shot)) {
        acted = true;
        continue;
      }
    }
    const rw = reloadableWeapon(u);
    if (rw && weaponEmpty(rw) && canReload(u, rw)) {
      reloadWeapon(u, rw);
      continue;
    }
    if (moved) break;
    // Fermo sull'obiettivo da tenere
    if (goal.hold && runner === u && u.col === goal.tile.col && u.row === goal.tile.row) break;
    // Accucciato: valuta lo spostamento da in piedi se alzarsi è gratuito,
    // e si alza solo se poi si muove davvero
    const standFree = u.stance !== "stand" && stanceChangeCost(u) === 0;
    const stance = u.stance;
    if (standFree) u.stance = "stand";
    const dest = simChooseMove(u, goal, runner);
    u.stance = stance;
    moved = true;
    if (!dest || (dest.col === u.col && dest.row === u.row)) continue;
    if (standFree) changeStance(u, "stand");
    simSelect(u);
    await moveUnit(u, dest.col, dest.row, dest.cost);
    G.lastMove = null;
  }
  if (!u.alive || G.phase !== "player") return;
  // Turni passati fermi senza sparare né curare (spinge ad avanzare)
  u.simStill = u.col === start.col && u.row === start.row && !acted ? (u.simStill || 0) + 1 : 0;

  simUpdateSeen();
  simFaceThreat(u, goal);
  const known = simKnownEnemies();
  const near = known.some((p) => dist(p, u) <= 6);
  // Reazioni: overwatch (cecchino) e soppressione (assalto) con l'AP residuo
  const canSpecial = u.ap >= 1 && !u.specialUsed && !u.shaken && !specialBlockedByAmmo(u);
  const sp = unitSpecial(u);
  if (canSpecial && known.length && (sp === "overwatch" || (sp === "suppression" && near))) {
    clearLastMove();
    u.ap -= 1;
    u.specialUsed = true;
    if (sp === "overwatch") {
      u.overwatch = true;
      if (!G.overwatchList.includes(u)) G.overwatchList.push(u);
    } else {
      u.suppression = true;
      if (!G.suppressList.includes(u)) G.suppressList.push(u);
    }
  }
  // In contatto: accucciato (il primo cambio del turno è gratuito)
  if (near && u.stance === "stand" && canChangeStance(u) && u.ap >= stanceChangeCost(u))
    changeStance(u, "crouch");
  // Ferito e sanguinante senza medico: primo soccorso
  if (u.bleeding && !G.units.some((m) => m.alive && unitSpecial(m) === "heal") && canFirstAid(u))
    firstAid(u);
}

async function simPlayerTurn() {
  simUpdateSeen();
  _simFields = new Map();
  const goal = simSquadGoal();
  const runner = simRunner(goal);
  const field = simField(goal.tile);
  log(
    `obiettivo (${goal.tile.col},${goal.tile.row})${goal.hunt ? " caccia" : ""} · ` +
      G.units
        .filter((u) => u.alive)
        .map((u) => `${u.cls[0]}(${u.col},${u.row})${u.hp}hp`)
        .join(" "),
    "bot",
  );
  // Prima le unità più lontane dall'obiettivo, così la squadra resta unita
  const order = G.units
    .filter((u) => u.alive)
    .sort((a, b) => _simFd(field, b) - _simFd(field, a));
  for (const u of order) {
    if (G.phase !== "player") return;
    await simUnitTurn(u, goal, runner);
  }
  G.selectedUnit = null;
}
