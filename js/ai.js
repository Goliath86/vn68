async function runEnemyTurn() {
  log(t("log.vc_turn_start"), "turn");
  const liveEnemies = G.enemies.filter((e) => e.alive);
  // Tiri di avvistamento delle unità occultate: uno per coppia VC/unità per turno
  G.vcSpotRolls = {};

  // Reset AP nemici
  liveEnemies.forEach((e) => {
    e.ap = e.maxAp || 2;
    //e.alerted = false;
    e.suppressed = false;
    // L'agguato dura fino al turno VC successivo: ogni VC decide di nuovo
    e.ambush = false;
    // Il cecchino che ha sparato torna mimetizzato (guerrilla.js)
    e.exposed = false;
    // Cecchino VC: se ha sparato nel turno precedente, in questo turno ricarica
    e.needReload = !!e.hasShot;
    e.hasShot = false;
  });

  // Morale: VC feriti gravemente o vicini a un comandante caduto vanno in rotta
  checkVcMorale();

  // Rinforzi periodici
  const reinTurn = G.mapData.reinforcementTurn || 99;
  if (G.turn % reinTurn === 0) {
    spawnReinforcements(G.mapData.reinforcementCount || 2);
  }

  // Imboscata a sorpresa (una tantum)
  if (
    !G.missionState.ambushTriggered &&
    G.mapData.vcAmbushTurn &&
    G.turn >= G.mapData.vcAmbushTurn &&
    G.mapData.vcAmbushZones?.length
  ) {
    G.missionState.ambushTriggered = true;
    spawnAmbush(G.mapData.vcAmbushCount || 2, G.mapData.vcAmbushZones);
    await sleep(800);
  }

  // Aggiramenti su più turni: ruoli e punti di raccolta
  planFlanks();

  for (const enemy of liveEnemies) {
    await enemyActivation(enemy);
    await sleep(120);
  }

  // Countdown incendi attivi
  G.activeFires.forEach((f) => f.turnsLeft--);
  const extinguished = G.activeFires.filter((f) => f.turnsLeft <= 0);
  extinguished.forEach((f) =>
    log(t("log.fire_out", { col: f.col, row: f.row }), "system"),
  );
  G.activeFires = G.activeFires.filter((f) => f.turnsLeft > 0);
  tickSmokes();

  // Fine turno nemico → inizia nuovo turno
  log(t("log.vc_turn_end", { turn: G.turn }), "turn");
  G.turn++;
  G.phase = "player";
  document.getElementById("turn-num").textContent = G.turn;
  document.getElementById("phase-label").textContent = t("phases.player");
  document.getElementById("btn-endturn").disabled = false;
  log(t("log.player_turn_start", { turn: G.turn }), "turn");
  document.getElementById("vc-remain").textContent = G.enemies.filter(
    (e) => e.alive,
  ).length;

  // Reset overwatch e soppressione (scadono a fine turno nemico)
  G.overwatchList = [];
  G.suppressList = [];
  G.units.forEach((u) => {
    u.overwatch = false;
    u.suppression = false;
    u.overwatchFired = false;
  });

  // Reset players'units state
  G.units.forEach((u) => {
    if (u.alive) {
      u.ap = u.shaken ? AP_PER_TURN - 1 : AP_PER_TURN;
      u.specialUsed = false;
      u.rotated = false;
      u.stanceChanged = false;
      (u.weapons || []).forEach((w) => (w.shotsThisTurn = 0));
    }
    // Posizione svelata (spari, avvistamenti): torna nascosta
    u.exposed = false;
  });
  G.vcSpotRolls = {};

  // Meteo: acquazzoni casuali, nuvole e temperatura (mechanics.js)
  tickRain();
  tickWeather();

  // Emorragie: le unità sanguinanti perdono HP a inizio turno
  tickBleeding();
  if (G.phase === "gameover") return;

  // Colpi d'artiglieria richiesti nel turno precedente: cadono ora
  await resolveArtillery();
  if (G.phase === "gameover") return;

  saveGame();

  // Check ambush (tentativo casuale)
  if (Math.random() < (G.mapData.ambushChance || 0)) {
    // Solo coppie VC/soldato con bersaglio in gittata, in vista e individuato
    const pairs = [];
    for (const e of liveEnemies.filter((e) => e.alive && vcCanShoot(e))) {
      const range = getEnemyStats(e).range;
      for (const u of G.units.filter((u) => u.alive)) {
        if (vcCanFireAt(e, u, range) && vcDetects(e, u))
          pairs.push({ ambusher: e, target: u });
      }
    }
    if (pairs.length) {
      const { ambusher, target } = pick(pairs);
      sfx("ambush");
      log(
        t("log.ambush", {
          name: ambusher.name,
          target: target.name,
        }),
        "enemy",
      );
      ambusher.hasShot = true;
      await resolveCombat(ambusher, target, true);
      makeVcNoise(ambusher, target, unitFireWeapon(ambusher));
    }
  }

  checkGameOver();
  // Tutorial: inizia il turno del giocatore (dopo artiglieria e imboscate)
  tutorialEvent("turnStart", { turn: G.turn });
  updateUI();
  render();
}

// Sceglie l'arma ottimale per un VC: usa l'arma speciale quando ha senso tattico
function vcChooseWeapon(enemy, target) {
  const weapons = enemy.weapons || [];
  if (weapons.length <= 1) return weapons[0] ?? null;
  const primary = weapons[0];
  const d = dist(enemy, target);
  // Armi ad area mai sotto la gittata minima: l'esplosione colpirebbe chi spara
  const specials = weapons
    .slice(1)
    .filter((w) => (w.ammo === null || w.ammo > 0) && d >= weaponMinRange(w));
  if (!specials.length) return primary;
  for (const spec of specials) {
    // Usa se la primaria non raggiunge ma la speciale sì
    if (d > primary.range && d <= spec.range) return spec;
    // Primaria in gittata: AoE solo se 2+ unità US sono raggruppate nel raggio
    if (spec.aoe && d <= spec.range) {
      const cluster = G.units.filter(
        (u) => u.alive && dist(u, target) <= spec.aoe,
      ).length;
      if (cluster >= 2) return spec;
    }
  }
  return primary;
}

