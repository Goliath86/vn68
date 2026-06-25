// Bresenham: restituisce tile da (x0,y0) a (x1,y1), start escluso, end incluso
function getLineTiles(x0, y0, x1, y1) {
  const tiles = [];
  let dx = Math.abs(x1 - x0),
    dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1,
    sy = y0 < y1 ? 1 : -1;
  let err = dx - dy,
    cx = x0,
    cy = y0;
  while (true) {
    if (cx !== x0 || cy !== y0) tiles.push({ col: cx, row: cy });
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
  }
  return tiles;
}

// Controlla se un'unità vede (toCol,toRow) considerando terrain LOS
function isTileVisibleFromUnit(unit, toCol, toRow) {
  const uc = unit.col,
    ur = unit.row;
  if (uc === toCol && ur === toRow) return true;
  const vision = UNIT_CLASSES[unit.cls].vision;
  if (dist(unit, { col: toCol, row: toRow }) > vision) return false;
  const line = getLineTiles(uc, ur, toCol, toRow);
  let penalty = 0;
  // Controlla solo i tile intermedi (non il tile bersaglio)
  for (let i = 0; i < line.length - 1; i++) {
    const { col, row } = line[i];
    const key = G.mapData.grid[row]?.[col];
    const td = key ? G.mapData.tileTypes[key] : null;
    if (!td) continue;
    if (td.losBlock === "full") return false;
    if (td.losBlock === "partial") penalty++;
  }
  return dist(unit, { col: toCol, row: toRow }) + penalty <= vision;
}

// Precalcola l'insieme di tile visibili — chiamato all'inizio di ogni renderMap
function recomputeVisibility() {
  G.visibleTiles.clear();
  if (!G.mapData) return;
  for (const u of G.units) {
    if (!u.alive) continue;
    const vision = UNIT_CLASSES[u.cls].vision;
    const rMin = Math.max(0, u.row - vision),
      rMax = Math.min(G.mapData.rows - 1, u.row + vision);
    const cMin = Math.max(0, u.col - vision),
      cMax = Math.min(G.mapData.cols - 1, u.col + vision);
    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) {
        const k = `${c},${r}`;
        if (!G.visibleTiles.has(k) && isTileVisibleFromUnit(u, c, r))
          G.visibleTiles.add(k);
      }
    }
  }
}

function isTileVisible(col, row) {
  if (!G.fowEnabled) return true;
  return G.visibleTiles.has(`${col},${row}`);
}

function toggleFOW() {
  G.fowEnabled = !G.fowEnabled;
  const btn = document.getElementById("btn-fow");
  btn.classList.toggle("fow-on", G.fowEnabled);
  btn.title = G.fowEnabled ? "Fog of War: ON" : "Fog of War: OFF";
  if (G.actionMode === "attack") setActionMode("attack");
  render();
}

function getTileAt(col, row) {
  const md = G.mapData;
  if (!md) return null;
  if (row < 0 || row >= md.rows || col < 0 || col >= md.cols) return null;
  const key = md.grid[row][col];
  return md.tileTypes[key] || null;
}

function isOnFire(col, row) {
  return G.activeFires.some((f) => f.col === col && f.row === row);
}

function isTilePassable(col, row, unit = null) {
  const t = getTileAt(col, row);
  if (!t) return false;
  if (t.impassable) return false;
  if (isOnFire(col, row)) return false;
  return true;
}

function moveCost(col, row) {
  const t = getTileAt(col, row);
  return t ? t.moveCost || 1 : 99;
}

function coverBonus(col, row) {
  const t = getTileAt(col, row);
  return t ? t.coverBonus || 0 : 0;
}
