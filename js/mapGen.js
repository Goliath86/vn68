// ── MAPPE PROCEDURALI ──────────────────────────────────────────────────
// Generano al volo un mapData con lo stesso schema dei JSON in missions/,
// senza alcun file di supporto. saveGame() salva l'intero G.mapData, quindi
// la mappa generata sopravvive a salvataggi/caricamenti fino a nuova partita.
// Un generatore si registra in MAP_GENERATORS e si usa da catalog.json con
// una voce "generator": "<nome>" al posto di "file".
// Stesso seed → stessa mappa (PRNG deterministico, tentativi derivati dal seed).

const PROC_COLS = 16;
const PROC_ROWS = 12;

function _mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function newMapSeed() {
  return 10000 + Math.floor(Math.random() * 90000);
}

function generateProceduralMap(name, seed = newMapSeed()) {
  const gen = MAP_GENERATORS[name];
  if (!gen) throw new Error(`unknown map generator: ${name}`);
  return gen(seed);
}

// I tentativi scartati (mappa non valida) sono derivati dal seed,
// quindi lo stesso seed produce sempre la stessa mappa
function _generateWithRetries(build, seed) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const md = build(seed, attempt);
    if (md) return md;
  }
  throw new Error("procedural map generation failed");
}

// Vero se ogni tile percorribile è raggiungibile (4-connesso) da `from`
function _allReachable(grid, tileTypes, from) {
  const H = grid.length;
  const W = grid[0].length;
  const passable = (c, r) =>
    c >= 0 && r >= 0 && c < W && r < H && !tileTypes[grid[r][c]].impassable;
  const seen = grid.map((row) => row.map(() => false));
  const queue = [[from.col, from.row]];
  seen[from.row][from.col] = true;
  while (queue.length) {
    const [c, r] = queue.pop();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (passable(nc, nr) && !seen[nr][nc]) {
        seen[nr][nc] = true;
        queue.push([nc, nr]);
      }
    }
  }
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) if (passable(c, r) && !seen[r][c]) return false;
  }
  return true;
}

// Blocco "translations" { it, en } della mappa a partire dai testi del generatore
function _procTranslations(texts, seed, reconKeys, captureKey) {
  const text = (lang) => {
    const tx = texts[lang];
    return {
      name: tx.name.replace("{seed}", seed),
      description: tx.description,
      tileLabels: { ...tx.tileLabels },
      objectives: {
        recon: reconKeys.map((k) => ({ label: tx[k] })),
        capture_objective: [{ label: tx[captureKey] }],
      },
    };
  };
  return { it: text("it"), en: text("en") };
}

// ── GIUNGLA (delta del Mekong) ─────────────────────────────────────────
const JUNGLE_TILE_TYPES = {
  J: { id: "jungle", label: "Giungla", moveCost: 2, coverBonus: 2, color: "#2d5a1b", losBlock: "partial", burnable: true },
  S: { id: "swamp", label: "Palude", moveCost: 3, coverBonus: 1, color: "#4a6741", losBlock: "partial" },
  R: { id: "river", label: "Fiume", moveCost: 0, coverBonus: 0, color: "#1a4d7a", impassable: true },
  V: { id: "village", label: "Villaggio", moveCost: 1, coverBonus: 1, color: "#8b6914", losBlock: "partial", burnable: true },
  C: { id: "clearing", label: "Radura", moveCost: 1, coverBonus: 0, color: "#7a9e40" },
  T: { id: "trail", label: "Sentiero", moveCost: 1, coverBonus: 0, color: "#a08060" },
  B: { id: "bunker", label: "Bunker VC", moveCost: 1, coverBonus: 3, color: "#5a4a30", demolishable: true, demolishResult: "J", losBlock: "full" },
  X: { id: "obstacle", label: "Ostacolo", moveCost: 0, coverBonus: 0, color: "#333333", impassable: true, demolishable: true, demolishResult: "C", losBlock: "full" },
  F: { id: "ford", label: "Guado", moveCost: 2, coverBonus: 0, color: "#2e7a9e" },
};

