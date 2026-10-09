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

function _grass(ctx, x, y, ts, rng, n) {
  ctx.lineWidth = 0.8;
  ctx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const gx = x + rng() * ts;
    const gy = y + rng() * ts;
    const l = ts * (0.05 + rng() * 0.06);
    ctx.strokeStyle = rng() < 0.6 ? "rgba(150,200,90,0.35)" : _dk(0.22);
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + (rng() - 0.5) * l * 0.8, gy - l);
    ctx.stroke();
  }
}

// Chioma/cespuglio a strati: ombra → base → lobi → luce
function _foliage(ctx, cx, cy, r, rng, cols) {
  _disc(ctx, cx + r * 0.25, cy + r * 0.35, r * 1.05, _dk(0.32));
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

function _tdJungle(ctx, x, y, ts, rng) {
  ctx.fillStyle = _dk(0.25); // sottobosco in ombra
  ctx.fillRect(x, y, ts, ts);
  const crowns = [];
  for (let i = 0; i < 7; i++) crowns.push([x + rng() * ts, y + rng() * ts, ts * (0.14 + rng() * 0.1)]);
  crowns.sort((a, b) => a[1] - b[1]);
  for (const [cx, cy, r] of crowns) {
    _foliage(ctx, cx, cy, r, rng, ["rgba(25,60,18,0.9)", "rgba(50,105,30,0.7)", "rgba(140,200,80,0.28)"]);
  }
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

function _tdObjective(ctx, x, y, ts, rng) {
  _tdPavers(ctx, x, y, ts, rng, 4);
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

const TILE_DETAILS = {
  wall: (ctx, x, y, ts, rng) => _tdBricks(ctx, x, y, ts, rng, false),
  obstacle: (ctx, x, y, ts, rng) => _tdBricks(ctx, x, y, ts, rng, false),
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
  objective: _tdObjective,
  debris: _tdDebris,
  trail: _tdTrail,
  village: _tdVillage,
  bunker: _tdBunker,
};

function drawTileDetails(ctx, tileDef, x, y, ts, col = 0, row = 0) {
  const rng = _tileRng(col, row);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, ts, ts);
  ctx.clip();
  // lieve variazione di luminosità per tile: rompe l'uniformità della griglia
  ctx.fillStyle = _tint(rng() - 0.5, 0.1, 0.05);
  ctx.fillRect(x, y, ts, ts);
  const draw = TILE_DETAILS[tileDef.id];
  // id sconosciuto (nuove mappe config-driven): grana generica
  if (draw) draw(ctx, x, y, ts, rng);
  else _grain(ctx, x, y, ts, rng, 16, 0.09);
  ctx.restore();
}

// ── TRANSIZIONI E OMBRE TRA TILE ───────────────────────────────────────
// Passata eseguita dopo aver disegnato tutti i tile; ogni effetto è disegnato
// nel tile che lo "riceve": sfumature tra terreni diversi (vince la priorità
// più alta), rive del fiume, ombre a sud-est dei tile alti (luce da nord-ovest,
// coerente con i disegni dei tile). Id sconosciuti: altezza da losBlock "full".
const TILE_BLEED_PRIORITY = {
  jungle: 6,
  garden: 5,
  clearing: 4,
  swamp: 4,
  village: 3,
  debris: 3,
  trail: 2,
};
const TILE_HEIGHT = {
  wall: 0.32,
  wall_breach: 0.32,
  obstacle: 0.25,
  building: 0.3,
  temple: 0.34,
  bunker: 0.12,
};
const WATER_IDS = new Set(["river", "ford"]);
const _DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]; // N E S W

function _tileHeight(def) {
  if (!def) return 0;
  return TILE_HEIGHT[def.id] ?? (def.losBlock === "full" ? 0.25 : 0);
}

function _isGround(def) {
  return !!def && !_tileHeight(def) && !WATER_IDS.has(def.id) && def.id !== "bridge";
}

function _hexRgb(color) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color || "");
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
  const n = parseInt(h, 16);
  return `${n >> 16},${(n >> 8) & 255},${n & 255}`;
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

