// ── TILE TEXTURE DETAILS ───────────────────────────────────────────────
// Disegnati una sola volta nella cache del terreno (render.js:getTerrainCache),
// quindi possono essere ricchi. Usano solo velature chiare/scure sopra il
// `color` del JSON missione, così la tinta resta config-driven. Variazione
// deterministica per tile (seed da col/row); i pattern continui (mattoni,
// onde, lastricato) usano coordinate di mondo per combaciare tra tile vicini.
const _dk = (a) => `rgba(0,0,0,${a.toFixed(3)})`;
const _lt = (a) => `rgba(255,255,255,${a.toFixed(3)})`;

function _tileRng(col, row) {
  const seed = col * 73.13 + row * 151.71;
  let i = 0;
  return () => _hash01(seed + i++ * 17.31);
}

// Velatura con segno: t in [-0.5, 0.5] → scura se negativo, chiara se positivo
function _tint(t, dark, light) {
  return t < 0 ? _dk(-t * dark) : _lt(t * light);
}

function _disc(ctx, cx, cy, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function _oval(ctx, cx, cy, rx, ry, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function _grain(ctx, x, y, ts, rng, n, a) {
  for (let i = 0; i < n; i++) {
    const s = ts * (0.012 + rng() * 0.022);
    ctx.fillStyle = rng() < 0.55 ? _dk(a) : _lt(a * 0.7);
    ctx.fillRect(x + rng() * ts, y + rng() * ts, s, s);
  }
}

function _crack(ctx, x, y, ts, rng, a) {
  let px = x + ts * (0.15 + rng() * 0.7);
  let py = y + ts * (0.15 + rng() * 0.7);
  let ang = rng() * Math.PI * 2;
  ctx.strokeStyle = _dk(a);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(px, py);
  for (let i = 0; i < 5; i++) {
    ang += (rng() - 0.5) * 1.4;
    px += Math.cos(ang) * ts * 0.09;
    py += Math.sin(ang) * ts * 0.09;
    ctx.lineTo(px, py);
  }
  ctx.stroke();
}

const GRASS_LIGHT = "rgba(150,200,90,0.35)";
const GRASS_DARK = _dk(0.22);
// Se impostato (render.js:getTerrainCache con il vento attivo), i fili d'erba
// non vengono disegnati ma raccolti qui, per animarli a ogni fotogramma
// (animations.js:renderWindGrass). Stessa sequenza di rng in entrambi i casi.
let _grassSink = null;

function _grass(ctx, x, y, ts, rng, n) {
  ctx.lineWidth = 0.8;
  ctx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const gx = x + rng() * ts;
    const gy = y + rng() * ts;
    const l = ts * (0.05 + rng() * 0.06);
    const light = rng() < 0.6;
    const lean = (rng() - 0.5) * l * 0.8;
    if (_grassSink) {
      _grassSink.push({ x: gx, y: gy, l, lean, light });
      continue;
    }
    ctx.strokeStyle = light ? GRASS_LIGHT : GRASS_DARK;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + lean, gy - l);
    ctx.stroke();
  }
}

// Chioma/cespuglio a strati: ombra → base → lobi → luce
function _foliage(ctx, cx, cy, r, rng, cols, shadow = true) {
  if (shadow) _disc(ctx, cx + r * 0.25, cy + r * 0.35, r * 1.05, _dk(0.32));
  _disc(ctx, cx, cy, r, cols[0]);
  for (let i = 0; i < 5; i++) {
    const a = rng() * Math.PI * 2;
    _disc(ctx, cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45, r * (0.4 + rng() * 0.2), cols[1]);
  }
  _disc(ctx, cx - r * 0.3, cy - r * 0.35, r * 0.4, cols[2]);
}

// Mattoni allineati al mondo: le mura di più tile formano un'unica tessitura
function _tdBricks(ctx, x, y, ts, rng, cracked) {
  const bh = ts / 6;
  const bw = ts / 3;
  for (let k = 0; k < 6; k++) {
    const by = y + k * bh;
    const course = Math.round(by / bh);
    const off = course % 2 ? bw / 2 : 0;
    for (let bx = Math.floor((x - off) / bw) * bw + off; bx < x + ts; bx += bw) {
      const t = _hash01(Math.floor(bx / bw + 0.01) * 31.7 + course * 131.3) - 0.5;
      ctx.fillStyle = _tint(t, 0.3, 0.14);
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = _lt(0.07);
      ctx.fillRect(bx, by, bw, bh * 0.2);
      ctx.fillStyle = _dk(0.42); // giunti di malta
      ctx.fillRect(bx, by + bh - 0.8, bw, 0.8);
      ctx.fillRect(bx + bw - 0.8, by, 0.8, bh);
    }
  }
  _grain(ctx, x, y, ts, rng, 10, 0.12);
  // macchie di umidità
  for (let i = 0; i < 2; i++) {
    if (rng() < 0.5) continue;
    _oval(ctx, x + rng() * ts, y + rng() * ts, ts * (0.1 + rng() * 0.12), ts * (0.06 + rng() * 0.06), _dk(0.1));
  }
  if (!cracked) return;
  // muro demolibile: scheggiature e crepe passanti
  for (let i = 0; i < 3; i++) {
    const hx = x + ts * (0.1 + rng() * 0.65);
    const hy = y + ts * (0.1 + rng() * 0.65);
    ctx.fillStyle = _dk(0.5);
    ctx.fillRect(hx, hy, bw * (0.4 + rng() * 0.4), bh * 0.8);
  }
  ctx.lineWidth = 1.2;
  for (let k = 0; k < 2; k++) {
    let px = x + ts * (0.3 + rng() * 0.4);
    let py = y;
    ctx.strokeStyle = _dk(0.65);
    ctx.beginPath();
    ctx.moveTo(px, py);
    while (py < y + ts) {
      px += (rng() - 0.5) * ts * 0.25;
      py += ts * (0.1 + rng() * 0.12);
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}

function _tdBuilding(ctx, x, y, ts, rng) {
  const p = ts * 0.08;
  const w = ts - p * 2;
  ctx.fillStyle = _dk(0.4); // ombra proiettata a terra
  ctx.fillRect(x + p + ts * 0.05, y + p + ts * 0.06, w, w);

  if (rng() < 0.3) {
    // tetto piano: parapetto, vano scala, cisterna
    ctx.fillStyle = _lt(0.05);
    ctx.fillRect(x + p, y + p, w, w);
    _grain(ctx, x + p, y + p, w, rng, 18, 0.1);
    ctx.strokeStyle = _dk(0.5);
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x + p + 1.25, y + p + 1.25, w - 2.5, w - 2.5);
    ctx.strokeStyle = _lt(0.14);
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x + p + 0.4, y + p + 0.4, w - 0.8, w - 0.8);
    const bs = w * 0.24;
    const bx = x + p + w * (0.12 + rng() * 0.3);
    const by = y + p + w * (0.12 + rng() * 0.3);
    ctx.fillStyle = _dk(0.35);
    ctx.fillRect(bx + 2, by + 2, bs, bs);
    ctx.fillStyle = _lt(0.16);
    ctx.fillRect(bx, by, bs, bs);
    const r = w * 0.1;
    const tx = x + p + w * (0.62 + rng() * 0.18);
    const ty = y + p + w * (0.62 + rng() * 0.18);
    _disc(ctx, tx + 1.5, ty + 1.5, r, _dk(0.35));
    _disc(ctx, tx, ty, r, _lt(0.12));
    _disc(ctx, tx - r * 0.3, ty - r * 0.3, r * 0.4, _lt(0.12));
    return;
  }

  // tetto a falde in coppi, colmo orizzontale o verticale
  const h = w / 2;
  ctx.save();
  ctx.translate(x + ts / 2, y + ts / 2);
  if (rng() < 0.5) ctx.rotate(Math.PI / 2);
  ctx.fillStyle = _lt(0.13);
  ctx.fillRect(-h, -h, w, h);
  ctx.fillStyle = _dk(0.16);
  ctx.fillRect(-h, 0, w, h);
  const n = 8;
  const step = w / n;
  ctx.lineWidth = 0.6;
  for (let i = 0; i < n; i++) {
    const ly = -h + i * step;
    ctx.strokeStyle = _dk(0.22);
    ctx.beginPath();
    ctx.moveTo(-h, ly);
    ctx.lineTo(h, ly);
    ctx.stroke();
    ctx.strokeStyle = _dk(0.1);
    ctx.beginPath();
    for (let lx = -h + ((i % 2) * 0.5 + 0.5) * (w / 7); lx < h; lx += w / 7) {
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx, ly + step);
    }
    ctx.stroke();
  }
  ctx.fillStyle = _dk(0.3);
  ctx.fillRect(-h, 1, w, 1);
  ctx.fillStyle = _lt(0.24); // colmo
  ctx.fillRect(-h, -1.2, w, 2.4);
  for (let i = 0; i < 2; i++) {
    _oval(ctx, (rng() - 0.5) * w * 0.7, (rng() - 0.5) * w * 0.7, w * (0.08 + rng() * 0.1), w * 0.06, _dk(0.1));
  }
  ctx.restore();
  ctx.strokeStyle = _dk(0.5);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + p, y + p, w, w);
}

// Tetto a padiglione a più ordini, finiture dorate
function _tdTemple(ctx, x, y, ts, rng) {
  const cx = x + ts / 2;
  const cy = y + ts / 2;
  const gold = (a) => `rgba(255,210,110,${a})`;
  ctx.fillStyle = _dk(0.35);
  ctx.fillRect(x + ts * 0.1, y + ts * 0.12, ts * 0.86, ts * 0.86);
  for (const [hs, a] of [
    [0.44, 0.4],
    [0.3, 0.45],
    [0.16, 0.55],
  ]) {
    const h = ts * hs;
    if (hs < 0.44) {
      ctx.fillStyle = _dk(0.3);
      ctx.fillRect(cx - h + 1.5, cy - h + 2, h * 2, h * 2);
    }
    for (const [pts, fill] of [
      [[[-h, -h], [h, -h]], _lt(0.16)],
      [[[-h, -h], [-h, h]], _lt(0.06)],
      [[[h, -h], [h, h]], _dk(0.1)],
      [[[-h, h], [h, h]], _dk(0.2)],
    ]) {
      ctx.fillStyle = fill;
      _poly(ctx, [...pts, [0, 0]].map(([px, py]) => [cx + px, cy + py]));
      ctx.fill();
    }
    ctx.strokeStyle = gold(a * 0.6);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.moveTo(cx + sx * h, cy + sy * h);
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    ctx.strokeStyle = gold(a);
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - h, cy - h, h * 2, h * 2);
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.beginPath(); // angoli rialzati
      ctx.arc(cx + sx * h, cy + sy * h, ts * 0.025, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  _disc(ctx, cx, cy, ts * 0.035, gold(0.8));
  _disc(ctx, cx - ts * 0.01, cy - ts * 0.01, ts * 0.012, _lt(0.5));
}

// Masso irregolare: ombra a terra, corpo, faccia in luce a nord-ovest, muschio
function _rock(ctx, cx, cy, r, rng) {
  const a0 = rng() * Math.PI * 2;
  const pts = [];
  for (let k = 0; k < 8; k++) {
    const a = a0 + (k / 8) * Math.PI * 2;
    const rr = r * (0.75 + rng() * 0.3);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.8]);
  }
  const at = (s, ox, oy) => pts.map(([px, py]) => [cx + px * s + ox, cy + py * s + oy]);
  ctx.fillStyle = _dk(0.4);
  _poly(ctx, at(1, r * 0.25, r * 0.3));
  ctx.fill();
  const g = Math.round(105 + rng() * 30);
  ctx.fillStyle = `rgb(${g},${g - 4},${g - 14})`;
  _poly(ctx, at(1, 0, 0));
  ctx.fill();
  ctx.fillStyle = _dk(0.22); // lato in ombra
  _poly(ctx, at(0.75, r * 0.2, r * 0.18));
  ctx.fill();
  ctx.fillStyle = _lt(0.18); // faccia in luce
  _poly(ctx, at(0.55, -r * 0.22, -r * 0.2));
  ctx.fill();
  if (rng() < 0.7) _oval(ctx, cx - r * 0.15, cy - r * 0.35, r * 0.35, r * 0.18, "rgba(80,120,40,0.55)");
  if (rng() < 0.5) {
    ctx.strokeStyle = _dk(0.4);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.1, cy - r * 0.5);
    ctx.lineTo(cx + r * 0.05, cy - r * 0.05);
    ctx.lineTo(cx - r * 0.05, cy + r * 0.4);
    ctx.stroke();
  }
}

