function render() {
  if (!G.mapData) return;
  renderMap();
  renderOverlay();
  // Avvia il ciclo d'animazione se serve (es. un'unità ha appena iniziato a sanguinare)
  _startTileAnimLoop();
}

function tileToScreen(col, row) {
  const x = G.camX + col * TILE * G.scale;
  const y = G.camY + row * TILE * G.scale;
  return { x, y };
}

function screenToTile(sx, sy) {
  const rect = G.canvas.getBoundingClientRect();
  const mx = sx - rect.left;
  const my = sy - rect.top;
  const col = Math.floor((mx - G.camX) / (TILE * G.scale));
  const row = Math.floor((my - G.camY) / (TILE * G.scale));
  return { col, row };
}

// ── CACHE TERRENO PROCEDURALE ──────────────────────────────────────────
// Il terreno senza immagine di sfondo viene disegnato una volta su un canvas
// offscreen e poi solo "blittato" a ogni frame. Densità 2.5× = zoom massimo,
// ridotta se la mappa supererebbe il budget di pixel (limiti canvas mobile).
const TERRAIN_CACHE_DENSITY = 2.5;
const TERRAIN_CACHE_MAX_PX = 16e6;
const TERRAIN_CACHE_MAX_SIDE = 8192;
let _terrainCache = null; // { canvas, mapData, grass, canopy }

function invalidateTerrainCache() {
  _terrainCache = null;
}

function getTerrainCache() {
  const md = G.mapData;
  if (_terrainCache && _terrainCache.mapData === md) return _terrainCache.canvas;
  for (const _ of _terrainCacheSteps(md));
  return _terrainCache.canvas;
}

// Costruisce la cache prima del primo render() cedendo il controllo al
// browser ogni ~TERRAIN_BUILD_SLICE_MS: la pagina resta reattiva e
// onProgress(0..1) può aggiornare una barra (briefing, mappe procedurali)
const TERRAIN_BUILD_SLICE_MS = 30;

async function prebuildTerrainCache(md, onProgress = () => {}) {
  if (md.image) return;
  await loadTileTextures(md);
  let last = performance.now();
  for (const p of _terrainCacheSteps(md)) {
    if (performance.now() - last < TERRAIN_BUILD_SLICE_MS) continue;
    onProgress(p);
    await nextPaint();
    last = performance.now();
  }
  onProgress(1);
}

// Attende che il browser abbia disegnato un fotogramma
function nextPaint() {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}

// Disegno della cache a passi (righe di tile, righe di transizioni, gruppi
// di chiome): ogni yield dà l'avanzamento 0..1
const CANOPY_BUILD_CHUNK = 150;

function* _terrainCacheSteps(md) {
  const w = md.cols * TILE;
  const h = md.rows * TILE;
  const density = Math.min(
    TERRAIN_CACHE_DENSITY,
    Math.sqrt(TERRAIN_CACHE_MAX_PX / (w * h)),
    TERRAIN_CACHE_MAX_SIDE / Math.max(w, h),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * density);
  canvas.height = Math.round(h * density);
  const ctx = canvas.getContext("2d");
  // Coordinate in unità "scala 1": spessori linee identici al rendering diretto
  ctx.scale(canvas.width / w, canvas.height / h);

  // Col vento attivo l'erba dei tile in WIND_GRASS_IDS resta fuori dalla
  // cache: i fili, per tile, sono ridisegnati a ogni fotogramma
  const wind = windActive();
  const grass = wind ? { cols: md.cols, rows: md.rows, tiles: [] } : null;
  const crowns = wind ? null : jungleCrowns(md, TILE);
  const total = md.rows * 2 + (crowns ? Math.ceil(crowns.length / CANOPY_BUILD_CHUNK) : 1);
  let done = 0;
  for (let r = 0; r < md.rows; r++) {
    for (let c = 0; c < md.cols; c++) _drawTerrainTile(ctx, md, c, r, grass);
    yield ++done / total;
  }
  // Sfumature tra terreni, rive e ombre: richiedono tutti i tile già disegnati
  for (let r = 0; r < md.rows; r++) {
    drawTerrainTransitions(ctx, md, TILE, r, r + 1);
    yield ++done / total;
  }
  // Chiome della giungla senza clip: sporgono sui tile vicini. Col vento sono
  // disegnate a ogni fotogramma (animations.js:renderWindCanopy) dagli sprite
  // preparati qui; senza vento a gruppi, sempre in ordine da nord a sud
  let canopy = null;
  if (wind) {
    canopy = windCanopy(md, TILE);
    canopySprites();
    yield ++done / total;
  } else {
    for (let i = 0; i < crowns.length; i += CANOPY_BUILD_CHUNK) {
      drawJungleCanopy(ctx, md, TILE, crowns.slice(i, i + CANOPY_BUILD_CHUNK));
      yield ++done / total;
    }
    // Col vento la griglia va sopra le chiome animate: la disegna renderMap
    drawTerrainGrid(ctx, md);
  }

  _terrainCache = { canvas, mapData: md, grass, canopy };
}

// Fondo e dettagli di un tile. Col vento (grass) l'erba dei tile in
// WIND_GRASS_IDS resta fuori dalla cache: i fili sono ridisegnati a ogni
// fotogramma
function _drawTerrainTile(ctx, md, c, r, grass) {
  const tileDef = md.tileTypes[md.grid[r][c]];
  if (!tileDef) return;
  const x = c * TILE;
  const y = r * TILE;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = tileDef.color || "#2d5a1b";
  ctx.fillRect(x, y, TILE, TILE);
  ctx.globalAlpha = 1;
  if (grass && WIND_GRASS_IDS.has(tileLook(tileDef))) _grassSink = [];
  drawTileDetails(ctx, tileDef, x, y, TILE, c, r);
  if (grass) grass.tiles[r * md.cols + c] = _grassSink || undefined;
  _grassSink = null;
}

// Tile cambiato in partita (artiglieria, napalm, demolizione): ridisegna
// nella cache solo i dintorni invece di ricostruirla tutta, che su mappe
// grandi blocca la pagina per centinaia di ms a metà animazione. Con il
// tile cambiano transizioni, ombre e chiome dei vicini, e le chiome sporgono
// al massimo di un tile: si ridisegna il quadrato di raggio TERRAIN_PATCH_R
// (clip), con sotto anche i tile appena fuori per ciò che sporge dentro
const TERRAIN_PATCH_R = 2;

