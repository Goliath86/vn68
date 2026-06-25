function resizeCanvas() {
  const c = document.getElementById("center");
  const w = c.clientWidth;
  const h = c.clientHeight;
  G.canvas.width = G.oCanvas.width = w;
  G.canvas.height = G.oCanvas.height = h;
  if (G.mapData) render();
}

function setupCanvas() {
  G.canvas = document.getElementById("map-canvas");
  G.ctx = G.canvas.getContext("2d");
  G.oCanvas = document.getElementById("overlay-canvas");
  G.oCtx = G.oCanvas.getContext("2d");

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // Input events
  G.canvas.addEventListener("click", onCanvasClick);
  G.canvas.addEventListener("mousemove", onCanvasMove);
  G.canvas.addEventListener("mousedown", onMouseDown);
  G.canvas.addEventListener("mouseup", onMouseUp);
  G.canvas.addEventListener("mouseleave", () => {
    document.getElementById("tile-tooltip").style.display = "none";
  });
  G.canvas.addEventListener("wheel", onWheel, { passive: true });
  // touch
  G.canvas.addEventListener("touchstart", onTouchStart, {
    passive: true,
  });
  G.canvas.addEventListener("touchmove", onTouchMove, {
    passive: false,
  });
  G.canvas.addEventListener("touchend", onTouchEnd);
  // ── TOUCH mobile: pan 1 dito, pinch zoom, tap ────────────────────────────
  // ── TOUCH: pan con UN dito (anche senza tasto destro su mobile) ────────
  // Distanza minima per considerare un gesto "pan" vs "tap"
  let touchPanActive = false;
  let touchPanStart = null;
  let touchMoved = false;
  const TAP_THRESHOLD = 8; // pixel

  G.canvas.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 1) {
        touchPanStart = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          camX: G.camX,
          camY: G.camY,
        };
        touchMoved = false;
        touchPanActive = true;
      } else if (e.touches.length === 2) {
        // Pinch zoom inizializzazione
        touchPanActive = false;
        G._pinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        G._pinchScale = G.scale;
        G._pinchMid = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };
      }
    },
    { passive: true },
  );

  G.canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && touchPanActive && touchPanStart) {
        const dx = e.touches[0].clientX - touchPanStart.x;
        const dy = e.touches[0].clientY - touchPanStart.y;
        if (Math.abs(dx) > TAP_THRESHOLD || Math.abs(dy) > TAP_THRESHOLD) {
          touchMoved = true;
          G.camX = touchPanStart.camX + dx;
          G.camY = touchPanStart.camY + dy;
          clampCamera();
          render();
        }
      } else if (e.touches.length === 2 && G._pinchDist) {
        // Pinch zoom
        const newDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        const ratio = newDist / G._pinchDist;
        const newScale = clamp(G._pinchScale * ratio, 0.3, 2.5);
        const rect = G.canvas.getBoundingClientRect();
        const mx = G._pinchMid.x - rect.left;
        const my = G._pinchMid.y - rect.top;
        G.camX = mx - (mx - G.camX) * (newScale / G.scale);
        G.camY = my - (my - G.camY) * (newScale / G.scale);
        G.scale = newScale;
        clampCamera();
        render();
      }
    },
    { passive: false },
  );

  G.canvas.addEventListener(
    "touchend",
    (e) => {
      if (!touchMoved && touchPanActive && touchPanStart) {
        // È un tap: simula click
        const rect = G.canvas.getBoundingClientRect();
        const fakeEvt = {
          clientX: touchPanStart.x,
          clientY: touchPanStart.y,
        };
        onCanvasClick(fakeEvt);
      }
      touchPanActive = false;
      touchPanStart = null;
      touchMoved = false;
      G._pinchDist = null;
    },
    { passive: true },
  );

  // ── DRAG HANDLE per ridimensionare bottom sheet ───────────────────────
  (function () {
    const handle = document.getElementById("sheet-handle");
    const sheet = document.getElementById("bottom-sheet");
    const app = document.getElementById("app");
    let dragging = false,
      startY,
      startH;

    handle.addEventListener(
      "touchstart",
      (e) => {
        dragging = true;
        startY = e.touches[0].clientY;
        startH = sheet.offsetHeight;
      },
      { passive: true },
    );

    window.addEventListener(
      "touchmove",
      (e) => {
        if (!dragging) return;
        const dy = startY - e.touches[0].clientY; // drag up = aumenta
        const appH = app.offsetHeight;
        const newH = clamp(startH + dy, 80, appH - 80);
        sheet.style.setProperty("--sheet-h", newH + "px");
        sheet.style.height = newH + "px";
        resizeCanvas();
      },
      { passive: true },
    );

    window.addEventListener("touchend", () => {
      dragging = false;
    });
  })();
}
