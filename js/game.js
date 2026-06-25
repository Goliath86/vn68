// ── LOAD MAP ───────────────────────────────────────────────────────────
async function loadMission(jsonPath) {
  const resp = await fetch(jsonPath);
  G.mapData = await resp.json();
  loadMissionSounds(G.mapData);

  // Imposta scala iniziale per far stare la mappa nello schermo
  const c = document.getElementById("center");
  const scX = c.clientWidth / (G.mapData.cols * TILE);
  const scY = c.clientHeight / (G.mapData.rows * TILE);
  G.scale = Math.min(scX, scY, 1);
  G.camX = 0;
  G.camY = 0;

  // Carica immagine mappa se presente
  const imgName = G.mapData.image;
  const img = new Image();
  img.src = "missions/" + imgName;
  img.onload = () => {
    G.tileImg = img;
    render();
  };
  img.onerror = () => {
    G.tileImg = null;
    render();
  };

  return G.mapData;
}

// ── AUDIO SYSTEM ───────────────────────────────────────────────────────

// ── INIT GAME ──────────────────────────────────────────────────────────
function startGame(
  missionType,
  squadClasses = ["assault", "sniper", "engineer", "medic"],
) {
  history.pushState({ game: true }, "");
  G.missionType = missionType;
  G.turn = 1;
  G.phase = "player";
  G.units = [];
  G.enemies = [];
  G.selectedUnit = null;
  G.actionMode = null;
  G.overwatchList = [];
  G.suppressList = [];
  G.activeFires = [];
  G.missionState = { vcCarrierCounts: {} };

  const starts = G.mapData.playerStart;

  squadClasses.forEach((cls, i) => {
    const def = UNIT_CLASSES[cls];
    G.units.push({
      id: "u" + i,
      name: SOLDIER_NAMES[i],
      cls,
      col: starts[i].col,
      row: starts[i].row,
      hp: def.hp,
      maxHp: def.hp,
      ap: AP_PER_TURN,
      maxAp: AP_PER_TURN,
      alive: true,
      specialUsed: false,
      overwatch: false,
      suppression: false,
      suppressed: false,
      shaken: false,
      carriesPilot: false,
      weapons: buildWeapons(cls, {}),
      weaponIdx: 0,
    });
  });

  // Spawn VC
  const zones = G.mapData.vcSpawnZones;
  const count = G.mapData.vcCount || 6;
  let spawned = 0;
  let attempts = 0;
  while (spawned < count && attempts < 500) {
    attempts++;
    const zone = pick(zones);
    const col = rnd(zone.colMin, zone.colMax);
    const row = rnd(zone.rowMin, zone.rowMax);
    if (!isTilePassable(col, row)) continue;
    if (G.enemies.find((e) => e.col === col && e.row === row)) continue;
    const vcClass = pick(["grunt", "grunt", "grunt", "sniper_vc", "commander"]);
    const vcName =
      vcClass === "sniper_vc"
        ? VC_NAMES[1]
        : vcClass === "commander"
          ? VC_NAMES[3]
          : VC_NAMES[0];
    G.enemies.push({
      id: "e" + spawned,
      name: vcName,
      cls: vcClass,
      col,
      row,
      hp: vcClass === "commander" ? 8 : vcClass === "sniper_vc" ? 6 : 5,
      maxHp: vcClass === "commander" ? 8 : vcClass === "sniper_vc" ? 6 : 5,
      ap: 2,
      maxAp: 2,
      alive: true,
      alerted: false,
      suppressed: false,
      vx: col,
      vy: row,
      weapons: buildWeapons(vcClass, G.missionState.vcCarrierCounts),
      weaponIdx: 0,
    });
    spawned++;
  }

  // Init missione
  initMissionState(missionType);

  updateUI();
  renderUnitsOnMap();
  document.getElementById("turn-num").textContent = G.turn;
  document.getElementById("phase-label").textContent = t("phases.player");
  document.getElementById("vc-remain").textContent = G.enemies.filter(
    (e) => e.alive,
  ).length;
  const missionName = (mt("name") ?? G.mapData.name ?? "?").toUpperCase();
  document.getElementById("mission-subtitle").textContent =
    missionName + " — " + MISSION_TYPES[missionType].label.toUpperCase();
  document.getElementById("btn-dice").disabled = false;
  document.getElementById("btn-endturn").disabled = false;
  document.getElementById("btn-menu").style.display = "inline-block";
  log(t("log.mission_start"), "system");
  log(
    t("log.mission_type", {
      type: MISSION_TYPES[missionType].label,
    }),
    "system",
  );
  log(t("log.enemy_deployed", { count: spawned }), "enemy");
  ambientPlay(G.mapData.ambient);
  render();
  _startTileAnimLoop();
}