function _drawBleed(ctx, x, y, ts, d, rgb, rng) {
  const len = ts * 0.22;
  _edgeGradient(ctx, x, y, ts, d, len, [
    [0, `rgba(${rgb},0.75)`],
    [0.55, `rgba(${rgb},0.3)`],
    [1, `rgba(${rgb},0)`],
  ]);
  // bordo irregolare: chiazze del terreno vicino a cavallo del lato
  for (let i = 0; i < 5; i++) {
    const [px, py] = _edgePoint(x, y, ts, d, ((i + 0.2 + rng() * 0.6) / 5) * ts, rng() * len * 0.5);
    _disc(ctx, px, py, ts * (0.04 + rng() * 0.05), `rgba(${rgb},0.55)`);
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

function drawTerrainTransitions(ctx, md, ts) {
  const defAt = (c, r) =>
    c < 0 || r < 0 || c >= md.cols || r >= md.rows ? null : md.tileTypes[md.grid[r][c]];
  for (let r = 0; r < md.rows; r++) {
    for (let c = 0; c < md.cols; c++) {
      const def = defAt(c, r);
      if (!def) continue;
      const x = c * ts;
      const y = r * ts;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, ts, ts);
      ctx.clip();
      if (def.id === "river") {
        _DIRS.forEach(([dx, dy], d) => {
          const n = defAt(c + dx, r + dy);
          if (n && !WATER_IDS.has(n.id) && n.id !== "bridge") _drawShore(ctx, x, y, ts, d);
        });
      } else if (_isGround(def)) {
        const p = TILE_BLEED_PRIORITY[def.id] || 0;
        const rng = _tileRng(c + 0.37, r + 0.61);
        _DIRS.forEach(([dx, dy], d) => {
          const n = defAt(c + dx, r + dy);
          if (!_isGround(n) || n.id === def.id) return;
          if ((TILE_BLEED_PRIORITY[n.id] || 0) <= p) return;
          const rgb = _hexRgb(n.color);
          if (rgb) _drawBleed(ctx, x, y, ts, d, rgb, rng);
        });
      }
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

// --- Cappelli ---
function _hatCone(ctx, cx, cy, s, col) {
  ctx.fillStyle = col || "#d4b050";
  _poly(ctx, [
    [cx, cy - s * 0.82],
    [cx - s * 0.44, cy - s * 0.18],
    [cx + s * 0.44, cy - s * 0.18],
  ]);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.35)";
  ctx.lineWidth = s * 0.04;
  ctx.stroke();
  ctx.strokeStyle = "rgba(80,50,0,.55)";
  ctx.lineWidth = s * 0.045;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.38, cy - s * 0.24);
  ctx.lineTo(cx + s * 0.38, cy - s * 0.24);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,240,160,.22)";
  _poly(ctx, [
    [cx - s * 0.02, cy - s * 0.82],
    [cx - s * 0.18, cy - s * 0.2],
    [cx + s * 0.1, cy - s * 0.2],
  ]);
  ctx.fill();
}
function _hatHelmet(ctx, cx, cy, s, col) {
  ctx.fillStyle = col || "#4a5c2e";
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.31, s * 0.26, Math.PI, 0);
  ctx.lineTo(cx + s * 0.3, cy - s * 0.22);
  ctx.lineTo(cx - s * 0.3, cy - s * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.22)";
  ctx.lineWidth = s * 0.03;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.12)";
  ctx.beginPath();
  ctx.arc(cx - s * 0.08, cy - s * 0.38, s * 0.08, 0, Math.PI * 2);
  ctx.fill();
}
function _hatBoonie(ctx, cx, cy, s) {
  ctx.fillStyle = "#4e5e30";
  ctx.beginPath();
  ctx.ellipse(cx, cy - s * 0.22, s * 0.3, s * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a4a22";
  ctx.beginPath();
  ctx.ellipse(cx, cy - s * 0.27, s * 0.2, s * 0.12, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,.22)";
  [
    [cx - s * 0.08, cy - s * 0.29, s * 0.04],
    [cx + s * 0.08, cy - s * 0.3, s * 0.03],
    [cx, cy - s * 0.27, s * 0.03],
  ].forEach(([ax, ay, ar]) => {
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.fill();
  });
}
function _hatPith(ctx, cx, cy, s) {
  ctx.fillStyle = "#7e8f46";
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.34, s * 0.24, Math.PI * 1.08, Math.PI * 1.92);
  ctx.lineTo(cx + s * 0.36, cy - s * 0.22);
  ctx.lineTo(cx - s * 0.36, cy - s * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#6a7a38";
  ctx.fillRect(cx - s * 0.36, cy - s * 0.24, s * 0.72, s * 0.09);
  ctx.fillStyle = "#ee2020";
  _star5(ctx, cx, cy - s * 0.34, s * 0.09);
  ctx.fill();
}
function _hatEngineer(ctx, cx, cy, s) {
  ctx.fillStyle = "#6a7a40";
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.3, s * 0.24, Math.PI, 0);
  ctx.lineTo(cx + s * 0.28, cy - s * 0.24);
  ctx.lineTo(cx - s * 0.28, cy - s * 0.24);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#8aaa50";
  ctx.fillRect(cx - s * 0.27, cy - s * 0.27, s * 0.54, s * 0.08);
  ctx.strokeStyle = "rgba(255,255,255,.30)";
  ctx.lineWidth = s * 0.035;
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.3, s * 0.08, 0, Math.PI * 2);
  ctx.stroke();
}

