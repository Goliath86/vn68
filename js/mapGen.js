// ── MAPPE PROCEDURALI ──────────────────────────────────────────────────
// Generano al volo un mapData con lo stesso schema dei JSON in missions/,
// senza alcun file di supporto. saveGame() salva l'intero G.mapData, quindi
// la mappa generata sopravvive a salvataggi/caricamenti fino a nuova partita.
// Un generatore si registra in MAP_GENERATORS e si usa da catalog.json con
// una voce "generator": "<nome>" al posto di "file".
// Stesso seed → stessa mappa (PRNG deterministico, tentativi derivati dal seed).

// Dimensioni selezionabili. I generatori sono scritti per la mappa piccola
// (16×12) e scalano posizioni, distanze e quantità in proporzione; `step`
// aumenta VC, rinforzi e imboscate. La piccola resta identica a prima.
const PROC_SIZES = {
  small: { cols: 16, rows: 12, step: 0 },
  medium: { cols: 22, rows: 16, step: 1 },
  large: { cols: 28, rows: 20, step: 2 },
};
const PROC_BASE = PROC_SIZES.small;
const MAP_SIZE_KEY = "vn68_map_size";

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

function generateProceduralMap(name, seed = newMapSeed(), size = "small") {
  const gen = MAP_GENERATORS[name];
  if (!gen) throw new Error(`unknown map generator: ${name}`);
  return gen(seed, PROC_SIZES[size] ? size : "small");
}

// I tentativi scartati (mappa non valida) sono derivati dal seed,
// quindi lo stesso seed produce sempre la stessa mappa
function _generateWithRetries(build, seed, size) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const md = build(seed, attempt, size);
    if (md) return md;
  }
  throw new Error("procedural map generation failed");
}

// Scala dalle coordinate della mappa piccola a quelle della dimensione scelta.
// `swap`: righe e colonne scambiate (mappa generata "di traverso" e poi ruotata)
function _procScale(size, swap = false) {
  const { cols, rows, step } = PROC_SIZES[size];
  const W = swap ? rows : cols;
  const H = swap ? cols : rows;
  return {
    W,
    H,
    step,
    sx: (c) => Math.round((c * W) / PROC_BASE.cols),
    sy: (r) => Math.round((r * H) / PROC_BASE.rows),
    sd: (d) => Math.round((d * (W + H)) / (PROC_BASE.cols + PROC_BASE.rows)),
    area: (W * H) / (PROC_BASE.cols * PROC_BASE.rows),
  };
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

// Numero di percorsi disgiunti (fino a `max`) tra due tile: dopo ogni percorso
// trovato le sue tile intermedie diventano invalicabili. Le tile vicine agli
// estremi restano libere, così i corridoi possono partire dallo stesso punto.
function _corridorCount(grid, tileTypes, from, to, max = 3) {
  const H = grid.length;
  const W = grid[0].length;
  const blocked = grid.map((row) => row.map((k) => !!tileTypes[k].impassable));
  const nearEnd = (c, r) =>
    Math.abs(c - from.col) + Math.abs(r - from.row) <= 2 ||
    Math.abs(c - to.col) + Math.abs(r - to.row) <= 2;
  const key = (c, r) => r * W + c;
  let count = 0;
  for (; count < max; count++) {
    const prev = new Map([[key(from.col, from.row), -1]]);
    const queue = [[from.col, from.row]];
    for (let qi = 0; qi < queue.length && !prev.has(key(to.col, to.row)); qi++) {
      const [c, r] = queue[qi];
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= W || nr >= H) continue;
        if (blocked[nr][nc] || prev.has(key(nc, nr))) continue;
        prev.set(key(nc, nr), key(c, r));
        queue.push([nc, nr]);
      }
    }
    if (!prev.has(key(to.col, to.row))) break;
    for (let k = prev.get(key(to.col, to.row)); k !== -1; k = prev.get(k)) {
      const c = k % W;
      const r = (k - c) / W;
      if (!nearEnd(c, r)) blocked[r][c] = true;
    }
  }
  return count;
}

// Recupero pilota: il pilota si è allontanato dal relitto verso le linee
// amiche e aspetta al PILOT_ROUTE_SHARE del tragitto estrazione→relitto (sul
// tile percorribile più vicino, non sull'acqua). Col pilota in fondo alla
// mappa la missione era quasi impossibile oltre la mappa piccola (simulatore).
// RNG proprio: il resto della mappa resta identico a parità di seed.
const PILOT_ROUTE_SHARE = 0.6;

function _pilotSite(grid, tileTypes, from, wreck, seed, isWater) {
  const rng = _mulberry32(seed * 107 + 7);
  const tc = from.col + (wreck.col - from.col) * PILOT_ROUTE_SHARE;
  const tr = from.row + (wreck.row - from.row) * PILOT_ROUTE_SHARE;
  let best = [];
  let bestD = Infinity;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[0].length; c++) {
      if (tileTypes[grid[r][c]].impassable || isWater(c, r)) continue;
      const d = Math.round(Math.abs(c - tc) + Math.abs(r - tr));
      if (d < bestD) [best, bestD] = [[], d];
      if (d === bestD) best.push({ col: c, row: r });
    }
  }
  return best.length ? best[Math.floor(rng() * best.length)] : wreck;
}

// Scelta pesata da una tabella [[valore, peso], ...]
function _weighted(rng, table) {
  let x = rng();
  for (const [k, w] of table) if ((x -= w) < 0) return k;
  return table[table.length - 1][0];
}

