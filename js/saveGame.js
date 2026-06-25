function saveGame() {
  if (!G.mapData || G.phase === "gameover") return;
  try {
    const state = {
      version: 1,
      savedAt: Date.now(),
      mapName: G.mapData.name || "",
      missionType: G.missionType,
      turn: G.turn,
      fowEnabled: G.fowEnabled,
      mapData: G.mapData,
      units: G.units,
      enemies: G.enemies,
      overwatchIds: G.overwatchList.map((u) => u.id),
      suppressIds: G.suppressList.map((u) => u.id),
      activeFires: G.activeFires,
      missionState: G.missionState,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("[save] failed:", e);
  }
}
function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {}
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s?.version !== 1) {
      clearSave();
      return null;
    }
    return s;
  } catch (e) {
    clearSave();
    return null;
  }
}

async function resumeGame(save) {
  // Nascondi modal, prepara canvas
  document.getElementById("modal-overlay").style.display = "none";
  setupCanvas();

  // Ripristina mapData (include griglia modificata da demolizioni)
  G.mapData = save.mapData;
  loadMissionSounds(G.mapData);

  // Carica immagine mappa se presente
  if (G.mapData.image) {
    G.tileImg = new Image();
    await new Promise((r) => {
      G.tileImg.onload = r;
      G.tileImg.onerror = r;
      G.tileImg.src = "missions/" + G.mapData.image;
    });
    if (!G.tileImg.naturalWidth) G.tileImg = null;
  } else {
    G.tileImg = null;
  }

  // Ripristina stato partita
  G.missionType = save.missionType;
  G.turn = save.turn;
  G.phase = "player";
  G.fowEnabled = save.fowEnabled ?? true;
  G.units = save.units;
  G.enemies = save.enemies;
  G.missionState = save.missionState;
  G.activeFires = save.activeFires || [];
  G.selectedUnit = null;
  G.actionMode = null;
  G.currentWeapon = null;
  G.pendingAoe = null;
  G.diceQueue = null;
  G.pendingDice = false;
  G.reachable = [];
  G.attackable = [];

  // Re-collega overwatch/suppress (le liste contengono riferimenti agli oggetti in G.units)
  G.overwatchList = (save.overwatchIds || [])
    .map((id) => G.units.find((u) => u.id === id))
    .filter(Boolean);
  G.suppressList = (save.suppressIds || [])
    .map((id) => G.units.find((u) => u.id === id))
    .filter(Boolean);

  // Aggiorna header
  document.getElementById("turn-num").textContent = G.turn;
  document.getElementById("phase-label").textContent = t("phases.player");
  document.getElementById("vc-remain").textContent = G.enemies.filter(
    (e) => e.alive,
  ).length;
  document.getElementById("btn-endturn").disabled = false;
  document.getElementById("btn-menu").style.display = "inline-block";

  // Aggiorna FOW button
  const fowBtn = document.getElementById("btn-fow");
  if (fowBtn) fowBtn.classList.toggle("fow-on", G.fowEnabled);

  // Musica e render
  ambientPlay(G.mapData.ambient);
  history.pushState({ game: true }, "");
  render();
  _startTileAnimLoop();
  updateUI();

  log(t("log.game_resumed", { turn: G.turn }), "system");
}