// Gittata effettiva di un VC: considera tutte le armi con munizioni disponibili
function vcEffRange(enemy, stats) {
  return (enemy.weapons || [])
    .filter((w) => w.ammo === null || w.ammo > 0)
    .reduce((mx, w) => Math.max(mx, w.range), stats.range);
}

// Il cecchino VC dopo aver sparato salta un turno di fuoco (ricarica)
function vcCanShoot(enemy) {
  return !(enemy.cls === "sniper_vc" && (enemy.hasShot || enemy.needReload));
}

// Esegue un attacco VC contro il bersaglio (consuma AP e munizioni); l'arma
// è quella scelta dall'IA tattica o, se assente, da vcChooseWeapon
async function vcShoot(enemy, target, logKey, weapon) {
  const w = weapon !== undefined ? weapon : vcChooseWeapon(enemy, target);
  if (w && w.ammo !== null) w.ammo--;
  enemy.ap--;
  enemy.hasShot = true;
  // Lo sparo svela il cecchino mimetizzato fino al prossimo turno VC
  enemy.exposed = true;
  log(t(logKey, { name: enemy.name, target: target.name }), "enemy");
  if (w?.aoe) {
    await resolveAoeCombat(enemy, w, target.col, target.row, true);
  } else {
    await resolveCombat(enemy, target, true, w);
  }
  // Lo sparo richiama gli altri VC a portata d'orecchio
  makeVcNoise(enemy, target, w);
}

function nearestLiveUnit(pos) {
  const liveUnits = G.units.filter((u) => u.alive);
  if (!liveUnits.length) return null;
  return liveUnits.reduce(
    (best, u) => (dist(pos, u) < dist(pos, best) ? u : best),
    liveUnits[0],
  );
}

// Distanza minima che il cecchino VC cerca di mantenere dalle unità US
const SNIPER_VC_MIN_DIST = 3;

// Tile raggiungibili dal VC entro il budget di movimento (Dijkstra su costo terreno)
function vcReachableTiles(enemy, budget) {
  const key = (c, r) => `${c},${r}`;
  const best = { [key(enemy.col, enemy.row)]: 0 };
  const open = [{ col: enemy.col, row: enemy.row, cost: 0 }];
  const out = [];
  const DIRS = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  while (open.length) {
    open.sort((a, b) => a.cost - b.cost);
    const cur = open.shift();
    if (cur.cost > best[key(cur.col, cur.row)]) continue;
    out.push(cur);
    for (const [dc, dr] of DIRS) {
      const c = cur.col + dc,
        r = cur.row + dr;
      if (!isTilePassable(c, r) || isOccupied(c, r, enemy.id)) continue;
      const cost = cur.cost + moveCost(c, r);
      if (cost > budget || cost >= (best[key(c, r)] ?? Infinity)) continue;
      best[key(c, r)] = cost;
      open.push({ col: c, row: r, cost });
    }
  }
  return out;
}

// Valuta un tile per il cecchino: resta nella fascia [MIN_DIST, gittata]
// dalle unità US, preferendo copertura e distanza, e la possibilità di sparare
function sniperTileScore(tile, enemy, range, canShoot) {
  const target = nearestLiveUnit(tile);
  const d = target ? dist(tile, target) : Infinity;
  let score;
  if (d < SNIPER_VC_MIN_DIST) score = -(SNIPER_VC_MIN_DIST - d) * 20;
  else if (d > range) score = -(d - range) * 10;
  else score = 50 + d;
  // Bonus solo se da quel tile il bersaglio è anche in vista
  if (canShoot && d <= range && enemy.ap - tile.cost >= 1 && vcSees(tile, target))
    score += 30;
  score += coverBonus(tile.col, tile.row) * 3;
  // Tra gli alberi o nelle macerie è mimetizzato (guerrilla.js)
  if (isConcealingTile(tile.col, tile.row)) score += 4;
  score -= tile.cost * 0.5; // a parità preferisce non muoversi
  return score;
}

// Il cecchino si sposta sul tile migliore raggiungibile con gli AP residui
async function sniperReposition(enemy, stats, range) {
  const budget = Math.min(enemy.ap, stats.move);
  const canShoot = vcCanShoot(enemy);
  const tiles = vcReachableTiles(enemy, budget);
  const dest = tiles.reduce((b, tl) =>
    sniperTileScore(tl, enemy, range, canShoot) >
    sniperTileScore(b, enemy, range, canShoot)
      ? tl
      : b,
  );
  if (dest.cost === 0) return;

  const fromCol = enemy.col,
    fromRow = enemy.row;
  enemy.col = dest.col;
  enemy.row = dest.row;
  enemy.ap = Math.max(0, enemy.ap - dest.cost);
  await animateEnemyMove(enemy, fromCol, fromRow, enemy.col, enemy.row);
  const target = nearestLiveUnit(enemy);
  if (target) {
    log(
      t("log.vc_sniper_reposition", {
        name: enemy.name,
        target: target.name,
        dist: dist(enemy, target),
      }),
      "enemy",
    );
  }
  checkOverwatch(enemy);
  checkSuppression(enemy);
}

// IA del cecchino VC allertato: spara se può, poi si mantiene a distanza di tiro
// senza avvicinarsi troppo; dopo ogni colpo salta un turno per ricaricare
async function sniperActivation(enemy, stats) {
  const range = vcEffRange(enemy, stats);
  // Spara solo a chi è in gittata, in vista e individuato
  let target = vcCanShoot(enemy) ? vcFireTarget(enemy, range) : null;

  if (target && enemy.ap >= 1) {
    checkOverwatch(enemy);
    checkSuppression(enemy);
    if (enemy.alive && enemy.ap >= 1) {
      await vcShoot(enemy, target, "log.vc_attack");
    }
  } else if (enemy.needReload) {
    log(t("log.vc_sniper_reload", { name: enemy.name }), "enemy");
  }

  if (!enemy.alive || enemy.ap < 1) return;
  await sniperReposition(enemy, stats, range);

  target =
    enemy.alive && vcCanShoot(enemy) ? vcFireTarget(enemy, range) : null;
  if (target && enemy.ap >= 1) {
    await vcShoot(enemy, target, "log.vc_fire");
  }
}