// Testi della mappa (equivalente del blocco "translations" di un JSON missione)
const JUNGLE_TEXT = {
  it: {
    name: "Settore {seed}",
    description:
      "Zona del delta mai cartografata: giungla fitta, un fiume da guadare, bunker e villaggi in mano ai VC.",
    tileLabels: {
      jungle: "Giungla",
      swamp: "Palude",
      river: "Fiume",
      village: "Villaggio",
      clearing: "Radura",
      trail: "Sentiero",
      bunker: "Bunker VC",
      obstacle: "Ostacolo",
      ford: "Guado",
    },
    lz: "LZ Bravo",
    village: "Villaggio",
    bunker: "Bunker VC",
    radio: "Postazione Radio",
  },
  en: {
    name: "Sector {seed}",
    description:
      "Uncharted delta zone: thick jungle, a river to ford, bunkers and villages held by the VC.",
    tileLabels: {
      jungle: "Jungle",
      swamp: "Swamp",
      river: "River",
      village: "Village",
      clearing: "Clearing",
      trail: "Trail",
      bunker: "VC Bunker",
      obstacle: "Obstacle",
      ford: "Ford",
    },
    lz: "LZ Bravo",
    village: "Village",
    bunker: "VC Bunker",
    radio: "Radio Post",
  },
};

function generateJungleMap(seed) {
  return _generateWithRetries(_buildJungleMap, seed);
}