// Blocco "translations" { it, en } della mappa a partire dai testi del generatore
// (`variant` sceglie la descrizione se il generatore ne ha una per layout)
function _procTranslations(texts, seed, reconKeys, captureKey, variant) {
  const text = (lang) => {
    const tx = texts[lang];
    return {
      name: tx.name.replace("{seed}", seed),
      description: typeof tx.description === "string" ? tx.description : tx.description[variant],
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
    // Una descrizione per layout (vedi JUNGLE_LAYOUTS)
    description: {
      crossing:
        "Zona del delta mai cartografata: giungla fitta, un fiume da guadare, bunker e villaggi in mano ai VC.",
      bend:
        "Zona del delta mai cartografata: un fiume piega attraverso la giungla e chiude una sacca in mano ai VC.",
      parallel:
        "Zona del delta mai cartografata: un fiume corre lungo la direttrice d'avanzata e divide la giungla in due rive, entrambe in mano ai VC.",
      confluence:
        "Zona del delta mai cartografata: due corsi d'acqua confluiscono nella giungla e la dividono in settori collegati solo dai guadi.",
      swamp:
        "Zona del delta mai cartografata: nessun fiume, ma una larga fascia di palude rallenta l'avanzata verso bunker e villaggi dei VC.",
    },
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
    description: {
      crossing:
        "Uncharted delta zone: thick jungle, a river to ford, bunkers and villages held by the VC.",
      bend:
        "Uncharted delta zone: a river bends through the jungle and closes off a pocket held by the VC.",
      parallel:
        "Uncharted delta zone: a river runs along the line of advance and splits the jungle into two banks, both held by the VC.",
      confluence:
        "Uncharted delta zone: two waterways meet in the jungle and split it into sectors linked only by fords.",
      swamp:
        "Uncharted delta zone: no river, but a wide swamp belt slows the advance toward VC bunkers and villages.",
    },
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

// Layout dell'acqua, con il loro peso:
// - crossing:   fiume perpendicolare all'avanzata
// - bend:       il fiume piega ad angolo e chiude una sacca
// - parallel:   fiume lungo la direttrice d'avanzata, due rive
// - confluence: un affluente si getta nel fiume e divide la zona in settori
// - swamp:      nessun fiume, una larga fascia di palude con qualche stagno
const JUNGLE_LAYOUTS = [
  ["crossing", 0.25],
  ["bend", 0.2],
  ["parallel", 0.2],
  ["confluence", 0.2],
  ["swamp", 0.15],
];

function generateJungleMap(seed, size = "small") {
  return _generateWithRetries(_buildJungleMap, seed, size);
}

// La mappa è costruita in un sistema "canonico" con la partenza a ovest e
// gli obiettivi a est; alla fine viene ruotata/specchiata verso il bordo di
// partenza estratto (O/E/N/S). Per N/S si genera con righe e colonne scambiate.
function _buildJungleMap(seed, attempt, size) {
  const rng = _mulberry32(seed * 101 + attempt);
  const ri = (min, max) => min + Math.floor(rng() * (max - min + 1));
  const layout = _weighted(rng, JUNGLE_LAYOUTS);
  const edge = ["W", "E", "N", "S"][Math.floor(rng() * 4)];
  const flip = rng() < 0.5;
  const { W, H, step, sx, sy, sd, area } = _procScale(size, edge === "N" || edge === "S");
  const grid = Array.from({ length: H }, () => Array(W).fill("J"));
  const inB = (c, r) => c >= 0 && r >= 0 && c < W && r < H;
  const get = (c, r) => (inB(c, r) ? grid[r][c] : null);
  const set = (c, r, k) => {
    if (inB(c, r)) grid[r][c] = k;
  };
  const isWater = (c, r) => get(c, r) === "R" || get(c, r) === "F";
  const clampC = (c) => Math.max(1, Math.min(W - 2, c));
  const clampR = (r) => Math.max(1, Math.min(H - 2, r));

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

  // 2. Acqua. Un corso d'acqua è una catena 4-connessa di tile che passa per
  //    dei punti di controllo; tra due punti avanza sempre lungo l'asse
  //    principale, con piccole deviazioni laterali (anse).
  const meander = (a, b) => {
    const vert = Math.abs(b.row - a.row) >= Math.abs(b.col - a.col);
    const len = vert ? Math.abs(b.row - a.row) : Math.abs(b.col - a.col);
    const n = Math.max(0, Math.round(len / 4) - 1);
    const pts = [a];
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      const c = Math.round(a.col + (b.col - a.col) * t);
      const r = Math.round(a.row + (b.row - a.row) * t);
      pts.push(vert ? { col: clampC(c + ri(-1, 1)), row: r } : { col: c, row: clampR(r + ri(-1, 1)) });
    }
    pts.push(b);
    return pts;
  };
  const river = (...ctrl) => {
    let pts = [ctrl[0]];
    for (let i = 1; i < ctrl.length; i++) pts = pts.concat(meander(ctrl[i - 1], ctrl[i]).slice(1));
    let { col: c, row: r } = pts[0];
    const cells = [{ col: c, row: r }];
    for (let i = 1; i < pts.length; i++) {
      const to = pts[i];
      const vert = Math.abs(to.row - r) >= Math.abs(to.col - c);
      let first = true;
      while (c !== to.col || r !== to.row) {
        const ax = Math.abs(to.col - c);
        const ay = Math.abs(to.row - r);
        // Il primo passo segue l'asse principale: niente ritorni sulle tile già fatte
        const alongCol = first ? !vert && ax > 0 : ay === 0 || (ax > 0 && rng() < ax / (ax + ay));
        if (alongCol || !ay) c += Math.sign(to.col - c);
        else r += Math.sign(to.row - r);
        first = false;
        cells.push({ col: c, row: r });
      }
    }
    for (const p of cells) set(p.col, p.row, "R");
    return cells;
  };

  let fordCount = 0;
  if (layout === "crossing") {
    river({ col: ri(sx(6), sx(9)), row: 0 }, { col: ri(sx(6), sx(9)), row: H - 1 });
    fordCount = 2 + step;
  } else if (layout === "bend") {
    const corner = { col: ri(sx(6), sx(9)), row: ri(sy(5), sy(7)) };
    river(
      { col: ri(sx(5), sx(8)), row: 0 },
      corner,
      { col: W - 1, row: clampR(corner.row + ri(0, sy(3))) },
    );
    fordCount = 2 + step;
  } else if (layout === "parallel") {
    river({ col: 0, row: ri(sy(3), sy(4)) }, { col: W - 1, row: ri(sy(6), sy(9)) });
    fordCount = 2 + step;
  } else if (layout === "confluence") {
    const main = river({ col: ri(sx(5), sx(7)), row: 0 }, { col: ri(sx(5), sx(8)), row: H - 1 });
    const joinRow = ri(sy(3), sy(8));
    const join = main.filter((p) => p.row === joinRow).reduce((a, b) => (b.col > a.col ? b : a));
    river({ col: W - 1, row: clampR(joinRow + ri(-sy(2), sy(2))) }, { col: join.col + 1, row: join.row });
    fordCount = 3 + step;
  } else {
    // Fascia di palude con qualche stagno invalicabile
    let cc = ri(sx(6), sx(8));
    const half = 1 + Math.ceil(step / 2);
    for (let r = 0; r < H; r++) {
      if (r > 0 && rng() < 0.4) cc = Math.max(sx(5), Math.min(sx(10), cc + (rng() < 0.5 ? -1 : 1)));
      for (let c = cc - half - 1; c <= cc + half + 1; c++) {
        const edgeTile = Math.abs(c - cc) > half;
        if (!edgeTile || rng() < 0.5) set(c, r, rng() < 0.85 ? "S" : "J");
      }
    }
    for (let i = 0, n = 2 + step; i < n; i++) {
      const p = { col: ri(sx(5), sx(10)), row: ri(1, H - 2) };
      if (get(p.col, p.row) !== "S") continue;
      set(p.col, p.row, "R");
      const [dc, dr] = [[1, 0], [0, 1]][Math.floor(rng() * 2)];
      if (rng() < 0.6 && get(p.col + dc, p.row + dr) === "S") set(p.col + dc, p.row + dr, "R");
    }
  }

  // Guadi: solo dove il fiume è dritto e largo un tile, con terra ai due lati;
  // distribuiti lungo il corso (ognuno il più lontano possibile dagli altri)
  const fords = [];
  if (fordCount) {
    const land = (c, r) => inB(c, r) && !isWater(c, r);
    const cands = [];
    for (let r = 1; r < H - 1; r++) {
      for (let c = 1; c < W - 1; c++) {
        if (get(c, r) !== "R") continue;
        if (isWater(c, r - 1) && isWater(c, r + 1) && land(c - 1, r) && land(c + 1, r))
          cands.push({ col: c, row: r, a: { col: c - 1, row: r }, b: { col: c + 1, row: r } });
        else if (isWater(c - 1, r) && isWater(c + 1, r) && land(c, r - 1) && land(c, r + 1))
          cands.push({ col: c, row: r, a: { col: c, row: r - 1 }, b: { col: c, row: r + 1 } });
      }
    }
    while (fords.length < fordCount && cands.length) {
      let idx = Math.floor(rng() * cands.length);
      if (fords.length) {
        const score = (p) => Math.min(...fords.map((f) => dist(f, p))) + rng() * 2;
        idx = cands.reduce((bi, p, i) => (score(p) > score(cands[bi]) ? i : bi), 0);
      }
      const f = cands.splice(idx, 1)[0];
      if (fords.some((o) => dist(o, f) < 3)) continue;
      set(f.col, f.row, "F");
      fords.push(f);
    }
    if (fords.length < 2) return null;
  }

  // 3. Punti chiave: partenza sul bordo ovest (all'asciutto, lontano
  //    dall'acqua), obiettivi verso est
  const dryStart = (r) => {
    for (let rr = r - 1; rr <= r + 4; rr++)
      for (let c = 0; c <= 2; c++) if (isWater(c, rr)) return false;
    return r >= 0 && r + 3 < H;
  };
  const pref = ri(sy(3), sy(5));
  const startRows = [];
  for (let r = 0; r + 3 < H; r++) if (dryStart(r)) startRows.push(r);
  if (!startRows.length) return null;
  const startRow = startRows.reduce((a, b) => (Math.abs(b - pref) < Math.abs(a - pref) ? b : a));
  const playerStart = [0, 1, 2, 3].map((i) => ({ col: 0, row: startRow + i }));
  const extract = { col: 0, row: startRow + 1 };
  const far = (p, others, d) => others.every((o) => dist(p, o) >= d);
  const pickTile = (cMin, cMax, rMin, rMax, ok) => {
    for (let a = 0; a < 200; a++) {
      const p = { col: ri(cMin, cMax), row: ri(rMin, rMax) };
      if (inB(p.col, p.row) && !isWater(p.col, p.row) && ok(p)) return p;
    }
    return null;
  };
  const villageAt = pickTile(sx(11), sx(14), sy(2), sy(9), () => true);
  if (!villageAt) return null;
  const lzAt = pickTile(sx(11), W - 2, 1, H - 2, (p) => far(p, [villageAt], sd(5)));
  if (!lzAt) return null;
  const bunkerAt = pickTile(sx(3), sx(13), 0, H - 1, (p) =>
    far(p, [...playerStart, villageAt, lzAt], sd(4)),
  );
  const radioAt = pickTile(sx(8), sx(14), 1, H - 2, (p) =>
    far(p, [villageAt, lzAt, bunkerAt || villageAt], sd(3)),
  );
  if (!bunkerAt || !radioAt) return null;

  // 4. Sentieri. Le zone separate dall'acqua si collegano solo dai guadi:
  //    un sentiero che deve cambiare zona passa dal guado più comodo
  //    (preferendo quelli non ancora usati)
  const region = grid.map((row) => row.map(() => -1));
  for (let r0 = 0, id = 0; r0 < H; r0++) {
    for (let c0 = 0; c0 < W; c0++) {
      if (region[r0][c0] !== -1 || isWater(c0, r0)) continue;
      const stack = [[c0, r0]];
      region[r0][c0] = id;
      while (stack.length) {
        const [c, r] = stack.pop();
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = c + dc;
          const nr = r + dr;
          if (inB(nc, nr) && region[nr][nc] === -1 && !isWater(nc, nr)) {
            region[nr][nc] = id;
            stack.push([nc, nr]);
          }
        }
      }
      id++;
    }
  }
  const reg = (p) => region[p.row][p.col];
  const carve = (from, to) => {
    let { col: c, row: r } = from;
    for (let g = 0; g < 4 * (W + H); g++) {
      if (["J", "C", "S"].includes(get(c, r))) set(c, r, "T");
      if (c === to.col && r === to.row) break;
      const dc = Math.sign(to.col - c);
      const dr = Math.sign(to.row - r);
      const ax = Math.abs(to.col - c);
      const ay = Math.abs(to.row - r);
      // Passo preferito e alternativa; l'acqua si aggira, se possibile
      const steps = dc && (!dr || rng() < ax / (ax + ay)) ? [[dc, 0], [0, dr]] : [[0, dr], [dc, 0]];
      const next = steps.find(([sc, sr]) => (sc || sr) && inB(c + sc, r + sr) && !isWater(c + sc, r + sr));
      if (!next) break;
      c += next[0];
      r += next[1];
    }
  };
  const used = new Set();
  const route = (from, to) => {
    let cur = from;
    for (let hop = 0; hop < 4 && reg(cur) !== reg(to); hop++) {
      let best = null;
      for (const f of fords) {
        for (const [near, other] of [[f.a, f.b], [f.b, f.a]]) {
          if (reg(near) !== reg(cur)) continue;
          const score = dist(cur, near) + dist(other, to) + (used.has(f) ? 6 : 0);
          if (!best || score < best.score) best = { f, near, other, score };
        }
      }
      if (!best) break;
      used.add(best.f);
      carve(cur, best.near);
      cur = best.other;
    }
    carve(cur, to);
  };
  route(extract, villageAt);
  route(villageAt, lzAt);
  route({ col: 1, row: startRow + 2 }, radioAt);

  // 5. Elementi: villaggio, LZ, bunker, postazione, ostacoli, partenza
  set(villageAt.col, villageAt.row, "V");
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
    if (rng() < 0.5 && inB(villageAt.col + dc, villageAt.row + dr) && !isWater(villageAt.col + dc, villageAt.row + dr))
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
  // Le rive dei guadi restano libere: un ostacolo lì chiuderebbe il passaggio
  const keyPoints = [...playerStart, villageAt, lzAt, bunkerAt, radioAt, ...fords.flatMap((f) => [f.a, f.b])];
  // Mappe più grandi: altri bunker sparsi oltre la partenza
  for (let i = 0; i < step; i++) {
    const p = pickTile(sx(5), W - 1, 0, H - 1, (q) =>
      ["J", "C"].includes(get(q.col, q.row)) && far(q, keyPoints, sd(3)),
    );
    if (p) set(p.col, p.row, "B");
  }
  for (let i = 0, n = ri(Math.round(2 * area), Math.round(4 * area)); i < n; i++) {
    const p = pickTile(2, W - 1, 0, H - 1, (q) => get(q.col, q.row) === "J" && far(q, keyPoints, 2));
    if (p) set(p.col, p.row, "X");
  }
  for (const s of playerStart) set(s.col, s.row, "C");

  // 6. Verifica: ogni tile percorribile raggiungibile dalla partenza, e
  //    almeno due corridoi distinti verso ciascun obiettivo principale
  if (!_allReachable(grid, JUNGLE_TILE_TYPES, extract)) return null;
  for (const goal of [villageAt, lzAt, radioAt]) {
    if (_corridorCount(grid, JUNGLE_TILE_TYPES, extract, goal, 2) < 2) return null;
  }

  // 7. Dal sistema canonico al bordo di partenza estratto
  const toMap = (p) => {
    const c = p.col;
    const r = flip ? H - 1 - p.row : p.row;
    if (edge === "E") return { col: W - 1 - c, row: r };
    if (edge === "N") return { col: r, row: c };
    if (edge === "S") return { col: r, row: W - 1 - c };
    return { col: c, row: r };
  };
  const zone = (colMin, colMax, rowMin, rowMax) => {
    const a = toMap({ col: colMin, row: rowMin });
    const b = toMap({ col: colMax, row: rowMax });
    return {
      colMin: Math.min(a.col, b.col),
      colMax: Math.max(a.col, b.col),
      rowMin: Math.min(a.row, b.row),
      rowMax: Math.max(a.row, b.row),
    };
  };
  const cols = edge === "N" || edge === "S" ? H : W;
  const rows = edge === "N" || edge === "S" ? W : H;
  const mapGrid = Array.from({ length: rows }, () => Array(cols));
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const p = toMap({ col: c, row: r });
      mapGrid[p.row][p.col] = grid[r][c];
    }
  }
  const lz = toMap(lzAt);
  const ex = toMap(extract);
  const pilot = toMap(_pilotSite(grid, JUNGLE_TILE_TYPES, extract, lzAt, seed, isWater));

  const { it, en } = _procTranslations(JUNGLE_TEXT, seed, ["lz", "village", "bunker"], "radio", layout);

  return {
    procedural: "jungle",
    seed,
    size,
    layout,
    startEdge: edge,
    name: en.name,
    description: en.description,
    tileSize: TILE,
    cols,
    rows,
    sounds: { move: "assets/footsteps_jungle.mp3" },
    tileTypes: JSON.parse(JSON.stringify(JUNGLE_TILE_TYPES)),
    grid: mapGrid,
    playerStart: playerStart.map(toMap),
    vcSpawnZones: [
      zone(sx(10), W - 1, 0, H / 2 - 1),
      zone(sx(10), W - 1, H / 2, H - 1),
    ],
    vcCount: ri(6, 8) + 3 * step,
    trapCount: Math.round(4 * area),
    objectives: {
      recon: [
        { ...lz, label: it.objectives.recon[0].label },
        { ...toMap(villageAt), label: it.objectives.recon[1].label },
        { ...toMap(bunkerAt), label: it.objectives.recon[2].label },
      ],
      search_destroy: { eliminateAll: false, minKills: 4 + 2 * step },
      rescue_pilot: {
        pilotCol: pilot.col,
        pilotRow: pilot.row,
        extractCol: ex.col,
        extractRow: ex.row,
        tileAnimations: [{ col: pilot.col, row: pilot.row, type: "smoke" }],
      },
      capture_objective: [{ ...toMap(radioAt), label: it.objectives.capture_objective[0].label, holdTurns: 2 }],
    },
    supportedMissions: ["recon", "search_destroy", "rescue_pilot", "capture_objective"],
    ambient: "missions/rung_sat_ambient.mp3",
    // Meteo (solo visivo): acquazzoni casuali, nebbiolina sul delta paludoso
    rain: { chance: 0.2, minTurns: 2, maxTurns: 4 },
    mist: layout === "swamp",
    ambushChance: 0.15,
    reinforcementTurn: 5,
    reinforcementCount: step ? 3 : 2,
    vcAmbushTurn: ri(4, 5) + step,
    vcAmbushCount: ri(2, 3) + step,
    vcAmbushZones: [
      zone(0, sx(6), 0, 1),
      zone(0, sx(6), H - 2, H - 1),
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
    // Una descrizione per layout (vedi URBAN_LAYOUTS)
    description: {
      river:
        "Distretto cittadino mai cartografato: isolati in rovina, un fiume da attraversare sui ponti e una cittadella murata in mano all'NVA.",
      canal:
        "Distretto cittadino mai cartografato: un canale rettilineo taglia il quartiere ed è scavalcato da molti ponti. Oltre il canale, la cittadella murata dell'NVA.",
      sidecanal:
        "Distretto cittadino mai cartografato: un canale corre lungo l'avanzata e isola una striscia di edifici raggiungibile solo dai ponti. La cittadella è in mano all'NVA.",
      riverside:
        "Distretto cittadino mai cartografato: il fiume chiude un fianco del quartiere, e gli isolati in rovina arrivano fino alla cittadella murata dell'NVA.",
      dry:
        "Distretto cittadino mai cartografato: nessun corso d'acqua, solo isolati in rovina, piazze e pagode fino alla cittadella murata dell'NVA.",
    },
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
    pagoda: "Pagoda",
    market: "Mercato",
    hq: "Comando NVA",
  },
  en: {
    name: "District {seed}",
    description: {
      river:
        "Uncharted city district: ruined blocks, a river crossed only by bridges and a walled citadel held by the NVA.",
      canal:
        "Uncharted city district: a straight canal cuts through the district and is crossed by many bridges. Beyond the canal stands the NVA's walled citadel.",
      sidecanal:
        "Uncharted city district: a canal runs along the line of advance and cuts off a strip of buildings reachable only by bridges. The citadel is held by the NVA.",
      riverside:
        "Uncharted city district: the river closes off one flank of the district, and the ruined blocks stretch up to the NVA's walled citadel.",
      dry:
        "Uncharted city district: no waterway, only ruined blocks, squares and pagodas up to the NVA's walled citadel.",
    },
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
    pagoda: "Pagoda",
    market: "Market",
    hq: "NVA Command",
  },
};