function invalidateTerrainTile(col, row) {
  const tc = _terrainCache;
  const md = G.mapData;
  if (!tc || tc.mapData !== md) return;
  const R = TERRAIN_PATCH_R;
  const c0 = Math.max(0, col - R);
  const c1 = Math.min(md.cols - 1, col + R);
  const r0 = Math.max(0, row - R);
  const r1 = Math.min(md.rows - 1, row + R);
  const e0 = Math.max(0, c0 - 1);
  const e1 = Math.min(md.cols - 1, c1 + 1);
  const f0 = Math.max(0, r0 - 1);
  const f1 = Math.min(md.rows - 1, r1 + 1);
  const { canvas, grass } = tc;
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.setTransform(canvas.width / (md.cols * TILE), 0, 0, canvas.height / (md.rows * TILE), 0, 0);
  const x = c0 * TILE;
  const y = r0 * TILE;
  const w = (c1 - c0 + 1) * TILE;
  const h = (r1 - r0 + 1) * TILE;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.clearRect(x, y, w, h);
  for (let r = f0; r <= f1; r++) {
    for (let c = e0; c <= e1; c++) _drawTerrainTile(ctx, md, c, r, grass);
  }
  drawTerrainTransitions(ctx, md, TILE, f0, f1 + 1, e0, e1 + 1);
  if (tc.canopy) {
    // Col vento le chiome sono disegnate a ogni fotogramma: basta la lista
    tc.canopy = windCanopy(md, TILE);
  } else {
    const near = jungleCrowns(md, TILE).filter(
      (k) => k.c >= e0 && k.c <= e1 && k.r >= f0 && k.r <= f1,
    );
    drawJungleCanopy(ctx, md, TILE, near);
    drawTerrainGrid(ctx, md);
  }
  ctx.restore();
}

// Mappe con immagine di sfondo: i tile trasformati dall'artiglieria
// (mechanics.js:blastTile, G.missionState.blasted) sono ridisegnati sopra
// l'immagine con la texture procedurale. Uno sprite per tile e tipo.
const _blastedSprites = new Map(); // "col,row,id" → canvas

function renderBlastedTiles(ctx, ts) {
  for (const b of G.missionState?.blasted || []) {
    const def = getTileAt(b.col, b.row);
    if (!def) continue;
    const key = `${b.col},${b.row},${def.id}`;
    let cv = _blastedSprites.get(key);
    if (!cv) {
      const dens = 2;
      cv = document.createElement("canvas");
      cv.width = cv.height = TILE * dens;
      const g = cv.getContext("2d");
      g.scale(dens, dens);
      g.fillStyle = def.color || "#2d5a1b";
      g.fillRect(0, 0, TILE, TILE);
      drawTileDetails(g, def, 0, 0, TILE, b.col, b.row);
      drawTileObjects(g, def, 0, 0, TILE, b.col, b.row);
      _blastedSprites.set(key, cv);
    }
    const { x, y } = tileToScreen(b.col, b.row);
    ctx.drawImage(cv, x, y, ts, ts);
  }
}

// Bordi dei tile in coordinate di mondo (ctx già trasformato)
function drawTerrainGrid(ctx, md) {
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 0.5;
  for (let r = 0; r < md.rows; r++) {
    for (let c = 0; c < md.cols; c++) {
      if (md.tileTypes[md.grid[r][c]]) ctx.strokeRect(c * TILE, r * TILE, TILE, TILE);
    }
  }
}