// --- Testa e corpo ---
function _head(ctx, cx, cy, s, tone) {
  ctx.fillStyle = tone || "#c8956a";
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.2, s * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,.45)";
  ctx.beginPath();
  ctx.arc(cx - s * 0.055, cy - s * 0.215, s * 0.022, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + s * 0.055, cy - s * 0.215, s * 0.022, 0, Math.PI * 2);
  ctx.fill();
}
function _headVN(ctx, cx, cy, s) {
  _head(ctx, cx, cy, s, "#c09058");
}
function _torso(ctx, cx, cy, s, col) {
  ctx.fillStyle = col;
  ctx.fillRect(cx - s * 0.22, cy - s * 0.02, s * 0.44, s * 0.4);
  ctx.strokeStyle = "rgba(0,0,0,.18)";
  ctx.lineWidth = s * 0.025;
  ctx.strokeRect(cx - s * 0.22, cy - s * 0.02, s * 0.44, s * 0.4);
}
function _legs(ctx, cx, cy, s, col) {
  ctx.fillStyle = col;
  ctx.fillRect(cx - s * 0.19, cy + s * 0.36, s * 0.14, s * 0.28);
  ctx.fillRect(cx + s * 0.05, cy + s * 0.36, s * 0.14, s * 0.28);
}
function _armL(ctx, cx, cy, s, col) {
  ctx.strokeStyle = col;
  ctx.lineWidth = s * 0.12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.22, cy + s * 0.04);
  ctx.lineTo(cx - s * 0.36, cy + s * 0.24);
  ctx.stroke();
}
function _armR(ctx, cx, cy, s, col) {
  ctx.strokeStyle = col;
  ctx.lineWidth = s * 0.12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.22, cy + s * 0.04);
  ctx.lineTo(cx + s * 0.38, cy - s * 0.04);
  ctx.stroke();
}