// Layout dell'acqua, con il loro peso:
// - river:     fiume con anse perpendicolare all'avanzata, pochi ponti
// - canal:     canale rettilineo perpendicolare all'avanzata, molti ponti
// - sidecanal: canale lungo l'avanzata che isola una striscia di isolati
// - riverside: il fiume chiude un fianco, nessun ponte da attraversare
// - dry:       nessun corso d'acqua
const URBAN_LAYOUTS = [
  ["river", 0.3],
  ["canal", 0.2],
  ["sidecanal", 0.2],
  ["riverside", 0.15],
  ["dry", 0.15],
];

// Carattere degli isolati: tile e peso
const URBAN_BLOCK_KINDS = {
  dense: [["B", 0.7], ["D", 0.1], ["U", 0.1], ["G", 0.1]],
  park: [["G", 0.6], ["P", 0.25], ["T", 0.15]],
  ruined: [["D", 0.5], ["B", 0.3], ["U", 0.2]],
  temple: [["T", 0.45], ["G", 0.3], ["P", 0.25]],
  slum: [["B", 0.35], ["D", 0.3], ["U", 0.25], ["G", 0.1]],
};
const URBAN_BLOCK_WEIGHTS = [
  ["dense", 0.45],
  ["park", 0.12],
  ["ruined", 0.18],
  ["temple", 0.1],
  ["slum", 0.15],
];