async function enemyActivation(enemy) {
  if (!enemy.alive) return;

  const liveUnits = G.units.filter((u) => u.alive);
  if (!liveUnits.length) return;

  // Nei tunnel: riemerge in agguato da un ingresso libero (guerrilla.js)
  if (enemy.inTunnel) {
    tunnelEmerge(enemy);
    render();
    return;
  }

  const stats = getEnemyStats(enemy);

  // Allerta se un'unità US è in vista: entro la distanza d'allerta (ridotta
  // di notte, dal lato o dalle spalle del VC e dalla postura) e in linea di
  // vista; se occultata, serve anche il tiro di avvistamento
  const spotted = liveUnits.find(
    (u) => vcSees(enemy, u, vcAlertDistanceFrom(enemy, u)) && vcDetects(enemy, u),
  );
  if (spotted && !enemy.alerted) {
    enemy.alerted = true;
    faceToward(enemy, spotted);
    addFX("spot", { col: enemy.col, row: enemy.row }, 1200);
    propagateAlert(enemy);
  }

  if (enemy.routed > 0) {
    // Morale a pezzi: ripiega senza attaccare, nei tunnel se ce n'è uno a portata
    if (!(await tryTunnelDive(enemy, stats))) await routedActivation(enemy, stats);
  } else if (enemy.alerted && enemy.cls === "sniper_vc") {
    await sniperActivation(enemy, stats);
  } else if (enemy.alerted) {
    // Ferito gravemente: sparisce nei tunnel se può; altrimenti IA tattica
    // (sceglie da dove e a chi sparare, avanza di copertura in copertura o
    // resta in agguato: vedi sezione IA TATTICA)
    // Aggiratore: prosegue verso il fianco della squadra (sezione AGGIRAMENTO)
    if (
      !(await tryTunnelDive(enemy, stats)) &&
      !(enemy.flank && (await flankActivation(enemy, stats)))
    )
      await tacticalActivation(enemy, stats, liveUnits);
  } else {
    // Guerrigliero in pattuglia: ogni tanto lascia una trappola dove si trova
    maybePlantTrap(enemy);
    // Pattuglia: comportamento basato sul tipo di missione
    let patrolDest = null;
    const pType = G.missionType;
    const md = G.mapData;

    if (pType === "search_destroy") {
      // Vagabondaggio casuale entro ±4 tile
      const dc = clamp(enemy.col + rnd(-4, 4), 0, md.cols - 1);
      const dr = clamp(enemy.row + rnd(-4, 4), 0, md.rows - 1);
      if (isTilePassable(dc, dr)) patrolDest = { col: dc, row: dr };
    } else if (pType === "rescue_pilot") {
      // Convergono verso il pilota; se già trovato, verso il punto di estrazione
      const st = G.missionState;
      patrolDest = st.pilotFound
        ? { col: st.extractCol, row: st.extractRow }
        : { col: st.pilotCol, row: st.pilotRow };
    } else if (pType === "recon") {
      // Esplorano l'intera mappa verso posizioni casuali
      patrolDest = {
        col: rnd(0, md.cols - 1),
        row: rnd(0, md.rows - 1),
      };
    } else if (pType === "capture_objective") {
      // Convergono sull'obiettivo più vicino
      const objs = G.missionState.objectives || [];
      if (objs.length)
        patrolDest = objs.reduce(
          (b, o) => (dist(enemy, o) < dist(enemy, b) ? o : b),
          objs[0],
        );
    }
    // Sentinella ("hold" nella mappa): resta al suo posto finché non è allertata
    if (enemy.hold) patrolDest = null;

    if (
      patrolDest &&
      enemy.ap >= 1 &&
      !(patrolDest.col === enemy.col && patrolDest.row === enemy.row)
    ) {
      const path = getPath(
        enemy.col,
        enemy.row,
        patrolDest.col,
        patrolDest.row,
      );
      if (path && path.length > 1) {
        const patFromCol = enemy.col,
          patFromRow = enemy.row;
        let moved = 0;
        for (
          let i = 1;
          i < path.length && moved < stats.move && enemy.ap > 0;
          i++
        ) {
          const step = path[i];
          const tile = getTileAt(step.col, step.row);
          if (!tile || tile.impassable) break;
          if (isOccupied(step.col, step.row, enemy.id)) break;
          enemy.col = step.col;
          enemy.row = step.row;
          moved += tile.moveCost || 1;
          enemy.ap = Math.max(0, enemy.ap - (tile.moveCost || 1));
        }
        if (enemy.col !== patFromCol || enemy.row !== patFromRow) {
          await animateEnemyMove(
            enemy,
            patFromCol,
            patFromRow,
            enemy.col,
            enemy.row,
          );
        }
      }
    }
    // Overwatch e fuoco soppressivo: controlla dopo il movimento
    checkOverwatch(enemy);
    checkSuppression(enemy);
    log(t("log.vc_patrol", { name: enemy.name }), "enemy");
  }
  render();
}

function spawnReinforcements(count) {
  sfx("spawn");
  log(t("log.reinforcements", { count }), "enemy");
  const zones = G.mapData.vcSpawnZones;
  let spawned = 0;
  for (let a = 0; a < 200 && spawned < count; a++) {
    // Metà dei rinforzi può sbucare da un ingresso di tunnel (guerrilla.js)
    const tn = tunnelForReinforcement();
    const zone = tn ? null : pick(zones);
    const col = tn ? tn.col : rnd(zone.colMin, zone.colMax);
    const row = tn ? tn.row : rnd(zone.rowMin, zone.rowMax);
    if (!isTilePassable(col, row)) continue;
    if (isOccupied(col, row)) continue;
    if (tn && isTileVisible(col, row)) revealTunnel(tn);
    G.enemies.push({
      id: "r" + Date.now() + spawned,
      name: t("units.vc_reinforcement_name"),
      cls: "grunt",
      col,
      row,
      hp: 5,
      maxHp: 5,
      ap: 2,
      maxAp: 2,
      alive: true,
      alerted: true,
      facing: facingToward({ col, row }, nearestLiveUnit({ col, row }) ?? { col, row }) ?? 2,
      vx: col,
      vy: row,
      weapons: buildWeapons("grunt", G.missionState.vcCarrierCounts),
      weaponIdx: 0,
    });
    addFX("spawn", { col, row }, 1300);
    spawned++;
  }
  document.getElementById("vc-remain").textContent = G.enemies.filter(
    (e) => e.alive,
  ).length;
}

