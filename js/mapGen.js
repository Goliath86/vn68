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
        pilotCol: lz.col,
        pilotRow: lz.row,
        extractCol: ex.col,
        extractRow: ex.row,
        tileAnimations: [{ col: lz.col, row: lz.row, type: "smoke" }],
      },
      capture_objective: [{ ...toMap(radioAt), label: it.objectives.capture_objective[0].label, holdTurns: 2 }],
    },
    supportedMissions: ["recon", "search_destroy", "rescue_pilot", "capture_objective"],
    ambient: "missions/rung_sat_ambient.mp3",
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

function generateUrbanMap(seed, size = "small") {
  return _generateWithRetries(_buildUrbanMap, seed, size);
}

function _buildUrbanMap(seed, attempt, size) {
  const rng = _mulberry32(seed * 103 + attempt);
  const { W, H, step, sx, sy, area } = _procScale(size);
  const ri = (min, max) => min + Math.floor(rng() * (max - min + 1));
  const rpick = (arr) => arr[Math.floor(rng() * arr.length)];
  const grid = Array.from({ length: H }, () => Array(W).fill("U"));
  const inB = (c, r) => c >= 0 && r >= 0 && c < W && r < H;
  const get = (c, r) => (inB(c, r) ? grid[r][c] : null);
  const set = (c, r, k) => {
    if (inB(c, r)) grid[r][c] = k;
  };

  // 1. Fiume da ovest a est con lievi anse (righe rb..rb+1), 4-connesso
  const rb = ri(sy(5), sy(6));
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
  // Strade trasversali ogni 3 righe dove c'è spazio per gli isolati
  const streetRows = [northRoad, southRoad, H - 1];
  for (let r = southRoad + 2; r <= H - 3; r += 3) streetRows.push(r);
  for (let r = 2; r <= wallRow - 2; r += 3) streetRows.push(r);
  const isStreet = (c, r) => avenues.includes(c) || streetRows.includes(r);
  const BLOCK_KINDS = {
    dense: [["B", 0.7], ["D", 0.1], ["U", 0.1], ["G", 0.1]],
    park: [["G", 0.6], ["P", 0.25], ["T", 0.15]],
    ruined: [["D", 0.5], ["B", 0.3], ["U", 0.2]],
  };
  const weighted = (table) => _weighted(rng, table);
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
  const westAv = avenues.filter((c) => c >= sx(2) && c <= sx(6));
  const eastAv = avenues.filter((c) => c >= sx(9) && c <= sx(13));
  if (!westAv.length || !eastAv.length) return null;
  const bridgeCols = [rpick(westAv), rpick(eastAv)];
  // Mappe più grandi: un terzo ponte su un viale centrale
  if (step) {
    const midAv = avenues.filter((c) => c > bridgeCols[0] + 2 && c < bridgeCols[1] - 2);
    if (midAv.length) bridgeCols.push(rpick(midAv));
  }
  const bridges = bridgeCols.map((c) => {
    for (let r = riverRows[c][0]; r <= riverRows[c][1]; r++) set(c, r, "F");
    return { col: c, row: riverRows[c][0] };
  });

  // 4. Cittadella murata a nord del fiume: porta sul lato sud, brecce
  //    demolibili, pagode e giardini attorno al comando NVA
  const cw = ri(sx(7), sx(9));
  const cx0 = ri(sx(3), W - cw - sx(3));
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
  for (let i = 0, n = ri(1, 2 + step); i < n && breachCols.length; i++) {
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
    size,
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
    vcCount: ri(7, 9) + 3 * step,
    trapCount: Math.round(3 * area),
    objectives: {
      recon: [
        { ...reconBridge, label: it.objectives.recon[0].label },
        { ...marketAt, label: it.objectives.recon[1].label },
        { ...hqAt, label: it.objectives.recon[2].label },
      ],
      search_destroy: { eliminateAll: false, minKills: 5 + 2 * step },
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
    reinforcementCount: step ? 3 : 2,
    vcAmbushTurn: ri(3, 4) + step,
    vcAmbushCount: 2 + step,
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