function generateUrbanMap(seed, size = "small") {
  return _generateWithRetries(_buildUrbanMap, seed, size);
}

// Come la giungla: costruita in un sistema canonico (partenza a sud,
// cittadella a nord) e poi ruotata/specchiata verso il bordo estratto.
// Per O/E si genera con righe e colonne scambiate.
function _buildUrbanMap(seed, attempt, size) {
  const rng = _mulberry32(seed * 103 + attempt);
  const ri = (min, max) => min + Math.floor(rng() * (max - min + 1));
  const rpick = (arr) => arr[Math.floor(rng() * arr.length)];
  const weighted = (table) => _weighted(rng, table);
  const layout = weighted(URBAN_LAYOUTS);
  const edge = ["S", "N", "W", "E"][Math.floor(rng() * 4)];
  const mirror = rng() < 0.5;
  const { W, H, step, sx, sy, area } = _procScale(size, edge === "W" || edge === "E");
  const grid = Array.from({ length: H }, () => Array(W).fill("U"));
  const inB = (c, r) => c >= 0 && r >= 0 && c < W && r < H;
  const get = (c, r) => (inB(c, r) ? grid[r][c] : null);
  const set = (c, r, k) => {
    if (inB(c, r)) grid[r][c] = k;
  };
  const isWater = (c, r) => get(c, r) === "R" || get(c, r) === "F";

  // 1. Acqua, viali nord-sud e strade est-ovest. `wallRow` è il muro sud
  //    della cittadella; `colLimit` la prima colonna che la cittadella non
  //    può occupare (acqua sul fianco)
  let avenues = [];
  for (let c = ri(1, 2); c < W; c += ri(3, 4)) avenues.push(c);
  const streetRows = [H - 1];
  let wallRow;
  let colLimit = W;
  let bridgeCands = []; // { col, row, tiles }: punti in cui una strada incontra l'acqua
  let bridgeCount = 0;
  if (layout === "river" || layout === "canal") {
    const wide = layout === "river";
    const rb = ri(sy(5), sy(6));
    const spans = [];
    let rr = rb + (wide ? ri(0, 1) : 0);
    for (let c = 0; c < W; c++) {
      const prev = rr;
      if (wide && c > 0 && rng() < 0.3) rr = rr === rb ? rb + 1 : rb;
      const lo = Math.min(prev, rr);
      const hi = Math.max(prev, rr);
      for (let r = lo; r <= hi; r++) set(c, r, "R");
      spans[c] = [lo, hi];
    }
    const southRoad = rb + (wide ? 2 : 1);
    wallRow = rb - 2;
    streetRows.push(rb - 1, southRoad);
    for (let r = southRoad + 2; r <= H - 3; r += 3) streetRows.push(r);
    bridgeCands = avenues
      .filter((c) => c >= 1 && c <= W - 2)
      .map((c) => {
        const tiles = [];
        for (let r = spans[c][0]; r <= spans[c][1]; r++) tiles.push({ col: c, row: r });
        return { col: c, row: spans[c][0], tiles };
      });
    bridgeCount = wide ? 2 + step : 3 + step;
  } else {
    wallRow = ri(sy(3), sy(4));
    streetRows.push(wallRow + 1);
    for (let r = wallRow + 4; r <= H - 3; r += 3) streetRows.push(r);
    if (layout === "sidecanal") {
      // Canale dritto su tutta l'altezza; oltre, una striscia di 3-4 colonne
      const cc = W - 1 - ri(sx(3), sx(4));
      for (let r = 0; r < H; r++) set(cc, r, "R");
      avenues = avenues.filter((c) => c !== cc);
      colLimit = cc - 1;
      bridgeCands = streetRows
        .filter((r) => r >= 1 && r <= H - 3)
        .map((r) => ({ col: cc, row: r, tiles: [{ col: cc, row: r }] }));
      bridgeCount = 2 + step;
    } else if (layout === "riverside") {
      // Fiume largo 2-3 tile lungo il fianco est
      let rv = W - ri(2, 3);
      let minRv = rv;
      for (let r = 0; r < H; r++) {
        if (r > 0 && rng() < 0.3) rv = rv === W - 2 ? W - 3 : W - 2;
        for (let c = rv; c < W; c++) set(c, r, "R");
        minRv = Math.min(minRv, rv);
      }
      avenues = avenues.filter((c) => c < minRv - 1);
      colLimit = minRv - 1;
    }
  }
  for (let r = 2; r <= wallRow - 2; r += 3) streetRows.push(r);
  const isStreet = (c, r) => avenues.includes(c) || streetRows.includes(r);

  // 2. Isolati tra le strade, ognuno con un proprio carattere
  const blockKind = {};
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (isWater(c, r) || isStreet(c, r)) continue;
      const id = `${avenues.filter((a) => a < c).length},${streetRows.filter((s) => s < r).length}`;
      blockKind[id] ??= weighted(URBAN_BLOCK_WEIGHTS);
      set(c, r, weighted(URBAN_BLOCK_KINDS[blockKind[id]]));
    }
  }

  // 3. Ponti dove le strade incontrano l'acqua, distribuiti lungo il corso
  const bridges = [];
  while (bridges.length < bridgeCount && bridgeCands.length) {
    let idx = Math.floor(rng() * bridgeCands.length);
    if (bridges.length) {
      const gap = (p) => Math.min(...bridges.map((b) => dist(b, p)));
      idx = bridgeCands.reduce((bi, p, i) => (gap(p) + rng() * 2 > gap(bridgeCands[bi]) + rng() * 2 ? i : bi), 0);
    }
    const b = bridgeCands.splice(idx, 1)[0];
    if (bridges.some((o) => dist(o, b) < 3)) continue;
    for (const p of b.tiles) set(p.col, p.row, "F");
    bridges.push({ col: b.col, row: b.row });
  }
  if (bridgeCount && bridges.length < 2) return null;

  // 4. Cittadella murata contro il bordo nord, in posizione variabile
  //    (anche d'angolo). Porta principale a sud o su un fianco, sempre un
  //    secondo ingresso su un altro lato, brecce demolibili, pagode e
  //    giardini attorno al comando NVA
  const avail = colLimit - 1;
  const cw = Math.min(ri(sx(7), sx(9)), avail);
  if (cw < 6 || wallRow < 3) return null;
  const cx0 = ri(0, avail - cw);
  const cx1 = cx0 + cw - 1;
  const inCitadel = (c, r) => c >= cx0 && c <= cx1 && r <= wallRow;
  for (let r = 0; r <= wallRow; r++) {
    for (let c = cx0; c <= cx1; c++) {
      if (c === cx0 || c === cx1 || r === wallRow) set(c, r, "W");
      else set(c, r, weighted([["T", 0.4], ["G", 0.35], ["P", 0.15], ["D", 0.1]]));
    }
  }
  // Lati con un'uscita possibile: un fianco contro il bordo mappa non ne ha
  const sides = ["S"];
  if (cx0 > 0) sides.push("W");
  if (cx1 < W - 1 && !isWater(cx1 + 1, 1)) sides.push("E");
  const gateOn = (side, avoid) => {
    if (side === "S") {
      const cands = [];
      for (let c = cx0 + 2; c <= cx1 - 2; c++) if (!avoid || Math.abs(c - avoid.col) >= 3) cands.push(c);
      if (!cands.length) return null;
      const onAv = cands.filter((c) => avenues.includes(c));
      const col = rpick(onAv.length ? onAv : cands);
      return { side, col, row: wallRow, inner: { col, row: wallRow - 1 } };
    }
    const col = side === "W" ? cx0 : cx1;
    const row = ri(1, wallRow - 1);
    return { side, col, row, inner: { col: col + (side === "W" ? 1 : -1), row } };
  };
  const mainSide = rng() < 0.6 || sides.length === 1 ? "S" : rpick(sides.slice(1));
  const gate = gateOn(mainSide);
  const otherSides = sides.filter((s) => s !== mainSide);
  const postern = otherSides.length ? gateOn(rpick(otherSides)) : gateOn("S", gate);
  if (!gate || !postern) return null;
  for (const g of [gate, postern]) set(g.col, g.row, "U");
  const hqAt = { col: ri(cx0 + 2, cx1 - 2), row: ri(0, 1) };
  // Viale lastricato dalla porta principale al comando
  {
    let { col: c, row: r } = gate.inner;
    const horizFirst = gate.side !== "S";
    for (let g = 0; g < W + H && (c !== hqAt.col || r !== hqAt.row); g++) {
      set(c, r, "P");
      if (horizFirst ? c !== hqAt.col : r === hqAt.row) c += Math.sign(hqAt.col - c);
      else r += Math.sign(hqAt.row - r);
    }
  }
  set(hqAt.col, hqAt.row, "O");
  // Brecce: tratti di muro con terra all'esterno, lontani dagli ingressi
  const breachCands = [];
  const nearGate = (c, r) => [gate, postern].some((g) => Math.abs(g.col - c) + Math.abs(g.row - r) <= 1);
  for (let c = cx0 + 1; c < cx1; c++) {
    if (!nearGate(c, wallRow) && inB(c, wallRow + 1) && !isWater(c, wallRow + 1)) breachCands.push({ col: c, row: wallRow });
  }
  for (const [c, out] of [[cx0, cx0 - 1], [cx1, cx1 + 1]]) {
    for (let r = 1; r < wallRow; r++) {
      if (!nearGate(c, r) && inB(out, r) && !isWater(out, r)) breachCands.push({ col: c, row: r });
    }
  }
  for (let i = 0, n = ri(1, 2 + step); i < n && breachCands.length; i++) {
    const b = breachCands.splice(Math.floor(rng() * breachCands.length), 1)[0];
    set(b.col, b.row, "M");
  }

  const pickTile = (cMin, cMax, rMin, rMax, ok) => {
    for (let a = 0; a < 200; a++) {
      const p = { col: ri(cMin, cMax), row: ri(rMin, rMax) };
      if (inB(p.col, p.row) && !URBAN_TILE_TYPES[get(p.col, p.row)].impassable && !isWater(p.col, p.row) && ok(p))
        return p;
    }
    return null;
  };
  const outsideCitadel = (p) => p.col < cx0 - 1 || p.col > cx1 + 1 || p.row > wallRow + 1;

  // 5. Mercato verso la partenza, relitto dell'elicottero vicino alle mura
  //    ma fuori, pagoda da ricognire se non ci sono ponti
  const marketAt = pickTile(0, W - 2, Math.floor(H / 2), H - 3, (p) => !isStreet(p.col, p.row));
  const crashAt = pickTile(0, W - 1, 0, wallRow + 2, outsideCitadel);
  if (!marketAt || !crashAt) return null;
  for (const [dc, dr] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const c = marketAt.col + dc;
    const r = marketAt.row + dr;
    if (r < H - 1 && !avenues.includes(c) && !isWater(c, r)) set(c, r, "P");
  }
  set(crashAt.col, crashAt.row, "P");
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const c = crashAt.col + dc;
    const r = crashAt.row + dr;
    if (inB(c, r) && !isWater(c, r) && !inCitadel(c, r) && rng() < 0.5) set(c, r, "D");
  }
  let pagodaAt = null;
  if (!bridges.length) {
    pagodaAt = pickTile(0, W - 1, wallRow + 2, H - 3, (p) => !isStreet(p.col, p.row) && dist(p, marketAt) >= 3);
    if (!pagodaAt) return null;
    set(pagodaAt.col, pagodaAt.row, "T");
  }

  // 6. Crateri d'artiglieria (uno per mappa piccola): edifici attorno ridotti in macerie
  for (let i = 0, n = Math.round(area); i < n; i++) {
    const craterAt = pickTile(0, W - 1, 0, H - 2, (p) => !inCitadel(p.col, p.row));
    if (!craterAt) continue;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (get(craterAt.col + dc, craterAt.row + dr) === "B" && rng() < 0.7)
          set(craterAt.col + dc, craterAt.row + dr, "D");
      }
    }
  }

  // 7. Partenza sul bordo sud (la riga H-1 è sempre strada), lontano dall'acqua
  const startCols = [];
  for (let c = 1; c + 3 <= W - 2; c++) {
    let dry = true;
    for (let i = -1; i <= 4; i++) if (isWater(c + i, H - 1) || isWater(c + i, H - 2)) dry = false;
    if (dry) startCols.push(c);
  }
  if (!startCols.length) return null;
  const sc = rpick(startCols);
  const playerStart = [0, 1, 2, 3].map((i) => ({ col: sc + i, row: H - 1 }));
  const extract = { col: sc + 1, row: H - 1 };

  // 8. Verifica: ogni tile percorribile raggiungibile dalla partenza, e
  //    almeno due corridoi distinti verso comando, mercato e relitto
  if (!_allReachable(grid, URBAN_TILE_TYPES, extract)) return null;
  for (const goal of [hqAt, marketAt, crashAt]) {
    if (_corridorCount(grid, URBAN_TILE_TYPES, extract, goal, 2) < 2) return null;
  }

  // 9. Dal sistema canonico al bordo di partenza estratto
  const toMap = (p) => {
    const c = mirror ? W - 1 - p.col : p.col;
    const r = p.row;
    if (edge === "N") return { col: c, row: H - 1 - r };
    if (edge === "W") return { col: H - 1 - r, row: c };
    if (edge === "E") return { col: r, row: c };
    return { col: c, row: r };
  };
  const zone = (colMin, colMax, rowMin, rowMax) => {
    const a = toMap({ col: colMin, row: rowMin });
    const b = toMap({ col: colMax, row: rowMax });
    return {
      colMin: Math.min(a.col, b.col),
      colMax: Math.max(a.col, b.col),
      rowMin: Math.min(a.row, b.row),
      rowMax: Math.max(a.row, b.row),
    };
  };
  const cols = edge === "W" || edge === "E" ? H : W;
  const rows = edge === "W" || edge === "E" ? W : H;
  const mapGrid = Array.from({ length: rows }, () => Array(cols));
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const p = toMap({ col: c, row: r });
      mapGrid[p.row][p.col] = grid[r][c];
    }
  }
  const hq = toMap(hqAt);
  const crash = toMap(crashAt);
  const ex = toMap(extract);
  const pilot = toMap(_pilotSite(grid, URBAN_TILE_TYPES, extract, crashAt, seed, isWater));
  const reconFirst = bridges.length ? toMap(rpick(bridges)) : toMap(pagodaAt);

  const { it, en } = _procTranslations(
    URBAN_TEXT,
    seed,
    [bridges.length ? "bridge" : "pagoda", "market", "hq"],
    "hq",
    layout,
  );

  return {
    procedural: "urban",
    seed,
    size,
    layout,
    startEdge: edge,
    name: en.name,
    description: en.description,
    tileSize: TILE,
    cols,
    rows,
    tileTypes: JSON.parse(JSON.stringify(URBAN_TILE_TYPES)),
    grid: mapGrid,
    playerStart: playerStart.map(toMap),
    vcSpawnZones: [
      zone(0, W - 1, 0, wallRow),
      zone(0, W - 1, wallRow + 1, H - 4),
    ],
    vcCount: ri(7, 9) + 3 * step,
    trapCount: Math.round(3 * area),
    objectives: {
      recon: [
        { ...reconFirst, label: it.objectives.recon[0].label },
        { ...toMap(marketAt), label: it.objectives.recon[1].label },
        { ...hq, label: it.objectives.recon[2].label },
      ],
      search_destroy: { eliminateAll: false, minKills: 5 + 2 * step },
      rescue_pilot: {
        pilotCol: pilot.col,
        pilotRow: pilot.row,
        extractCol: ex.col,
        extractRow: ex.row,
        tileAnimations: [{ col: pilot.col, row: pilot.row, type: "smoke" }],
      },
      capture_objective: [{ ...hq, label: it.objectives.capture_objective[0].label, holdTurns: 2 }],
    },
    supportedMissions: ["recon", "search_destroy", "rescue_pilot", "capture_objective"],
    ambient: "missions/hue_city_ambient.ogg",
    // Meteo (solo visivo): acquazzoni casuali
    rain: { chance: 0.2, minTurns: 2, maxTurns: 4 },
    ambushChance: 0.2,
    reinforcementTurn: 4,
    reinforcementCount: step ? 3 : 2,
    vcAmbushTurn: ri(3, 4) + step,
    vcAmbushCount: 2 + step,
    vcAmbushZones: [
      zone(0, 1, Math.floor(H / 2), H - 2),
      zone(W - 2, W - 1, Math.floor(H / 2), H - 2),
    ],
    translations: { it, en },
  };
}

const MAP_GENERATORS = {
  jungle: generateJungleMap,
  urban: generateUrbanMap,
};
