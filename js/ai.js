async function runEnemyTurn() {
  log(t("log.vc_turn_start"), "turn");
  const liveEnemies = G.enemies.filter((e) => e.alive);

  // Reset AP nemici
  liveEnemies.forEach((e) => {
    e.ap = e.maxAp || 2;
    e.alerted = false;
    e.suppressed = false;
  });

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

  // Ripristina AP giocatori
  G.units.forEach((u) => {
    if (u.alive) {
      u.ap = u.shaken ? AP_PER_TURN - 1 : AP_PER_TURN;
      u.specialUsed = false;
      u.hasShot = false;
    }
  });
  saveGame();

  // Check ambush (tentativo casuale)
  if (Math.random() < (G.mapData.ambushChance || 0)) {
    const liveUnits = G.units.filter((u) => u.alive);
    if (liveUnits.length && liveEnemies.length) {
      const ambusher = pick(liveEnemies.filter((e) => e.alive));
      const target = pick(liveUnits);
      if (ambusher && target) {
        sfx("ambush");
        log(
          t("log.ambush", {
            name: ambusher.name,
            target: target.name,
          }),
          "enemy",
        );
        await resolveCombat(ambusher, target, true);
      }
    }
  }

  checkGameOver();
  updateUI();
  render();
}

// Sceglie l'arma ottimale per un VC: usa l'arma speciale quando ha senso tattico
function vcChooseWeapon(enemy, target) {
  const weapons = enemy.weapons || [];
  if (weapons.length <= 1) return weapons[0] ?? null;
  const primary = weapons[0];
  const specials = weapons
    .slice(1)
    .filter((w) => w.ammo === null || w.ammo > 0);
  if (!specials.length) return primary;
  const d = dist(enemy, target);
  for (const spec of specials) {
    // Usa se la primaria non raggiunge ma la speciale sì
    if (d > primary.range && d <= spec.range) return spec;
    // Usa AoE se 2+ unità US sono raggruppate nel raggio di esplosione
    if (spec.aoe && d <= spec.range) {
      const cluster = G.units.filter(
        (u) => u.alive && dist(u, target) <= spec.aoe,
      ).length;
      if (cluster >= 2) return spec;
    }
  }
  return primary;
}

