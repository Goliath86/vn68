// ── LOAD MAP ───────────────────────────────────────────────────────────
// Una mappa con errori (validate.js) non parte: MapDataError con l'elenco,
// mostrato nel briefing; gli avvisi restano in console
async function loadMission(jsonPath) {
  const data = await fetchJsonData(jsonPath);
  assertValid(jsonPath, validateMission(data));
  // Immagini dei tile ("texture") pronte prima del primo disegno del terreno
  if (!data.image) await loadTileTextures(data);
  return useMission(data);
}

// Attiva un mapData già pronto (da JSON o da generatore procedurale)
function useMission(data) {
  // La griglia si può scrivere come righe di testo ("JJCCT..."): la
  // demolizione modifica i singoli tile, quindi servono array di caratteri
  if (data.grid) data.grid = data.grid.map((r) => (typeof r === "string" ? r.split("") : r));
  G.mapData = data;
  loadMissionSounds(G.mapData);
  // Altri ingressi (lezioni, generatori): le texture che arrivano dopo
  // rifanno la cache del terreno (plchldSprites.js:loadTileTextures)
  if (!data.image) loadTileTextures(data);

  // Imposta scala iniziale per far stare la mappa nello schermo
  const c = document.getElementById("center");
  const scX = c.clientWidth / (G.mapData.cols * TILE);
  const scY = c.clientHeight / (G.mapData.rows * TILE);
  G.scale = Math.min(scX, scY, 1);
  G.camX = 0;
  G.camY = 0;
  // Mappe grandi su schermi piccoli: non rimpicciolire oltre una soglia
  // leggibile, e inquadrare la zona di partenza della squadra
  const MIN_FIT_SCALE = 0.35;
  if (G.scale < MIN_FIT_SCALE && G.mapData.playerStart?.length) {
    G.scale = MIN_FIT_SCALE;
    const ps = G.mapData.playerStart;
    const midC = ps.reduce((s, p) => s + p.col, 0) / ps.length + 0.5;
    const midR = ps.reduce((s, p) => s + p.row, 0) / ps.length + 0.5;
    G.camX = c.clientWidth / 2 - midC * TILE * G.scale;
    G.camY = c.clientHeight / 2 - midR * TILE * G.scale;
    if (G.canvas) clampCamera();
  }

  // Carica immagine mappa se presente
  const imgName = G.mapData.image;
  if (!imgName) {
    G.tileImg = null;
    render();
    return G.mapData;
  }
  const img = new Image();
  img.src = assetUrl("missions/" + imgName);
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

// ── PARAMETRI PER MISSIONE ─────────────────────────────────────────────
// "tuning" nel JSON della mappa: { "VC_TACTICS": { "holdChance": 0.8 },
// "ENEMY_CLASSES": { "commander": { "hp": 10 } }, … } unito in profondità
// alle costanti di bilanciamento (numeri e array sostituiti, oggetti uniti).
// A ogni avvio o ripresa si torna prima ai valori di partenza, così una
// missione non lascia i suoi parametri alla successiva.
const TUNABLES = () => ({ VC_TACTICS, STANCES, MELEE, ARTILLERY, NAPALM, ENEMY_CLASSES, VC_MIX });
let _tuningDefaults = null;

function applyMissionTuning(md) {
  const objs = TUNABLES();
  // Valori di partenza = quelli dopo config.json, fotografati al primo avvio
  _tuningDefaults ??= JSON.parse(JSON.stringify(objs));
  for (const [k, obj] of Object.entries(objs)) {
    for (const key of Object.keys(obj)) delete obj[key];
    deepMerge(obj, _tuningDefaults[k]);
  }
  for (const [k, patch] of Object.entries(md?.tuning || {})) {
    if (objs[k]) deepMerge(objs[k], patch);
    else console.warn(`[tuning] parametro sconosciuto: ${k}`);
  }
}

// ── INIT GAME ──────────────────────────────────────────────────────────
function startGame(
  missionType,
  squadClasses = ["assault", "sniper", "engineer", "medic"],
  options = {},
) {
  history.pushState({ game: true }, "");
  clearLog();
  applyMissionTuning(G.mapData);

  G.missionType = missionType;
  G.turn = 1;
  G.phase = "player";
  G.units = [];
  G.enemies = [];
  G.selectedUnit = null;
  G.actionMode = null;
  G.throwing = false;
  G.overwatchList = [];
  G.suppressList = [];
  G.activeFires = [];
  G.missionState = {
    vcCarrierCounts: {},
    night: !!(options.night || G.mapData.night),
    smokes: [],
    artillery: [],
    napalm: [],
  };
  G.lastMove = null;

  const starts = G.mapData.playerStart;
  // maxCarriers vale anche per la squadra US (es. una sola radio)
  const usCarrierCounts = {};

  // Squadra: scelta nel briefing (sulle posizioni di partenza) oppure fissa
  // dalla mappa con "squad": [{ cls, col, row, facing?, hp?, bleeding?, stance? }]
  // (lezioni del tutorial)
  const squadDefs =
    G.mapData.squad ||
    squadClasses.map((cls, i) => ({ cls, col: starts[i].col, row: starts[i].row }));

  squadDefs.forEach((sd, i) => {
    const cls = sd.cls;
    const def = UNIT_CLASSES[cls];
    const hp = Math.min(def.hp, sd.hp ?? def.hp);

    G.units.push({
      id: "u" + i,
      name: SOLDIER_NAMES[i],
      cls,
      col: sd.col,
      row: sd.row,
      hp,
      maxHp: def.hp,
      ap: AP_PER_TURN,
      maxAp: AP_PER_TURN,
      alive: true,
      facing: sd.facing ?? initialFacing(sd),
      rotated: false,
      stance: sd.stance || "stand",
      stanceChanged: false,
      exposed: false,
      specialUsed: false,
      overwatch: false,
      suppression: false,
      suppressed: false,
      shaken: hp / def.hp < SEVERE_WOUND_THRESHOLD,
      bleeding: !!sd.bleeding,
      carriesPilot: false,
      weapons: buildWeapons(cls, usCarrierCounts),
      weaponIdx: 0,
    });
  });

  // VC fissi dalla mappa: "enemies": [{ cls, col, row, facing?, alerted?, hold?, hp? }]
  // (hold: sentinella che non pattuglia finché non è allertata)
  let spawned = 0;
  for (const ed of G.mapData.enemies || []) {
    G.enemies.push(
      makeEnemy("e" + spawned, ed.cls || "grunt", ed.col, ed.row, {
        hp: ed.hp,
        facing: ed.facing,
        alerted: ed.alerted,
        hold: ed.hold,
      }),
    );
    spawned++;
  }

  // Spawn VC casuale
  const zones = G.mapData.vcSpawnZones;
  const count = G.mapData.enemies ? 0 : G.mapData.vcCount || 6;
  let attempts = 0;

  while (spawned < count && attempts < 500) {
    attempts++;
    const zone = pick(zones);
    const col = rnd(zone.colMin, zone.colMax);
    const row = rnd(zone.rowMin, zone.rowMax);

    if (!isTilePassable(col, row)) continue;

    if (G.enemies.find((e) => e.col === col && e.row === row)) continue;

    G.enemies.push(makeEnemy("e" + spawned, pickEnemyClass(vcMix("spawn")), col, row));
    spawned++;
  }

  // Init missione
  initMissionState(missionType);
  initTraps();
  revealTrapsAroundEngineers();
  initTunnels();
  revealTunnelsNearUnits();

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

  //document.getElementById("btn-dice").disabled = false;

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

  if (isNight()) log(t("log.night_mission"), "system");
  initRain();
  initWeather();

  ambientPlay(G.mapData.ambient);

  // Pannello dell'istruttore: visibile solo nelle lezioni del tutorial
  renderTutorialPanel();

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

// Recupero pilota: se cade il soldato che lo scorta, il pilota resta a terra
// sul suo tile e un altro soldato può raccoglierlo (unitMovement.js:moveUnit)
function dropPilot(unit) {
  if (!unit.carriesPilot) return;
  unit.carriesPilot = false;
  const st = G.missionState;
  st.pilotFound = false;
  st.pilotCol = unit.col;
  st.pilotRow = unit.row;
  log(t("log.pilot_dropped", { name: unit.name }), "combat");
}

/**
 * Function to check the victory conditions for every type of mission
 */
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

/**
 * Function to display a game over overlay to the player in case of victory or defeat
 */
function showGameOver(win) {
  // Una sola volta: il riepilogo aggiorna lo storico delle statistiche
  if (G.phase === "gameover") return;
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
  // Riepilogo statistico della missione (js/stats.js); le lezioni del
  // tutorial non entrano nello storico
  renderMissionStats(win, { history: !G.mapData?.tutorial });
  // Tutorial: lezione superata e bottone per la successiva (tutorial.js)
  tutorialGameOver(win);
  render();
}

function endPlayerTurn() {
  if (G.phase !== "player") return;
  if (G.pendingDice || G.throwing) return;
  clearLastMove();
  tutorialEvent("endTurn", { turn: G.turn });
  // Cancella qualsiasi modalità azione in corso (incluso weapon_select e aoe_confirm)
  G.actionMode = null;
  G.currentWeapon = null;
  G.pendingAoe = null;
  G.aimTarget = null;
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
