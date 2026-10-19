
setupCanvas();
initPanelCollapse();
document.querySelectorAll(".game-version").forEach((el) => (el.textContent = `v${GAME_VERSION}`));

audioInit();

// ── SCHERMATA DI CARICAMENTO ───────────────────────────────────────────
// Copre il menu finché sprite, musica e suoni non sono scaricati
// (config.js:preloadAssets): niente segnaposto al posto delle pedine né
// musica del menu che parte a partita iniziata.
let _loadingPct = 0;

function setLoadingProgress(frac) {
  _loadingPct = Math.round(frac * 100);
  document.getElementById("loading-fill").style.width = `${_loadingPct}%`;
  document.getElementById("loading-text").textContent = t("loading.progress", { pct: _loadingPct });
}

function hideLoadingScreen() {
  document.getElementById("loading-overlay").classList.add("hidden");
}

// Avvia la musica del menu; se il browser blocca l'autoplay (nessun gesto
// dell'utente finora) la schermata resta con il pulsante CONTINUA, il cui
// click sblocca l'audio
function finishLoading() {
  document.getElementById("loading-text").textContent = t("loading.ready");
  // Saltato con CONTINUA durante un download lento: la musica del menu
  // parte solo se il giocatore è ancora nel menu
  const inMenu =
    document.getElementById("modal-overlay").style.display !== "none" ||
    !document.getElementById("tutorial-overlay").classList.contains("hidden");
  if (_loadingSkipped && !inMenu) return;
  if (!CONFIG.menuMusic || AUDIO.muted) return hideLoadingScreen();
  ambientPlay(CONFIG.menuMusic);
  const a = AUDIO.ambient;
  if (!a) return hideLoadingScreen();
  // Se play() non si risolve né rifiuta (nessuna uscita audio) non si resta bloccati
  const stall = new Promise((r) => setTimeout(r, MUSIC_START_WAIT_MS));
  Promise.race([a.play(), stall]).then(hideLoadingScreen, showLoadingContinue);
}

const MUSIC_START_WAIT_MS = 3000;

// Pulsante CONTINUA: sblocca l'audio del menu (se già pronto) e chiude la schermata
function showLoadingContinue() {
  const btn = document.getElementById("loading-continue");
  btn.classList.remove("hidden");
  btn.onclick = () => {
    if (AUDIO.ambient) AUDIO.ambient.play().catch(() => {});
    else _loadingSkipped = true;
    hideLoadingScreen();
  };
}

// Rete lenta o bloccata: dopo LOADING_SKIP_MS si può entrare comunque
// (gli asset arrivano in background, con i fallback nel frattempo)
const LOADING_SKIP_MS = 20000;
let _loadingSkipped = false;
const _loadingSkipTimer = setTimeout(showLoadingContinue, LOADING_SKIP_MS);

// Carica traduzioni + catalogo mappe + config in parallelo, poi scarica gli
// asset e solo allora apre il menu; le musiche d'ambiente delle missioni
// arrivano dopo, in background (se una missione parte prima, ambientPlay
// usa il percorso originale in streaming)
let _ambientPaths = [];
Promise.all([loadLang("it"), loadCatalog(), loadConfig()])
  .then(async () => {
    rebuildMapsFromCatalog();
    applyTranslationsToData();
    applyTranslationsToDOM();
    reportStartupIssues();
    setLoadingProgress(_loadingPct / 100);
    initModal();

    const maps = await catalogAssetPaths();
    _ambientPaths = maps.ambient;
    await preloadAssets([...configAssetPaths(), ...maps.files], setLoadingProgress);
    await buildAssetCaches();
  })
  .catch((e) => console.error("[loading]", e))
  .finally(() => {
    clearTimeout(_loadingSkipTimer);
    finishLoading();
    preloadAssets(_ambientPaths);
  });

// Language switcher
document.querySelectorAll(".lang-btn").forEach((btn) => {
  btn.addEventListener("click", () => setLang(btn.dataset.lang));
});

// Prevent context menu on canvas and overlay
document
  .getElementById("map-canvas")
  .addEventListener("contextmenu", (e) => e.preventDefault());

document
  .getElementById("overlay-canvas")
  .addEventListener("contextmenu", (e) => e.preventDefault());

// Click on overlay-canvas: pointer-events off, let the click pass through
document.getElementById("overlay-canvas").style.pointerEvents = "none";