// --- Armi e accessori ---
function _rifle(ctx, cx, cy, s, lng) {
  const len = s * (lng ? 0.82 : 0.56);
  ctx.strokeStyle = "#3a2810";
  ctx.lineWidth = s * 0.08;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.26, cy + s * 0.02);
  ctx.lineTo(cx + s * 0.26 + len, cy + s * 0.02 - len * 0.28);
  ctx.stroke();
  ctx.strokeStyle = "#6a4820";
  ctx.lineWidth = s * 0.035;
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.32, cy);
  ctx.lineTo(cx + s * 0.26 + len, cy + s * 0.02 - len * 0.28);
  ctx.stroke();
}
function _pistol(ctx, cx, cy, s) {
  ctx.strokeStyle = "#2a1808";
  ctx.lineWidth = s * 0.07;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.22, cy + s * 0.06);
  ctx.lineTo(cx + s * 0.44, cy - s * 0.04);
  ctx.stroke();
}
function _medCross(ctx, cx, cy, s) {
  ctx.fillStyle = "rgba(255,255,255,.80)";
  ctx.fillRect(cx - s * 0.1, cy + s * 0.1, s * 0.2, s * 0.06);
  ctx.fillRect(cx - s * 0.04, cy + s * 0.06, s * 0.08, s * 0.14);
}
function _medBag(ctx, cx, cy, s) {
  ctx.fillStyle = "#f0e8cc";
  ctx.fillRect(cx + s * 0.24, cy + s * 0.04, s * 0.18, s * 0.16);
  ctx.fillStyle = "#dd1818";
  ctx.fillRect(cx + s * 0.3, cy + s * 0.07, s * 0.06, s * 0.1);
  ctx.fillRect(cx + s * 0.25, cy + s * 0.1, s * 0.16, s * 0.04);
}

