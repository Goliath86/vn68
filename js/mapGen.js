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
  // I tentativi scartati (mappa non interamente raggiungibile) sono derivati
  // dal seed, quindi lo stesso seed produce sempre la stessa mappa
  for (let attempt = 0; attempt < 50; attempt++) {
    const md = _buildJungleMap(seed, attempt);
    if (md) return md;
  }
  throw new Error("procedural map generation failed");
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
  const passable = (c, r) => inB(c, r) && !JUNGLE_TILE_TYPES[grid[r][c]].impassable;
  const seen = grid.map((row) => row.map(() => false));
  const queue = [[extract.col, extract.row]];
  seen[extract.row][extract.col] = true;
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
    for (let c = 0; c < W; c++) if (passable(c, r) && !seen[r][c]) return null;
  }

  const text = (lang) => {
    const tx = JUNGLE_TEXT[lang];
    return {
      name: tx.name.replace("{seed}", seed),
      description: tx.description,
      tileLabels: { ...tx.tileLabels },
      objectives: {
        recon: [{ label: tx.lz }, { label: tx.village }, { label: tx.bunker }],
        capture_objective: [{ label: tx.radio }],
      },
    };
  };
  const it = text("it");
  const en = text("en");

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

const MAP_GENERATORS = {
  jungle: generateJungleMap,
};