// animFrame: ridisegno del ciclo d'animazione (animations.js), lo stato di
// gioco non è cambiato e la visibilità non va ricalcolata
function renderMap(animFrame = false) {
  if (G.fowEnabled && !animFrame) recomputeVisibility();
  const ctx = G.ctx;
  const md = G.mapData;
  const ts = TILE * G.scale;
  ctx.clearRect(0, 0, G.canvas.width, G.canvas.height);

  // Sfondo
  ctx.fillStyle = "#111a08";
  ctx.fillRect(0, 0, G.canvas.width, G.canvas.height);

  // Se c'è immagine mappa, la disegna a piena risoluzione al posto dei tile
  if (G.tileImg) {
    ctx.drawImage(G.tileImg, G.camX, G.camY, md.cols * ts, md.rows * ts);
    renderBlastedTiles(ctx, ts);
    // Solo bordi griglia (navigazione), niente fill né texture
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 0.5;
    for (let r = 0; r < md.rows; r++) {
      for (let c = 0; c < md.cols; c++) {
        const { x, y } = tileToScreen(c, r);
        ctx.strokeRect(x, y, ts, ts);
      }
    }
  } else {
    // Griglia tile procedurale, pre-renderizzata in cache offscreen
    ctx.drawImage(getTerrainCache(), G.camX, G.camY, md.cols * ts, md.rows * ts);
    // Onde animate su fiume e guado (animations.js:renderWaterWaves)
    renderWaterWaves(ctx, ts);
    renderWindGrass(ctx, _terrainCache.grass);
    // Foglie sollevate dalle raffiche sulle radure (animations.js)
    renderWindLeaves(ctx);
    if (_terrainCache.canopy) {
      renderWindCanopy(ctx, _terrainCache.canopy);
      ctx.save();
      ctx.translate(G.camX, G.camY);
      ctx.scale(G.scale, G.scale);
      drawTerrainGrid(ctx, md);
      ctx.restore();
    }
  }

  // Crateri delle esplosioni (animations.js:renderCraters), sopra le chiome
  renderCraters(ctx);

  // Indicatori missione
  renderMissionMarkers(ctx, ts);

  // Trappole individuate dal geniere
  for (const trap of G.missionState?.traps || []) {
    if (!trap.revealed) continue;
    const { x, y } = tileToScreen(trap.col, trap.row);
    ctx.strokeStyle = "#ff4422";
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x + 3, y + 3, ts - 6, ts - 6);
    ctx.setLineDash([]);
    ctx.fillStyle = "#ff6644";
    ctx.font = `bold ${Math.max(10, Math.round(ts * 0.38))}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(trap.type === "mine" ? "✸" : "▲", x + ts * 0.5, y + ts * 0.5);
  }

  // Ingressi di tunnel individuati (guerrilla.js); sigillati: macerie e X
  for (const tn of G.missionState?.tunnels || []) {
    if (!tn.revealed) continue;
    drawTunnelEntrance(ctx, tn, ts);
  }

  // Ombre delle nuvole di giorno (animations.js:renderCloudShadows)
  renderCloudShadows(ctx, ts);

  // Nebbiolina sulla palude (animations.js:renderMist), coperta da notte e FOW
  renderMist(ctx, ts);

  // Notte: velo scuro su tutta la mappa (prima del FOW)
  if (isNight()) {
    ctx.fillStyle = "rgba(8,12,40,0.38)";
    ctx.fillRect(G.camX, G.camY, md.cols * ts, md.rows * ts);
  }

  // Fog of War — overlay scuro sui tile fuori visibilità
  if (G.fowEnabled) {
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    for (let r = 0; r < md.rows; r++) {
      for (let c = 0; c < md.cols; c++) {
        if (!isTileVisible(c, r)) {
          const { x, y } = tileToScreen(c, r);
          ctx.fillRect(x, y, ts, ts);
        }
      }
    }
    // Soldato selezionato: velo leggero sui tile visti dai compagni ma non
    // da lui, così si distingue il suo campo visivo da quello della squadra
    const sel = G.selectedUnit;
    if (sel?.alive && G.phase === "player") {
      const own = unitVisibleTiles(sel);
      ctx.fillStyle = `rgba(0,0,0,${SQUAD_ONLY_VEIL})`;
      for (const k of G.visibleTiles) {
        if (own.has(k)) continue;
        const [c, r] = k.split(",").map(Number);
        const { x, y } = tileToScreen(c, r);
        ctx.fillRect(x, y, ts, ts);
      }
    }
  }

  // Animazioni tile (smoke, fire, fog) — dopo il FOW: il fumo è visibile
  // anche nell'oscurità (il fumo del relitto si vede da lontano)
  renderTileAnimations(ctx, ts);

  // Unità nemiche (nascoste nella nebbia)
  for (const e of G.enemies) {
    if (!e.alive) continue;
    // FOW, tunnel e cecchini mimetizzati (guerrilla.js)
    if (!isEnemyVisible(e)) continue;
    const { x, y } = tileToScreen(e.vx ?? e.col, e.vy ?? e.row);
    ctx.fillStyle = "rgba(100,15,15,0.68)";
    ctx.beginPath();
    ctx.arc(x + ts * 0.5, y + ts * 0.5, ts * 0.41, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#cc3300";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x + ts * 0.5, y + ts * 0.5, ts * 0.41, 0, Math.PI * 2);
    ctx.stroke();
    drawUnitSprite(ctx, x, y, ts, e.cls, false, true, pieceStance(e), e.facing, 0, unitAnimPose(e, true));
    drawFacingMarker(ctx, x, y, ts, e.facing, "#ff6a40");
    const hpRatio = e.hp / e.maxHp;
    ctx.fillStyle = "#111";
    ctx.fillRect(x + 2, y + ts - 5, ts - 4, 3);
    ctx.fillStyle = hpRatio > 0.5 ? "#aa4422" : "#882200";
    ctx.fillRect(x + 2, y + ts - 5, (ts - 4) * hpRatio, 3);
    // VC in rotta: bandiera bianca
    if (e.routed > 0) {
      ctx.fillStyle = "#ffffff";
      ctx.font = `${Math.max(8, Math.round(ts * 0.24))}px serif`;
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText("⚐", x + ts - 2, y + 2);
    }
    // VC in agguato: mirino arancione (sparerà a chi si muove nel suo campo di tiro)
    if (e.ambush) drawAmbushMark(ctx, x + ts * 0.2, y + ts * 0.2, ts);
  }

  // Unità alleate
  for (const u of G.units) {
    if (!u.alive) continue;
    //const { x, y } = tileToScreen(u.col, u.row);
    const { x, y } = tileToScreen(u.vx ?? u.col, u.vy ?? u.row);
    const isSelected = G.selectedUnit && G.selectedUnit.id === u.id;
    const isDone = u.ap <= 0;

    // Ombra + sfondo
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.fillRect(x + ts * 0.11 + 2, y + ts * 0.11 + 2, ts * 0.78, ts * 0.78);
    ctx.fillStyle = isDone ? "rgba(55,68,38,0.72)" : "rgba(38,58,20,0.72)";
    ctx.fillRect(x + ts * 0.11, y + ts * 0.11, ts * 0.78, ts * 0.78);

    // Soldato visto dall'alto nella sua postura, rivolto dove guarda
    drawUnitSprite(ctx, x, y, ts, u.cls, isDone, false, u.stance, u.facing, 0, unitAnimPose(u));
    drawFacingMarker(ctx, x, y, ts, u.facing, isSelected ? "#f0c030" : "#e8e0b0");

    // Occultamento: 🌿 nascosto ai VC, 👁 posizione svelata (sparo/avvistamento)
    if (u.stance && u.stance !== "stand" && isConcealingTile(u.col, u.row)) {
      ctx.font = `${Math.max(8, Math.round(ts * 0.22))}px serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(u.exposed ? "👁" : "🌿", x + 3, y + 3);
    }

    // Bordo selezione
    if (isSelected) {
      ctx.strokeStyle = "#f0c030";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x + ts * 0.08, y + ts * 0.08, ts * 0.84, ts * 0.84);
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + ts * 0.11, y + ts * 0.11, ts * 0.78, ts * 0.78);
    }

    // Pilota a bordo
    if (u.carriesPilot) {
      ctx.fillStyle = "#ffcc00";
      ctx.font = `${Math.max(6, ts * 0.2)}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("✈", x + ts * 0.5, y + 2);
    }

    // Overwatch
    if (u.overwatch) {
      ctx.strokeStyle = "#aaddff";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(x + 2, y + 2, ts - 4, ts - 4);
      ctx.setLineDash([]);
    }

    // Fuoco Soppressivo
    if (u.suppression) {
      ctx.strokeStyle = "#ffaa33";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(x + 2, y + 2, ts - 4, ts - 4);
      ctx.setLineDash([]);
    }

    // Morale scosso — bordo rosso pulsante
    if (u.shaken) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 280);
      ctx.strokeStyle = `rgba(255,80,40,${0.6 + 0.4 * pulse})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, ts - 4, ts - 4);
    }

    // Emorragia: goccia di sangue pulsante nell'angolo in alto a destra
    if (u.bleeding) drawBleedDrop(ctx, x + ts - ts * 0.17, y + ts * 0.17, ts);

    // HP bar
    const hpRatio = u.hp / u.maxHp;
    ctx.fillStyle = "#111";
    ctx.fillRect(x + 2, y + ts - 5, ts - 4, 3);
    ctx.fillStyle = hpRatio > 0.5 ? "#44aa22" : "#cc4422";
    ctx.fillRect(x + 2, y + ts - 5, (ts - 4) * hpRatio, 3);
  }

  // Tutorial: tile indicato dall'istruttore (tutorial.js)
  drawTutorialMarker(ctx, ts);

  // Pioggia sopra a tutto (animations.js:renderRain)
  renderRain(ctx, ts);
}