// --- Sprite VC ---
function _sprVCGrunt(ctx, cx, cy, s) {
  _legs(ctx, cx, cy, s, "#1e1e0e");
  _torso(ctx, cx, cy, s, "#262610");
  _armL(ctx, cx, cy, s, "#262610");
  _armR(ctx, cx, cy, s, "#262610");
  _rifle(ctx, cx, cy, s, false);
  _headVN(ctx, cx, cy, s);
  _hatCone(ctx, cx, cy, s);
}
function _sprVCSniper(ctx, cx, cy, s) {
  const dy = s * 0.14;
  _legs(ctx, cx, cy + dy, s, "#181808");
  _torso(ctx, cx, cy + dy, s, "#1e1e08");
  _armL(ctx, cx, cy + dy, s, "#1e1e08");
  _armR(ctx, cx, cy + dy, s, "#1e1e08");
  _rifle(ctx, cx, cy + dy, s, true);
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(cx + s * 0.56, cy + dy - s * 0.11, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
  _headVN(ctx, cx, cy + dy, s);
  _hatCone(ctx, cx, cy + dy, s, "#b89040");
}
function _sprVCCommander(ctx, cx, cy, s) {
  _legs(ctx, cx, cy, s, "#28361a");
  _torso(ctx, cx, cy, s, "#2e3e1c");
  ctx.fillStyle = "#c8a420";
  ctx.fillRect(cx - s * 0.27, cy - s * 0.01, s * 0.11, s * 0.06);
  ctx.fillRect(cx + s * 0.16, cy - s * 0.01, s * 0.11, s * 0.06);
  _armL(ctx, cx, cy, s, "#2e3e1c");
  _armR(ctx, cx, cy, s, "#2e3e1c");
  _pistol(ctx, cx, cy, s);
  _headVN(ctx, cx, cy, s);
  _hatPith(ctx, cx, cy, s);
}

// --- Sprite US ---
function _sprUSAssault(ctx, cx, cy, s) {
  _legs(ctx, cx, cy, s, "#4a5a2c");
  _torso(ctx, cx, cy, s, "#526430");
  ctx.fillStyle = "rgba(0,0,0,.18)";
  ctx.fillRect(cx - s * 0.18, cy + s * 0.04, s * 0.36, s * 0.22);
  _armL(ctx, cx, cy, s, "#4a5a2c");
  _armR(ctx, cx, cy, s, "#4a5a2c");
  _rifle(ctx, cx, cy, s, false);
  _head(ctx, cx, cy, s);
  _hatHelmet(ctx, cx, cy, s);
}
function _sprUSSniper(ctx, cx, cy, s) {
  const dy = s * 0.12;
  _legs(ctx, cx, cy + dy, s, "#3a4a22");
  _torso(ctx, cx, cy + dy, s, "#485830");
  ctx.fillStyle = "rgba(20,30,8,.40)";
  [
    [cx - s * 0.1, cy + dy + s * 0.12, s * 0.07],
    [cx + s * 0.06, cy + dy + s * 0.24, s * 0.06],
    [cx - s * 0.02, cy + dy + s * 0.3, s * 0.07],
  ].forEach(([ax, ay, ar]) => {
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.fill();
  });
  _armL(ctx, cx, cy + dy, s, "#3a4a22");
  _armR(ctx, cx, cy + dy, s, "#3a4a22");
  _rifle(ctx, cx, cy + dy, s, true);
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(cx + s * 0.58, cy + dy - s * 0.14, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
  _head(ctx, cx, cy + dy, s);
  _hatBoonie(ctx, cx, cy + dy, s);
}
function _sprUSEngineer(ctx, cx, cy, s) {
  _legs(ctx, cx, cy, s, "#4a5a2c");
  _torso(ctx, cx, cy, s, "#4a5a30");
  ctx.fillStyle = "#384820";
  ctx.fillRect(cx - s * 0.3, cy + s * 0.01, s * 0.11, s * 0.28);
  _armL(ctx, cx, cy, s, "#4a5a2c");
  _armR(ctx, cx, cy, s, "#4a5a2c");
  ctx.strokeStyle = "#7a7048";
  ctx.lineWidth = s * 0.09;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.26, cy + s * 0.06);
  ctx.lineTo(cx + s * 0.46, cy - s * 0.06);
  ctx.stroke();
  ctx.fillStyle = "#7a7048";
  ctx.beginPath();
  ctx.arc(cx + s * 0.46, cy - s * 0.06, s * 0.07, 0, Math.PI * 2);
  ctx.fill();
  _head(ctx, cx, cy, s);
  _hatEngineer(ctx, cx, cy, s);
}
function _sprUSMedic(ctx, cx, cy, s) {
  _legs(ctx, cx, cy, s, "#4a5a2c");
  _torso(ctx, cx, cy, s, "#5e7840");
  _medCross(ctx, cx, cy, s);
  _medBag(ctx, cx, cy, s);
  _armL(ctx, cx, cy, s, "#4e6234");
  _armR(ctx, cx, cy, s, "#4e6234");
  _head(ctx, cx, cy, s);
  _hatHelmet(ctx, cx, cy, s, "#4a5a2c");
  ctx.fillStyle = "#ee2020";
  ctx.fillRect(cx - s * 0.04, cy - s * 0.46, s * 0.08, s * 0.04);
  ctx.fillRect(cx - s * 0.08, cy - s * 0.44, s * 0.16, s * 0.04);
}

function drawUnitSprite(ctx, x, y, ts, cls, isDone, isEnemy) {
  const cx = x + ts * 0.5;
  const cy = y + ts * 0.52;
  const s = ts * 0.36;
  ctx.save();
  if (isDone && !isEnemy) ctx.globalAlpha = 0.6;

  // Immagine custom da config.json (se caricata correttamente)
  const img = UNIT_IMG_CACHE[cls];
  if (img && img.complete && img.naturalWidth > 0) {
    const pad = ts * 0.08;
    ctx.drawImage(img, x + pad, y + pad, ts - pad * 2, ts - pad * 2);
    ctx.restore();
    return;
  }

  if (isEnemy) {
    if (cls === "commander") _sprVCCommander(ctx, cx, cy, s);
    else if (cls === "sniper_vc") _sprVCSniper(ctx, cx, cy, s);
    else _sprVCGrunt(ctx, cx, cy, s);
  } else {
    if (cls === "sniper") _sprUSSniper(ctx, cx, cy, s);
    else if (cls === "engineer") _sprUSEngineer(ctx, cx, cy, s);
    else if (cls === "medic") _sprUSMedic(ctx, cx, cy, s);
    else _sprUSAssault(ctx, cx, cy, s);
  }
  ctx.restore();
}
