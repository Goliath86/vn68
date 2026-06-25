// ── INIT ───────────────────────────────────────────────────────────────
setupCanvas();

audioInit();

// Carica traduzioni + catalogo mappe in parallelo, poi inizializza
Promise.all([loadLang("it"), loadCatalog(), loadConfig()]).then(() => {
  rebuildMapsFromCatalog();
  applyTranslationsToData();
  applyTranslationsToDOM();
  initModal();
  if (CONFIG.menuMusic) {
    const menuUrl = CONFIG.menuMusic;
    ambientStop();
    const a = new Audio(menuUrl);
    a.loop = true;
    a.volume = AUDIO.musicVol;
    AUDIO.ambient = a;
    a.play().catch(() => {
      // Autoplay blocked (HTTPS autoplay policy) — retry on first user gesture
      const resume = () => ambientPlay(menuUrl);
      document.addEventListener("click", resume, {
        once: true,
      });
      document.addEventListener("keydown", resume, {
        once: true,
      });
    });
  }
});

// Language switcher
document.querySelectorAll(".lang-btn").forEach((btn) => {
  btn.addEventListener("click", () => setLang(btn.dataset.lang));
});

// Previeni context menu su canvas
document
  .getElementById("map-canvas")
  .addEventListener("contextmenu", (e) => e.preventDefault());
document
  .getElementById("overlay-canvas")
  .addEventListener("contextmenu", (e) => e.preventDefault());

// Click su overlay-canvas: pointer-events off, passa al canvas sotto
document.getElementById("overlay-canvas").style.pointerEvents = "none";