// Tronco abbattuto: ombra, corteccia, riflesso, nervature, sezione con anelli
function _log(ctx, x1, y1, x2, y2, w, rng) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const line = (ox, oy) => {
    ctx.beginPath();
    ctx.moveTo(x1 + ox, y1 + oy);
    ctx.lineTo(x2 + ox, y2 + oy);
    ctx.stroke();
  };
  ctx.lineCap = "round";
  ctx.strokeStyle = _dk(0.4);
  ctx.lineWidth = w;
  line(w * 0.25, w * 0.35);
  ctx.strokeStyle = `rgb(${88 + Math.round(rng() * 20)},64,40)`;
  line(0, 0);
  ctx.strokeStyle = _dk(0.25); // metà in ombra
  ctx.lineWidth = w * 0.45;
  line(Math.sin(ang) * -w * 0.22, Math.cos(ang) * w * 0.22);
  ctx.strokeStyle = _lt(0.14);
  ctx.lineWidth = w * 0.18;
  line(Math.sin(ang) * w * 0.22, -Math.cos(ang) * w * 0.22);
  // nervature della corteccia
  ctx.strokeStyle = _dk(0.35);
  ctx.lineWidth = 0.7;
  const len = Math.hypot(x2 - x1, y2 - y1);
  for (let i = 0; i < 7; i++) {
    const t = 0.1 + rng() * 0.8;
    const o = (rng() - 0.5) * w * 0.7;
    const px = x1 + (x2 - x1) * t + Math.sin(ang) * -o;
    const py = y1 + (y2 - y1) * t + Math.cos(ang) * o;
    const l = len * (0.05 + rng() * 0.08);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(ang) * l, py + Math.sin(ang) * l);
    ctx.stroke();
  }
  // sezione del taglio all'estremità
  ctx.save();
  ctx.translate(x2, y2);
  ctx.rotate(ang);
  _oval(ctx, 0, 0, w * 0.22, w * 0.5, "rgb(185,150,100)");
  ctx.strokeStyle = "rgba(120,85,50,0.7)";
  ctx.lineWidth = 0.6;
  for (const s of [0.3, 0.6]) {
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.22 * s, w * 0.5 * s, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  if (rng() < 0.6) {
    const t = 0.2 + rng() * 0.5;
    _oval(ctx, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, w * 0.35, w * 0.22, "rgba(80,120,40,0.55)"); // muschio
  }
}

// Ostacolo naturale (diventa radura se demolito): sottobosco + massi o tronchi
function _tdObstacle(ctx, x, y, ts, rng) {
  ctx.fillStyle = "rgb(78,92,45)";
  ctx.fillRect(x, y, ts, ts);
  _grain(ctx, x, y, ts, rng, 14, 0.12);
  _grass(ctx, x, y, ts, rng, 16);
  if (rng() < 0.5) {
    const rocks = [[x + ts * (0.42 + rng() * 0.16), y + ts * (0.42 + rng() * 0.16), ts * (0.24 + rng() * 0.06)]];
    const n = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const d = ts * (0.24 + rng() * 0.1);
      rocks.push([rocks[0][0] + Math.cos(a) * d, rocks[0][1] + Math.sin(a) * d, ts * (0.07 + rng() * 0.08)]);
    }
    rocks.sort((p, q) => p[1] - q[1]);
    for (const [cx, cy, r] of rocks) _rock(ctx, cx, cy, r, rng);
  } else {
    const a = rng() * Math.PI;
    const cx = x + ts / 2;
    const cy = y + ts / 2;
    const l = ts * 0.38;
    _log(ctx, cx - Math.cos(a) * l, cy - Math.sin(a) * l, cx + Math.cos(a) * l, cy + Math.sin(a) * l, ts * 0.17, rng);
    // secondo tronco accatastato di traverso, più corto
    const b = a + Math.PI / 2 + (rng() - 0.5) * 0.8;
    const l2 = ts * 0.28;
    const ox = (rng() - 0.5) * ts * 0.2;
    _log(ctx, cx + ox - Math.cos(b) * l2, cy - Math.sin(b) * l2, cx + ox + Math.cos(b) * l2, cy + Math.sin(b) * l2, ts * 0.13, rng);
    if (rng() < 0.6) _rock(ctx, x + ts * (0.15 + rng() * 0.7), y + ts * (0.75 + rng() * 0.1), ts * 0.08, rng);
  }
}

function _tdGarden(ctx, x, y, ts, rng) {
  _grass(ctx, x, y, ts, rng, 30);
  const n = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    _foliage(ctx, x + ts * (0.2 + rng() * 0.6), y + ts * (0.2 + rng() * 0.6), ts * (0.1 + rng() * 0.08), rng, [
      "rgba(40,85,25,0.85)",
      "rgba(70,130,40,0.6)",
      "rgba(160,215,100,0.3)",
    ]);
  }
  const flowers = ["rgba(240,200,80,0.8)", "rgba(240,120,140,0.75)", "rgba(255,255,255,0.7)"];
  for (let i = 0; i < 6; i++) {
    if (rng() < 0.4) continue;
    _disc(ctx, x + rng() * ts, y + rng() * ts, ts * 0.018, flowers[Math.floor(rng() * flowers.length)]);
  }
}

function _tdClearing(ctx, x, y, ts, rng) {
  _grain(ctx, x, y, ts, rng, 12, 0.08);
  _grass(ctx, x, y, ts, rng, 26);
  if (rng() < 0.3) {
    _foliage(ctx, x + ts * (0.2 + rng() * 0.6), y + ts * (0.2 + rng() * 0.6), ts * 0.08, rng, [
      "rgba(45,90,28,0.8)",
      "rgba(75,135,42,0.55)",
      "rgba(160,215,100,0.28)",
    ]);
  }
}

// Solo il sottobosco: le chiome sono una passata a parte senza clip
// (drawJungleCanopy), così sporgono dal tile e la giungla non ha bordi quadrati
function _tdJungle(ctx, x, y, ts, rng) {
  ctx.fillStyle = _dk(0.25); // sottobosco in ombra
  ctx.fillRect(x, y, ts, ts);
  _grass(ctx, x, y, ts, rng, 10);
}

function _tdSwamp(ctx, x, y, ts, rng) {
  _grain(ctx, x, y, ts, rng, 10, 0.1);
  const pools = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < pools; i++) {
    const px = x + ts * (0.15 + rng() * 0.7);
    const py = y + ts * (0.15 + rng() * 0.7);
    const rx = ts * (0.1 + rng() * 0.12);
    _oval(ctx, px, py, rx, rx * 0.6, "rgba(15,40,45,0.5)");
    ctx.strokeStyle = _lt(0.15);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(px, py, rx, rx * 0.6, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
  ctx.lineWidth = 0.9;
  ctx.lineCap = "round";
  for (let c = 0; c < 3; c++) {
    const bx = x + ts * (0.1 + rng() * 0.8);
    const by = y + ts * (0.25 + rng() * 0.7);
    for (let i = 0; i < 5; i++) {
      const tx = bx + (rng() - 0.5) * ts * 0.12;
      const ty = by - ts * (0.08 + rng() * 0.1);
      ctx.strokeStyle = "rgba(160,180,80,0.55)";
      ctx.beginPath();
      ctx.moveTo(bx + (rng() - 0.5) * ts * 0.03, by);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      if (rng() < 0.4) _oval(ctx, tx, ty, ts * 0.01, ts * 0.025, "rgba(110,80,40,0.7)");
    }
  }
}

// Onde continue tra tile adiacenti (fase per riga del mondo) + riflessi
function _tdRiver(ctx, x, y, ts, rng, alpha = 1) {
  const wr = Math.round(y / ts);
  ctx.lineWidth = 1;
  for (let k = 0; k < 5; k++) {
    const base = y + ((k + 0.5) * ts) / 5;
    const ph = _hash01(wr * 7.7 + k * 3.1) * Math.PI * 2;
    const freq = (Math.PI * 2) / (ts * (0.8 + _hash01(k * 5.3 + wr) * 0.6));
    ctx.strokeStyle = k % 2 ? _dk(0.14 * alpha) : `rgba(150,210,255,${0.2 * alpha})`;
    ctx.beginPath();
    for (let wx = x; wx <= x + ts; wx += 2) {
      const wy = base + Math.sin(wx * freq + ph) * ts * 0.025;
      if (wx === x) ctx.moveTo(wx, wy);
      else ctx.lineTo(wx, wy);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const gx = x + rng() * ts;
    const gy = y + rng() * ts;
    ctx.strokeStyle = _lt((0.25 + rng() * 0.25) * alpha);
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + ts * (0.05 + rng() * 0.07), gy);
    ctx.stroke();
  }
}

// Impalcato di assi con parapetti laterali (attraversamento verticale)
function _tdBridge(ctx, x, y, ts, rng) {
  const rail = ts * 0.11;
  const n = 8;
  const ph = ts / n;
  for (let i = 0; i < n; i++) {
    const py = y + i * ph;
    const t = _hash01(Math.round(py / ph) * 13.7 + Math.round(x / ts) * 5.1) - 0.5;
    ctx.fillStyle = _tint(t, 0.3, 0.16);
    ctx.fillRect(x + rail, py, ts - rail * 2, ph);
    ctx.fillStyle = _dk(0.1); // venatura
    ctx.fillRect(x + rail + ts * rng() * 0.3, py + ph * (0.3 + rng() * 0.4), ts * (0.2 + rng() * 0.3), 0.6);
    ctx.fillStyle = _dk(0.45);
    ctx.fillRect(x + rail, py + ph - 1, ts - rail * 2, 1);
    _disc(ctx, x + rail + ts * 0.05, py + ph / 2, 0.8, _dk(0.5));
    _disc(ctx, x + ts - rail - ts * 0.05, py + ph / 2, 0.8, _dk(0.5));
  }
  for (const sx of [x, x + ts - rail]) {
    ctx.fillStyle = _dk(0.35);
    ctx.fillRect(sx, y, rail, ts);
    ctx.fillStyle = _lt(0.14);
    ctx.fillRect(sx, y, rail * 0.35, ts);
    for (const py of [y, y + ts / 2]) {
      ctx.fillStyle = _dk(0.5);
      ctx.fillRect(sx - rail * 0.05, py - rail * 0.3, rail * 1.1, rail * 0.6);
    }
  }
}

function _tdFord(ctx, x, y, ts, rng) {
  _tdRiver(ctx, x, y, ts, rng, 0.7);
  for (let i = 0; i < 5; i++) {
    const sx = x + ts * (0.2 + rng() * 0.6);
    const sy = y + ts * (0.1 + i * 0.2);
    const r = ts * (0.05 + rng() * 0.03);
    _oval(ctx, sx + 1.5, sy + 1.5, r, r * 0.75, _dk(0.35));
    _oval(ctx, sx, sy, r, r * 0.75, "rgba(170,160,140,0.6)");
    _oval(ctx, sx - r * 0.3, sy - r * 0.25, r * 0.4, r * 0.3, _lt(0.2));
  }
}

function _tdStreet(ctx, x, y, ts, rng) {
  _grain(ctx, x, y, ts, rng, 40, 0.1);
  if (rng() < 0.45) _crack(ctx, x, y, ts, rng, 0.35);
  if (rng() < 0.3) {
    const r = ts * (0.08 + rng() * 0.07);
    _oval(ctx, x + ts * (0.2 + rng() * 0.6), y + ts * (0.2 + rng() * 0.6), r, r * 0.6, _dk(0.16));
  }
  if (rng() < 0.2) {
    const px = x + ts * (0.2 + rng() * 0.6);
    const py = y + ts * (0.2 + rng() * 0.6);
    const r = ts * (0.05 + rng() * 0.04);
    _oval(ctx, px, py + r * 0.15, r, r * 0.7, _lt(0.1));
    _oval(ctx, px, py, r, r * 0.65, _dk(0.4));
  }
}

function _tdPavers(ctx, x, y, ts, rng, n = 4) {
  const s = ts / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const px = x + i * s;
      const py = y + j * s;
      const t = _hash01(Math.round(px / s) * 17.3 + Math.round(py / s) * 41.9) - 0.5;
      ctx.fillStyle = _tint(t, 0.22, 0.14);
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = _lt(0.06);
      ctx.fillRect(px, py, s, s * 0.15);
      ctx.fillStyle = _dk(0.3);
      ctx.fillRect(px, py + s - 0.7, s, 0.7);
      ctx.fillRect(px + s - 0.7, py, 0.7, s);
    }
  }
  _grain(ctx, x, y, ts, rng, 12, 0.08);
  if (rng() < 0.35) {
    const px = x + Math.floor(rng() * n) * s;
    const py = y + Math.floor(rng() * n) * s;
    ctx.strokeStyle = _dk(0.35);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(px + s * 0.1, py + s * (0.2 + rng() * 0.3));
    ctx.lineTo(px + s * 0.5, py + s * 0.5);
    ctx.lineTo(px + s * 0.9, py + s * (0.5 + rng() * 0.3));
    ctx.stroke();
  }
}