function spawnAmbush(count, zones) {
  sfx("ambush");
  log(t("log.vc_ambush", { count }), "enemy");
  let spawned = 0;
  for (let a = 0; a < 300 && spawned < count; a++) {
    const zone = pick(zones);
    const col = rnd(zone.colMin, zone.colMax);
    const row = rnd(zone.rowMin, zone.rowMax);
    if (!isTilePassable(col, row)) continue;
    if (isOccupied(col, row)) continue;
    const cls = pick(["grunt", "grunt", "sniper_vc", "commander"]);
    const vcName =
      cls === "sniper_vc"
        ? VC_NAMES[1]
        : cls === "commander"
          ? VC_NAMES[3]
          : VC_NAMES[0];
    G.enemies.push({
      id: "amb" + Date.now() + spawned,
      name: vcName,
      cls,
      col,
      row,
      hp: cls === "commander" ? 8 : cls === "sniper_vc" ? 6 : 5,
      maxHp: cls === "commander" ? 8 : cls === "sniper_vc" ? 6 : 5,
      ap: 2,
      maxAp: 2,
      alive: true,
      alerted: true,
      facing: facingToward({ col, row }, nearestLiveUnit({ col, row }) ?? { col, row }) ?? 2,
      suppressed: false,
      vx: col,
      vy: row,
      weapons: buildWeapons(cls, G.missionState.vcCarrierCounts),
      weaponIdx: 0,
    });
    addFX("spawn", { col, row, ambush: true }, 1400);
    spawned++;
  }
  document.getElementById("vc-remain").textContent = G.enemies.filter(
    (e) => e.alive,
  ).length;
  render();
}

// Animazione di movimento (VC e unità US): segue il percorso tile per tile
// invece di tagliare in diagonale, con un saltello per passo e polvere sui
// tile visibili (non sui tile nel FOW: non deve tradire VC nascosti).
const MOVE_STEP_MS = 120;
const MOVE_MAX_MS = 720;
const MOVE_HOP = 0.06; // altezza saltello, in frazioni di tile

function _movePath(fromCol, fromRow, toCol, toRow) {
  const steps = Math.abs(toCol - fromCol) + Math.abs(toRow - fromRow);
  const path = getPath(fromCol, fromRow, toCol, toRow);
  // Fallback alla linea retta se non c'è percorso o è assurdamente lungo
  if (!path || path.length < 2 || path.length - 1 > steps * 3)
    return [
      { col: fromCol, row: fromRow },
      { col: toCol, row: toRow },
    ];
  return path;
}

function _moveDust(col, row, big) {
  if (!isTileVisible(col, row)) return;
  addFX("move", { col, row, big }, big ? 650 : 450);
}