// Ingresso di tunnel: botola scura con bordo di legno; sigillato: macerie e X
function drawTunnelEntrance(ctx, tn, ts) {
  const { x, y } = tileToScreen(tn.col, tn.row);
  const cx = x + ts * 0.5,
    cy = y + ts * 0.55;
  const rx = ts * 0.24,
    ry = ts * 0.15;
  ctx.save();
  // Bordo di legno
  ctx.fillStyle = tn.sealed ? "#5a5246" : "#6b4a26";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 1.3, ry * 1.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Buco
  ctx.fillStyle = tn.sealed ? "#7a7264" : "#0c0905";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = tn.sealed ? "rgba(255,255,255,0.7)" : "rgba(255,170,80,0.85)";
  ctx.lineWidth = Math.max(1.5, ts * 0.03);
  if (tn.sealed) {
    // Macerie: X sopra l'ingresso
    ctx.beginPath();
    ctx.moveTo(cx - rx, cy - ry);
    ctx.lineTo(cx + rx, cy + ry);
    ctx.moveTo(cx + rx, cy - ry);
    ctx.lineTo(cx - rx, cy + ry);
    ctx.stroke();
  } else {
    // Contorno tratteggiato come le trappole individuate
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x + 3, y + 3, ts - 6, ts - 6);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

// Mirino dell'agguato VC centrato in (cx, cy)
function drawAmbushMark(ctx, cx, cy, ts) {
  const r = ts * 0.1;
  ctx.save();
  ctx.lineWidth = Math.max(1.5, ts * 0.03);
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffa040";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.moveTo(cx - r * 1.4, cy);
  ctx.lineTo(cx + r * 1.4, cy);
  ctx.moveTo(cx, cy - r * 1.4);
  ctx.lineTo(cx, cy + r * 1.4);
  ctx.stroke();
  ctx.restore();
}

// Goccia di sangue (indicatore di emorragia) centrata in (cx, cy)
function drawBleedDrop(ctx, cx, cy, ts) {
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
  const r = ts * (0.075 + 0.012 * pulse);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 1.9);
  ctx.bezierCurveTo(cx + r * 0.35, cy - r * 1.1, cx + r, cy - r * 0.4, cx + r, cy + r * 0.15);
  ctx.arc(cx, cy + r * 0.15, r, 0, Math.PI);
  ctx.bezierCurveTo(cx - r, cy - r * 0.4, cx - r * 0.35, cy - r * 1.1, cx, cy - r * 1.9);
  ctx.closePath();
  ctx.fillStyle = `rgba(200,16,16,${0.8 + 0.2 * pulse})`;
  ctx.fill();
  ctx.lineWidth = Math.max(1, ts * 0.018);
  ctx.strokeStyle = "rgba(40,0,0,0.9)";
  ctx.stroke();
  // Riflesso
  ctx.fillStyle = "rgba(255,190,190,0.7)";
  ctx.beginPath();
  ctx.arc(cx - r * 0.35, cy - r * 0.05, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── RAGGIO DI MIRA (solo desktop con mouse) ────────────────────────────
// In modalità attacco a bersaglio singolo un raggio va dall'unità al tile
// sotto il mouse; il colore dice se la linea di tiro è libera e, se no,
// perché (vedi mechanics.js:fireLineStatus). Una X segna cosa la blocca.
const AIM_RAY_RGB = {
  clear: "90,230,110",
  ally: "255,70,60",
  los: "255,160,40",
  vision: "170,170,170",
  range: "170,170,170",
};

function aimRayEnabled() {
  return (
    !isMobile() && window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

function drawAimRay(ctx, ts, u, hov, weapon) {
  if (!hov || !aimRayEnabled()) return;
  const md = G.mapData;
  if (hov.col < 0 || hov.row < 0 || hov.col >= md.cols || hov.row >= md.rows) return;
  if (hov.col === u.col && hov.row === u.row) return;

  const res = fireLineStatus(u, hov, weapon);
  const rgb = AIM_RAY_RGB[res.status];
  const { x: ux, y: uy } = tileToScreen(u.col, u.row);
  const { x: hx, y: hy } = tileToScreen(hov.col, hov.row);
  const sx = ux + ts / 2,
    sy = uy + ts / 2,
    ex = hx + ts / 2,
    ey = hy + ts / 2;

  ctx.save();
  ctx.lineCap = "round";
  // Alone + linea piena
  ctx.strokeStyle = `rgba(${rgb},0.25)`;
  ctx.lineWidth = Math.max(4, ts * 0.11);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.strokeStyle = `rgba(${rgb},0.95)`;
  ctx.lineWidth = Math.max(1.5, ts * 0.035);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  // Punto d'arrivo
  ctx.fillStyle = `rgba(${rgb},0.95)`;
  ctx.beginPath();
  ctx.arc(ex, ey, Math.max(2.5, ts * 0.06), 0, Math.PI * 2);
  ctx.fill();

  // X sul tile che blocca (compagno, muro, fumo)
  if (res.block) {
    const { x: bx, y: by } = tileToScreen(res.block.col, res.block.row);
    const cx = bx + ts / 2,
      cy = by + ts / 2,
      r = ts * 0.2;
    ctx.lineWidth = Math.max(2.5, ts * 0.06);
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    for (const pass of [0, 1]) {
      if (pass) {
        ctx.lineWidth = Math.max(1.5, ts * 0.035);
        ctx.strokeStyle = `rgba(${rgb},1)`;
      }
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r);
      ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r);
      ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
    }
  }

  // Motivo del blocco sotto il tile puntato
  if (res.status !== "clear") {
    const label = t(`aim.${res.status}`, { name: res.ally?.name ?? "" });
    ctx.font = `bold ${Math.max(10, Math.round(ts * 0.2))}px 'Oswald'`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.strokeText(label, ex, hy + ts + 2);
    ctx.fillText(label, ex, hy + ts + 2);
  }
  ctx.restore();
}

// Postura disegnata della pedina: quella dei soldati; i VC non ne hanno una,
// in agguato sono accovacciati e i tiratori scelti sdraiati
function pieceStance(u) {
  if (u.stance) return u.stance;
  if (u.ambush) return "crouch";
  return ENEMY_CLASSES[u.cls] && enemyRole(u) === "sniper" ? "prone" : "stand";
}

// Freccia sul bordo del tile nella direzione in cui guarda l'unità
function drawFacingMarker(ctx, x, y, ts, facing, color) {
  if (facing == null) return;
  const [fx, fy] = FACING_DIRS[facing];
  const cx = x + ts / 2 + fx * ts * 0.43,
    cy = y + ts / 2 + fy * ts * 0.43;
  const s = ts * 0.1;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.atan2(fy, fx));
  ctx.beginPath();
  ctx.moveTo(s, 0);
  ctx.lineTo(-s * 0.7, -s);
  ctx.lineTo(-s * 0.7, s);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.lineWidth = Math.max(1, ts * 0.02);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function renderMissionMarkers(ctx, ts) {
  const type = G.missionType;
  const st = G.missionState;
  if (!type || !st) return;

  if (type === "recon") {
    for (const pt of st.points || []) {
      if (pt.scouted) continue;
      const { x, y } = tileToScreen(pt.col, pt.row);
      ctx.strokeStyle = "#88aaff";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x + 3, y + 3, ts - 6, ts - 6);
      ctx.setLineDash([]);
      ctx.fillStyle = "#88aaff";
      ctx.font = `${Math.max(8, ts * 0.22)}px 'Share Tech Mono'`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("REC", x + ts * 0.5, y + 4);
    }
  }
  if (type === "rescue_pilot") {
    if (!st.pilotFound && isTileVisible(st.pilotCol, st.pilotRow)) {
      const { x, y } = tileToScreen(st.pilotCol, st.pilotRow);
      ctx.fillStyle = "rgba(255,165,0,0.6)";
      ctx.fillRect(x, y, ts, ts);
      ctx.fillStyle = "#fff";
      ctx.font = `${ts * 0.4}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("✈", x + ts * 0.5, y + ts * 0.5);
    }
    const { x: ex, y: ey } = tileToScreen(st.extractCol, st.extractRow);
    ctx.strokeStyle = "#44ff88";
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(ex + 2, ey + 2, ts - 4, ts - 4);
    ctx.setLineDash([]);
    ctx.fillStyle = "#44ff88";
    ctx.font = `${Math.max(7, ts * 0.18)}px 'Share Tech Mono'`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("EXTR", ex + ts * 0.5, ey + ts - 3);
  }
  if (type === "capture_objective") {
    for (const obj of st.objectives || []) {
      const { x, y } = tileToScreen(obj.col, obj.row);
      ctx.fillStyle = obj.controlled
        ? "rgba(68,170,68,0.5)"
        : "rgba(200,160,0,0.45)";
      ctx.fillRect(x, y, ts, ts);
      ctx.strokeStyle = obj.controlled ? "#44ff88" : "#f0c030";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, ts - 4, ts - 4);
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.max(7, ts * 0.2)}px 'Oswald'`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `${obj.heldTurns || 0}/${obj.holdTurns || 2}`,
        x + ts * 0.5,
        y + ts * 0.5,
      );
    }
  }
}