function _tdDebris(ctx, x, y, ts, rng) {
  for (let i = 0; i < 3; i++) {
    _oval(ctx, x + rng() * ts, y + rng() * ts, ts * (0.15 + rng() * 0.15), ts * (0.1 + rng() * 0.1), _lt(0.06));
  }
  _grain(ctx, x, y, ts, rng, 30, 0.15);
  ctx.lineCap = "round";
  for (let i = 0; i < 1 + Math.floor(rng() * 2); i++) {
    // travi spezzate
    const bx = x + ts * (0.2 + rng() * 0.6);
    const by = y + ts * (0.2 + rng() * 0.6);
    const a = rng() * Math.PI;
    const l = ts * (0.2 + rng() * 0.15);
    ctx.strokeStyle = "rgba(55,38,22,0.75)";
    ctx.lineWidth = ts * 0.045;
    ctx.beginPath();
    ctx.moveTo(bx - Math.cos(a) * l, by - Math.sin(a) * l);
    ctx.lineTo(bx + Math.cos(a) * l, by + Math.sin(a) * l);
    ctx.stroke();
    ctx.strokeStyle = _lt(0.1);
    ctx.lineWidth = ts * 0.012;
    ctx.stroke();
  }
  const tones = ["rgba(150,75,55,0.65)", "rgba(150,135,115,0.6)", "rgba(95,85,75,0.7)"];
  for (let i = 0; i < 12; i++) {
    const cx = x + ts * (0.1 + rng() * 0.8);
    const cy = y + ts * (0.1 + rng() * 0.8);
    const r = ts * (0.035 + rng() * 0.055);
    const a0 = rng() * Math.PI * 2;
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = a0 + (k / 6) * Math.PI * 2;
      const rr = r * (0.6 + rng() * 0.5);
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    ctx.fillStyle = _dk(0.4);
    _poly(ctx, pts.map(([px, py]) => [cx + px + r * 0.3, cy + py + r * 0.35]));
    ctx.fill();
    ctx.fillStyle = tones[Math.floor(rng() * tones.length)];
    _poly(ctx, pts.map(([px, py]) => [cx + px, cy + py]));
    ctx.fill();
    ctx.fillStyle = _lt(0.15);
    _poly(ctx, pts.map(([px, py]) => [cx + px * 0.5 - r * 0.2, cy + py * 0.5 - r * 0.2]));
    ctx.fill();
  }
}

// Segnale dell'obiettivo (TILE_OBJECTS): il fondo è il lastricato
function _objectiveMarker(ctx, x, y, ts) {
  ctx.strokeStyle = "rgba(255,200,30,0.55)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x + ts * 0.5, y + ts * 0.5, ts * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + ts * 0.5, y + ts * 0.08);
  ctx.lineTo(x + ts * 0.5, y + ts * 0.32);
  ctx.moveTo(x + ts * 0.5, y + ts * 0.68);
  ctx.lineTo(x + ts * 0.5, y + ts * 0.92);
  ctx.moveTo(x + ts * 0.08, y + ts * 0.5);
  ctx.lineTo(x + ts * 0.32, y + ts * 0.5);
  ctx.moveTo(x + ts * 0.68, y + ts * 0.5);
  ctx.lineTo(x + ts * 0.92, y + ts * 0.5);
  ctx.stroke();
  _disc(ctx, x + ts * 0.5, y + ts * 0.5, ts * 0.06, "rgba(255,200,30,0.55)");
}

// Sentiero sinuoso che entra ed esce a metà dei lati alto/basso
function _tdTrail(ctx, x, y, ts, rng) {
  _grass(ctx, x, y, ts, rng, 14);
  const c1 = x + ts * (0.25 + rng() * 0.5);
  const c2 = x + ts * (0.25 + rng() * 0.5);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(x + ts / 2, y);
    ctx.bezierCurveTo(c1, y + ts * 0.33, c2, y + ts * 0.66, x + ts / 2, y + ts);
  };
  ctx.lineCap = "butt";
  path();
  ctx.strokeStyle = "rgba(150,120,80,0.4)";
  ctx.lineWidth = ts * 0.32;
  ctx.stroke();
  ctx.strokeStyle = "rgba(170,140,95,0.25)";
  ctx.lineWidth = ts * 0.2;
  ctx.stroke();
  ctx.strokeStyle = _dk(0.14);
  ctx.lineWidth = 1;
  ctx.setLineDash([ts * 0.06, ts * 0.05]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function _hut(ctx, cx, cy, w, h, rng) {
  ctx.fillStyle = _dk(0.35);
  ctx.fillRect(cx - w / 2 + w * 0.08, cy - h / 2 + h * 0.12, w, h);
  ctx.fillStyle = "rgba(190,150,80,0.75)"; // paglia
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.fillStyle = _dk(0.18);
  ctx.fillRect(cx - w / 2, cy, w, h / 2);
  ctx.strokeStyle = "rgba(90,60,25,0.35)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let i = 0; i < 22; i++) {
    const tx = cx - w / 2 + rng() * w;
    const ty = cy - h / 2 + rng() * h;
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + (rng() - 0.5) * w * 0.05, ty + h * 0.15);
  }
  ctx.stroke();
  ctx.fillStyle = "rgba(230,200,130,0.5)"; // colmo
  ctx.fillRect(cx - w / 2, cy - 0.8, w, 1.6);
  ctx.strokeStyle = _dk(0.45);
  ctx.lineWidth = 0.8;
  ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
}

function _tdVillage(ctx, x, y, ts, rng) {
  _oval(ctx, x + ts / 2, y + ts / 2, ts * 0.42, ts * 0.36, _lt(0.07)); // aia
  _grass(ctx, x, y, ts, rng, 10);
}

// Capanne del villaggio (TILE_OBJECTS)
function _villageHuts(ctx, x, y, ts, rng) {
  if (rng() < 0.5) {
    _hut(ctx, x + ts * 0.5, y + ts * 0.48, ts * 0.52, ts * 0.4, rng);
  } else {
    _hut(ctx, x + ts * 0.3, y + ts * 0.32, ts * 0.34, ts * 0.28, rng);
    _hut(ctx, x + ts * 0.68, y + ts * 0.66, ts * 0.36, ts * 0.3, rng);
  }
}

function _sandbag(ctx, cx, cy, rx, ry) {
  _oval(ctx, cx + 1, cy + 1.5, rx, ry, _dk(0.35));
  _oval(ctx, cx, cy, rx, ry, "rgba(175,155,100,0.85)");
  _oval(ctx, cx - rx * 0.15, cy - ry * 0.3, rx * 0.6, ry * 0.4, _lt(0.2));
}

// Postazione: anello di sacchi a terra attorno a una buca, ingresso in basso
function _tdBunker(ctx, x, y, ts, rng) {
  const cx = x + ts / 2;
  const cy = y + ts / 2;
  const hx = ts * 0.3;
  const hy = ts * 0.24;
  const L = ts * 0.15;
  ctx.fillStyle = _dk(0.55);
  ctx.fillRect(cx - hx * 0.65, cy - hy * 0.55, hx * 1.3, hy * 1.1);
  for (let bx = -hx; bx < hx - 0.01; bx += L) {
    _sandbag(ctx, cx + bx + L / 2, cy - hy, L * 0.52, L * 0.32);
    if (Math.abs(bx + L / 2) > L * 0.6) _sandbag(ctx, cx + bx + L / 2, cy + hy, L * 0.52, L * 0.32);
  }
  for (let by = -hy + L * 0.6; by < hy - L * 0.4; by += L) {
    _sandbag(ctx, cx - hx, cy + by + L / 2, L * 0.32, L * 0.52);
    _sandbag(ctx, cx + hx, cy + by + L / 2, L * 0.32, L * 0.52);
  }
  ctx.fillStyle = _dk(0.7); // feritoia
  ctx.fillRect(cx - hx * 0.4, cy - hy * 0.5, hx * 0.8, 1.5);
  _grain(ctx, x, y, ts, rng, 8, 0.1);
}

// Terra bruciata (vegetazione colpita dall'artiglieria): chiazze di cenere,
// tronchi carbonizzati a terra e ceppi anneriti
function _tdScorched(ctx, x, y, ts, rng) {
  ctx.fillStyle = _dk(0.3);
  ctx.fillRect(x, y, ts, ts);
  for (let i = 0; i < 4; i++) {
    _oval(ctx, x + ts * (0.15 + rng() * 0.7), y + ts * (0.15 + rng() * 0.7), ts * (0.12 + rng() * 0.14), ts * (0.08 + rng() * 0.1), "rgba(150,145,135,0.2)");
  }
  _grain(ctx, x, y, ts, rng, 26, 0.16);
  ctx.lineCap = "round";
  for (let i = 0; i < 1 + Math.floor(rng() * 2); i++) {
    const bx = x + ts * (0.25 + rng() * 0.5);
    const by = y + ts * (0.25 + rng() * 0.5);
    const a = rng() * Math.PI;
    const l = ts * (0.18 + rng() * 0.14);
    ctx.strokeStyle = "rgba(18,13,9,0.85)";
    ctx.lineWidth = ts * 0.065;
    ctx.beginPath();
    ctx.moveTo(bx - Math.cos(a) * l, by - Math.sin(a) * l);
    ctx.lineTo(bx + Math.cos(a) * l, by + Math.sin(a) * l);
    ctx.stroke();
    ctx.strokeStyle = "rgba(120,110,100,0.3)"; // crepe grigie del carbone
    ctx.lineWidth = ts * 0.012;
    ctx.setLineDash([ts * 0.03, ts * 0.06]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (let i = 0; i < 2 + Math.floor(rng() * 2); i++) {
    const sx = x + ts * (0.15 + rng() * 0.7);
    const sy = y + ts * (0.15 + rng() * 0.7);
    const r = ts * (0.04 + rng() * 0.03);
    _disc(ctx, sx + r * 0.4, sy + r * 0.5, r, _dk(0.4));
    _disc(ctx, sx, sy, r, "rgb(34,26,18)");
    _disc(ctx, sx - r * 0.25, sy - r * 0.25, r * 0.45, "rgba(90,78,64,0.6)");
  }
}

const TILE_DETAILS = {
  scorched: _tdScorched,
  wall: (ctx, x, y, ts, rng) => _tdBricks(ctx, x, y, ts, rng, false),
  obstacle: _tdObstacle,
  wall_breach: (ctx, x, y, ts, rng) => _tdBricks(ctx, x, y, ts, rng, true),
  building: _tdBuilding,
  temple: _tdTemple,
  garden: _tdGarden,
  clearing: _tdClearing,
  jungle: _tdJungle,
  swamp: _tdSwamp,
  river: _tdRiver,
  bridge: _tdBridge,
  ford: _tdFord,
  street: _tdStreet,
  urban: _tdStreet,
  plaza: _tdPavers,
  objective: (ctx, x, y, ts, rng) => _tdPavers(ctx, x, y, ts, rng, 4),
  debris: _tdDebris,
  trail: _tdTrail,
  village: _tdVillage,
  bunker: _tdBunker,
};

// Elementi in rilievo sul fondo del tile: disegnati da drawTileObjects dopo
// le fusioni tra terreni (drawTerrainTransitions), così il terreno vicino che
// sconfina nel tile passa sotto e non li sbiadisce
const TILE_OBJECTS = {
  village: _villageHuts,
  objective: _objectiveMarker,
};

// ── ASPETTO DEI TILE ("texture" nel tileType) ─────────────────────────
// Tutto ciò che è solo disegno (texture, fusioni, rive, ombre, chiome, erba
// al vento, onde, nebbia, uccelli, crateri) dipende dall'aspetto del tile, non
// dal suo id: "texture": "jungle" fa disegnare un tile nuovo come la giungla.
// Un percorso d'immagine ("assets/risaia.png") viene invece disegnato sopra
// il `color` del tile (le parti trasparenti lasciano vedere il colore) e per
// il resto conta come terreno generico (altezza da losBlock).
const TEXTURE_IMAGE_RE = /\.(png|jpe?g|webp|gif)$/i;
const _textureImages = new Map(); // percorso → Image
const _unknownLooks = new Set(); // aspetti sconosciuti già segnalati

function _textureImagePath(def) {
  const tx = def?.texture;
  return typeof tx === "string" && TEXTURE_IMAGE_RE.test(tx) ? tx : null;
}

function tileLook(def) {
  if (!def) return undefined;
  const tx = def.texture;
  if (typeof tx !== "string" || !tx || TEXTURE_IMAGE_RE.test(tx)) return def.id;
  if (!TILE_DETAILS[tx] && !_unknownLooks.has(tx)) {
    _unknownLooks.add(tx);
    console.warn(`[tiles] texture "${tx}" sconosciuta (tile "${def.id}"): note ${Object.keys(TILE_DETAILS).join(", ")}`);
  }
  return tx;
}

// Immagini delle texture della mappa: caricate dall'avvio della missione
// (game.js:useMission, render.js:prebuildTerrainCache); se una arriva a
// cache del terreno già costruita, la cache viene rifatta
function loadTileTextures(md) {
  const paths = [...new Set(Object.values(md?.tileTypes || {}).map(_textureImagePath).filter(Boolean))];
  return Promise.all(
    paths.map((p) => {
      let img = _textureImages.get(p);
      if (!img) {
        img = new Image();
        img.onload = () => {
          if (!_terrainCache) return;
          invalidateTerrainCache();
          _blastedSprites.clear();
          render();
        };
        img.onerror = () => console.warn(`[tiles] texture non trovata: ${p}`);
        img.src = assetUrl(p);
        _textureImages.set(p, img);
      }
      if (img.complete) return null;
      return new Promise((r) => {
        img.addEventListener("load", r);
        img.addEventListener("error", r);
      });
    }),
  );
}

function _tileImage(def) {
  const img = _textureImages.get(_textureImagePath(def));
  return img?.complete && img.naturalWidth ? img : null;
}

// surface: solo il fondo (TILE_SURFACE), per la fusione nel tile vicino
function _paintDetails(ctx, def, x, y, ts, rng, surface = false) {
  const img = _tileImage(def);
  if (img) {
    ctx.drawImage(img, x, y, ts, ts);
    return;
  }
  // lieve variazione di luminosità per tile: rompe l'uniformità della griglia
  ctx.fillStyle = _tint(rng() - 0.5, 0.1, 0.05);
  ctx.fillRect(x, y, ts, ts);
  const look = tileLook(def);
  const draw = (surface && TILE_SURFACE[look]) || TILE_DETAILS[look];
  // aspetto sconosciuto (nuove mappe config-driven senza texture): grana generica
  if (draw) draw(ctx, x, y, ts, rng);
  else _grain(ctx, x, y, ts, rng, 16, 0.09);
}

function drawTileDetails(ctx, tileDef, x, y, ts, col = 0, row = 0) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, ts, ts);
  ctx.clip();
  _paintDetails(ctx, tileDef, x, y, ts, _tileRng(col, row));
  ctx.restore();
}