function _buildJungleMap(seed, attempt) {
  const rng = _mulberry32(seed * 101 + attempt);
  const W = PROC_COLS;
  const H = PROC_ROWS;
  const ri = (min, max) => min + Math.floor(rng() * (max - min + 1));
  const grid = Array.from({ length: H }, () => Array(W).fill("J"));
  const inB = (c, r) => c >= 0 && r >= 0 && c < W && r < H;
  const get = (c, r) => (inB(c, r) ? grid[r][c] : null);
  const set = (c, r, k) => {
    if (inB(c, r)) grid[r][c] = k;
  };
  const isWater = (c, r) => get(c, r) === "R" || get(c, r) === "F";

  // 1. Base: giungla con radure e paludi da rumore a bassa frequenza
  const noise = () => {
    const S = 4;
    const g = Array.from({ length: Math.ceil(H / S) + 2 }, () =>
      Array.from({ length: Math.ceil(W / S) + 2 }, rng),
    );
    return (c, r) => {
      const x0 = Math.floor(c / S);
      const y0 = Math.floor(r / S);
      let tx = c / S - x0;
      let ty = r / S - y0;
      tx = tx * tx * (3 - 2 * tx);
      ty = ty * ty * (3 - 2 * ty);
      const a = g[y0][x0] + (g[y0][x0 + 1] - g[y0][x0]) * tx;
      const b = g[y0 + 1][x0] + (g[y0 + 1][x0 + 1] - g[y0 + 1][x0]) * tx;
      return a + (b - a) * ty;
    };
  };
  const veg = noise();
  const wet = noise();
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (wet(c, r) > 0.68) set(c, r, "S");
      else if (veg(c, r) + (rng() - 0.5) * 0.2 < 0.35) set(c, r, "C");
    }
  }

  // 2. Fiume da nord a sud nella fascia centrale, 4-connesso, con due guadi
  const river = [];
  let rc = ri(6, 9);
  for (let r = 0; r < H; r++) {
    const prev = rc;
    if (r > 0) {
      const d = rng();
      if (d < 0.3 && rc > 5) rc--;
      else if (d > 0.7 && rc < 10) rc++;
    }
    const lo = Math.min(prev, rc);
    const hi = Math.max(prev, rc);
    for (let c = lo; c <= hi; c++) set(c, r, "R");
    river[r] = [lo, hi];
  }
  const fords = [ri(2, 4), ri(7, 9)].map((r) => {
    for (let c = river[r][0]; c <= river[r][1]; c++) set(c, r, "F");
    return { row: r, west: river[r][0] - 1, east: river[r][1] + 1 };
  });

  // 3. Punti chiave: partenza a ovest, obiettivi oltre il fiume
  const startRow = ri(3, 5);
  const playerStart = [0, 1, 2, 3].map((i) => ({ col: 0, row: startRow + i }));
  const extract = { col: 0, row: startRow + 1 };
  const villageAt = { col: ri(12, 14), row: ri(2, 9) };
  const lzAt = {
    col: ri(12, 14),
    row: villageAt.row < 6 ? ri(8, 10) : ri(1, 3),
  };
  const far = (p, others, d) => others.every((o) => dist(p, o) >= d);
  const pickTile = (cMin, cMax, rMin, rMax, ok) => {
    for (let a = 0; a < 200; a++) {
      const p = { col: ri(cMin, cMax), row: ri(rMin, rMax) };
      if (!isWater(p.col, p.row) && ok(p)) return p;
    }
    return null;
  };
  const bunkerAt = pickTile(3, 13, 0, H - 1, (p) =>
    far(p, [...playerStart, villageAt, lzAt], 4),
  );
  const radioAt = pickTile(9, 14, 1, H - 2, (p) =>
    far(p, [villageAt, lzAt, bunkerAt || villageAt], 3),
  );
  if (!bunkerAt || !radioAt) return null;

  // 4. Sentieri: partenza → guadi → villaggio / postazione radio / LZ
  const carve = (from, to) => {
    let { col: c, row: r } = from;
    for (let g = 0; g < 80; g++) {
      if (["J", "C", "S"].includes(get(c, r))) set(c, r, "T");
      if (c === to.col && r === to.row) break;
      const dc = Math.sign(to.col - c);
      const dr = Math.sign(to.row - r);
      const ax = Math.abs(to.col - c);
      const ay = Math.abs(to.row - r);
      if (dc && (!dr || rng() < ax / (ax + ay))) c += dc;
      else r += dr;
    }
  };
  const [fA, fB] =
    Math.abs(fords[0].row - extract.row) <= Math.abs(fords[1].row - extract.row)
      ? fords
      : [fords[1], fords[0]];
  carve(extract, { col: fA.west, row: fA.row });
  carve({ col: fA.east, row: fA.row }, villageAt);
  carve(villageAt, lzAt);
  carve({ col: 1, row: startRow + 2 }, { col: fB.west, row: fB.row });
  carve({ col: fB.east, row: fB.row }, radioAt);

  // 5. Elementi: villaggio, LZ, bunker, postazione, ostacoli, partenza
  set(villageAt.col, villageAt.row, "V");
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
    if (rng() < 0.5 && !isWater(villageAt.col + dc, villageAt.row + dr))
      set(villageAt.col + dc, villageAt.row + dr, "V");
  }
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!isWater(lzAt.col + dc, lzAt.row + dr)) set(lzAt.col + dc, lzAt.row + dr, "C");
    }
  }
  set(bunkerAt.col, bunkerAt.row, "B");
  const bunker2 = pickTile(villageAt.col - 2, villageAt.col + 2, villageAt.row - 2, villageAt.row + 2, (p) =>
    get(p.col, p.row) === "J" || get(p.col, p.row) === "C",
  );
  if (bunker2) set(bunker2.col, bunker2.row, "B");
  set(radioAt.col, radioAt.row, "C");
  const keyPoints = [...playerStart, villageAt, lzAt, bunkerAt, radioAt];
  for (let i = 0, n = ri(2, 4); i < n; i++) {
    const p = pickTile(2, W - 1, 0, H - 1, (q) => get(q.col, q.row) === "J" && far(q, keyPoints, 2));
    if (p) set(p.col, p.row, "X");
  }
  for (const s of playerStart) set(s.col, s.row, "C");

  // 6. Verifica: ogni tile percorribile raggiungibile dalla partenza
  if (!_allReachable(grid, JUNGLE_TILE_TYPES, extract)) return null;

  const { it, en } = _procTranslations(JUNGLE_TEXT, seed, ["lz", "village", "bunker"], "radio");

  return {
    procedural: "jungle",
    seed,
    name: en.name,
    description: en.description,
    tileSize: TILE,
    cols: W,
    rows: H,
    sounds: { move: "assets/footsteps_jungle.mp3" },
    tileTypes: JSON.parse(JSON.stringify(JUNGLE_TILE_TYPES)),
    grid,
    playerStart,
    vcSpawnZones: [
      { colMin: 10, colMax: W - 1, rowMin: 0, rowMax: 5 },
      { colMin: 10, colMax: W - 1, rowMin: 6, rowMax: H - 1 },
    ],
    vcCount: ri(6, 8),
    trapCount: 4,
    objectives: {
      recon: [
        { ...lzAt, label: it.objectives.recon[0].label },
        { ...villageAt, label: it.objectives.recon[1].label },
        { ...bunkerAt, label: it.objectives.recon[2].label },
      ],
      search_destroy: { eliminateAll: false, minKills: 4 },
      rescue_pilot: {
        pilotCol: lzAt.col,
        pilotRow: lzAt.row,
        extractCol: extract.col,
        extractRow: extract.row,
        tileAnimations: [{ col: lzAt.col, row: lzAt.row, type: "smoke" }],
      },
      capture_objective: [{ ...radioAt, label: it.objectives.capture_objective[0].label, holdTurns: 2 }],
    },
    supportedMissions: ["recon", "search_destroy", "rescue_pilot", "capture_objective"],
    ambient: "missions/rung_sat_ambient.mp3",
    ambushChance: 0.15,
    reinforcementTurn: 5,
    reinforcementCount: 2,
    vcAmbushTurn: ri(4, 5),
    vcAmbushCount: ri(2, 3),
    vcAmbushZones: [
      { colMin: 0, colMax: 6, rowMin: 0, rowMax: 1 },
      { colMin: 0, colMax: 6, rowMin: H - 2, rowMax: H - 1 },
    ],
    translations: { it, en },
  };
}