// Etichetta di probabilità sopra un tile (bordo nero per leggerla su ogni terreno)
function drawOddsLabel(ctx, ts, x, y, label, color) {
  ctx.save();
  ctx.font = `bold ${Math.max(9, Math.round(ts * 0.22))}px 'Oswald'`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.fillStyle = color;
  ctx.strokeText(label, x + ts / 2, y - 1);
  ctx.fillText(label, x + ts / 2, y - 1);
  ctx.restore();
}

// Mirino sul tile di un nemico colpibile
function drawCrosshair(ctx, ts, e) {
  const { x, y } = tileToScreen(e.col, e.row);
  const cx = x + ts / 2,
    cy = y + ts / 2;
  const ro = ts * 0.3,
    ri = ts * 0.09,
    gap = ts * 0.05;
  ctx.strokeStyle = "rgba(255,60,60,0.95)";
  ctx.lineWidth = Math.max(1.5, ts * 0.045);
  ctx.beginPath();
  ctx.arc(cx, cy, ro, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, ri, 0, Math.PI * 2);
  ctx.stroke();
  const i2 = ri + gap,
    o2 = ro - gap;
  ctx.beginPath();
  ctx.moveTo(cx, cy - o2);
  ctx.lineTo(cx, cy - i2);
  ctx.moveTo(cx, cy + i2);
  ctx.lineTo(cx, cy + o2);
  ctx.moveTo(cx - o2, cy);
  ctx.lineTo(cx - i2, cy);
  ctx.moveTo(cx + i2, cy);
  ctx.lineTo(cx + o2, cy);
  ctx.stroke();
}

// Click contestuale (actions.js:quickActions): area raggiungibile (velo chiaro
// e contorno azzurro, leggibili anche sulle mappe verdi) e VC in tiro con la
// probabilità di colpire; sotto il mouse il percorso col costo in AP, oppure
// il raggio di mira sul VC
const QUICK_RGB = "150,225,255";
// Campo visivo del soldato selezionato e linee di avvistamento (lilla, per
// non confondersi con l'area di movimento azzurra)
const VISION_RGB = "205,165,255";
const SPOT_FIRE_RGB = "255,215,90";
// Opacità del velo sui tile visti solo dai compagni del selezionato
// (renderMap; la nebbia di guerra è 0.72)
const SQUAD_ONLY_VEIL = 0.42;