// ctx già limitato al tile (drawTerrainTransitions) o tile isolato
// (render.js:renderBlastedTiles); seme proprio, indipendente dal fondo
function drawTileObjects(ctx, tileDef, x, y, ts, col = 0, row = 0) {
  const draw = !_tileImage(tileDef) && TILE_OBJECTS[tileLook(tileDef)];
  if (draw) draw(ctx, x, y, ts, _tileRng(col + 0.37, row + 0.61));
}

// ── TRANSIZIONI E OMBRE TRA TILE ───────────────────────────────────────
// Passata eseguita dopo aver disegnato tutti i tile; ogni effetto è disegnato
// nel tile che lo "riceve": fusioni tra terreni diversi, rive del fiume, ombre
// a sud-est dei tile alti (luce da nord-ovest, coerente con i disegni dei
// tile). Id sconosciuti: altezza da losBlock "full", priorità 0.
//
// Fusione: tra due terreni "a terra" vicini, quello a priorità più alta (a
// parità decide l'id, così ne invade sempre uno solo) entra nell'altro. Nel
// tile che riceve si ridisegna la texture del vicino e la si mostra attraverso
// una maschera alfa piena sul lato di contatto e sfumata verso l'interno, con
// frangia irregolare; gli angoli toccati solo in diagonale ricevono uno spicchio.
const TILE_BLEED_PRIORITY = {
  jungle: 9,
  swamp: 8,
  garden: 7,
  clearing: 6,
  village: 5,
  scorched: 4.5,
  debris: 4,
  trail: 3,
  street: 2,
  plaza: 1,
  objective: 0,
};
// Profondità della fusione (frazione di tile) per terreno che invade;
// i lastricati entrano poco, la giungla ha già le chiome che sporgono
const TILE_BLEND_DEPTH = { jungle: 0.3, swamp: 0.55, debris: 0.28, street: 0.22, plaza: 0.2, objective: 0.2 };
const TILE_BLEND_DEPTH_DEFAULT = 0.4;
// Tetto per terreno che riceve: il tracciato del sentiero resta leggibile
const TILE_BLEND_MAX_IN = { trail: 0.38 };
// Texture usata quando il terreno invade un vicino: solo il fondo, senza gli
// elementi che non devono comparire a metà nel tile accanto (aia, tracciato;
// capanne e segnale dell'obiettivo sono già a parte in TILE_OBJECTS)
const TILE_SURFACE = {
  village: (ctx, x, y, ts, rng) => _grass(ctx, x, y, ts, rng, 10),
  trail: (ctx, x, y, ts, rng) => _grain(ctx, x, y, ts, rng, 14, 0.1),
};
const TILE_HEIGHT = {
  wall: 0.32,
  wall_breach: 0.32,
  // Massi/tronchi bassi su erba: hanno già le loro ombre, il tile no
  // (0 esplicito: altrimenti varrebbe il default di losBlock "full")
  obstacle: 0,
  building: 0.3,
  temple: 0.34,
  bunker: 0.12,
};
const WATER_IDS = new Set(["river", "ford"]);
// Tile bassi che restano fuori dalle fusioni tra terreni (i massi e i
// tronchi arrivano vicino ai bordi e verrebbero coperti)
const NO_BLEND_IDS = new Set(["obstacle"]);
const _DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]; // N E S W

function _tileHeight(def) {
  if (!def) return 0;
  return TILE_HEIGHT[tileLook(def)] ?? (def.losBlock === "full" ? 0.25 : 0);
}

function _isGround(def) {
  if (!def || _tileHeight(def)) return false;
  const look = tileLook(def);
  return !WATER_IDS.has(look) && !NO_BLEND_IDS.has(look) && look !== "bridge";
}

// Gradiente dal lato `d` del tile verso l'interno, profondo `len`
function _edgeGradient(ctx, x, y, ts, d, len, stops) {
  const [dx, dy] = _DIRS[d];
  const ex = dx > 0 ? x + ts : x;
  const ey = dy > 0 ? y + ts : y;
  const g = dx
    ? ctx.createLinearGradient(ex, 0, ex - dx * len, 0)
    : ctx.createLinearGradient(0, ey, 0, ey - dy * len);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  if (dx) ctx.fillRect(dx > 0 ? x + ts - len : x, y, len, ts);
  else ctx.fillRect(x, dy > 0 ? y + ts - len : y, ts, len);
}

// Punto a distanza `depth` dal lato `d`, posizione `s` lungo il lato
function _edgePoint(x, y, ts, d, s, depth) {
  const [dx, dy] = _DIRS[d];
  return [
    dx ? (dx > 0 ? x + ts - depth : x + depth) : x + s,
    dy ? (dy > 0 ? y + ts - depth : y + depth) : y + s,
  ];
}

function _outranks(a, b) {
  const pa = TILE_BLEED_PRIORITY[tileLook(a)] || 0;
  const pb = TILE_BLEED_PRIORITY[tileLook(b)] || 0;
  return pa !== pb ? pa > pb : a.id > b.id;
}

// Chiazza morbida per la maschera (alfa al centro → 0 sul bordo)
function _softBlob(ctx, cx, cy, r, a) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(0,0,0,${a})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

// Maschera del lato `d`: gradiente + frangia di chiazze. Le chiazze stanno su
// una griglia di mondo lungo il lato, così la frangia prosegue senza salti nei
// tile che condividono la stessa linea di contatto
function _maskEdge(ctx, x, y, ts, d, len) {
  _edgeGradient(ctx, x, y, ts, d, len, [
    [0, "rgba(0,0,0,0.9)"],
    [0.6, "rgba(0,0,0,0.3)"],
    [1, "rgba(0,0,0,0)"],
  ]);
  const [dx, dy] = _DIRS[d];
  const along = dx ? y : x;
  const line = dx ? x + (dx > 0 ? ts : 0) : y + (dy > 0 ? ts : 0);
  const step = ts / 6;
  const k0 = Math.round(along / step);
  for (let k = k0 - 1; k <= k0 + 6; k++) {
    const h1 = _hash01(k * 12.99 + line * 0.783 + d * 3.1);
    const h2 = _hash01(k * 7.31 + line * 0.517 + d * 5.7);
    const [px, py] = _edgePoint(x, y, ts, d, (k + 0.5) * step - along, len * (0.1 + h1 * 0.4));
    _softBlob(ctx, px, py, len * (0.35 + h2 * 0.45), 0.8);
  }
}

// Tele di appoggio riusate: texture del vicino e maschera (ridimensionare
// azzera anche lo stato del contesto)
let _blendTex = null;
let _blendMask = null;
function _blendCanvas(c, px) {
  c = c || document.createElement("canvas");
  c.width = px;
  c.height = px;
  return c;
}

function _drawSoftEdges(ctx, defAt, def, c, r, ts) {
  const invaders = new Map(); // id → { def, sides, corners }
  // stesso aspetto (es. id nuovo con "texture" uguale al vicino): niente fusione
  const same = (a, b) => a.id === b.id || (tileLook(a) === tileLook(b) && !_tileImage(a) && !_tileImage(b));
  const take = (n) => {
    if (!_isGround(n) || same(n, def) || !_outranks(n, def)) return null;
    if (!invaders.has(n.id)) invaders.set(n.id, { def: n, sides: [], corners: [] });
    return invaders.get(n.id);
  };
  _DIRS.forEach(([dx, dy], d) => take(defAt(c + dx, r + dy))?.sides.push(d));
  // angolo toccato solo in diagonale (i due lati adiacenti sono altro terreno)
  for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const n = defAt(c + dx, r + dy);
    const a = defAt(c + dx, r);
    const b = defAt(c, r + dy);
    if (!n || !_isGround(a) || !_isGround(b) || same(a, n) || same(b, n)) continue;
    take(n)?.corners.push([dx, dy]);
  }
  if (!invaders.size) return;

  const k = ctx.getTransform().a; // densità della cache del terreno
  const px = Math.ceil(ts * k);
  const x = c * ts;
  const y = r * ts;
  const cap = TILE_BLEND_MAX_IN[tileLook(def)] ?? 1;
  // dal più debole al più forte: il terreno dominante resta sopra
  const list = [...invaders.values()].sort((p, q) => (_outranks(p.def, q.def) ? 1 : -1));
  for (const { def: n, sides, corners } of list) {
    _blendTex = _blendCanvas(_blendTex, px);
    _blendMask = _blendCanvas(_blendMask, px);
    const tg = _blendTex.getContext("2d");
    const mg = _blendMask.getContext("2d");
    // coordinate di mondo: i pattern allineati al mondo restano continui
    tg.setTransform(k, 0, 0, k, -x * k, -y * k);
    mg.setTransform(k, 0, 0, k, -x * k, -y * k);
    tg.globalAlpha = 0.85; // come il fondo dei tile in getTerrainCache
    tg.fillStyle = n.color || "#2d5a1b";
    tg.fillRect(x, y, ts, ts);
    tg.globalAlpha = 1;
    _paintDetails(tg, n, x, y, ts, _tileRng(c + 0.71, r + 0.43), true);
    const len = ts * Math.min(cap, TILE_BLEND_DEPTH[tileLook(n)] ?? TILE_BLEND_DEPTH_DEFAULT);
    for (const d of sides) _maskEdge(mg, x, y, ts, d, len);
    for (const [dx, dy] of corners) _softBlob(mg, dx > 0 ? x + ts : x, dy > 0 ? y + ts : y, len * 1.2, 0.9);
    tg.setTransform(1, 0, 0, 1, 0, 0);
    tg.globalCompositeOperation = "destination-in";
    tg.drawImage(_blendMask, 0, 0);
    ctx.drawImage(_blendTex, 0, 0, ts * k, ts * k, x, y, ts, ts);
  }
}