async function enemyActivation(enemy) {
  if (!enemy.alive) return;
  const liveUnits = G.units.filter((u) => u.alive);
  if (!liveUnits.length) return;

  // Trova unità più vicina
  let target = liveUnits.reduce(
    (best, u) => (dist(enemy, u) < dist(enemy, best) ? u : best),
    liveUnits[0],
  );
  const d = dist(enemy, target);
  const stats = getEnemyStats(enemy);

  // Allerta se a distanza visiva
  if (d <= 5 && !enemy.alerted) {
    enemy.alerted = true;
    addFX("spot", { col: enemy.col, row: enemy.row }, 1200);
    propagateAlert(enemy);
  } else if (d <= 5) {
    enemy.alerted = true;
  }

  if (enemy.alerted) {
    // Gittata effettiva: considera tutte le armi disponibili
    const effRange = (enemy.weapons || [])
      .filter((w) => w.ammo === null || w.ammo > 0)
      .reduce((mx, w) => Math.max(mx, w.range), stats.range);
    // Se in gittata (con qualsiasi arma): attacca
    if (d <= effRange && enemy.ap >= 1) {
      checkOverwatch(enemy);
      checkSuppression(enemy);
      if (enemy.ap >= 1) {
        const w = vcChooseWeapon(enemy, target);
        if (w && w.ammo !== null) w.ammo--;
        enemy.ap--;
        log(
          t("log.vc_attack", {
            name: enemy.name,
            target: target.name,
          }),
          "enemy",
        );
        if (w?.aoe) {
          await resolveAoeCombat(enemy, w, target.col, target.row, true);
        } else {
          await resolveCombat(enemy, target, true, w);
        }
      }
    } else {
      // Muovi verso il target
      if (enemy.ap >= 1) {
        const fromCol = enemy.col,
          fromRow = enemy.row;
        const path = getPath(
          enemy.col,
          enemy.row,
          target.col,
          target.row,
          true,
        );
        if (path && path.length > 1) {
          let moved = 0;
          for (
            let i = 1;
            i < path.length && moved < stats.move && enemy.ap > 0;
            i++
          ) {
            const step = path[i];
            const tile = getTileAt(step.col, step.row);
            if (!tile || tile.impassable || isOnFire(step.col, step.row)) break;
            if (isOccupied(step.col, step.row, enemy.id)) break;
            enemy.col = step.col;
            enemy.row = step.row;
            moved += tile.moveCost || 1;
            enemy.ap = Math.max(0, enemy.ap - (tile.moveCost || 1));
          }
          if (enemy.col !== fromCol || enemy.row !== fromRow) {
            await animateEnemyMove(
              enemy,
              fromCol,
              fromRow,
              enemy.col,
              enemy.row,
            );
            const newDist = dist(enemy, target);
            log(
              t("log.vc_advance", {
                name: enemy.name,
                target: target.name,
                dist: newDist,
              }),
              "enemy",
            );
          }
          // Overwatch e fuoco soppressivo: controlla dopo il movimento
          checkOverwatch(enemy);
          checkSuppression(enemy);
          // Attacca se ora in gittata (con qualsiasi arma)
          const newEffRange = (enemy.weapons || [])
            .filter((w) => w.ammo === null || w.ammo > 0)
            .reduce((mx, w) => Math.max(mx, w.range), stats.range);
          if (dist(enemy, target) <= newEffRange && enemy.ap >= 1) {
            const w = vcChooseWeapon(enemy, target);
            if (w && w.ammo !== null) w.ammo--;
            enemy.ap--;
            log(
              t("log.vc_fire", {
                name: enemy.name,
                target: target.name,
              }),
              "enemy",
            );
            if (w?.aoe) {
              await resolveAoeCombat(enemy, w, target.col, target.row, true);
            } else {
              await resolveCombat(enemy, target, true, w);
            }
          }
        }
      }
    }
  } else {
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
    const zone = pick(zones);
    const col = rnd(zone.colMin, zone.colMax);
    const row = rnd(zone.rowMin, zone.rowMax);
    if (!isTilePassable(col, row)) continue;
    if (isOccupied(col, row)) continue;
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
      vx: col,
      vy: row,
      weapons: buildWeapons("grunt", G.missionState.vcCarrierCounts),
      weaponIdx: 0,
    });
    addFX("spawn", { col, row }, 1000);
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
      suppressed: false,
      vx: col,
      vy: row,
      weapons: buildWeapons(cls, G.missionState.vcCarrierCounts),
      weaponIdx: 0,
    });
    addFX("spawn", { col, row }, 1400);
    spawned++;
  }
  document.getElementById("vc-remain").textContent = G.enemies.filter(
    (e) => e.alive,
  ).length;
  render();
}

function animateEnemyMove(enemy, fromCol, fromRow, toCol, toRow) {
  const steps = Math.abs(toCol - fromCol) + Math.abs(toRow - fromRow);
  if (steps === 0) return Promise.resolve();
  const duration = Math.min(steps * 160, 480);
  const t0 = performance.now();
  enemy.vx = fromCol;
  enemy.vy = fromRow;
  return new Promise((resolve) => {
    function frame(now) {
      const p = Math.min(1, (now - t0) / duration);
      const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
      enemy.vx = fromCol + (toCol - fromCol) * ease;
      enemy.vy = fromRow + (toRow - fromRow) * ease;
      render();
      if (p < 1) requestAnimationFrame(frame);
      else {
        enemy.vx = toCol;
        enemy.vy = toRow;
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
      addFX("spot", { col: other.col, row: other.row }, 900);
    }
  });
}