// ── CITTÀ (offensiva del Têt) ──────────────────────────────────────────
const URBAN_TILE_TYPES = {
  W: { id: "wall", label: "Mura", moveCost: 0, coverBonus: 0, color: "#4a4030", impassable: true, losBlock: "full" },
  M: { id: "wall_breach", label: "Muro Demolibile", moveCost: 0, coverBonus: 0, color: "#5a4830", impassable: true, demolishable: true, demolishResult: "D", losBlock: "full" },
  T: { id: "temple", label: "Pagoda", moveCost: 1, coverBonus: 2, color: "#7a5c28", losBlock: "partial" },
  G: { id: "garden", label: "Giardino", moveCost: 1, coverBonus: 1, color: "#3a5a20", burnable: true },
  U: { id: "street", label: "Strada", moveCost: 1, coverBonus: 0, color: "#5a5040" },
  R: { id: "river", label: "Fiume", moveCost: 0, coverBonus: 0, color: "#1a4d7a", impassable: true },
  F: { id: "bridge", label: "Ponte", moveCost: 2, coverBonus: 0, color: "#8a7050" },
  B: { id: "building", label: "Edificio", moveCost: 1, coverBonus: 3, color: "#3a3030", losBlock: "full" },
  D: { id: "debris", label: "Macerie", moveCost: 2, coverBonus: 2, color: "#6a5040", losBlock: "partial" },
  P: { id: "plaza", label: "Piazza", moveCost: 1, coverBonus: 0, color: "#9a8060" },
  O: { id: "objective", label: "Comando NVA", moveCost: 1, coverBonus: 0, color: "#cc9900" },
};

const URBAN_TEXT = {
  it: {
    name: "Quartiere {seed}",
    description:
      "Distretto cittadino mai cartografato: isolati in rovina, un fiume da attraversare sui ponti e una cittadella murata in mano all'NVA.",
    tileLabels: {
      wall: "Mura",
      wall_breach: "Muro Demolibile",
      temple: "Pagoda",
      garden: "Giardino",
      street: "Strada",
      river: "Fiume",
      bridge: "Ponte",
      building: "Edificio",
      debris: "Macerie",
      plaza: "Piazza",
      objective: "Comando NVA",
    },
    bridge: "Ponte",
    market: "Mercato",
    hq: "Comando NVA",
  },
  en: {
    name: "District {seed}",
    description:
      "Uncharted city district: ruined blocks, a river crossed only by bridges and a walled citadel held by the NVA.",
    tileLabels: {
      wall: "Wall",
      wall_breach: "Breachable Wall",
      temple: "Pagoda",
      garden: "Garden",
      street: "Street",
      river: "River",
      bridge: "Bridge",
      building: "Building",
      debris: "Rubble",
      plaza: "Plaza",
      objective: "NVA Command",
    },
    bridge: "Bridge",
    market: "Market",
    hq: "NVA Command",
  },
};

function generateUrbanMap(seed) {
  return _generateWithRetries(_buildUrbanMap, seed);
}