function _drawShore(ctx, x, y, ts, d) {
  const len = ts * 0.16;
  _edgeGradient(ctx, x, y, ts, d, len, [
    [0, "rgba(70,55,35,0.6)"],
    [0.5, "rgba(70,55,35,0.25)"],
    [1, "rgba(70,55,35,0)"],
  ]);
  // schiuma ondulata parallela alla riva, continua tra tile (coordinate mondo)
  const along = _DIRS[d][0] ? y : x;
  ctx.strokeStyle = _lt(0.28);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let s = 0; s <= ts; s += 2) {
    const w = len * 0.75 + Math.sin((along + s) * 0.22) * ts * 0.02;
    const [px, py] = _edgePoint(x, y, ts, d, s, w);
    if (s === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

function _drawCastShadow(ctx, x, y, ts, hN, hW, hNW) {
  if (hW) _edgeGradient(ctx, x, y, ts, 3, ts * hW, [[0, _dk(0.4)], [1, _dk(0)]]);
  if (hN) _edgeGradient(ctx, x, y, ts, 0, ts * hN, [[0, _dk(0.4)], [1, _dk(0)]]);
  if (hNW && !hW && !hN) {
    // solo l'angolo: il tile alto è in diagonale
    const g = ctx.createRadialGradient(x, y, 0, x, y, ts * hNW);
    g.addColorStop(0, _dk(0.35));
    g.addColorStop(1, _dk(0));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, ts * hNW, ts * hNW);
  }
}

// r0..r1, c0..c1: righe e colonne da disegnare (render.js costruisce la
// cache a passi e ridisegna i dintorni dei tile cambiati in partita)
function drawTerrainTransitions(ctx, md, ts, r0 = 0, r1 = md.rows, c0 = 0, c1 = md.cols) {
  const defAt = (c, r) =>
    c < 0 || r < 0 || c >= md.cols || r >= md.rows ? null : md.tileTypes[md.grid[r][c]];
  for (let r = r0; r < r1; r++) {
    for (let c = c0; c < c1; c++) {
      const def = defAt(c, r);
      if (!def) continue;
      const x = c * ts;
      const y = r * ts;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, ts, ts);
      ctx.clip();
      if (tileLook(def) === "river") {
        _DIRS.forEach(([dx, dy], d) => {
          const look = tileLook(defAt(c + dx, r + dy));
          if (look && !WATER_IDS.has(look) && look !== "bridge") _drawShore(ctx, x, y, ts, d);
        });
      } else if (_isGround(def)) {
        _drawSoftEdges(ctx, defAt, def, c, r, ts);
      }
      drawTileObjects(ctx, def, x, y, ts, c, r);
      if (!_tileHeight(def)) {
        _drawCastShadow(
          ctx, x, y, ts,
          _tileHeight(defAt(c, r - 1)),
          _tileHeight(defAt(c - 1, r)),
          _tileHeight(defAt(c - 1, r - 1)),
        );
      }
      ctx.restore();
    }
  }
}

// ── CHIOME DELLA GIUNGLA ───────────────────────────────────────────────
// Passata finale senza clip (dopo le transizioni): le chiome degli alberi
// escono dal tile. Verso altra giungla (o il bordo mappa) si fondono
// liberamente; verso terreni diversi sporgono al massimo di CANOPY_OVERHANG
// tile, per non far sembrare coperto un tile che non lo è. Tutte le chiome
// della mappa sono disegnate da nord a sud, così si sovrappongono in modo
// coerente anche tra tile diversi.
const CANOPY_OVERHANG = 0.14;
const CANOPY_COLS = ["rgba(25,60,18,0.92)", "rgba(50,105,30,0.72)", "rgba(140,200,80,0.28)"];

// Chiome ordinate da nord a sud: { cx, cy, rad, c, r, i } (i = indice nel tile)
function jungleCrowns(md, ts) {
  const isJungle = (c, r) =>
    c < 0 || r < 0 || c >= md.cols || r >= md.rows || tileLook(md.tileTypes[md.grid[r][c]]) === "jungle";
  // Intervallo del centro di una chioma lungo un asse: fino al bordo verso la
  // giungla, rientrato di (estensione − sporgenza) verso altri terreni
  const span = (start, re, openLo, openHi) => {
    const lo = openLo ? start : start + re - CANOPY_OVERHANG * ts;
    const hi = openHi ? start + ts : start + ts - re + CANOPY_OVERHANG * ts;
    return lo <= hi ? [lo, hi] : [start + ts / 2, start + ts / 2];
  };
  const crowns = [];
  for (let r = 0; r < md.rows; r++) {
    for (let c = 0; c < md.cols; c++) {
      if (tileLook(md.tileTypes[md.grid[r][c]]) !== "jungle") continue;
      const rng = _tileRng(c + 0.13, r + 0.29);
      const n = 6 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) {
        // ogni tanto un albero emergente, più grande, rompe la griglia
        const rad = ts * (rng() < 0.12 ? 0.3 + rng() * 0.08 : 0.15 + rng() * 0.12);
        const re = rad * 1.1; // estensione dei lobi oltre il raggio
        const [x0, x1] = span(c * ts, re, isJungle(c - 1, r), isJungle(c + 1, r));
        const [y0, y1] = span(r * ts, re, isJungle(c, r - 1), isJungle(c, r + 1));
        crowns.push({ cx: x0 + rng() * (x1 - x0), cy: y0 + rng() * (y1 - y0), rad, c, r, i });
      }
    }
  }
  return crowns.sort((a, b) => a.cy - b.cy);
}

function drawJungleCanopy(ctx, md, ts, crowns = jungleCrowns(md, ts)) {
  for (const k of crowns) {
    _foliage(ctx, k.cx, k.cy, k.rad, _tileRng(k.c + k.i * 0.071, k.r + 0.53), CANOPY_COLS);
  }
}

// ── CHIOME AL VENTO ────────────────────────────────────────────────────
// Col vento le chiome non stanno nella cache del terreno: ridisegnarne
// migliaia di cerchi a ogni fotogramma costerebbe troppo, quindi si
// preparano una volta CANOPY_VARIANTS chiome tipo (raggio CANOPY_SPRITE_R) e
// ogni chioma ne usa una, scalata al suo raggio. Niente rotazioni: luce e
// ombra devono restare a nord-ovest/sud-est. Ogni variante ha una sagoma
// chiara gemella, sovrapposta dove passa la raffica (foglie rovesciate).
const CANOPY_VARIANTS = 48;
const CANOPY_SPRITE_R = 24;
const CANOPY_SPRITE_EXT = 1.45; // ingombro (ombra compresa) in raggi
const CANOPY_SPRITE_DENSITY = 2.5;
const CANOPY_GUST_TINT = "rgb(215,235,160)";
let _canopySprites = null;

function canopySprites() {
  if (_canopySprites) return _canopySprites;
  const R = CANOPY_SPRITE_R;
  const half = R * CANOPY_SPRITE_EXT;
  const px = Math.ceil(half * 2 * CANOPY_SPRITE_DENSITY);
  const make = (v, light) => {
    const cv = document.createElement("canvas");
    cv.width = px;
    cv.height = px;
    const g = cv.getContext("2d");
    g.scale(CANOPY_SPRITE_DENSITY, CANOPY_SPRITE_DENSITY);
    _foliage(g, half, half, R, _tileRng(v * 1.37, 7.7), CANOPY_COLS, !light);
    if (light) {
      g.globalCompositeOperation = "source-atop";
      g.fillStyle = CANOPY_GUST_TINT;
      g.fillRect(0, 0, half * 2, half * 2);
    }
    return cv;
  };
  _canopySprites = [];
  for (let v = 0; v < CANOPY_VARIANTS; v++) _canopySprites.push({ base: make(v, false), light: make(v, true) });
  return _canopySprites;
}

// Dati per l'animazione: variante e fase di ogni chioma, in ordine di disegno
function windCanopy(md, ts) {
  return jungleCrowns(md, ts).map((k) => ({
    cx: k.cx,
    cy: k.cy,
    rad: k.rad,
    v: Math.floor(_hash01(k.c * 3.7 + k.r * 5.1 + k.i * 1.3) * CANOPY_VARIANTS),
    ph: _hash01(k.c * 1.9 + k.r * 2.3 + k.i * 0.7) * Math.PI * 2,
  }));
}

// ── SPRITES PERSONAGGI ─────────────────────────────────────────────────────

function _poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
}
function _star5(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2,
      ri = i % 2 ? r * 0.4 : r;
    i
      ? ctx.lineTo(cx + Math.cos(a) * ri, cy + Math.sin(a) * ri)
      : ctx.moveTo(cx + Math.cos(a) * ri, cy + Math.sin(a) * ri);
  }
  ctx.closePath();
}

// --- Pedine: soldati visti dall'alto ---
// Ogni aspetto (scelto con il campo "sprite" della classe, altrimenti col suo
// nome) dice uniforme, copricapo, equipaggiamento e arma. Il soldato è
// disegnato rivolto a nord in coordinate di tile (-0.5..0.5) per ognuna
// delle tre posture, messo in cache come immagine insieme alla sua sagoma
// (l'ombra) e ruotato da drawUnitSprite secondo il facing dell'unità.
// rig = cinghie sul busto (us: bretelle e cinturone; chicom: giberne sul
// petto; belt: solo cintura); sleeves "rolled" = maniche arrotolate;
// feet "sandals" = sandali invece degli scarponi
const SOLDIER_LOOKS = {
  // US
  assault: { cloth: "#56643a", skin: "#d8a77c", hat: "helmet", hatCol: "#5d6b3a", weapon: "m16", rig: "us", sleeves: "rolled", gear: ["pack", "pouches", "grenades"] },
  sniper: { cloth: "#4d5a33", skin: "#c99a70", hat: "boonie", hatCol: "#6a7442", camo: "#2e3a1a", weapon: "scoped", rig: "us", gear: ["pouches"] },
  engineer: { cloth: "#56643a", skin: "#e0b48a", hat: "helmet", hatCol: "#5d6b3a", weapon: "m16", rig: "us", sleeves: "rolled", gear: ["radio"] },
  medic: { cloth: "#5c6c3e", skin: "#b88660", hat: "helmet", hatCol: "#5d6b3a", hatCross: true, weapon: "pistol", rig: "us", gear: ["medbag", "armband"] },
  // VC e NVA
  grunt: { cloth: "#22221d", skin: "#c49565", hat: "cone", hatCol: "#c9aa6a", weapon: "ak", rig: "chicom", feet: "sandals", gear: ["rpg"] },
  sniper_vc: { cloth: "#2b301d", skin: "#b88a5c", hat: "cone", hatCol: "#8d8a52", leaves: true, weapon: "scoped", rig: "belt", feet: "sandals", gear: [] },
  commander: { cloth: "#6e6a45", skin: "#c49565", hat: "pith", hatCol: "#66703f", weapon: "pistol", rig: "belt", gear: ["boards", "mapcase"] },
  nva: { cloth: "#4f5934", skin: "#c49565", hat: "pith", hatCol: "#5a663a", weapon: "ak", rig: "chicom", gear: ["pack"] },
};

// Per postura: ombra (tile verso sud-est, più corta vicino al suolo), scala e
// punti del corpo nella figura rivolta a nord. torso [x, y, rx, ry]; legs
// [punti, "boot" | "knee"]; gun [calcio x, y, volata x, y]; arm* spalla →
// gomito → mano; grip = mani sulla pistola; back = centro di zaino/radio
const SOLDIER_POSES = {
  stand: {
    shadow: 0.07,
    scale: 1.1,
    torso: [0, 0.04, 0.2, 0.105],
    head: [0, 0.015],
    back: 0.155,
    legs: [
      [[[-0.07, 0.03], [-0.085, -0.085]], "boot"],
      [[[0.07, 0.06], [0.085, 0.15]], "boot"],
    ],
    gun: [0.1, 0.08, 0.035, -0.44],
    armR: [[0.15, 0.03], [0.18, -0.03], [0.086, -0.035]],
    armL: [[-0.15, 0.03], [-0.15, -0.12], [0.065, -0.2]],
    grip: [0.03, -0.22],
  },
  crouch: {
    shadow: 0.045,
    scale: 1.04,
    torso: [0, 0.07, 0.19, 0.1],
    head: [0, 0.0],
    back: 0.175,
    legs: [
      [[[-0.07, 0.06], [-0.11, -0.15]], "knee"],
      [[[0.07, 0.1], [0.09, 0.2], [0.1, 0.35]], "boot"],
    ],
    gun: [0.1, 0.1, 0.03, -0.42],
    armR: [[0.14, 0.06], [0.17, 0.0], [0.085, -0.01]],
    armL: [[-0.14, 0.06], [-0.15, -0.1], [0.062, -0.18]],
    grip: [0.03, -0.2],
  },
  prone: {
    shadow: 0.02,
    scale: 1,
    torso: [0, -0.01, 0.14, 0.17],
    head: [0, -0.2],
    back: 0.03,
    legs: [
      [[[-0.05, 0.12], [-0.13, 0.43]], "boot"],
      [[[0.05, 0.12], [0.12, 0.43]], "boot"],
    ],
    gun: [0.07, -0.12, 0.02, -0.49],
    armR: [[0.12, -0.12], [0.21, -0.21], [0.054, -0.24]],
    armL: [[-0.12, -0.12], [-0.2, -0.27], [0.036, -0.37]],
    grip: [0.025, -0.34],
  },
};

const _SO = "rgba(14,16,8,.85)"; // contorno
const _SW = 0.016; // spessore del contorno (tile)