function animateEnemyMove(enemy, fromCol, fromRow, toCol, toRow) {
  if (fromCol === toCol && fromRow === toRow) return Promise.resolve();
  const path = _movePath(fromCol, fromRow, toCol, toRow);
  const segs = path.length - 1;
  const duration = Math.min(segs * MOVE_STEP_MS, MOVE_MAX_MS);
  const t0 = performance.now();
  let lastIdx = 0;
  // Stormo di uccelli che si alza da un tile giungla del percorso (animations.js)
  const birdIdx = birdFlushStep(path);
  const enter = (i) => {
    if (i === birdIdx) flushBirds(path[i], path[i - 1]);
  };
  enemy.vx = fromCol;
  enemy.vy = fromRow;
  _moveDust(fromCol, fromRow, false);
  return new Promise((resolve) => {
    function frame(now) {
      const p = Math.min(1, (now - t0) / duration);
      const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
      const s = ease * segs;
      const idx = Math.min(segs - 1, Math.floor(s));
      const f = s - idx;
      const a = path[idx],
        b = path[idx + 1];
      // L'unità guarda nella direzione del passo in corso (a fine movimento: l'ultimo)
      enemy.facing = facingToward(a, b) ?? enemy.facing;
      enemy.vx = a.col + (b.col - a.col) * f;
      enemy.vy = a.row + (b.row - a.row) * f - MOVE_HOP * Math.abs(Math.sin(s * Math.PI));
      // Polvere ogni volta che si entra in un nuovo tile
      const reached = Math.floor(s + 1e-6);
      while (lastIdx < reached && lastIdx < segs - 1) {
        lastIdx++;
        _moveDust(path[lastIdx].col, path[lastIdx].row, false);
        enter(lastIdx);
      }
      render();
      if (p < 1) requestAnimationFrame(frame);
      else {
        enemy.vx = toCol;
        enemy.vy = toRow;
        _moveDust(toCol, toRow, true);
        enter(segs);
        render();
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

function propagateAlert(source) {
  const RADIUS = 3;
  G.enemies.forEach((other) => {
    if (!other.alive || other.id === source.id || other.alerted) return;
    if (dist(source, other) <= RADIUS) {
      other.alerted = true;
      other.ap = 0; // reagisce all'allerta ma non agisce nello stesso turno
      addFX("spot", { col: other.col, row: other.row, relay: true }, 900);
    }
  });
}

// ── IA TATTICA (VC in allerta, escluso il cecchino) ─────────────────────
// Ogni VC valuta tutti i tile raggiungibili con gli AP del turno:
//  1. se da qualche tile (compreso il suo) può sparare a un soldato in
//     gittata, in vista e individuato, sceglie la combinazione tile+bersaglio+
//     arma migliore: danno atteso e probabilità di uccidere (che premiano i
//     tiri sul fianco o alle spalle, i bersagli scoperti e i feriti) più la
//     bontà del tile (copertura, poche armi US puntate, fuori dai coni di
//     overwatch e soppressione, non ammassato con altri VC). Dopo lo sparo,
//     con AP residui, ripiega in un tile più sicuro se il guadagno è netto.
//  2. altrimenti avanza di copertura in copertura verso la squadra, oppure,
//     se è già ben coperto e la squadra è vicina, resta fermo in agguato.
//     Gli AP non spesi diventano un agguato: spara una volta al primo
//     soldato che, nel turno del giocatore, termina un movimento nel suo
//     campo di tiro (fronte e lati, in vista, individuato).
const VC_TACTICS = {
  attackWeight: 10, // per punto di danno atteso
  killWeight: 20, // per probabilità di uccidere
  aoeSingleFactor: 0.5, // RPG su un solo bersaglio: meglio conservarlo
  coverWeight: 3, // per punto di copertura del tile
  concealWeight: 1, // tile che nasconde (vegetazione, macerie)
  threatPenalty: 2.5, // per ogni soldato che vede il tile e lo ha in gittata
  overwatchPenalty: 6, // tile nel cono di un overwatch US attivo
  suppressionPenalty: 4, // tile nell'area di un fuoco soppressivo US
  clusterPenalty: 1.5, // per ogni altro VC adiacente (granate)
  costWeight: 0.3, // per AP di movimento
  approachWeight: 1.2, // per AP di distanza dal bersaglio (avanzata)
  farApproachFactor: 3, // avanzata più decisa se la squadra è lontana
  holdRange: 4, // agguato se la squadra è entro gittata + holdRange
  holdChance: 0.5, // probabilità di restare in agguato (comandante: sempre)
  scootMinGain: 2, // guadagno minimo per ripiegare dopo lo sparo
  // Aggiramento su più turni (sezione AGGIRAMENTO)
  flankMinGroup: 3, // VC allertati idonei necessari per avviare un aggiramento
  flankShare: 0.34, // quota del gruppo che aggira (max 1 ogni 16×12 tile di mappa)
  flankMinStartDist: 4, // non aggira chi è già a ridosso della squadra
  flankMaxStartDist: 10, // né chi è ancora lontano (prima si avvicina)
  flankRallyMin: 3, // distanza del punto di raccolta dal soldato bersaglio
  flankRallyMax: 5,
  flankRearBonus: 6, // punto di raccolta alle spalle del bersaglio
  flankSideBonus: 3, // punto di raccolta sul fianco
  flankExposure: 3, // costo extra (AP) di un tile visto dalla squadra
  flankPathWeight: 0.4, // per AP di percorso fino al punto di raccolta
  flankApproachWeight: 1.5, // per AP di distanza residua durante l'avvicinamento
  flankRallyKeep: 3, // punto di raccolta vicino a quello del turno prima (stabilità)
  flankPincerPenalty: 4, // due aggiratori sullo stesso lato del bersaglio
  flankMaxTurns: 6, // dopo tanti turni senza arrivare rinuncia
  flankGoldenShot: 20, // tiro abbastanza buono da interrompere l'avvicinamento
};

const _tkey = (c, r) => `${c},${r}`;

// Probabilità di colpire, danno atteso e probabilità di uccidere per
// 2d6 + atk contro def + 1d6 (stessa formula di resolveCombat)
function diceOdds(atk, def, hp) {
  let hits = 0,
    kills = 0,
    dmgSum = 0;
  for (let a = 1; a <= 6; a++)
    for (let b = 1; b <= 6; b++)
      for (let d = 1; d <= 6; d++) {
        const dmg = Math.max(0, a + b + atk - (def + d));
        if (dmg > 0) hits++;
        if (dmg >= hp) kills++;
        dmgSum += dmg;
      }
  return { pHit: hits / 216, expDmg: dmgSum / 216, pKill: kills / 216 };
}

// Valore di un attacco diretto VC da `from` (orientamento e postura del
// bersaglio contano: dal fianco copertura dimezzata, alle spalle +1 ATK)
function vcDirectScore(enemy, from, target, weapon) {
  const atk =
    (weapon?.atk ?? getEnemyStats(enemy).attack) + rearAttackBonus(from, target);
  const def =
    (UNIT_CLASSES[target.cls]?.defense ?? 1) +
    stanceDefenseBonus(target, from) +
    effectiveCover(from, target);
  const o = diceOdds(atk, def, target.hp);
  return o.expDmg * VC_TACTICS.attackWeight + o.pKill * VC_TACTICS.killWeight;
}

// Valore di un colpo ad area centrato su `target`: somma sulle unità US nel
// raggio, meno i VC che verrebbero colpiti
function vcAoeScore(enemy, target, weapon) {
  const inBlast = (x) => x.alive && dist(x, target) <= weapon.aoe;
  let score = 0,
    hitUs = 0;
  for (const u of G.units.filter(inBlast)) {
    const def =
      (UNIT_CLASSES[u.cls]?.defense ?? 1) +
      stanceAoeDefenseBonus(u) +
      coverBonus(u.col, u.row);
    const o = diceOdds(weapon.atk, def, u.hp);
    score += o.expDmg * VC_TACTICS.attackWeight + o.pKill * VC_TACTICS.killWeight;
    hitUs++;
  }
  for (const e of G.enemies.filter(inBlast)) {
    if (e === enemy) continue;
    const def = getEnemyStats(e).defense + coverBonus(e.col, e.row);
    score -= diceOdds(weapon.atk, def, e.hp).expDmg * VC_TACTICS.attackWeight * 1.5;
  }
  return hitUs === 1 ? score * VC_TACTICS.aoeSingleFactor : score;
}

// Miglior attacco possibile da `from` (il VC stesso o un tile ipotetico):
// { target, weapon, score } oppure null
function vcBestAttackFrom(enemy, from) {
  const stats = getEnemyStats(enemy);
  const usable = (enemy.weapons || []).filter((w) => w.ammo === null || w.ammo > 0);
  const options = usable.length ? usable : [null];
  let best = null;
  for (const u of G.units) {
    if (!u.alive) continue;
    const d = dist(from, u);
    // Dal tile ipotetico il VC guarderebbe verso il bersaglio
    const viewer =
      from === enemy
        ? enemy
        : { col: from.col, row: from.row, facing: facingToward(from, u) ?? enemy.facing };
    let seenChecked = false;
    for (const w of options) {
      const range = w?.range ?? stats.range;
      if (d > range || (w?.aoe && d < weaponMinRange(w))) continue;
      // Vista prima del tiro di avvistamento: niente tiri per chi è dietro un muro
      if (!seenChecked) {
        if (!vcSees(from, u) || !vcDetects(enemy, u, viewer)) break;
        seenChecked = true;
      }
      const score = w?.aoe ? vcAoeScore(enemy, u, w) : vcDirectScore(enemy, from, u, w);
      if (!best || score > best.score) best = { target: u, weapon: w, score };
    }
  }
  return best;
}

// Bontà difensiva di un tile per un VC (più alto = meglio); con `field`
// (distanze dal bersaglio) premia anche l'avvicinamento
function vcTileScore(enemy, tile, field = null, farFactor = 1) {
  const T = VC_TACTICS;
  let s =
    coverBonus(tile.col, tile.row) * T.coverWeight +
    (isConcealingTile(tile.col, tile.row) ? T.concealWeight : 0) -
    (tile.cost || 0) * T.costWeight;
  for (const u of G.units) {
    if (!u.alive) continue;
    if (dist(u, tile) <= unitFireRange(u) && isTileVisibleFromUnit(u, tile.col, tile.row))
      s -= T.threatPenalty;
  }
  for (const ow of G.overwatchList) {
    if (
      ow.alive &&
      !ow.overwatchFired &&
      hasRoundLoaded(unitFireWeapon(ow)) &&
      facingSector(ow, tile) === "front" &&
      dist(ow, tile) <= unitFireRange(ow) &&
      isTileVisibleFromUnit(ow, tile.col, tile.row)
    )
      s -= T.overwatchPenalty;
  }
  for (const sup of G.suppressList) {
    if (sup.alive && suppressionCovers(sup, tile) && isTileVisibleFromUnit(sup, tile.col, tile.row))
      s -= T.suppressionPenalty;
  }
  for (const e of G.enemies) {
    if (e.alive && e !== enemy && dist(e, tile) <= 1) s -= T.clusterPenalty;
  }
  if (field) s -= (field.get(_tkey(tile.col, tile.row)) ?? 99) * T.approachWeight * farFactor;
  return s;
}

// Distanza (in costo di movimento) di ogni tile percorribile da `goal`;
// `extra(col, row)` aggiunge un costo per tile (es. tile esposti alla squadra)
function vcDistanceField(goal, extra = null) {
  const field = new Map([[_tkey(goal.col, goal.row), 0]]);
  const open = [{ col: goal.col, row: goal.row, cost: 0 }];
  while (open.length) {
    open.sort((a, b) => a.cost - b.cost);
    const cur = open.shift();
    if (cur.cost > field.get(_tkey(cur.col, cur.row))) continue;
    for (const [dc, dr] of FACING_DIRS) {
      const c = cur.col + dc,
        r = cur.row + dr;
      if (!isTilePassable(c, r)) continue;
      const cost = cur.cost + moveCost(c, r) + (extra ? extra(c, r) : 0);
      if (cost >= (field.get(_tkey(c, r)) ?? Infinity)) continue;
      field.set(_tkey(c, r), cost);
      open.push({ col: c, row: r, cost });
    }
  }
  return field;
}

// Sposta il VC su un tile raggiungibile (animazione, AP, reazioni US)
async function vcMoveTo(enemy, tile, target, logKey = "log.vc_advance") {
  if (tile.cost > 0) {
    const fromCol = enemy.col,
      fromRow = enemy.row;
    enemy.col = tile.col;
    enemy.row = tile.row;
    enemy.ap = Math.max(0, enemy.ap - tile.cost);
    await animateEnemyMove(enemy, fromCol, fromRow, enemy.col, enemy.row);
    if (target)
      log(t(logKey, { name: enemy.name, target: target.name, dist: dist(enemy, target) }), "enemy");
  }
  // Overwatch e fuoco soppressivo reagiscono al movimento (o all'azione)
  checkOverwatch(enemy);
  checkSuppression(enemy);
}

function setVcAmbush(enemy) {
  if (!enemy.alive || enemy.ap < 1) return;
  enemy.ambush = true;
  if (isTileVisible(enemy.col, enemy.row))
    log(t("log.vc_ambush_set", { name: enemy.name }), "enemy");
}

async function tacticalActivation(enemy, stats, liveUnits) {
  if (enemy.ap < 1) return;
  const tiles = vcReachableTiles(enemy, Math.min(enemy.ap, stats.move));

  // 1) Sparare: miglior combinazione tile + bersaglio + arma
  let plan = null;
  for (const tl of tiles) {
    if (enemy.ap - tl.cost < 1) continue;
    const atk = vcBestAttackFrom(enemy, tl.cost === 0 ? enemy : tl);
    if (!atk) continue;
    const score = atk.score + vcTileScore(enemy, tl);
    if (!plan || score > plan.score) plan = { ...atk, tile: tl, score };
  }
  if (plan) {
    const moved = plan.tile.cost > 0;
    await vcMoveTo(enemy, plan.tile, plan.target, "log.vc_flank");
    if (enemy.alive && enemy.ap >= 1 && plan.target.alive) {
      // Dopo il movimento (o un overwatch) il bersaglio potrebbe non essere più valido
      const ok =
        dist(enemy, plan.target) <= (plan.weapon?.range ?? stats.range) &&
        vcSees(enemy, plan.target);
      if (ok)
        await vcShoot(enemy, plan.target, moved ? "log.vc_fire" : "log.vc_attack", plan.weapon);
    }
    // Spara e ripiega: con AP residui cerca un tile più sicuro
    if (enemy.alive && enemy.ap >= 1) {
      const here = { col: enemy.col, row: enemy.row, cost: 0 };
      const hereScore = vcTileScore(enemy, here);
      const retreat = vcReachableTiles(enemy, Math.min(enemy.ap, stats.move)).reduce(
        (b, tl) => {
          const s = vcTileScore(enemy, tl);
          return s > b.s ? { tl, s } : b;
        },
        { tl: here, s: hereScore },
      );
      if (retreat.tl.cost > 0 && retreat.s - hereScore >= VC_TACTICS.scootMinGain) {
        await vcMoveTo(enemy, retreat.tl, null);
        if (isTileVisible(enemy.col, enemy.row))
          log(t("log.vc_take_cover", { name: enemy.name }), "enemy");
      }
    }
    return;
  }

  // 2) Nessun tiro possibile: avanzare di copertura in copertura o restare in agguato.
  // Bersaglio: il più vicino tra gli individuati, poi tra i non occultati
  // (il VC non conosce la posizione di chi è nascosto), poi il più vicino
  const byDist = (a, b) => dist(enemy, a) - dist(enemy, b);
  const goal =
    nearestDetectedUnit(enemy) ??
    liveUnits.filter((u) => !isConcealed(u)).sort(byDist)[0] ??
    [...liveUnits].sort(byDist)[0];
  const effRange = vcEffRange(enemy, stats);
  const here = tiles.find((tl) => tl.cost === 0);
  const goodCover =
    coverBonus(enemy.col, enemy.row) >= 1 || isConcealingTile(enemy.col, enemy.row);
  const near = dist(enemy, goal) <= effRange + VC_TACTICS.holdRange;
  const holdChance = enemy.cls === "commander" ? 1 : VC_TACTICS.holdChance;
  if (goodCover && near && Math.random() < holdChance) {
    checkOverwatch(enemy);
    checkSuppression(enemy);
    setVcAmbush(enemy);
    return;
  }

  const field = vcDistanceField(goal);
  const farFactor = near ? 1 : VC_TACTICS.farApproachFactor;
  const dest = tiles.reduce(
    (b, tl) => {
      const s = vcTileScore(enemy, tl, field, farFactor);
      return s > b.s ? { tl, s } : b;
    },
    { tl: here, s: vcTileScore(enemy, here, field, farFactor) },
  ).tl;
  await vcMoveTo(enemy, dest, goal);
  // Gli AP non spesi diventano un agguato per il turno del giocatore
  setVcAmbush(enemy);
}

// ── AGGIRAMENTO ────────────────────────────────────────────────────────
// Con abbastanza VC allertati, una parte del gruppo diventa "aggiratore":
// sceglie un punto di raccolta sul fianco o alle spalle di un soldato
// (rispetto al suo orientamento) e ci arriva in più turni lungo un percorso
// che evita i tile visti dalla squadra, mentre gli altri VC la tengono
// impegnata con l'IA tattica normale. Arrivato, o appena può colpire il bersaglio dal fianco o dalle spalle,
// torna all'IA tattica, che premia già quei tiri.
// Stato: enemy.flank = { targetId, rally, side, turns, hp } (nel salvataggio).

function flankEligible(e) {
  return (
    e.alive &&
    e.alerted &&
    !e.inTunnel &&
    !(e.routed > 0) &&
    e.cls !== "sniper_vc" &&
    e.cls !== "commander"
  );
}

// Tile visti da almeno un soldato: calcolati una volta per turno VC
function computeVcExposure() {
  const md = G.mapData;
  const units = G.units.filter((u) => u.alive);
  const seen = new Set();
  for (let r = 0; r < md.rows; r++)
    for (let c = 0; c < md.cols; c++)
      if (units.some((u) => isTileVisibleFromUnit(u, c, r))) seen.add(_tkey(c, r));
  return seen;
}

// Lato del bersaglio (-1 / 1, 0 se allineato) in cui si trova `tile`
function flankSide(target, tile) {
  const [fx, fy] = FACING_DIRS[target.facing ?? 2];
  return Math.sign((tile.col - target.col) * fy - (tile.row - target.row) * fx);
}

// Miglior punto di raccolta per aggirare `target`: { tile, side } o null.
// `takenSides`: lati già scelti da altri aggiratori (meglio la tenaglia);
// `prev`: punto del turno prima, preferito se ancora buono (non lo insegue
// a ogni passo o rotazione della squadra)
function chooseFlankRally(enemy, target, exposure, takenSides, prev = null) {
  const T = VC_TACTICS;
  const stealth = (c, r) => (exposure.has(_tkey(c, r)) ? T.flankExposure : 0);
  const fromEnemy = vcDistanceField(enemy, stealth);
  let best = null;
  for (let r = target.row - T.flankRallyMax; r <= target.row + T.flankRallyMax; r++) {
    for (let c = target.col - T.flankRallyMax; c <= target.col + T.flankRallyMax; c++) {
      const tile = { col: c, row: r };
      const d = dist(target, tile);
      if (d < T.flankRallyMin || d > T.flankRallyMax) continue;
      if (!isTilePassable(c, r) || isOccupied(c, r)) continue;
      const sector = facingSector(target, tile);
      if (sector === "front") continue;
      const pathCost = fromEnemy.get(_tkey(c, r));
      if (pathCost === undefined) continue;
      let s =
        (sector === "rear" ? T.flankRearBonus : T.flankSideBonus) +
        coverBonus(c, r) * T.coverWeight +
        (isConcealingTile(c, r) ? T.concealWeight : 0) -
        stealth(c, r) -
        pathCost * T.flankPathWeight;
      // Gli altri soldati non devono averlo davanti a sé, in gittata e in vista
      for (const u of G.units) {
        if (!u.alive || u === target) continue;
        if (
          facingSector(u, tile) === "front" &&
          dist(u, tile) <= unitFireRange(u) &&
          isTileVisibleFromUnit(u, c, r)
        )
          s -= T.threatPenalty;
      }
      const side = flankSide(target, tile);
      if (side && takenSides.includes(side)) s -= T.flankPincerPenalty;
      if (prev && dist(prev, tile) <= 1) s += T.flankRallyKeep;
      if (!best || s > best.s) best = { tile, side, s };
    }
  }
  return best;
}

// Inizio turno VC: chiude gli aggiramenti finiti, ne assegna di nuovi e
// ricalcola i punti di raccolta (la squadra si muove e si gira)
function planFlanks() {
  const T = VC_TACTICS;
  const units = G.units.filter((u) => u.alive);
  for (const e of G.enemies) {
    if (!e.flank) continue;
    // Troppo tempo, VC colpito durante l'avvicinamento
    if (!flankEligible(e) || e.flank.turns >= T.flankMaxTurns || e.hp < e.flank.hp) {
      e.flank = null;
      continue;
    }
    // Bersaglio caduto: l'aggiramento prosegue su un altro soldato
    if (!units.some((u) => u.id === e.flank.targetId)) {
      e.flank.targetId = null;
      e.flank.rally = null;
    }
  }
  if (!units.length) return;

  const group = G.enemies.filter(flankEligible);
  const active = group.filter((e) => e.flank);
  const md = G.mapData;
  const maxByMap = Math.max(1, Math.round((md.cols * md.rows) / 192));
  const wanted =
    group.length >= T.flankMinGroup
      ? Math.min(maxByMap, Math.max(1, Math.round(group.length * T.flankShare)))
      : 0;
  // Nuovi aggiratori: chi non ha un tiro da dove si trova, né a ridosso
  // della squadra né ancora lontano; i più vicini prima (arrivano prima)
  const near = (e) => dist(e, nearestLiveUnit(e));
  const cands = group
    .filter(
      (e) =>
        !e.flank &&
        near(e) >= T.flankMinStartDist &&
        near(e) <= T.flankMaxStartDist &&
        !vcBestAttackFrom(e, e),
    )
    .sort((a, b) => near(a) - near(b));
  for (const e of cands) {
    if (active.length >= wanted) break;
    e.flank = { targetId: null, rally: null, side: 0, turns: 0, hp: e.hp };
    active.push(e);
    statAdd("vcFlankers");
  }
  if (!active.length) return;

  const exposure = computeVcExposure();
  G.vcExposure = exposure;
  const taken = {};
  for (const e of active) {
    const tgt =
      units.find((u) => u.id === e.flank.targetId) ?? nearestDetectedUnit(e) ?? nearestLiveUnit(e);
    taken[tgt.id] ??= [];
    const best = chooseFlankRally(e, tgt, exposure, taken[tgt.id], e.flank.rally);
    if (!best) {
      e.flank = null;
      continue;
    }
    Object.assign(e.flank, { targetId: tgt.id, rally: best.tile, side: best.side });
    e.flank.turns++;
    taken[tgt.id].push(best.side);
  }
}

// Attivazione di un aggiratore. Restituisce false se il VC deve invece
// agire con l'IA tattica (arrivato, occasione di tiro, aggiramento finito)
async function flankActivation(enemy, stats) {
  const T = VC_TACTICS;
  const f = enemy.flank;
  const target = G.units.find((u) => u.alive && u.id === f.targetId);
  if (!f.rally) {
    enemy.flank = null;
    return false;
  }
  // Bersaglio caduto in questo turno: per ora IA tattica, al prossimo
  // planFlanks sceglie un nuovo soldato da aggirare
  if (!target) {
    f.targetId = null;
    f.rally = null;
    return false;
  }
  if (enemy.ap < 1) return true;
  const tiles = vcReachableTiles(enemy, Math.min(enemy.ap, stats.move));
  const range = vcEffRange(enemy, stats);

  // Arrivato: sul punto di raccolta, o con un tiro sul fianco/retro del
  // bersaglio a portata in questo turno
  const flankShot = tiles.some(
    (tl) =>
      enemy.ap - tl.cost >= 1 &&
      facingSector(target, tl) !== "front" &&
      dist(tl, target) <= range &&
      vcSees(tl, target),
  );
  if (dist(enemy, f.rally) <= 1 || flankShot) {
    enemy.flank = null;
    statAdd("vcFlankArrived");
    return false;
  }
  // Occasione d'oro da dove si trova: spara (l'aggiramento resta in corso)
  const shot = vcBestAttackFrom(enemy, enemy);
  if (shot && shot.score >= T.flankGoldenShot) return false;

  // Avvicinamento: il tile raggiungibile più vicino al punto di raccolta
  // lungo il percorso meno esposto, preferendo copertura e meno minacce
  const exposure = G.vcExposure ?? new Set();
  const stealth = (c, r) => (exposure.has(_tkey(c, r)) ? T.flankExposure : 0);
  const field = vcDistanceField(f.rally, stealth);
  const score = (tl) =>
    -(field.get(_tkey(tl.col, tl.row)) ?? 99) * T.flankApproachWeight -
    stealth(tl.col, tl.row) +
    vcTileScore(enemy, tl);
  const here = tiles.find((tl) => tl.cost === 0);
  const dest = tiles.reduce((b, tl) => (score(tl) > score(b) ? tl : b), here);
  const wasVisible = isEnemyVisible(enemy);
  await vcMoveTo(enemy, dest, null);
  if (!enemy.alive) return true;
  if (dest.cost > 0 && (wasVisible || isEnemyVisible(enemy)))
    log(t("log.vc_flanking", { name: enemy.name }), "enemy");
  faceToward(enemy, target);
  setVcAmbush(enemy);
  return true;
}

// Fuoco dall'agguato: chiamato quando un soldato termina un movimento nel
// turno del giocatore. Ogni VC in agguato spara al massimo una volta, solo se
// il soldato è davanti o di lato, in gittata, in vista e individuato.
// Restituisce true se almeno un VC ha sparato.
async function vcAmbushFire(unit) {
  let fired = false;
  for (const e of G.enemies) {
    if (!unit.alive || G.phase !== "player") break;
    if (!e.alive || !e.ambush || e.routed > 0) continue;
    if (facingSector(e, unit) === "rear") continue;
    const w = vcChooseWeapon(e, unit);
    if (w?.aoe) continue; // in agguato solo fuoco diretto
    const range = w?.range ?? getEnemyStats(e).range;
    if (!vcCanFireAt(e, unit, range) || !vcDetects(e, unit)) continue;
    e.ambush = false;
    statAdd("vcAmbushFire");
    log(t("log.vc_ambush_fire", { name: e.name, target: unit.name }), "enemy");
    await resolveCombat(e, unit, true, w);
    makeVcNoise(e, unit, w);
    fired = true;
  }
  if (fired) {
    checkGameOver();
    updateUI();
    render();
  }
  return fired;
}