function _buildUrbanMap(seed, attempt) {
  const rng = _mulberry32(seed * 103 + attempt);
  const W = PROC_COLS;
  const H = PROC_ROWS;
  const ri = (min, max) => min + Math.floor(rng() * (max - min + 1));
  const rpick = (arr) => arr[Math.floor(rng() * arr.length)];
  const grid = Array.from({ length: H }, () => Array(W).fill("U"));
  const inB = (c, r) => c >= 0 && r >= 0 && c < W && r < H;
  const get = (c, r) => (inB(c, r) ? grid[r][c] : null);
  const set = (c, r, k) => {
    if (inB(c, r)) grid[r][c] = k;
  };

  // 1. Fiume da ovest a est con lievi anse (righe rb..rb+1), 4-connesso
  const rb = ri(5, 6);
  const riverRows = [];
  let rr = rb + ri(0, 1);
  for (let c = 0; c < W; c++) {
    const prev = rr;
    if (c > 0 && rng() < 0.3) rr = rr === rb ? rb + 1 : rb;
    const lo = Math.min(prev, rr);
    const hi = Math.max(prev, rr);
    for (let r = lo; r <= hi; r++) set(c, r, "R");
    riverRows[c] = [lo, hi];
  }
  const northRoad = rb - 1;
  const southRoad = rb + 2;
  const wallRow = rb - 2;

  // 2. Viali nord-sud e strade est-ovest; tra di essi gli isolati, ognuno
  //    con un proprio carattere (densamente edificato, parco, in rovina)
  const avenues = [];
  for (let c = ri(1, 2); c < W; c += ri(3, 4)) avenues.push(c);
  const streetRows = [northRoad, southRoad, H - 1];
  if (H - 1 - southRoad >= 4) streetRows.push(southRoad + 2);
  if (wallRow >= 4) streetRows.push(2);
  const isStreet = (c, r) => avenues.includes(c) || streetRows.includes(r);
  const BLOCK_KINDS = {
    dense: [["B", 0.7], ["D", 0.1], ["U", 0.1], ["G", 0.1]],
    park: [["G", 0.6], ["P", 0.25], ["T", 0.15]],
    ruined: [["D", 0.5], ["B", 0.3], ["U", 0.2]],
  };
  const weighted = (table) => {
    let x = rng();
    for (const [k, w] of table) if ((x -= w) < 0) return k;
    return table[table.length - 1][0];
  };
  const blockKind = {};
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (get(c, r) === "R" || isStreet(c, r)) continue;
      const id = `${avenues.filter((a) => a < c).length},${streetRows.filter((s) => s < r).length}`;
      if (!blockKind[id]) {
        const x = rng();
        blockKind[id] = x < 0.6 ? "dense" : x < 0.75 ? "park" : "ruined";
      }
      set(c, r, weighted(BLOCK_KINDS[blockKind[id]]));
    }
  }

  // 3. Due ponti, uno per metà mappa, sui viali (così le strade proseguono)
  const westAv = avenues.filter((c) => c >= 2 && c <= 6);
  const eastAv = avenues.filter((c) => c >= 9 && c <= 13);
  if (!westAv.length || !eastAv.length) return null;
  const bridges = [rpick(westAv), rpick(eastAv)].map((c) => {
    for (let r = riverRows[c][0]; r <= riverRows[c][1]; r++) set(c, r, "F");
    return { col: c, row: riverRows[c][0] };
  });

  // 4. Cittadella murata a nord del fiume: porta sul lato sud, brecce
  //    demolibili, pagode e giardini attorno al comando NVA
  const cw = ri(7, 9);
  const cx0 = ri(3, W - cw - 3);
  const cx1 = cx0 + cw - 1;
  const inCitadel = (c, r) => c >= cx0 && c <= cx1 && r <= wallRow;
  for (let r = 0; r <= wallRow; r++) {
    for (let c = cx0; c <= cx1; c++) {
      if (c === cx0 || c === cx1 || r === wallRow) set(c, r, "W");
      else set(c, r, weighted([["T", 0.4], ["G", 0.35], ["P", 0.15], ["D", 0.1]]));
    }
  }
  const hqAt = { col: ri(cx0 + 2, cx1 - 2), row: ri(0, 1) };
  set(hqAt.col, hqAt.row, "O");
  const gateAv = avenues.filter((c) => c > cx0 + 1 && c < cx1 - 1);
  const gateCol = gateAv.length ? rpick(gateAv) : ri(cx0 + 2, cx1 - 2);
  set(gateCol, wallRow, "U");
  // Viale lastricato dalla porta al comando
  for (let r = wallRow - 1; r > hqAt.row; r--) set(gateCol, r, "P");
  for (let c = gateCol; c !== hqAt.col; c += Math.sign(hqAt.col - gateCol)) {
    set(c, hqAt.row, "P");
  }
  const breachCols = [];
  for (let c = cx0 + 1; c < cx1; c++) if (Math.abs(c - gateCol) > 1) breachCols.push(c);
  for (let i = 0, n = ri(1, 2); i < n && breachCols.length; i++) {
    set(breachCols.splice(Math.floor(rng() * breachCols.length), 1)[0], wallRow, "M");
  }
  if (rng() < 0.5) set(rng() < 0.5 ? cx0 : cx1, ri(0, wallRow - 1), "M");

  const pickTile = (cMin, cMax, rMin, rMax, ok) => {
    for (let a = 0; a < 200; a++) {
      const p = { col: ri(cMin, cMax), row: ri(rMin, rMax) };
      if (inB(p.col, p.row) && !URBAN_TILE_TYPES[get(p.col, p.row)].impassable && ok(p)) return p;
    }
    return null;
  };

  // 5. Mercato a sud del fiume, relitto dell'elicottero a nord fuori dalle mura
  const marketAt = pickTile(0, W - 2, southRoad + 1, H - 2, (p) => !isStreet(p.col, p.row));
  const crashAt = pickTile(0, W - 1, 0, wallRow, (p) => p.col < cx0 - 1 || p.col > cx1 + 1);
  if (!marketAt || !crashAt) return null;
  for (const [dc, dr] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const c = marketAt.col + dc;
    const r = marketAt.row + dr;
    if (r < H - 1 && !avenues.includes(c)) set(c, r, "P");
  }
  set(crashAt.col, crashAt.row, "P");
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const c = crashAt.col + dc;
    const r = crashAt.row + dr;
    if (r <= wallRow && !inCitadel(c, r) && rng() < 0.5) set(c, r, "D");
  }

  // 6. Un cratere d'artiglieria: edifici attorno ridotti in macerie
  const craterAt = pickTile(0, W - 1, 0, H - 2, (p) => !inCitadel(p.col, p.row));
  if (craterAt) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (get(craterAt.col + dc, craterAt.row + dr) === "B" && rng() < 0.7)
          set(craterAt.col + dc, craterAt.row + dr, "D");
      }
    }
  }

  // 7. Partenza sul bordo sud (la riga H-1 è sempre strada)
  const sc = ri(4, W - 8);
  const playerStart = [0, 1, 2, 3].map((i) => ({ col: sc + i, row: H - 1 }));
  const extract = { col: sc + 1, row: H - 1 };

  // 8. Verifica: ogni tile percorribile raggiungibile dalla partenza
  if (!_allReachable(grid, URBAN_TILE_TYPES, extract)) return null;

  const { it, en } = _procTranslations(URBAN_TEXT, seed, ["bridge", "market", "hq"], "hq");
  const reconBridge = rpick(bridges);

  return {
    procedural: "urban",
    seed,
    name: en.name,
    description: en.description,
    tileSize: TILE,
    cols: W,
    rows: H,
    tileTypes: JSON.parse(JSON.stringify(URBAN_TILE_TYPES)),
    grid,
    playerStart,
    vcSpawnZones: [
      { colMin: 0, colMax: W - 1, rowMin: 0, rowMax: wallRow },
      { colMin: 0, colMax: W - 1, rowMin: southRoad, rowMax: H - 4 },
    ],
    vcCount: ri(7, 9),
    trapCount: 3,
    objectives: {
      recon: [
        { ...reconBridge, label: it.objectives.recon[0].label },
        { ...marketAt, label: it.objectives.recon[1].label },
        { ...hqAt, label: it.objectives.recon[2].label },
      ],
      search_destroy: { eliminateAll: false, minKills: 5 },
      rescue_pilot: {
        pilotCol: crashAt.col,
        pilotRow: crashAt.row,
        extractCol: extract.col,
        extractRow: extract.row,
        tileAnimations: [{ col: crashAt.col, row: crashAt.row, type: "smoke" }],
      },
      capture_objective: [{ ...hqAt, label: it.objectives.capture_objective[0].label, holdTurns: 2 }],
    },
    supportedMissions: ["recon", "search_destroy", "rescue_pilot", "capture_objective"],
    ambient: "missions/hue_city_ambient.ogg",
    ambushChance: 0.2,
    reinforcementTurn: 4,
    reinforcementCount: 2,
    vcAmbushTurn: ri(3, 4),
    vcAmbushCount: 2,
    vcAmbushZones: [
      { colMin: 0, colMax: 1, rowMin: southRoad, rowMax: H - 2 },
      { colMin: W - 2, colMax: W - 1, rowMin: southRoad, rowMax: H - 2 },
    ],
    translations: { it, en },
  };
}

const MAP_GENERATORS = {
  jungle: generateJungleMap,
  urban: generateUrbanMap,
};