// Colore schiarito (k > 0) o scurito (k < 0)
function _shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k));
  return "#" + ((1 << 24) + (f(n >> 16) << 16) + (f((n >> 8) & 255) << 8) + f(n & 255)).toString(16).slice(1);
}
// Tratto con contorno: arti, cinghie, armi; shine > 0 = riflesso chiaro
// lungo il centro, che dà il volume di un cilindro
function _limb(ctx, pts, w, col, shine = 0) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.strokeStyle = _SO;
  ctx.lineWidth = w + _SW * 2;
  ctx.stroke();
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.stroke();
  if (shine) {
    ctx.strokeStyle = _shadeHex(col, shine);
    ctx.lineWidth = w * 0.35;
    ctx.stroke();
  }
}
// Linee sottili senza contorno (cuciture, pieghe, zigrinature)
function _lines(ctx, segs, w, col) {
  ctx.lineCap = "round";
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.beginPath();
  for (const [ax, ay, bx, by] of segs) {
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  }
  ctx.stroke();
}
function _blobs(ctx, col, pts) {
  ctx.fillStyle = col;
  for (const [x, y, r, a = 0] of pts) {
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.65, a, 0, Math.PI * 2);
    ctx.fill();
  }
}
// Volume tondeggiante: più chiaro al centro (la luce non dipende da dove
// guarda l'unità), contorno scuro
function _dome(ctx, x, y, rx, ry, col, rot = 0) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, _shadeHex(col, 0.2));
  g.addColorStop(1, _shadeHex(col, -0.25));
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = _SO;
  ctx.lineWidth = _SW;
  ctx.stroke();
}
function _box(ctx, x, y, w, h, col) {
  const r = Math.min(w, h) * 0.25,
    l = x - w / 2,
    t = y - h / 2;
  ctx.beginPath();
  ctx.moveTo(l + r, t);
  ctx.arcTo(l + w, t, l + w, t + h, r);
  ctx.arcTo(l + w, t + h, l, t + h, r);
  ctx.arcTo(l, t + h, l, t, r);
  ctx.arcTo(l, t, l + w, t, r);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
  ctx.strokeStyle = _SO;
  ctx.lineWidth = _SW;
  ctx.stroke();
}
function _redCross(ctx, x, y, r) {
  ctx.fillStyle = "#d01818";
  ctx.fillRect(x - r, y - r * 0.35, r * 2, r * 0.7);
  ctx.fillRect(x - r * 0.35, y - r, r * 0.7, r * 2);
}

