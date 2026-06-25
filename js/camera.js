function onMouseDown(e) {
  if (e.button !== 2 && e.button !== 1) return; // solo tasto destro/medio per pan
  G.dragging = true;
  G.dragStart = { x: e.clientX - G.camX, y: e.clientY - G.camY };
  e.preventDefault();
}
function onMouseUp() {
  G.dragging = false;
}
function onCanvasMove(e) {
  if (G.dragging) {
    G.camX = e.clientX - G.dragStart.x;
    G.camY = e.clientY - G.dragStart.y;
    clampCamera();
    render();
    return;
  }
  // Tooltip
  const { col, row } = screenToTile(e.clientX, e.clientY);
  if (col >= 0 && row >= 0 && col < G.mapData.cols && row < G.mapData.rows) {
    showTooltip(e, col, row);
  } else {
    document.getElementById("tile-tooltip").style.display = "none";
  }
}
function onWheel(e) {
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  const rect = G.canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const newScale = clamp(G.scale * delta, 0.3, 2.5);
  G.camX = mx - (mx - G.camX) * (newScale / G.scale);
  G.camY = my - (my - G.camY) * (newScale / G.scale);
  G.scale = newScale;
  clampCamera();
  render();
}

// Touch pan
let lastTouch = null;
function onTouchStart(e) {
  lastTouch = {
    x: e.touches[0].clientX,
    y: e.touches[0].clientY,
  };
}
function onTouchMove(e) {
  e.preventDefault();
  if (!lastTouch) return;
  const dx = e.touches[0].clientX - lastTouch.x;
  const dy = e.touches[0].clientY - lastTouch.y;
  G.camX += dx;
  G.camY += dy;
  lastTouch = {
    x: e.touches[0].clientX,
    y: e.touches[0].clientY,
  };
  clampCamera();
  render();
}
function onTouchEnd() {
  lastTouch = null;
}

function clampCamera() {
  if (!G.mapData) return;
  const cw = G.canvas.width,
    ch = G.canvas.height;
  const mw = G.mapData.cols * TILE * G.scale;
  const mh = G.mapData.rows * TILE * G.scale;
  G.camX = clamp(G.camX, Math.min(0, cw - mw), Math.max(0, cw - mw));
  G.camY = clamp(G.camY, Math.min(0, ch - mh), Math.max(0, ch - mh));
}