function initMissionState(type) {
  const md = G.mapData;
  const st = G.missionState; // preserva vcCarrierCounts già popolato dallo spawn iniziale
  st.vcCarrierCounts = st.vcCarrierCounts || {};

  if (type === "recon") {
    st.points = (md.objectives.recon || []).map((p) => ({
      ...p,
      scouted: false,
    }));
  }
  if (type === "search_destroy") {
    const sd = md.objectives.search_destroy || {};
    st.kills = 0;
    st.needed = sd.eliminateAll ? G.enemies.length : sd.minKills || 4;
    st.eliminateAll = !!sd.eliminateAll;
  }
  if (type === "rescue_pilot") {
    const rp = md.objectives.rescue_pilot || {};
    st.pilotCol = rp.pilotCol || 0;
    st.pilotRow = rp.pilotRow || 0;
    st.extractCol = rp.extractCol || 0;
    st.extractRow = rp.extractRow || 0;
    st.pilotFound = false;
    st.pilotExtracted = false;
  }
  if (type === "capture_objective") {
    const caps = md.objectives.capture_objective || [];
    st.objectives = caps.map((o) => ({
      ...o,
      heldTurns: 0,
      controlled: false,
    }));
  }
  G.missionState = st;
}
function checkVictory() {
  const type = G.missionType;
  const st = G.missionState;
  let won = false;

  if (type === "recon") {
    won = (st.points || []).every((p) => p.scouted);
  }
  if (type === "search_destroy") {
    won = st.eliminateAll
      ? G.enemies.every((e) => !e.alive)
      : st.kills >= st.needed;
  }
  if (type === "rescue_pilot") {
    won = !!st.pilotExtracted;
  }
  if (type === "capture_objective") {
    won = (st.objectives || []).every((o) => o.heldTurns >= (o.holdTurns || 2));
  }
  if (won) showGameOver(true);
}

function checkGameOver() {
  const liveUnits = G.units.filter((u) => u.alive).length;
  if (liveUnits === 0) {
    showGameOver(false);
    return;
  }
  checkVictory();
}

function showGameOver(win) {
  G.phase = "gameover";
  clearSave();
  sfx(win ? "victory" : "defeat");
  ambientStop();
  const el = document.getElementById("gameover-overlay");
  const title = document.getElementById("go-title");
  const desc = document.getElementById("go-desc");
  el.classList.remove("hidden");
  title.className = win ? "win" : "lose";
  title.textContent = win ? t("gameover.win_title") : t("gameover.lose_title");
  const vc = G.enemies.filter((e) => !e.alive).length;
  const survive = G.units.filter((u) => u.alive).length;
  desc.textContent = win
    ? t("gameover.win_desc", { turn: G.turn, vc, survive })
    : t("gameover.lose_desc", { turn: G.turn, vc });
  render();
}

function endPlayerTurn() {
  if (G.phase !== "player") return;
  if (G.pendingDice) return;
  // Cancella qualsiasi modalità azione in corso (incluso weapon_select e aoe_confirm)
  G.actionMode = null;
  G.currentWeapon = null;
  G.pendingAoe = null;
  G.reachable = [];
  G.attackable = [];

  // Capture objective: conta chi è sopra
  if (G.missionType === "capture_objective") {
    for (const obj of G.missionState.objectives || []) {
      const hasUnit = G.units.some(
        (u) => u.alive && u.col === obj.col && u.row === obj.row,
      );
      if (hasUnit) {
        obj.controlled = true;
        obj.heldTurns = (obj.heldTurns || 0) + 1;
        const objLabel =
          missionObjLabel(
            "capture_objective",
            G.missionState.objectives.indexOf(obj),
          ) ?? obj.label;
        log(
          t("log.objective_held", {
            label: objLabel,
            held: obj.heldTurns,
            total: obj.holdTurns || 2,
          }),
          "success",
        );
      } else {
        obj.controlled = false;
      }
    }
    checkVictory();
  }

  sfx("turn_end");
  log(t("log.player_turn_end"), "turn");
  G.phase = "enemy";
  document.getElementById("phase-label").textContent = t("phases.enemy");
  document.getElementById("btn-endturn").disabled = true;

  setTimeout(runEnemyTurn, 600);
}