// Mouse su un VC visibile: linee dai soldati che lo vedono; su un soldato:
// linee verso i VC che vede. Piene se il VC è anche a tiro, tratteggiate se
// è solo visto (actions.js:spotStatus)
function drawSpotLines(ctx, ts) {
  const hov = G.hoveredTile;
  if (!hov || G.actionMode !== null || G.phase !== "player") return;
  const at = (o) => o.alive && o.col === hov.col && o.row === hov.row;
  const enemy = G.enemies.find((e) => at(e) && isEnemyVisible(e));
  const unit = !enemy && G.units.find(at);
  if (!enemy && !unit) return;
  const pairs = enemy
    ? G.units.map((u) => [u, enemy])
    : G.enemies.filter((e) => e.alive && isEnemyVisible(e)).map((e) => [unit, e]);

  ctx.save();
  ctx.lineCap = "round";
  for (const [u, e] of pairs) {
    const st = spotStatus(u, e);
    if (!st) continue;
    const { x: ux, y: uy } = tileToScreen(u.col, u.row);
    const { x: ex, y: ey } = tileToScreen(e.col, e.row);
    const sx = ux + ts / 2,
      sy = uy + ts / 2,
      tx = ex + ts / 2,
      ty = ey + ts / 2;
    const rgb = st === "fire" ? SPOT_FIRE_RGB : VISION_RGB;
    ctx.setLineDash(st === "fire" ? [] : [ts * 0.12, ts * 0.1]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = Math.max(3.5, ts * 0.08);
    ctx.stroke();
    ctx.strokeStyle = `rgba(${rgb},0.95)`;
    ctx.lineWidth = Math.max(1.5, ts * 0.035);
    ctx.stroke();
    // Occhio sul soldato che vede
    ctx.setLineDash([]);
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(3, ts * 0.07), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawQuickActions(ctx, ts, qa) {
  const u = G.selectedUnit;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  for (const r of qa.reach) {
    const { x, y } = tileToScreen(r.col, r.row);
    ctx.fillRect(x, y, ts, ts);
  }
  // Contorno dell'area (il tile del soldato ne fa parte): lati dei tile
  // raggiungibili che non confinano con un altro tile dell'area
  const inArea = new Set(qa.reach.map((r) => `${r.col},${r.row}`));
  inArea.add(`${u.col},${u.row}`);
  ctx.beginPath();
  for (const k of inArea) {
    const [c, r] = k.split(",").map(Number);
    const { x, y } = tileToScreen(c, r);
    if (!inArea.has(`${c},${r - 1}`)) { ctx.moveTo(x, y); ctx.lineTo(x + ts, y); }
    if (!inArea.has(`${c},${r + 1}`)) { ctx.moveTo(x, y + ts); ctx.lineTo(x + ts, y + ts); }
    if (!inArea.has(`${c - 1},${r}`)) { ctx.moveTo(x, y); ctx.lineTo(x, y + ts); }
    if (!inArea.has(`${c + 1},${r}`)) { ctx.moveTo(x + ts, y); ctx.lineTo(x + ts, y + ts); }
  }
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = Math.max(3, ts * 0.07);
  ctx.stroke();
  ctx.strokeStyle = `rgba(${QUICK_RGB},0.95)`;
  ctx.lineWidth = Math.max(1.5, ts * 0.03);
  ctx.stroke();
  for (const e of qa.targets) {
    const { x, y } = tileToScreen(e.col, e.row);
    ctx.strokeStyle = "rgba(255,80,80,0.75)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, ts - 4, ts - 4);
    drawCrosshair(ctx, ts, e);
    const pHit = qa.odds.get(e);
    drawOddsLabel(ctx, ts, x, y, `${Math.round(pHit * 100)}%`, oddsColor(pHit));
  }

  const hov = G.hoveredTile;
  const dest = hov && qa.reach.find((r) => r.col === hov.col && r.row === hov.row);
  if (dest) {
    const tiles = quickPath(qa, dest.col, dest.row);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    tiles.forEach((p, i) => {
      const { x, y } = tileToScreen(p.col, p.row);
      if (i) ctx.lineTo(x + ts / 2, y + ts / 2);
      else ctx.moveTo(x + ts / 2, y + ts / 2);
    });
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = Math.max(4, ts * 0.1);
    ctx.stroke();
    ctx.strokeStyle = `rgba(${QUICK_RGB},0.95)`;
    ctx.lineWidth = Math.max(2, ts * 0.05);
    ctx.stroke();
    const { x, y } = tileToScreen(dest.col, dest.row);
    ctx.fillStyle = `rgba(${QUICK_RGB},0.3)`;
    ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
    ctx.strokeStyle = `rgba(${QUICK_RGB},0.95)`;
    ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
    drawOddsLabel(ctx, ts, x, y, t("aim.move_cost", { ap: dest.cost }), `rgb(${QUICK_RGB})`);
  } else if (hov && qa.targets.some((e) => e.col === hov.col && e.row === hov.row)) {
    drawAimRay(ctx, ts, u, hov, qa.weapon);
  }
  ctx.restore();
}

function renderOverlay() {
  const ctx = G.oCtx;
  const ts = TILE * G.scale;
  ctx.clearRect(0, 0, G.oCanvas.width, G.oCanvas.height);

  // Celle raggiungibili (movimento)
  if (G.actionMode === "move") {
    ctx.fillStyle = "rgba(74,180,74,0.3)";
    ctx.strokeStyle = "rgba(74,200,74,0.7)";
    ctx.lineWidth = 1.5;
    for (const r of G.reachable) {
      const { x, y } = tileToScreen(r.col, r.row);
      ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
      ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
    }
  }

  // Celle attaccabili
  if (G.actionMode === "attack") {
    const isAoe = isAreaWeapon(G.currentWeapon);
    if (isAoe) {
      // Napalm, dopo il primo click: tile d'inizio marcato e linea in
      // anteprima fino al tile sotto il mouse (se è una fine valida)
      if (napalmPickingEnd()) {
        const hover = napalmHoverLine();
        if (hover) drawNapalmLine(ctx, ts, hover, false);
        const { x, y } = tileToScreen(G.pendingAoe.col, G.pendingAoe.row);
        ctx.strokeStyle = "rgba(255,220,0,0.95)";
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 2, y + 2, ts - 4, ts - 4);
      }
      // AoE weapon: colora l'area di tiro in arancione
      ctx.fillStyle = "rgba(255,140,0,0.18)";
      ctx.strokeStyle = "rgba(255,180,0,0.5)";
      ctx.lineWidth = 1;
      for (const t of G.attackable) {
        const { x, y } = tileToScreen(t.col, t.row);
        ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
        ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
      }
      // Evidenzia le tile che hanno nemici nel range di tiro
      ctx.fillStyle = "rgba(255,100,0,0.3)";
      for (const t of G.attackable) {
        if (
          G.enemies.some(
            (e) =>
              e.alive &&
              e.col === t.col &&
              e.row === t.row &&
              isEnemyVisible(e),
          )
        ) {
          const { x, y } = tileToScreen(t.col, t.row);
          ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
        }
      }
    } else {
      ctx.fillStyle = "rgba(200,40,40,0.35)";
      ctx.strokeStyle = "rgba(255,80,80,0.8)";
      ctx.lineWidth = 2;
      for (const e of G.attackable) {
        const { x, y } = tileToScreen(e.col, e.row);
        ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
        ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
      }

      // Mirino su ogni nemico attaccabile
      ctx.save();
      for (const e of G.attackable) drawCrosshair(ctx, ts, e);
      // Probabilità di colpire sopra ogni bersaglio (visibile anche su mobile,
      // senza hover), colorata per fascia (combat.js:oddsColor)
      if (G.selectedUnit) {
        for (const e of G.attackable) {
          const { x, y } = tileToScreen(e.col, e.row);
          const { pHit } = attackOdds(G.selectedUnit, e, G.currentWeapon);
          drawOddsLabel(ctx, ts, x, y, `${Math.round(pHit * 100)}%`, oddsColor(pHit));
        }
      }
      // Mobile: bersaglio puntato col primo tap (il secondo spara)
      const aim = G.aimTarget;
      if (aim && G.attackable.includes(aim)) {
        const { x, y } = tileToScreen(aim.col, aim.row);
        ctx.strokeStyle = "#ffe080";
        ctx.lineWidth = Math.max(2, ts * 0.06);
        ctx.strokeRect(x + 2, y + 2, ts - 4, ts - 4);
      }
      ctx.restore();

      // Linea di fuoco dall'unità selezionata
      if (G.selectedUnit) {
        const { x: sx, y: sy } = tileToScreen(
          G.selectedUnit.col,
          G.selectedUnit.row,
        );
        ctx.strokeStyle = "rgba(255,200,50,0.5)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        for (const e of G.attackable) {
          const { x: ex, y: ey } = tileToScreen(e.col, e.row);
          ctx.beginPath();
          ctx.moveTo(sx + ts / 2, sy + ts / 2);
          ctx.lineTo(ex + ts / 2, ey + ts / 2);
          ctx.stroke();
        }
        ctx.setLineDash([]);

        // Raggio del rumore: i VC entro questo contorno sentiranno lo sparo
        strokeNoiseOutline(
          ctx,
          sx,
          sy,
          ts,
          weaponNoise(G.selectedUnit, G.currentWeapon ?? unitFireWeapon(G.selectedUnit)),
        );

        drawAimRay(ctx, ts, G.selectedUnit, G.hoveredTile, G.currentWeapon);
      }
    }
  }

  // Anteprima AoE in attesa di conferma
  if (G.actionMode === "aoe_confirm" && G.pendingAoe) {
    const { col: tc, row: tr, weapon: w, line } = G.pendingAoe;
    if (w.napalm) {
      // Napalm: la linea scelta con la direzione di volo
      drawNapalmLine(ctx, ts, line, true);
    } else {
      // Raggio AoE attorno al tile bersaglio (artiglieria: tutta l'area della salva)
      const spread = w.artillery ? artilleryScatter(w) : 0;
      ctx.fillStyle = "rgba(255,90,0,0.28)";
      ctx.strokeStyle = "rgba(255,160,0,0.75)";
      ctx.lineWidth = 1.5;
      for (let c = 0; c < G.mapData.cols; c++) {
        for (let r = 0; r < G.mapData.rows; r++) {
          if (salvoDist(c, r, tc, tr, spread) <= w.aoe) {
            const { x, y } = tileToScreen(c, r);
            ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
            ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
          }
        }
      }
      // Tile bersaglio: bordo più marcato
      const { x: bx, y: by } = tileToScreen(tc, tr);
      // Granate: quadrato tratteggiato in cui il lancio può deviare (combat.js:throwLanding);
      // artiglieria: quadrato in cui cadono i colpi della salva (mechanics.js)
      if (spread || w.scatter) {
        const s = spread || w.scatter;
        ctx.save();
        ctx.setLineDash([ts * 0.12, ts * 0.08]);
        ctx.strokeStyle = "rgba(255,235,160,0.85)";
        ctx.lineWidth = 2;
        ctx.strokeRect(bx - s * ts + 1, by - s * ts + 1, (2 * s + 1) * ts - 2, (2 * s + 1) * ts - 2);
        ctx.restore();
      }
      // Raggio del rumore dell'esplosione, dal punto d'impatto
      if (G.selectedUnit)
        strokeNoiseOutline(ctx, bx, by, ts, weaponNoise(G.selectedUnit, w));
      ctx.strokeStyle = "rgba(255,220,0,0.95)";
      ctx.lineWidth = 3;
      ctx.strokeRect(bx + 2, by + 2, ts - 4, ts - 4);
      // Icona esplosione al centro
      ctx.font = `${Math.round(ts * 0.45)}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("💥", bx + ts / 2, by + ts / 2);
    }
    // Probabilità di colpire per ogni bersaglio nel raggio; i soldati della
    // squadra (fuoco amico) in rosso con bordo
    for (const o of aoeOdds(w, tc, tr, line)) {
      const { x, y } = tileToScreen(o.target.col, o.target.row);
      if (o.isUS) {
        ctx.strokeStyle = "rgba(255,70,60,0.95)";
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 3, y + 3, ts - 6, ts - 6);
      }
      const label = `${o.isUS ? "⚠ " : ""}${Math.round(o.pHit * 100)}%`;
      drawOddsLabel(ctx, ts, x, y, label, o.isUS ? "#ff7a6a" : oddsColor(o.pHit));
    }
  }

  // Speciale: celle target
  if (G.actionMode === "special") {
    ctx.fillStyle = "rgba(50,150,220,0.35)";
    ctx.strokeStyle = "rgba(100,180,255,0.8)";
    ctx.lineWidth = 1.5;
    for (const r of G.reachable) {
      const { x, y } = tileToScreen(r.col || r.col, r.row || r.row);
      ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
      ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
    }
  }

  // Rotazione: frecce sui 4 tile adiacenti, quella attuale evidenziata;
  // area visiva in anteprima per la freccia sotto il mouse (o quella attuale)
  if (G.actionMode === "rotate" && G.selectedUnit) {
    const u = G.selectedUnit;
    const hov = G.hoveredTile;
    const previewFacing =
      hov && G.reachable.some((r) => r.col === hov.col && r.row === hov.row)
        ? facingToward(u, hov)
        : u.facing;
    const { x: ux, y: uy } = tileToScreen(u.col, u.row);
    ctx.strokeStyle = `rgba(${VISION_RGB},0.8)`;
    ctx.lineWidth = 2;
    strokeVisionOutline(ctx, u, ux, uy, ts, previewFacing);
    ctx.lineWidth = 1.5;
    for (const r of G.reachable) {
      const { x, y } = tileToScreen(r.col, r.row);
      const f = facingToward(u, r);
      const current = f === u.facing;
      ctx.fillStyle = current ? "rgba(240,192,48,0.35)" : "rgba(240,192,48,0.15)";
      ctx.strokeStyle = "rgba(240,192,48,0.8)";
      ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
      ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
      // Freccia al centro del tile, puntata verso l'esterno
      const [fx, fy] = FACING_DIRS[f];
      ctx.save();
      ctx.translate(x + ts / 2, y + ts / 2);
      ctx.rotate(Math.atan2(fy, fx));
      const s = ts * 0.2;
      ctx.beginPath();
      ctx.moveTo(s, 0);
      ctx.lineTo(-s * 0.6, -s * 0.8);
      ctx.lineTo(-s * 0.6, s * 0.8);
      ctx.closePath();
      ctx.fillStyle = current ? "#f0c030" : "rgba(240,224,176,0.85)";
      ctx.fill();
      ctx.restore();
    }
  }

  // Click contestuale: dove può andare o sparare il soldato selezionato
  const qa = quickActions();
  // Sotto: il raggio di mira del click contestuale resta in vista
  drawSpotLines(ctx, ts);
  if (qa) drawQuickActions(ctx, ts, qa);

  // Selezione unità corrente
  if (G.selectedUnit && G.selectedUnit.alive && G.actionMode === null) {
    const u = G.selectedUnit;
    const { x, y } = tileToScreen(u.vx ?? u.col, u.vy ?? u.row);
    ctx.strokeStyle = "#f0c030";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
    ctx.setLineDash([]);

    // Area visiva: tratteggiato il cono teorico (fronte pieno, lati -1,
    // 2 tile dietro), pieno il campo reale tolti terreno e fumo
    ctx.save();
    ctx.strokeStyle = `rgba(${VISION_RGB},0.4)`;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    strokeVisionOutline(ctx, u, x, y, ts);
    ctx.restore();
    const seen = unitVisibleTiles(u);
    const seenShape = (dc, dr) => seen.has(`${u.col + dc},${u.row + dr}`);
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = Math.max(3, ts * 0.06);
    strokeShapeOutline(ctx, x, y, ts, unitVision(u), seenShape);
    ctx.strokeStyle = `rgba(${VISION_RGB},0.95)`;
    ctx.lineWidth = Math.max(1.5, ts * 0.028);
    strokeShapeOutline(ctx, x, y, ts, unitVision(u), seenShape);
    ctx.restore();

    // Contorno raggio attacco: gittata dell'arma (come in combattimento)
    ctx.strokeStyle = "rgba(240,192,48,0.28)";
    ctx.lineWidth = 1;
    strokeRangeOutline(ctx, x, y, ts, unitFireRange(u));
  }

  // Zone soppressione (assalti in fuoco soppressivo): fronte e lati
  for (const sup of G.suppressList) {
    if (!sup.alive) continue;
    const { x: sx, y: sy } = tileToScreen(sup.col, sup.row);
    ctx.strokeStyle = "rgba(255,165,50,0.55)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    strokeShapeOutline(ctx, sx, sy, ts, unitFireRange(sup), (dc, dr) =>
      suppressionCovers(sup, { col: sup.col + dc, row: sup.row + dr }),
    );
    ctx.setLineDash([]);
  }

  // Overwatch: cono frontale entro la gittata
  for (const ow of G.overwatchList) {
    if (!ow.alive || ow.overwatchFired) continue;
    const { x: ox, y: oy } = tileToScreen(ow.col, ow.row);
    ctx.strokeStyle = "rgba(170,221,255,0.6)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    strokeShapeOutline(ctx, ox, oy, ts, unitFireRange(ow), (dc, dr) =>
      facingSector(ow, { col: ow.col + dc, row: ow.row + dr }) === "front",
    );
    ctx.setLineDash([]);
  }

  // Artiglieria richiesta: area della salva in arrivo, più scura dove cadono
  // i colpi (quadrato di dispersione), più chiara dove arrivano le schegge
  for (const s of G.missionState?.artillery || []) {
    const spread = s.scatter ?? ARTILLERY.scatter;
    ctx.strokeStyle = "rgba(255,60,40,0.85)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    for (let c = 0; c < G.mapData.cols; c++) {
      for (let r = 0; r < G.mapData.rows; r++) {
        const d = salvoDist(c, r, s.col, s.row, spread);
        if (d > s.aoe) continue;
        const { x, y } = tileToScreen(c, r);
        ctx.fillStyle = d ? "rgba(255,60,40,0.07)" : "rgba(255,60,40,0.14)";
        ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
      }
    }
    const { x: ax, y: ay } = tileToScreen(s.col, s.row);
    ctx.strokeRect(ax - spread * ts + 1, ay - spread * ts + 1, (2 * spread + 1) * ts - 2, (2 * spread + 1) * ts - 2);
    ctx.setLineDash([]);
    ctx.font = `${Math.round(ts * 0.42)}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🎯", ax + ts / 2, ay + ts / 2);
  }

  // Napalm richiesto: linea e direzione dell'attacco aereo in arrivo
  for (const s of G.missionState?.napalm || []) drawNapalmLine(ctx, ts, s.line, false, true);

  // Effetti grafici
  renderEffects(ctx, ts);
}

// Linea del napalm: tile colorati e freccia dal primo all'ultimo (direzione
// di volo). strong: anteprima da confermare; pending: attacco già richiesto
function drawNapalmLine(ctx, ts, line, strong, pending = false) {
  if (!line?.length) return;
  ctx.save();
  ctx.fillStyle = pending ? "rgba(255,110,20,0.14)" : strong ? "rgba(255,110,0,0.32)" : "rgba(255,110,0,0.2)";
  ctx.strokeStyle = pending ? "rgba(255,90,30,0.85)" : "rgba(255,170,0,0.8)";
  ctx.lineWidth = 1.5;
  if (pending) ctx.setLineDash([5, 4]);
  for (const t of line) {
    const { x, y } = tileToScreen(t.col, t.row);
    ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
    ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
  }
  ctx.setLineDash([]);
  const a = tileToScreen(line[0].col, line[0].row);
  const b = tileToScreen(line[line.length - 1].col, line[line.length - 1].row);
  const ax = a.x + ts / 2,
    ay = a.y + ts / 2,
    bx = b.x + ts / 2,
    by = b.y + ts / 2;
  const ang = Math.atan2(by - ay, bx - ax);
  const head = ts * 0.28;
  ctx.strokeStyle = "rgba(255,235,170,0.9)";
  ctx.fillStyle = "rgba(255,235,170,0.9)";
  ctx.lineWidth = Math.max(2, ts * 0.05);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(ax - Math.cos(ang) * ts * 0.35, ay - Math.sin(ang) * ts * 0.35);
  ctx.lineTo(bx + Math.cos(ang) * ts * 0.1, by + Math.sin(ang) * ts * 0.1);
  ctx.stroke();
  const tx = bx + Math.cos(ang) * ts * 0.38,
    ty = by + Math.sin(ang) * ts * 0.38;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - Math.cos(ang - 0.5) * head, ty - Math.sin(ang - 0.5) * head);
  ctx.lineTo(tx - Math.cos(ang + 0.5) * head, ty - Math.sin(ang + 0.5) * head);
  ctx.closePath();
  ctx.fill();
  if (pending || strong) {
    ctx.font = `${Math.round(ts * 0.38)}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🔥", ax, ay);
  }
  ctx.restore();
}

// Distanza Manhattan del tile (c, r) dal quadrato di lato 2s+1 centrato su
// (tc, tr): 0 dentro il quadrato (s = 0: dist() dal centro)
function salvoDist(c, r, tc, tr, s) {
  return Math.max(0, Math.abs(c - tc) - s) + Math.max(0, Math.abs(r - tr) - s);
}

// Traccia il bordo esterno dei tile entro `range` (distanza Manhattan, coerente con dist())
// attorno al tile con angolo schermo (x, y). Stile/dash vanno impostati dal chiamante.
function strokeRangeOutline(ctx, x, y, ts, range) {
  strokeShapeOutline(ctx, x, y, ts, range, () => true);
}

// Come sopra, limitato ai tile (offset dc, dr dall'unità) per cui `inShape` è vero
function strokeShapeOutline(ctx, x, y, ts, range, inShape) {
  const inRange = (dc, dr) =>
    Math.abs(dc) + Math.abs(dr) <= range && inShape(dc, dr);
  ctx.beginPath();
  for (let dc = -range; dc <= range; dc++) {
    for (let dr = -range; dr <= range; dr++) {
      if (!inRange(dc, dr)) continue;
      const tx = x + dc * ts,
        ty = y + dr * ts;
      if (!inRange(dc, dr - 1)) {
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + ts, ty);
      }
      if (!inRange(dc, dr + 1)) {
        ctx.moveTo(tx, ty + ts);
        ctx.lineTo(tx + ts, ty + ts);
      }
      if (!inRange(dc - 1, dr)) {
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx, ty + ts);
      }
      if (!inRange(dc + 1, dr)) {
        ctx.moveTo(tx + ts, ty);
        ctx.lineTo(tx + ts, ty + ts);
      }
    }
  }
  ctx.stroke();
}

// Contorno grigio tratteggiato del raggio di rumore attorno a un tile
function strokeNoiseOutline(ctx, x, y, ts, radius) {
  ctx.save();
  ctx.strokeStyle = "rgba(220,215,195,0.5)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([2, 4]);
  strokeRangeOutline(ctx, x, y, ts, radius);
  ctx.restore();
}

// Contorno dell'area visiva a cono di un'unità (forma geometrica, senza LOS),
// eventualmente per un orientamento diverso da quello attuale
function strokeVisionOutline(ctx, u, x, y, ts, facing = u.facing) {
  const at = (dc, dr) => ({ col: u.col + dc, row: u.row + dr });
  strokeShapeOutline(ctx, x, y, ts, unitVision(u), (dc, dr) =>
    Math.abs(dc) + Math.abs(dr) <= unitVisionToward(u, at(dc, dr), facing),
  );
}

function renderUnitsOnMap() {
  render();
}