// Arma dal calcio (bx, by) alla volata (mx, my)
function _gun(ctx, kind, bx, by, mx, my) {
  const L = Math.hypot(mx - bx, my - by);
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(Math.atan2(my - by, mx - bx));
  const seg = (a, b, w, col, shine = 0.2) => _limb(ctx, [[a * L, 0], [b * L, 0]], w, col, shine);
  // Blocchetto sulla canna (mirino, presa gas) e tacche trasversali
  const nub = (a, w, h, col) => _box(ctx, a * L, 0, w, h, col);
  const ribs = (a, b, n, h) =>
    _lines(ctx, Array.from({ length: n }, (_, i) => {
      const x = (a + ((b - a) * (i + 0.5)) / n) * L;
      return [x, -h / 2, x, h / 2];
    }), 0.006, "rgba(0,0,0,.55)");
  if (kind === "pistol") {
    seg(0, 1, 0.034, "#1c1c1a");
    seg(0.2, 0.9, 0.01, "#55554e", 0); // carrello
  } else if (kind === "ak") {
    seg(0, 0.24, 0.048, "#7a4a22", 0.25); // calcio
    seg(0.24, 0.5, 0.042, "#262622"); // castello
    seg(0.28, 0.47, 0.012, "#4c4c45", 0); // coperchio
    seg(0.5, 0.69, 0.052, "#80502a", 0.25); // astina
    seg(0.69, 0.98, 0.017, "#1f1f1c");
    nub(0.71, 0.026, 0.032, "#1f1f1c"); // presa gas
    nub(0.93, 0.02, 0.03, "#1f1f1c"); // mirino
    seg(0.97, 1, 0.022, "#1f1f1c", 0); // freno di bocca
  } else if (kind === "scoped") {
    seg(0, 0.66, 0.048, "#5e3c1c", 0.25); // calcio e cassa
    seg(0.66, 1, 0.02, "#262420");
    seg(0.26, 0.58, 0.026, "#151515", 0.3); // ottica
    seg(0.25, 0.31, 0.036, "#151515", 0); // oculare
    seg(0.52, 0.59, 0.042, "#151515", 0); // obiettivo
    nub(0.42, 0.026, 0.026, "#202020"); // torretta
    ctx.fillStyle = "#8fc4dc"; // riflesso della lente
    ctx.beginPath();
    ctx.arc(0.6 * L, -0.008, 0.009, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // M16
    seg(0, 0.22, 0.048, "#202220"); // calcio
    seg(0.22, 0.5, 0.042, "#2c2e2a"); // castello
    seg(0.25, 0.46, 0.014, "#4a4d46", 0); // maniglia di trasporto
    seg(0.5, 0.74, 0.056, "#262824", 0.15); // astina
    ribs(0.52, 0.72, 5, 0.05);
    seg(0.74, 0.96, 0.016, "#1a1a18");
    nub(0.79, 0.022, 0.034, "#1a1a18"); // mirino
    seg(0.95, 1, 0.024, "#1a1a18", 0); // spegnifiamma
  }
  ctx.restore();
}

// Copricapo visto dall'alto, centrato sulla testa
function _hat(ctx, look, hx, hy) {
  const c = look.hatCol;
  if (look.hat === "cone") {
    // Nón lá: spicchi di foglia alternati, stecche radiali e cerchi di
    // bambù, punta al centro
    _dome(ctx, hx, hy, 0.17, 0.17, c);
    ctx.fillStyle = "rgba(255,240,200,.1)";
    for (let i = 0; i < 16; i += 2) {
      const a = (i * Math.PI) / 8;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.arc(hx, hy, 0.165, a, a + Math.PI / 8);
      ctx.fill();
    }
    _lines(ctx, Array.from({ length: 16 }, (_, i) => {
      const a = (i * Math.PI) / 8;
      return [hx + Math.cos(a) * 0.025, hy + Math.sin(a) * 0.025, hx + Math.cos(a) * 0.165, hy + Math.sin(a) * 0.165];
    }), 0.005, "rgba(80,55,20,.3)");
    ctx.strokeStyle = "rgba(80,55,20,.45)";
    ctx.lineWidth = 0.008;
    for (const r of [0.05, 0.095, 0.135]) {
      ctx.beginPath();
      ctx.arc(hx, hy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = _shadeHex(c, 0.35);
    ctx.beginPath();
    ctx.arc(hx, hy, 0.018, 0, Math.PI * 2);
    ctx.fill();
  } else if (look.hat === "boonie") {
    // Tesa con le cuciture concentriche, cupola con la fascia porta-rametti
    _dome(ctx, hx, hy, 0.155, 0.145, _shadeHex(c, -0.1));
    ctx.save();
    ctx.setLineDash([0.012, 0.01]);
    ctx.strokeStyle = "rgba(20,24,10,.5)";
    ctx.lineWidth = 0.005;
    for (const r of [0.115, 0.135]) {
      ctx.beginPath();
      ctx.ellipse(hx, hy, r, r * 0.935, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    _dome(ctx, hx, hy, 0.088, 0.088, c);
    if (look.camo) _blobs(ctx, look.camo, [[hx - 0.03, hy - 0.03, 0.03, 0.5], [hx + 0.035, hy + 0.02, 0.028, -0.8], [hx - 0.02, hy + 0.045, 0.02, 1.4]]);
    ctx.strokeStyle = "rgba(20,24,10,.65)";
    ctx.lineWidth = 0.014;
    ctx.beginPath();
    ctx.arc(hx, hy, 0.08, 0, Math.PI * 2);
    ctx.stroke();
  } else if (look.hat === "pith") {
    // Casco coloniale: tesa, quattro spicchi cuciti, sfiato in cima
    _dome(ctx, hx, hy, 0.14, 0.14, _shadeHex(c, -0.12));
    _dome(ctx, hx, hy, 0.105, 0.105, c);
    _lines(ctx, [[hx - 0.1, hy, hx + 0.1, hy], [hx, hy - 0.1, hx, hy + 0.1]], 0.006, "rgba(20,24,10,.4)");
    _dome(ctx, hx, hy, 0.024, 0.024, _shadeHex(c, 0.15));
    // Coccarda con la stella sul davanti
    ctx.fillStyle = "#b8231d";
    ctx.beginPath();
    ctx.arc(hx, hy - 0.085, 0.03, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f0c830";
    _star5(ctx, hx, hy - 0.085, 0.022);
    ctx.fill();
  } else if (look.hat === "helmet") {
    // M1: telo mimetico a foglie (verde e marrone), bordo della calotta,
    // fascia elastica con la boccetta di repellente infilata
    _dome(ctx, hx, hy, 0.125, 0.125, c);
    _blobs(ctx, _shadeHex(c, -0.32), [[hx - 0.05, hy - 0.04, 0.03, 0.6], [hx + 0.045, hy + 0.035, 0.032, -0.5], [hx + 0.05, hy - 0.055, 0.02, 1.2], [hx - 0.035, hy + 0.06, 0.024, 2]]);
    _blobs(ctx, "#6e6440", [[hx + 0.01, hy - 0.075, 0.022, 0.2], [hx - 0.075, hy + 0.01, 0.02, 1.5], [hx + 0.075, hy - 0.005, 0.018, -1], [hx + 0.005, hy + 0.01, 0.018, 0.8]]);
    ctx.strokeStyle = "rgba(255,255,220,.18)";
    ctx.lineWidth = 0.008;
    ctx.beginPath();
    ctx.arc(hx, hy, 0.115, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(20,24,10,.7)";
    ctx.lineWidth = 0.014;
    ctx.beginPath();
    ctx.arc(hx, hy, 0.095, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.translate(hx + 0.07, hy + 0.06);
    ctx.rotate(-0.85);
    _box(ctx, 0, 0, 0.042, 0.022, "#cfc9a2");
    ctx.restore();
    if (look.hatCross) {
      ctx.fillStyle = "#eee8d8";
      ctx.fillRect(hx - 0.05, hy - 0.05, 0.1, 0.1);
      _redCross(ctx, hx, hy, 0.04);
    }
  }
}

// Fronde di mimetizzazione
function _camoLeaves(ctx, pts) {
  pts.forEach(([x, y, a], i) => {
    ctx.fillStyle = i % 2 ? "#4a6a26" : "#36521c";
    ctx.beginPath();
    ctx.ellipse(x, y, 0.045, 0.018, a, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Zaino, radio o lanciarazzi sulla schiena
function _backGear(ctx, look, by) {
  for (const g of look.gear) {
    if (g === "pack") {
      // Zaino con il poncho arrotolato sopra, patta e cinghie con fibbie
      const pc = _shadeHex(look.cloth, -0.15);
      _limb(ctx, [[-0.1, by - 0.065], [0.1, by - 0.065]], 0.04, _shadeHex(look.cloth, 0.08), 0.2);
      _lines(ctx, [[-0.04, by - 0.085, -0.04, by - 0.045], [0.04, by - 0.085, 0.04, by - 0.045]], 0.008, "rgba(20,24,10,.6)");
      _box(ctx, 0, by, 0.2, 0.12, pc);
      _box(ctx, 0, by + 0.03, 0.16, 0.06, _shadeHex(look.cloth, -0.3));
      _lines(ctx, [[-0.05, by - 0.06, -0.05, by + 0.06], [0.05, by - 0.06, 0.05, by + 0.06]], 0.012, _shadeHex(look.cloth, -0.42));
      ctx.fillStyle = "#9a9478";
      for (const dx of [-0.05, 0.05]) ctx.fillRect(dx - 0.01, by + 0.045, 0.02, 0.012);
    } else if (g === "radio") {
      // PRC-25: manopole, cornetta agganciata e antenna a stilo
      _box(ctx, 0, by + 0.005, 0.2, 0.16, "#3e4629");
      _box(ctx, 0, by - 0.04, 0.17, 0.05, "#2f3620");
      ctx.fillStyle = "#1c1f12";
      for (const dx of [-0.05, 0, 0.05]) {
        ctx.beginPath();
        ctx.arc(dx, by - 0.04, 0.014, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#6a7048";
      for (const dx of [-0.05, 0, 0.05]) ctx.fillRect(dx - 0.003, by - 0.052, 0.006, 0.012);
      _lines(ctx, [[-0.08, by + 0.02, 0.08, by + 0.02], [-0.08, by + 0.05, 0.08, by + 0.05]], 0.006, "rgba(0,0,0,.35)");
      _limb(ctx, [[-0.12, by - 0.02], [-0.135, by + 0.06]], 0.024, "#1a1a16", 0.2);
      _limb(ctx, [[0.06, by - 0.03], [0.14, by + 0.26]], 0.008, "#151510");
    } else if (g === "rpg") {
      // RPG-2 a tracolla: tubo, impugnatura e testata a ogiva
      const a = Math.atan2(-0.16, 0.31);
      _limb(ctx, [[-0.16, by + 0.07], [0.15, by - 0.09]], 0.04, "#56603a", 0.2);
      _lines(ctx, [[-0.02, by - 0.02, -0.005, by + 0.01], [0.06, by - 0.06, 0.075, by - 0.03]], 0.014, "#3a2a18");
      _dome(ctx, -0.19, by + 0.085, 0.055, 0.034, "#6c7040", a);
      _dome(ctx, -0.235, by + 0.108, 0.02, 0.016, "#4a4c2c", a);
    }
  }
}

// Tasche, borse e mostrine ai lati del busto
function _sideGear(ctx, look, [tx, ty, rx, ry]) {
  for (const g of look.gear) {
    if (g === "pouches") {
      for (const s of [-1, 1]) _box(ctx, tx + s * (rx - 0.02), ty + ry * 0.45, 0.05, 0.06, _shadeHex(look.cloth, -0.25));
    } else if (g === "medbag") {
      _box(ctx, tx - rx - 0.01, ty + ry * 0.4, 0.08, 0.1, "#d9d0ae");
      _redCross(ctx, tx - rx - 0.01, ty + ry * 0.4, 0.025);
    } else if (g === "mapcase") {
      _box(ctx, tx + rx, ty + ry * 0.5, 0.07, 0.09, "#6a4a26");
    } else if (g === "boards") {
      for (const s of [-1, 1]) {
        ctx.fillStyle = "#b8231d";
        ctx.fillRect(tx + s * rx * 0.75 - 0.03, ty - 0.015, 0.06, 0.03);
        ctx.fillStyle = "#f0c830";
        ctx.fillRect(tx + s * rx * 0.75 - 0.03, ty - 0.004, 0.06, 0.008);
      }
    } else if (g === "armband") {
      ctx.fillStyle = "#eee8d8";
      ctx.beginPath();
      ctx.arc(tx - rx * 0.85, ty - 0.005, 0.03, 0, Math.PI * 2);
      ctx.fill();
      _redCross(ctx, tx - rx * 0.85, ty - 0.005, 0.02);
    }
  }
}

// Cinghie sul busto (campo rig): bretelle con le bombe a mano e cinturone
// con le borracce (US), giberne cinesi sul petto con le cinghie incrociate
// sulla schiena, oppure la sola cintura
function _rig(ctx, look, [tx, ty, rx, ry]) {
  const web = look.rig === "us" ? "#6e7048" : look.rig === "chicom" ? "#8a7c52" : "#3a2a18";
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(tx, ty, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  if (look.rig === "us") {
    for (const s of [-1, 1]) _limb(ctx, [[tx + s * rx * 0.42, ty - ry], [tx + s * rx * 0.38, ty + ry]], 0.026, web);
  } else if (look.rig === "chicom") {
    for (const s of [-1, 1]) _limb(ctx, [[tx + s * rx * 0.5, ty - ry], [tx - s * rx * 0.5, ty + ry * 0.8]], 0.022, web);
  }
  _limb(ctx, [[tx - rx, ty + ry * 0.8], [tx + rx, ty + ry * 0.8]], 0.034, look.rig === "us" ? web : "#3a2a18");
  ctx.restore();
  if (look.rig === "us") {
    for (const s of [-1, 1]) _dome(ctx, tx + s * rx * 0.62, ty + ry * 0.95, 0.04, 0.034, "#3f4428");
    if (look.gear.includes("grenades")) {
      for (const s of [-1, 1]) {
        _dome(ctx, tx + s * rx * 0.42, ty - ry * 0.55, 0.026, 0.026, "#4f5a30");
        _lines(ctx, [[tx + s * rx * 0.42, ty - ry * 0.55, tx + s * rx * 0.42 + s * 0.02, ty - ry * 0.55 + 0.02]], 0.007, "#a8a890");
      }
    }
  } else if (look.rig === "chicom") {
    for (const dx of [-0.075, 0, 0.075]) _box(ctx, tx + dx * (rx / 0.2), ty - ry * 0.72, 0.06, 0.045, web);
  } else {
    ctx.fillStyle = "#b8a060";
    ctx.fillRect(tx - 0.015, ty + ry * 0.8 - 0.012, 0.03, 0.024);
  }
}

// Pieghe della stoffa e cuciture delle spalle, nella sagoma del busto
function _torsoFolds(ctx, [tx, ty, rx, ry]) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(tx, ty, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = "rgba(0,0,0,.28)";
  ctx.lineWidth = 0.008;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(tx + s * rx * 0.7, ty - ry);
    ctx.quadraticCurveTo(tx + s * rx * 0.55, ty, tx + s * rx * 0.7, ty + ry);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(0,0,0,.18)";
  ctx.beginPath();
  ctx.moveTo(tx - rx * 0.25, ty + ry * 0.2);
  ctx.quadraticCurveTo(tx, ty + ry * 0.45, tx + rx * 0.2, ty + ry * 0.15);
  ctx.moveTo(tx - rx * 0.15, ty - ry * 0.35);
  ctx.quadraticCurveTo(tx + rx * 0.05, ty - ry * 0.2, tx + rx * 0.25, ty - ry * 0.4);
  ctx.stroke();
  ctx.restore();
}

// La figura è dipinta in tre strati, così le animazioni (drawUnitSprite con
// `anim`) possono muovere braccia e testa: corpo (gambe, busto,
// equipaggiamento), braccia con arma e mani, testa con copricapo
function _paintSoldier(ctx, look, stance) {
  _paintSoldierLower(ctx, look, stance);
  _paintSoldierArms(ctx, look, stance);
  _paintSoldierHead(ctx, look, stance);
}

function _paintSoldierLower(ctx, look, stance) {
  _paintSoldierLegs(ctx, look, stance);
  _paintSoldierTorso(ctx, look, stance);
}

// Gambe con la cucitura dei pantaloni e la tasca sulla coscia; in fondo
// scarpone (suola e tomaia) o sandalo, oppure il ginocchio piegato.
// legs: gambe al posto di quelle della posa (camminata, soldierWalkLegs)
function _paintSoldierLegs(ctx, look, stance, legs = SOLDIER_POSES[stance].legs) {
  const trousers = _shadeHex(look.cloth, -0.12);
  for (const [pts, end] of legs) {
    _limb(ctx, pts, 0.078, trousers, 0.12);
    const [a, b] = pts.slice(-2);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const [s0, s1] = pts;
    const m = [s0[0] + (s1[0] - s0[0]) * 0.45, s0[1] + (s1[1] - s0[1]) * 0.45];
    if (Math.hypot(s1[0] - s0[0], s1[1] - s0[1]) > 0.15) {
      ctx.save();
      ctx.translate(m[0], m[1]);
      ctx.rotate(Math.atan2(s1[1] - s0[1], s1[0] - s0[0]));
      _box(ctx, 0, 0, 0.06, 0.048, _shadeHex(look.cloth, -0.2));
      ctx.restore();
    }
    if (end === "boot") {
      if (look.feet === "sandals") {
        _dome(ctx, b[0], b[1], 0.042, 0.026, look.skin, ang);
        _lines(ctx, [[b[0] - Math.sin(ang) * 0.022, b[1] + Math.cos(ang) * 0.022, b[0] + Math.sin(ang) * 0.022, b[1] - Math.cos(ang) * 0.022]], 0.01, "#2a2218");
      } else {
        _dome(ctx, b[0], b[1], 0.05, 0.034, "#1e1812", ang);
        _dome(ctx, b[0] - Math.cos(ang) * 0.008, b[1] - Math.sin(ang) * 0.008, 0.032, 0.022, "#3a3024", ang);
      }
    } else {
      _dome(ctx, b[0], b[1], 0.047, 0.047, _shadeHex(look.cloth, -0.05));
      _dome(ctx, b[0], b[1], 0.026, 0.026, _shadeHex(look.cloth, -0.18));
    }
  }
}

// Busto, mimetica e equipaggiamento
function _paintSoldierTorso(ctx, look, stance) {
  const p = SOLDIER_POSES[stance];
  const [tx, ty, rx, ry] = p.torso;
  _dome(ctx, tx, ty, rx, ry, look.cloth);
  if (look.camo) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(tx, ty, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = look.camo;
    for (const [dx, dy, r] of [[-0.12, -0.03, 0.05], [0.06, 0.05, 0.06], [0.14, -0.04, 0.04], [-0.03, 0.09, 0.04]]) {
      ctx.beginPath();
      ctx.ellipse(tx + dx * (rx / 0.2), ty + dy * (ry / 0.105), r, r * 0.7, dx * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  _torsoFolds(ctx, p.torso);
  if (look.rig) _rig(ctx, look, p.torso);
  _backGear(ctx, look, p.back);
  _sideGear(ctx, look, p.torso);
  if (look.leaves) _camoLeaves(ctx, [[tx - rx * 0.8, ty + 0.01, 1.2], [tx + rx * 0.8, ty + 0.03, -0.4]]);
}

// Braccia (maniche arrotolate: risvolto al gomito e avambraccio nudo), arma
// e mani. handL: posizione della mano sinistra al posto di quella della posa
// (ricarica e gesti, drawUnitSprite); mag: oggetto nella mano sinistra,
// true/"mag" = caricatore, oppure "grenade", "radio", "bandage", "tool"
function _paintSoldierArms(ctx, look, stance, handL = null, mag = false) {
  const p = SOLDIER_POSES[stance];
  const sleeve = _shadeHex(look.cloth, -0.05);
  const arm = (pts) => {
    if (look.sleeves !== "rolled") return _limb(ctx, pts, 0.06, sleeve, 0.15);
    const [s, e, h] = pts;
    const cuff = [e[0] + (h[0] - e[0]) * 0.2, e[1] + (h[1] - e[1]) * 0.2];
    _limb(ctx, [cuff, h], 0.046, look.skin, 0.15);
    _limb(ctx, [s, e, cuff], 0.062, sleeve, 0.15);
    _dome(ctx, cuff[0], cuff[1], 0.036, 0.036, _shadeHex(look.cloth, 0.1));
  };
  const hand = ([x, y]) => {
    _dome(ctx, x, y, 0.032, 0.032, look.skin);
    ctx.fillStyle = "rgba(255,230,200,.35)";
    ctx.beginPath();
    ctx.arc(x - 0.008, y - 0.008, 0.011, 0, Math.PI * 2);
    ctx.fill();
  };
  // Braccio sinistro verso una mano spostata: gomito piegato verso l'esterno
  const armTo = (s, h) => arm([s, [(s[0] + h[0]) / 2 - 0.05, (s[1] + h[1]) / 2 + 0.02], h]);
  const magInHand = (h) => {
    if (!mag) return;
    ctx.save();
    ctx.translate(h[0], h[1]);
    if (mag === "grenade") {
      _dome(ctx, 0, -0.022, 0.028, 0.032, "#3d4a2a");
      _lines(ctx, [[0.012, -0.05, 0.026, -0.02]], 0.008, "#8a8a80");
    } else if (mag === "radio") {
      // Cornetta della radio da campo, dalla mano verso l'orecchio
      ctx.rotate(-0.4);
      _box(ctx, 0, -0.02, 0.028, 0.075, "#22241e");
    } else if (mag === "bandage") {
      _dome(ctx, 0, -0.02, 0.032, 0.026, "#e8e4d8");
      _lines(ctx, [[-0.03, -0.02, -0.08, 0.01]], 0.014, "#ddd8ca");
    } else if (mag === "tool") {
      _lines(ctx, [[0, -0.01, 0.01, -0.07], [0.012, -0.01, 0.024, -0.065]], 0.012, "#6a6a66");
    } else {
      ctx.rotate(0.5);
      _box(ctx, 0, -0.012, 0.03, 0.06, "#2a2a26");
    }
    ctx.restore();
  };
  if (look.weapon === "pistol") {
    // Pistola impugnata a due mani davanti al petto
    const g = p.grip;
    const sL = p.armL[0];
    arm([p.armR[0], [(p.armR[0][0] + g[0]) / 2 + 0.05, (p.armR[0][1] + g[1]) / 2], g]);
    if (handL) armTo(sL, handL);
    else arm([sL, [(sL[0] + g[0]) / 2 - 0.05, (sL[1] + g[1]) / 2], g]);
    _gun(ctx, "pistol", g[0], g[1] + 0.01, g[0], g[1] - 0.08);
    hand(g);
    if (handL) {
      magInHand(handL);
      hand(handL);
    }
  } else {
    arm(p.armR);
    if (handL) armTo(p.armL[0], handL);
    else arm(p.armL);
    _gun(ctx, look.weapon, ...p.gun);
    hand(p.armR[2]);
    magInHand(handL || p.armL[2]);
    hand(handL || p.armL[2]);
  }
}

// Testa e copricapo (il punto più alto)
function _paintSoldierHead(ctx, look, stance) {
  const [hx, hy] = SOLDIER_POSES[stance].head;
  _dome(ctx, hx, hy, 0.085, 0.085, look.skin);
  _hat(ctx, look, hx, hy);
  if (look.leaves) _camoLeaves(ctx, [[hx - 0.08, hy - 0.05, 0.6], [hx + 0.07, hy + 0.06, -0.9], [hx + 0.02, hy - 0.11, 2.1]]);
}

// Figura e sagoma per l'ombra in cache, a una risoluzione vicina a quella
// del tile (multipli di 16 px) così resta nitida a ogni zoom
const _SOLDIER_CACHE = new Map();
function soldierSprite(lookId, stance, ts) {
  const px = Math.min(192, Math.max(16, Math.ceil(ts / 16) * 16));
  const key = `${lookId}|${stance}|${px}`;
  let spr = _SOLDIER_CACHE.get(key);
  if (spr) return spr;
  const fig = document.createElement("canvas");
  fig.width = fig.height = px;
  const c = fig.getContext("2d");
  const k = px * SOLDIER_POSES[stance].scale;
  c.translate(px / 2, px / 2);
  c.scale(k, k);
  _paintSoldier(c, SOLDIER_LOOKS[lookId], stance);
  const shadow = document.createElement("canvas");
  shadow.width = shadow.height = px;
  const sc = shadow.getContext("2d");
  sc.drawImage(fig, 0, 0);
  sc.globalCompositeOperation = "source-in";
  sc.fillStyle = "#000";
  sc.fillRect(0, 0, px, px);
  // Bordo scuro attorno a tutta la sagoma, così la pedina si stacca dal
  // terreno anche a zoom bassi
  const body = document.createElement("canvas");
  body.width = body.height = px;
  const bc = body.getContext("2d");
  const d = Math.max(1, px / 96);
  bc.globalAlpha = 0.55;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) bc.drawImage(shadow, dx * d, dy * d);
  bc.globalAlpha = 1;
  bc.drawImage(fig, 0, 0);
  spr = { body, shadow };
  _SOLDIER_CACHE.set(key, spr);
  return spr;
}

// Strato della figura (canvas px × px, rivolta a nord) col suo bordo scuro,
// alla stessa scala di soldierSprite
function _soldierLayer(px, lookId, stance, paint) {
  const k = px * SOLDIER_POSES[stance].scale;
  const fig = document.createElement("canvas");
  fig.width = fig.height = px;
  const c = fig.getContext("2d");
  c.translate(px / 2, px / 2);
  c.scale(k, k);
  paint(c, SOLDIER_LOOKS[lookId], stance);
  const sil = document.createElement("canvas");
  sil.width = sil.height = px;
  const sc = sil.getContext("2d");
  sc.drawImage(fig, 0, 0);
  sc.globalCompositeOperation = "source-in";
  sc.fillStyle = "#000";
  sc.fillRect(0, 0, px, px);
  const out = document.createElement("canvas");
  out.width = out.height = px;
  const oc = out.getContext("2d");
  const d = Math.max(1, px / 96);
  oc.globalAlpha = 0.55;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) oc.drawImage(sil, dx * d, dy * d);
  oc.globalAlpha = 1;
  oc.drawImage(fig, 0, 0);
  return out;
}

const _soldierPx = (ts) => Math.min(192, Math.max(16, Math.ceil(ts / 16) * 16));

// Strati della figura per le animazioni (gambe, busto, braccia con arma,
// testa), ognuno con il suo bordo scuro
const _SOLDIER_LAYER_CACHE = new Map();
function soldierLayers(lookId, stance, ts) {
  const px = _soldierPx(ts);
  const key = `${lookId}|${stance}|${px}`;
  let layers = _SOLDIER_LAYER_CACHE.get(key);
  if (layers) return layers;
  const layer = (paint) => _soldierLayer(px, lookId, stance, paint);
  layers = {
    legs: layer((c, l, s) => _paintSoldierLegs(c, l, s)),
    torso: layer(_paintSoldierTorso),
    arms: layer((c, l, s) => _paintSoldierArms(c, l, s)),
    head: layer(_paintSoldierHead),
  };
  _SOLDIER_LAYER_CACHE.set(key, layers);
  return layers;
}

// ── CAMMINATA ──────────────────────────────────────────────────────────
// Gambe in movimento viste dall'alto, per fase del passo (0..1 = un ciclo,
// un passo per gamba): in piedi i piedi vanno avanti e indietro sotto il
// busto, accovacciati passi corti a ginocchia larghe, sdraiati una gamba
// alla volta si piega verso il fianco per spingere (strisciata)
const WALK_FRAMES = 8; // fotogrammi in cache per ciclo

function soldierWalkLegs(stance, phase) {
  const s = Math.sin(2 * Math.PI * phase);
  if (stance === "prone") {
    const leg = (sx, b) => [
      [[0.05 * sx, 0.12], [(0.09 + 0.12 * b) * sx, 0.275 - 0.03 * b], [(0.13 + 0.07 * b) * sx, 0.43 - 0.14 * b]],
      "boot",
    ];
    return [leg(-1, Math.max(0, s)), leg(1, Math.max(0, -s))];
  }
  if (stance === "crouch") {
    const leg = (sx, d) => {
      const foot = [0.115 * sx, 0.14 + d];
      return [[[0.07 * sx, 0.08], [0.14 * sx, (0.08 + foot[1]) / 2 - 0.03], foot], "boot"];
    };
    return [leg(-1, -0.19 * s), leg(1, 0.19 * s)];
  }
  // Falcata ampia: il piede avanti sporge oltre il busto, quello dietro sotto
  return [
    [[[-0.07, 0.04], [-0.09, 0.035 - 0.17 * s]], "boot"],
    [[[0.07, 0.04], [0.09, 0.035 + 0.17 * s]], "boot"],
  ];
}

const _WALK_CACHE = new Map();
function soldierWalkFrame(lookId, stance, ts, phase) {
  const px = _soldierPx(ts);
  const key = `${lookId}|${stance}|${px}`;
  let frames = _WALK_CACHE.get(key);
  if (!frames) _WALK_CACHE.set(key, (frames = []));
  const i = ((Math.floor(phase * WALK_FRAMES) % WALK_FRAMES) + WALK_FRAMES) % WALK_FRAMES;
  frames[i] ??= _soldierLayer(px, lookId, stance, (c, l, s) =>
    _paintSoldierLegs(c, l, s, soldierWalkLegs(s, i / WALK_FRAMES)),
  );
  return frames[i];
}

// Figura animata, già ruotata secondo il facing: respiro (scala attorno al
// busto), braccia e arma ruotate/spostate attorno al busto, testa girata.
// anim = unitAnimPose (animations.js): { breath, gunRot, gunDx, gunDy,
// headRot, handL?, mag?, walk?, bodyRot? } in coordinate della figura
// (tile, rivolta a nord); walk = fase del passo, bodyRot = torsione del busto
function _drawAnimatedSoldier(ctx, lookId, pose, ts, anim) {
  const L = soldierLayers(lookId, pose, ts);
  const p = SOLDIER_POSES[pose];
  const S = ts * p.scale; // unità della figura → pixel
  const [tx, ty] = p.torso;
  const [hx, hy] = p.head;
  const draw = (img) => ctx.drawImage(img, -ts / 2, -ts / 2, ts, ts);
  ctx.save();
  ctx.translate(tx * S, ty * S);
  ctx.scale(anim.breath, anim.breath);
  ctx.translate(-tx * S, -ty * S);
  draw(anim.walk != null ? soldierWalkFrame(lookId, pose, ts, anim.walk) : L.legs);
  if (anim.bodyRot) {
    ctx.translate(tx * S, ty * S);
    ctx.rotate(anim.bodyRot);
    ctx.translate(-tx * S, -ty * S);
  }
  draw(L.torso);
  // Braccia e arma attorno al centro del busto
  ctx.save();
  ctx.translate(tx * S, ty * S);
  ctx.rotate(anim.gunRot);
  ctx.translate((anim.gunDx - tx) * S, (anim.gunDy - ty) * S);
  if (anim.handL) {
    // Mano sinistra in movimento (ricarica): braccia ridipinte per questo fotogramma
    ctx.scale(S, S);
    _paintSoldierArms(ctx, SOLDIER_LOOKS[lookId], pose, anim.handL, anim.item ?? anim.mag);
  } else draw(L.arms);
  ctx.restore();
  // Testa girata sul collo
  ctx.save();
  ctx.translate(hx * S, hy * S);
  ctx.rotate(anim.headRot);
  ctx.translate(-hx * S, -hy * S);
  draw(L.head);
  ctx.restore();
  ctx.restore();
}

// Aspetto della classe: campo "sprite", altrimenti il nome se è un aspetto
// noto, altrimenti il fuciliere della fazione
function soldierLook(cls, isEnemy) {
  const base = (isEnemy ? ENEMY_CLASSES : UNIT_CLASSES)[cls]?.sprite ?? cls;
  return SOLDIER_LOOKS[base] ? base : isEnemy ? "grunt" : "assault";
}

// Pedina dell'unità nel tile (x, y): postura e facing (0 = nord … 3 = ovest)
// scelgono la figura e la sua rotazione; turn = rotazione extra (radianti)
// anim = posa animata (animations.js:unitAnimPose), null = figura ferma
function drawUnitSprite(ctx, x, y, ts, cls, isDone, isEnemy, stance, facing, turn = 0, anim = null) {
  const pose = SOLDIER_POSES[stance] ? stance : "stand";
  // anim.turn: rotazione ancora da compiere verso il facing (girata morbida)
  const ang = (facing || 0) * (Math.PI / 2) + turn + (anim?.turn || 0);
  ctx.save();
  if (isDone && !isEnemy) ctx.globalAlpha *= 0.6;
  ctx.translate(x + ts / 2, y + ts / 2);
  // Cambio di postura in corso (anim.stanceFrom, anim.stanceK 0..1): la
  // figura di prima sfuma in quella nuova, ombra compresa
  const from =
    anim?.stanceFrom && anim.stanceFrom !== pose && SOLDIER_POSES[anim.stanceFrom] ? anim.stanceFrom : null;
  // Dissolvenza concentrata a metà (meno fotogrammi con due figure) e la
  // pedina che si contrae un poco mentre cambia, come chi si abbassa
  const k = from ? clamp((anim.stanceK - 0.25) / 0.5, 0, 1) : 1;
  if (from) {
    const squash = 1 - 0.07 * Math.sin(Math.PI * anim.stanceK);
    ctx.scale(squash, squash);
  }
  const ready = (im) => im && im.complete && im.naturalWidth > 0;

  // Immagine da config.json (unitImages), rivolta a nord come la figura
  const img = UNIT_IMG_CACHE[cls]?.[pose];
  if (ready(img)) {
    ctx.rotate(ang);
    // Immagini intere: solo respiro e torsione della camminata
    if (anim) {
      ctx.rotate(anim.bodyRot || 0);
      ctx.scale(anim.breath, anim.breath);
    }
    const prev = from && UNIT_IMG_CACHE[cls]?.[from];
    if (ready(prev) && prev !== img) {
      const a = ctx.globalAlpha;
      ctx.globalAlpha = a * (1 - k);
      ctx.drawImage(prev, -ts / 2, -ts / 2, ts, ts);
      ctx.globalAlpha = a * k;
    }
    ctx.drawImage(img, -ts / 2, -ts / 2, ts, ts);
    ctx.restore();
    return;
  }

  const lookId = soldierLook(cls, isEnemy);
  const figure = (p, alpha) => {
    if (alpha <= 0) return;
    const spr = soldierSprite(lookId, p, ts);
    ctx.save();
    ctx.globalAlpha *= alpha;
    // Ombra: la sagoma ruotata, spostata sempre verso sud-est
    const off = SOLDIER_POSES[p].shadow * ts;
    ctx.save();
    ctx.translate(off, off);
    ctx.rotate(ang);
    ctx.globalAlpha *= 0.35;
    ctx.drawImage(spr.shadow, -ts / 2, -ts / 2, ts, ts);
    ctx.restore();
    ctx.rotate(ang);
    if (anim) _drawAnimatedSoldier(ctx, lookId, p, ts, anim);
    else ctx.drawImage(spr.body, -ts / 2, -ts / 2, ts, ts);
    ctx.restore();
  };
  if (from) figure(from, 1 - k);
  figure(pose, k);
  ctx.restore();
}
