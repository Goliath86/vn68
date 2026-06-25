document.getElementById("btn-restart").addEventListener("click", () => {
  document.getElementById("gameover-overlay").classList.add("hidden");
  document.getElementById("modal-overlay").style.display = "flex";
  initModal();
  if (CONFIG.menuMusic) ambientPlay(CONFIG.menuMusic);
});

function returnToMenu() {
  document.getElementById("confirm-overlay").classList.remove("hidden");
}

document.getElementById("confirm-no").addEventListener("click", () => {
  document.getElementById("confirm-overlay").classList.add("hidden");
});

document.getElementById("confirm-yes").addEventListener("click", async () => {
  document.getElementById("confirm-overlay").classList.add("hidden");
  history.replaceState(null, "");
  G.phase = "gameover"; // blocca il loop nemico in corso
  await ambientFadeOut(800);
  document.getElementById("modal-overlay").style.display = "flex";
  initModal();
  if (CONFIG.menuMusic) ambientPlay(CONFIG.menuMusic);
});

// ── BACK BUTTON (Android / browser) ───────────────────────────────────
window.addEventListener("popstate", () => {
  const confirmEl = document.getElementById("confirm-overlay");
  const confirmVisible = !confirmEl.classList.contains("hidden");

  if (confirmVisible) {
    // Back premuto mentre il confirm è aperto → chiude il confirm (= NO)
    confirmEl.classList.add("hidden");
    if (G.mapData && G.phase !== "gameover")
      history.pushState({ game: true }, "");
    return;
  }

  if (G.mapData && G.phase !== "gameover") {
    // Partita attiva → re-push dello stato e mostra confirm
    history.pushState({ game: true }, "");
    returnToMenu();
  }
});
