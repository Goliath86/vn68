let _tileAnimLoopActive = false;
let _tileAnimDt = 16;
let _tileAnimLastTime = 0;
let _fxLoopActive = false;

function addFX(type, data, duration) {
  G.effects.push({ type, data, duration, t0: performance.now() });
  if (!_fxLoopActive) {
    _fxLoopActive = true;
    requestAnimationFrame(_fxTick);
  }
}

function _fxTick(now) {
  G.effects = G.effects.filter((fx) => now - fx.t0 < fx.duration);
  renderOverlay();
  if (G.effects.length) requestAnimationFrame(_fxTick);
  else _fxLoopActive = false;
}

function _getTileAnims() {
  if (!G.mapData) return [];
  const global = G.mapData.tileAnimations || [];
  const mObj =
    G.missionType &&
    G.mapData.objectives &&
    G.mapData.objectives[G.missionType];
  const mission = (mObj && !Array.isArray(mObj) && mObj.tileAnimations) || [];
  const fires = (G.activeFires || []).map((f) => ({
    col: f.col,
    row: f.row,
    type: "fire",
    turnsLeft: f.turnsLeft,
  }));
  const smokes = (G.missionState?.smokes || []).map((s) => ({
    col: s.col,
    row: s.row,
    type: "smokeCloud",
    turnsLeft: s.turnsLeft,
  }));
  return [...global, ...mission, ...fires, ...smokes];
}

function _startTileAnimLoop() {
  if (_tileAnimLoopActive) return;
  if (!_getTileAnims().length) return;
  _tileAnimLoopActive = true;
  _tileAnimLastTime = 0;
  requestAnimationFrame(_tileAnimTick);
}

function _tileAnimTick(now) {
  _tileAnimDt = _tileAnimLastTime ? Math.min(now - _tileAnimLastTime, 64) : 16;
  _tileAnimLastTime = now;
  if (G.phase === "gameover" || !_getTileAnims().length) {
    _tileAnimLoopActive = false;
    _tileAnimLastTime = 0;
    return;
  }
  renderMap();
  requestAnimationFrame(_tileAnimTick);
}

function renderTileAnimations(ctx, ts) {
  const anims = _getTileAnims();
  // Dimentica gli istanti di comparsa di fumo/fuoco ormai spenti
  const live = new Set(anims.map(_animKey));
  for (const k of _tileAnimBorn.keys())
    if (!live.has(k)) _tileAnimBorn.delete(k);
  if (!anims.length) return;
  const now = performance.now();
  const seed0 = (anim) => anim.col * 7 + anim.row * 13;
  // Nessun check isTileVisible: il FOW overlay è disegnato dopo e copre
  // naturalmente le animazioni sui tile non visibili. Le particelle che
  // sconfinano in tile visibili adiacenti danno un effetto realistico.
  const clouds = [];
  for (const anim of anims) {
    const { x, y } = tileToScreen(anim.col, anim.row);
    if (anim.type === "smoke") _drawTileSmoke(ctx, x, y, ts, _tileAnimDt, anim);
    else if (anim.type === "fire") _drawTileFire(ctx, x, y, ts, now, anim);
    else if (anim.type === "fog") _drawTileFog(ctx, x, y, ts, now, seed0(anim));
    else if (anim.type === "smokeCloud") clouds.push(anim);
  }
  _drawSmokeClouds(ctx, ts, now, clouds);
}

// Runtime-only (non salvato): istante di comparsa di ogni tile animato, per
// far crescere fumo e fuoco invece di farli apparire di colpo
const _tileAnimBorn = new Map();

function _animKey(anim) {
  return `${anim.type}:${anim.col},${anim.row}`;
}

// 0→1 nei primi `ms` millisecondi dalla comparsa, con easing che rallenta
function _animGrow(anim, now, ms) {
  const key = _animKey(anim);
  if (!_tileAnimBorn.has(key)) _tileAnimBorn.set(key, now);
  const g = Math.min(1, (now - _tileAnimBorn.get(key)) / ms);
  return 1 - (1 - g) ** 3;
}

// ── SMOKE CLOUD — cortina fumogena (fumogeni) ───────────────────────────
// Sbuffi morbidi che sconfinano nei tile vicini: più tile fumati si fondono
// in un'unica nube. Disegnata a strati su tutti i tile insieme (ombre → velo
// → luci) così un tile non copre gli sbuffi del vicino creando cuciture.
const SMOKE_PUFFS = 5;

function _hash01(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function _smokePuff(ctx, cx, cy, r, rgb, alpha) {
  if (alpha <= 0.005 || r <= 0) return;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(${rgb},${alpha.toFixed(3)})`);
  g.addColorStop(0.55, `rgba(${rgb},${(alpha * 0.55).toFixed(3)})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function _drawSmokeClouds(ctx, ts, now, clouds) {
  if (!clouds.length) return;

  // Geometria animata di ogni tile (calcolata una volta, usata da tutti gli strati)
  const tiles = clouds.map((anim) => {
    const ease = _animGrow(anim, now, 1400); // espansione rapida che rallenta
    const thin = anim.turnsLeft <= 1 ? 0.6 : 1; // ultimo turno: si dirada
    const seed = anim.col * 31 + anim.row * 57;
    const { x, y } = tileToScreen(anim.col, anim.row);
    const cx = x + ts * 0.5,
      cy = y + ts * 0.5;
    const windX = Math.sin(now / 4200 + seed * 0.1) * ts * 0.05;
    const puffs = [];
    for (let i = 0; i < SMOKE_PUFFS; i++) {
      const h = seed + i * 17;
      const dir = i % 2 ? 1 : -1;
      const ang = _hash01(h) * Math.PI * 2 + dir * now * (0.00012 + _hash01(h + 1) * 0.00015);
      const d = (0.12 + _hash01(h + 2) * 0.22) * ts * (0.5 + 0.5 * ease);
      const r =
        ts *
        (0.3 + _hash01(h + 3) * 0.16) *
        (1 + 0.08 * Math.sin(now / 1700 + h)) *
        (0.4 + 0.6 * ease);
      puffs.push({
        px: cx + Math.cos(ang) * d + windX,
        py: cy + Math.sin(ang) * d * 0.8,
        r,
      });
    }
    return { cx, cy, a: ease * thin, ease, puffs };
  });

  ctx.save();
  // 1) Ombre: danno volume alla parte bassa degli sbuffi
  for (const tl of tiles)
    for (const p of tl.puffs)
      _smokePuff(ctx, p.px + ts * 0.05, p.py + ts * 0.07, p.r, "95,98,94", 0.22 * tl.a);
  // 2) Velo di base: copre bene il tile e sfuma oltre i bordi
  for (const tl of tiles)
    _smokePuff(ctx, tl.cx, tl.cy, ts * 0.8 * (0.5 + 0.5 * tl.ease), "165,167,162", 0.55 * tl.a);
  // 3) Corpo e luci degli sbuffi
  for (const tl of tiles)
    for (const p of tl.puffs) {
      _smokePuff(ctx, p.px, p.py, p.r, "196,197,191", 0.42 * tl.a);
      _smokePuff(ctx, p.px - ts * 0.03, p.py - ts * 0.04, p.r * 0.6, "232,232,226", 0.38 * tl.a);
    }
  ctx.restore();
}

// ── SMOKE — particle system con gradiente radiale ────────────────────────
// Coordinate tile-relative (frazione di ts) — indipendenti da camera e zoom
function _smokeAddParticle(particles) {
  particles.push({
    rx: (Math.random() - 0.5) * 0.3, // offset X iniziale (±0.15 ts)
    ry: 0.22 + Math.random() * 0.12, // parte bassa del tile
    vx: (Math.random() - 0.5) * 0.0001, // deriva laterale minima (ts/ms)
    vy0: -(0.0003 + Math.random() * 0.0002), // salita lenta (ts/ms) — totale ~0.6–0.8 ts
    age: 0,
    lifetime: 5000 + Math.random() * 4000, // vita lunga per vederla salire piano
    r0: 0.1, // raggio iniziale
    r1: 0.26 + Math.random() * 0.12, // raggio finale: 26–38% di ts
  });
}

function _drawTileSmoke(ctx, x, y, ts, dt, anim) {
  if (!anim._particles) {
    anim._particles = [];
    // Pre-semina con lifecycle scaglionato: fumo visibile fin dal primo frame
    for (let i = 0; i < 9; i++) {
      _smokeAddParticle(anim._particles);
      const p = anim._particles[i];
      const target = p.lifetime * (i / 9) * 0.85;
      const stepDt = target / 25;
      for (let s = 0; s < 25; s++) {
        const frac = p.age / p.lifetime;
        p.rx += p.vx * stepDt;
        p.ry += p.vy0 * (1 - Math.sqrt(Math.max(0, frac))) * stepDt;
        p.age += stepDt;
      }
    }
  }

  if (Math.random() < dt / 480) _smokeAddParticle(anim._particles);

  ctx.save();
  for (let i = anim._particles.length - 1; i >= 0; i--) {
    const p = anim._particles[i];
    p.age += dt;
    if (p.age >= p.lifetime) {
      anim._particles.splice(i, 1);
      continue;
    }

    const frac = p.age / p.lifetime;
    p.rx += p.vx * dt;
    p.ry += p.vy0 * (1 - Math.sqrt(frac)) * dt;

    // Converti a schermo solo al draw-time: segue camera e zoom automaticamente
    const drawX = x + ts * (0.5 + p.rx);
    const drawY = y + ts * (0.5 + p.ry);
    const radius = (p.r0 + (p.r1 - p.r0) * Math.sqrt(frac)) * ts;
    const alpha = (1 - Math.abs(1 - 2 * frac)) * 0.82;

    const grad = ctx.createRadialGradient(
      drawX,
      drawY,
      0,
      drawX,
      drawY,
      radius,
    );
    grad.addColorStop(0, `rgba(225,220,215,${alpha})`);
    grad.addColorStop(0.6, `rgba(208,203,198,${(alpha * 0.4).toFixed(3)})`);
    grad.addColorStop(1, "rgba(190,186,182,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ── FIRE — incendio: terreno bruciato, bagliore, lingue di fiamma, faville ──
// Strati: base carbonizzata → fumo che sale → bagliore e fiamme in modalità
// additiva ("lighter", così si illuminano a vicenda) → faville.
const FIRE_TONGUES = 7;
const FIRE_EMBERS = 7;

// Lingua di fiamma a goccia: base arrotondata in (bx,by), punta in (tipX, by-h)
function _flameTongue(ctx, bx, by, w, h, tipX, stops) {
  const g = ctx.createLinearGradient(bx, by, bx, by - h);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(bx - w, by);
  ctx.quadraticCurveTo(bx - w, by - h * 0.55, tipX, by - h);
  ctx.quadraticCurveTo(bx + w, by - h * 0.55, bx + w, by);
  ctx.arc(bx, by, w, 0, Math.PI);
  ctx.fill();
}

function _drawTileFire(ctx, x, y, ts, now, anim) {
  const seed = anim.col * 31 + anim.row * 57;
  const grow = _animGrow(anim, now, 900);
  const dying = anim.turnsLeft <= 1 ? 0.65 : 1; // ultimo turno: si affievolisce
  const k = grow * dying;
  const cx = x + ts * 0.5,
    baseY = y + ts * 0.8;
  // Sfarfallio globale: somma di sinusoidi a frequenze diverse
  const flick =
    0.88 + 0.08 * Math.sin(now / 83 + seed) + 0.04 * Math.sin(now / 31 + seed * 2);

  ctx.save();
  // 1) Terreno carbonizzato
  _smokePuff(ctx, cx, y + ts * 0.62, ts * 0.48, "25,14,6", 0.5 * grow);

  // 2) Fumo scuro che sale dalle punte delle fiamme
  for (let i = 0; i < 3; i++) {
    const ph = (now / 2600 + i / 3 + _hash01(seed + i)) % 1;
    const sx = cx + Math.sin(now / 900 + i * 2 + seed) * ts * 0.1 + ph * ts * 0.12;
    const sy = baseY - ts * (0.45 + ph * 0.75);
    const sa = (ph < 0.2 ? ph / 0.2 : 1 - (ph - 0.2) / 0.8) * 0.3 * k;
    _smokePuff(ctx, sx, sy, ts * (0.14 + ph * 0.22), "45,42,40", sa);
  }

  ctx.globalCompositeOperation = "lighter";
  // 3) Bagliore sul terreno circostante
  _smokePuff(ctx, cx, baseY - ts * 0.15, ts * 0.85, "255,110,20", 0.22 * k * flick);

  // 4) Lingue di fiamma: esterne rosso-arancio, poi nuclei giallo-bianchi
  const tongues = [];
  for (let i = 0; i < FIRE_TONGUES; i++) {
    const h0 = seed + i * 13;
    const bx = x + ts * (0.22 + (0.56 * (i + 0.5)) / FIRE_TONGUES) + (_hash01(h0) - 0.5) * ts * 0.06;
    // Le lingue centrali sono più alte
    const centre = 1 - Math.abs(i - (FIRE_TONGUES - 1) / 2) / FIRE_TONGUES;
    const lick = 0.8 + 0.2 * Math.sin(now / (110 + _hash01(h0 + 1) * 90) + h0);
    const h = ts * (0.22 + 0.38 * centre) * lick * k;
    const w = ts * (0.07 + _hash01(h0 + 2) * 0.04) * (0.6 + 0.4 * k);
    const sway = Math.sin(now / 240 + h0) * w * 0.9;
    const by = baseY + (_hash01(h0 + 3) - 0.5) * ts * 0.06;
    tongues.push({ bx, by, w, h, tipX: bx + sway });
  }
  for (const f of tongues)
    _flameTongue(ctx, f.bx, f.by, f.w, f.h, f.tipX, [
      [0, "rgba(255,150,30,0.75)"],
      [0.5, "rgba(230,70,10,0.55)"],
      [1, "rgba(150,20,0,0)"],
    ]);
  for (const f of tongues)
    _flameTongue(ctx, f.bx, f.by, f.w * 0.5, f.h * 0.6, f.bx + (f.tipX - f.bx) * 0.6, [
      [0, "rgba(255,250,215,0.8)"],
      [0.45, "rgba(255,210,70,0.55)"],
      [1, "rgba(255,140,20,0)"],
    ]);

  // 5) Faville: salgono ondeggiando e si spengono
  for (let i = 0; i < FIRE_EMBERS; i++) {
    const h0 = seed + i * 29;
    const ph = (now / (1300 + _hash01(h0) * 900) + _hash01(h0 + 1)) % 1;
    const ex = x + ts * (0.3 + _hash01(h0 + 2) * 0.4) + Math.sin(ph * 9 + h0) * ts * 0.08;
    const ey = baseY - ts * (0.15 + ph * 0.95);
    const ea = (1 - ph) * k;
    ctx.fillStyle = `rgba(255,${Math.floor(200 - ph * 120)},40,${ea.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(ex, ey, Math.max(1, ts * 0.018 * (1 - ph * 0.5)), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function _drawTileFog(ctx, x, y, ts, now, seed) {
  const pulse = 0.22 + 0.1 * Math.sin(now / 2400 + seed);
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = "rgb(190,205,215)";
  ctx.fillRect(x, y, ts, ts);
  ctx.restore();
}

function renderEffects(ctx, ts) {
  const now = performance.now();
  for (const fx of G.effects) {
    const t = Math.min(1, (now - fx.t0) / fx.duration);
    _drawEffect(ctx, ts, fx, t);
  }
}

function _drawEffect(ctx, ts, fx, p) {
  ctx.save();
  switch (fx.type) {
    case "move": {
      const { fromCol, fromRow, toCol, toRow } = fx.data;
      const { x: fx0, y: fy0 } = tileToScreen(fromCol, fromRow);
      const { x: tx0, y: ty0 } = tileToScreen(toCol, toRow);
      const cx0 = fx0 + ts * 0.5,
        cy0 = fy0 + ts * 0.5,
        cx1 = tx0 + ts * 0.5,
        cy1 = ty0 + ts * 0.5;
      const a = p < 0.7 ? 0.6 : 0.6 * (1 - (p - 0.7) / 0.3);
      ctx.strokeStyle = `rgba(240,220,150,${a})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cx0, cy0);
      ctx.lineTo(cx1, cy1);
      ctx.stroke();
      ctx.setLineDash([]);
      if (p > 0.25) {
        const pct = (p - 0.25) / 0.75;
        ctx.strokeStyle = `rgba(160,230,160,${(1 - pct) * 0.75})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx1, cy1, ts * 0.45 * pct, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }

    case "shot": {
      _drawShot(ctx, ts, fx, p);
      break;
    }

    case "hit": {
      _drawHit(ctx, ts, fx, p);
      break;
    }

    case "miss": {
      _drawMiss(ctx, ts, fx, p);
      break;
    }

    case "death": {
      _drawDeath(ctx, ts, fx.data, p);
      break;
    }

    case "spot": {
      const { col, row } = fx.data;
      const { x, y } = tileToScreen(col, row);
      const cx = x + ts * 0.5,
        bounce = Math.sin(p * Math.PI * 5) * ts * 0.06;
      const a = p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2;
      ctx.fillStyle = `rgba(255,180,0,${a})`;
      ctx.font = `bold ${Math.round(ts * 0.52)}px 'Oswald'`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("!", cx, y + bounce);
      if (p < 0.4) {
        ctx.strokeStyle = `rgba(255,150,0,${0.8 * (1 - p / 0.4)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(
          x + ts * 0.5,
          y + ts * 0.5,
          ts * 0.5 * (p / 0.4),
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
      break;
    }

    case "heal": {
      _drawHeal(ctx, ts, fx.data, p);
      break;
    }

    case "overwatch": {
      const { owCol, owRow, tCol, tRow } = fx.data;
      const { x: ox, y: oy } = tileToScreen(owCol, owRow);
      const { x: tx2, y: ty2 } = tileToScreen(tCol, tRow);
      const osx = ox + ts * 0.5,
        osy = oy + ts * 0.5,
        otx = tx2 + ts * 0.5,
        oty = ty2 + ts * 0.5;
      if (p < 0.35) {
        const ft = p / 0.35;
        ctx.strokeStyle = `rgba(180,220,255,${0.9 * (1 - ft)})`;
        ctx.lineWidth = 3;
        ctx.strokeRect(ox + 2, oy + 2, ts - 4, ts - 4);
      }
      ctx.strokeStyle = `rgba(180,220,255,${0.85 * (1 - p)})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      const tt2 = Math.min(1, p / 0.75);
      ctx.beginPath();
      ctx.moveTo(osx, osy);
      ctx.lineTo(osx + (otx - osx) * tt2, osy + (oty - osy) * tt2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (p < 0.5) {
        ctx.fillStyle = `rgba(180,220,255,${1 - p / 0.5})`;
        ctx.font = `bold ${Math.round(ts * 0.24)}px 'Oswald'`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(t("fx.overwatch"), osx, oy);
      }
      break;
    }

    case "suppression": {
      const { supCol, supRow, tCol, tRow } = fx.data;
      const { x: ox2, y: oy2 } = tileToScreen(supCol, supRow);
      const { x: tx3, y: ty3 } = tileToScreen(tCol, tRow);
      const ssx = ox2 + ts * 0.5,
        ssy = oy2 + ts * 0.5,
        stx = tx3 + ts * 0.5,
        sty = ty3 + ts * 0.5;
      if (p < 0.35) {
        const ft = p / 0.35;
        ctx.strokeStyle = `rgba(255,165,50,${0.9 * (1 - ft)})`;
        ctx.lineWidth = 3;
        ctx.strokeRect(ox2 + 2, oy2 + 2, ts - 4, ts - 4);
      }
      ctx.strokeStyle = `rgba(255,165,50,${0.85 * (1 - p)})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      const stt = Math.min(1, p / 0.75);
      ctx.beginPath();
      ctx.moveTo(ssx, ssy);
      ctx.lineTo(ssx + (stx - ssx) * stt, ssy + (sty - ssy) * stt);
      ctx.stroke();
      ctx.setLineDash([]);
      if (p < 0.5) {
        ctx.fillStyle = `rgba(255,165,50,${1 - p / 0.5})`;
        ctx.font = `bold ${Math.round(ts * 0.24)}px 'Oswald'`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(t("fx.suppression"), ssx, oy2);
      }
      break;
    }

    case "spawn": {
      const { col, row } = fx.data;
      const { x, y } = tileToScreen(col, row);
      const cx = x + ts * 0.5,
        cy = y + ts * 0.5;
      for (let w = 0; w < 2; w++) {
        const wt = (p + w * 0.5) % 1;
        ctx.strokeStyle = `rgba(200,40,40,${(1 - wt) * 0.7})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, ts * 0.65 * wt, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }

    case "demolition": {
      const { col, row, success } = fx.data;
      const { x, y } = tileToScreen(col, row);
      const cx = x + ts * 0.5,
        cy = y + ts * 0.5;
      if (p < 0.55) {
        const dt = p / 0.55;
        ctx.fillStyle = `rgba(180,150,80,${(1 - dt) * 0.55})`;
        ctx.beginPath();
        ctx.arc(cx, cy, ts * 0.5 * dt, 0, Math.PI * 2);
        ctx.fill();
      }
      if (p > 0.18) {
        const ta = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3,
          fy3 = cy - ts * 0.45 * (p - 0.18);
        ctx.fillStyle = success
          ? `rgba(100,255,100,${ta})`
          : `rgba(255,120,80,${ta})`;
        ctx.font = `bold ${Math.round(ts * 0.26)}px 'Special Elite'`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          success ? t("fx.demolition_success") : t("fx.demolition_fail"),
          cx,
          fy3,
        );
      }
      break;
    }

    case "explosion": {
      _drawExplosion(ctx, ts, fx.data, p);
      break;
    }
  }
  ctx.restore();
}

// ── SHOT — colpo singolo: vampata, traccianti, impatto ──────────────────
// Traccianti rossi per gli US e verdi per i VC (munizioni sovietiche).
// Colpi per attacco dal campo `rounds` dell'arma; se assente raffica di 3,
// cecchino 1 colpo (più veloce). Se il colpo va a vuoto i traccianti deviano
// e finiscono a terra oltre il bersaglio.
const SHOT_TRACER_RGB = { us: "255,95,60", vc: "130,255,110" };

function _drawShot(ctx, ts, fx, p) {
  const { fromCol, fromRow, toCol, toRow, enemy, hit, sniper } = fx.data;
  const { x: fx0, y: fy0 } = tileToScreen(fromCol, fromRow);
  const { x: tx0, y: ty0 } = tileToScreen(toCol, toRow);
  const sx = fx0 + ts * 0.5,
    sy = fy0 + ts * 0.5,
    ex = tx0 + ts * 0.5,
    ey = ty0 + ts * 0.5;
  const len = Math.hypot(ex - sx, ey - sy) || 1;
  const ux = (ex - sx) / len,
    uy = (ey - sy) / len;
  const nx = -uy,
    ny = ux;
  const mx = sx + ux * ts * 0.32, // bocca dell'arma
    my = sy + uy * ts * 0.32;
  const rgb = enemy ? SHOT_TRACER_RGB.vc : SHOT_TRACER_RGB.us;
  const rounds = clamp(Math.round(fx.data.rounds ?? (sniper ? 1 : 3)), 1, 5);
  const stagger = 0.12,
    travel = sniper ? 0.2 : 0.32;
  const seed = Math.floor(fx.t0) % 997;

  // Filo di fumo dalla bocca dell'arma
  if (p > 0.05) {
    const sp = (p - 0.05) / 0.95;
    _smokePuff(
      ctx,
      mx + ux * ts * 0.12 * sp,
      my + uy * ts * 0.12 * sp - ts * 0.1 * sp,
      ts * (0.08 + 0.14 * sp),
      "190,188,182",
      0.35 * (1 - sp),
    );
  }

  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < rounds; i++) {
    const t0 = i * stagger;
    const local = p - t0;
    if (local < 0) continue;
    const h = seed + i * 19;
    // Punto d'arrivo: vicino al centro se colpisce, deviato e oltre se manca
    const spread = hit ? 0.08 : 0.3 + _hash01(h) * 0.15;
    const side = (_hash01(h + 1) - 0.5) * 2 * spread * ts;
    const over = hit ? 0 : ts * (0.25 + _hash01(h + 2) * 0.3);
    const ix = ex + nx * side + ux * over,
      iy = ey + ny * side + uy * over;

    // Vampata alla bocca dell'arma
    ctx.globalCompositeOperation = "lighter";
    const f = local / 0.1;
    if (f < 1) {
      _smokePuff(ctx, mx, my, ts * 0.2, "255,225,150", 0.9 * (1 - f));
      const fl = ts * (sniper ? 0.38 : 0.28) * (1 - f * 0.5),
        fw = ts * 0.07 * (1 - f);
      ctx.fillStyle = `rgba(255,240,190,${(0.85 * (1 - f)).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(mx + nx * fw, my + ny * fw);
      ctx.lineTo(mx + ux * fl, my + uy * fl);
      ctx.lineTo(mx - nx * fw, my - ny * fw);
      ctx.fill();
    }

    // Tracciante: testa luminosa con coda sfumata
    const q = local / travel;
    if (q < 1) {
      const hx = mx + (ix - mx) * q,
        hy = my + (iy - my) * q;
      const dx = ix - mx,
        dy = iy - my;
      const dl = Math.hypot(dx, dy) || 1;
      const tail = Math.min(ts * (sniper ? 1.6 : 0.9), dl * q);
      const tx = hx - (dx / dl) * tail,
        ty = hy - (dy / dl) * tail;
      const g = ctx.createLinearGradient(tx, ty, hx, hy);
      g.addColorStop(0, `rgba(${rgb},0)`);
      g.addColorStop(1, `rgba(${rgb},0.95)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(1.5, ts * (sniper ? 0.025 : 0.035));
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      _smokePuff(ctx, hx, hy, ts * 0.07, "255,245,220", 0.9);
      continue;
    }

    // Impatto
    const r = (local - travel) / 0.22;
    if (r >= 1) continue;
    if (hit) {
      // Scintille che rimbalzano indietro verso il tiratore
      _smokePuff(ctx, ix, iy, ts * 0.14, "255,200,120", 0.8 * (1 - r));
      ctx.lineWidth = Math.max(1, ts * 0.015);
      ctx.strokeStyle = `rgba(255,210,120,${(0.9 * (1 - r)).toFixed(3)})`;
      for (let k = 0; k < 5; k++) {
        const a = Math.atan2(-uy, -ux) + (_hash01(h + 3 + k) - 0.5) * 2.4;
        const d0 = ts * 0.2 * r,
          d1 = ts * (0.08 + 0.22 * r);
        ctx.beginPath();
        ctx.moveTo(ix + Math.cos(a) * d0, iy + Math.sin(a) * d0);
        ctx.lineTo(ix + Math.cos(a) * d1, iy + Math.sin(a) * d1);
        ctx.stroke();
      }
    } else {
      // Polvere sollevata dal proiettile che finisce a terra
      ctx.globalCompositeOperation = "source-over";
      _smokePuff(ctx, ix, iy, ts * (0.08 + 0.14 * r), "150,128,92", 0.55 * (1 - r));
      ctx.fillStyle = `rgba(90,70,45,${(0.8 * (1 - r)).toFixed(3)})`;
      for (let k = 0; k < 3; k++) {
        const a = _hash01(h + 9 + k) * Math.PI * 2,
          d = ts * 0.18 * r;
        ctx.fillRect(ix + Math.cos(a) * d - 1, iy + Math.sin(a) * d - 1, 2, 2);
      }
    }
  }
  ctx.restore();
}

// ── HEAL — cura del medico ──────────────────────────────────────────────
// Sfera di luce dal medico al ferito (se su tile diversi) → alone e anelli
// verdi → piccole croci che salgono → croce medica con rimbalzo → "+N HP".
const HEAL_MOTES = 10;

// Croce "+" centrata in (cx,cy) con lato s
function _plusPath(ctx, cx, cy, s) {
  const a = s * 0.5,
    b = s * 0.17;
  ctx.beginPath();
  ctx.moveTo(cx - b, cy - a);
  ctx.lineTo(cx + b, cy - a);
  ctx.lineTo(cx + b, cy - b);
  ctx.lineTo(cx + a, cy - b);
  ctx.lineTo(cx + a, cy + b);
  ctx.lineTo(cx + b, cy + b);
  ctx.lineTo(cx + b, cy + a);
  ctx.lineTo(cx - b, cy + a);
  ctx.lineTo(cx - b, cy + b);
  ctx.lineTo(cx - a, cy + b);
  ctx.lineTo(cx - a, cy - b);
  ctx.lineTo(cx - b, cy - b);
  ctx.closePath();
}

function _drawHeal(ctx, ts, data, p) {
  const { col, row, amount, fromCol, fromRow } = data;
  const { x, y } = tileToScreen(col, row);
  const cx = x + ts * 0.5,
    cy = y + ts * 0.5;
  const seed = col * 31 + row * 57;
  const hasFrom =
    fromCol != null && (fromCol !== col || fromRow !== row);
  const t0 = hasFrom ? 0.2 : 0;
  const q = Math.max(0, (p - t0) / (1 - t0)); // tempo locale dopo l'arrivo

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // 1) Sfera di luce dal medico al ferito, con scia
  if (hasFrom && p < t0 + 0.05) {
    const { x: mx0, y: my0 } = tileToScreen(fromCol, fromRow);
    const mx = mx0 + ts * 0.5,
      my = my0 + ts * 0.5;
    const o = Math.min(1, p / t0);
    const e = o * o * (3 - 2 * o);
    const ox = mx + (cx - mx) * e,
      oy = my + (cy - my) * e;
    const trail = Math.max(0, e - 0.25);
    const g = ctx.createLinearGradient(mx + (cx - mx) * trail, my + (cy - my) * trail, ox, oy);
    g.addColorStop(0, "rgba(120,255,140,0)");
    g.addColorStop(1, "rgba(120,255,140,0.7)");
    ctx.strokeStyle = g;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(2, ts * 0.06);
    ctx.beginPath();
    ctx.moveTo(mx + (cx - mx) * trail, my + (cy - my) * trail);
    ctx.lineTo(ox, oy);
    ctx.stroke();
    _smokePuff(ctx, ox, oy, ts * 0.18, "160,255,170", 0.9);
  }

  if (q > 0) {
    // 2) Alone verde che pulsa sotto l'unità
    _smokePuff(ctx, cx, cy + ts * 0.1, ts * 0.65, "70,220,100", 0.45 * Math.sin(Math.PI * q));

    // 3) Due anelli che si allargano sfasati
    for (let k = 0; k < 2; k++) {
      const r = (q - k * 0.18) / 0.6;
      if (r <= 0 || r >= 1) continue;
      ctx.strokeStyle = `rgba(120,255,140,${(0.8 * (1 - r)).toFixed(3)})`;
      ctx.lineWidth = Math.max(1.5, ts * 0.035 * (1 - r));
      ctx.beginPath();
      ctx.arc(cx, cy, ts * (0.15 + 0.5 * (1 - (1 - r) ** 2)), 0, Math.PI * 2);
      ctx.stroke();
    }

    // 4) Piccole croci luminose che salgono ondeggiando
    for (let i = 0; i < HEAL_MOTES; i++) {
      const h = seed + i * 17;
      const start = _hash01(h) * 0.45;
      const m = (q - start) / 0.5;
      if (m <= 0 || m >= 1) continue;
      const mxp = cx + (_hash01(h + 1) - 0.5) * ts * 0.7 + Math.sin(m * 6 + h) * ts * 0.05;
      const myp = y + ts * (0.85 - 0.75 * m);
      const ma = Math.sin(Math.PI * m) * 0.9;
      _smokePuff(ctx, mxp, myp, ts * 0.07, "120,255,140", ma * 0.5);
      ctx.fillStyle = `rgba(210,255,215,${ma.toFixed(3)})`;
      _plusPath(ctx, mxp, myp, ts * (0.05 + _hash01(h + 2) * 0.04));
      ctx.fill();
    }
  }
  ctx.restore();

  if (q <= 0) return;

  // 5) Croce medica: compare con un rimbalzo, sale e svanisce
  const pop = Math.min(1, q / 0.2);
  const scale = pop < 1 ? 1 + 2.2 * (pop - 1) ** 3 + 1.2 * (pop - 1) ** 2 : 1; // back-out
  const ca = q < 0.6 ? 1 : Math.max(0, 1 - (q - 0.6) / 0.3);
  if (ca > 0) {
    const crossY = cy - ts * 0.12 * q;
    const s = ts * 0.34 * scale;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    _smokePuff(ctx, cx, crossY, ts * 0.32 * scale, "90,240,120", 0.55 * ca);
    ctx.restore();
    ctx.fillStyle = `rgba(255,255,255,${(0.95 * ca).toFixed(3)})`;
    ctx.strokeStyle = `rgba(40,150,60,${ca.toFixed(3)})`;
    ctx.lineWidth = Math.max(1.5, ts * 0.025);
    ctx.lineJoin = "round";
    _plusPath(ctx, cx, crossY, s);
    ctx.fill();
    ctx.stroke();
  }

  // 6) "+N HP" con contorno scuro, leggibile su qualsiasi terreno
  const fy = cy - ts * 0.35 - ts * 0.4 * q,
    ta = q < 0.7 ? Math.min(1, q / 0.1) : 1 - (q - 0.7) / 0.3;
  ctx.font = `bold ${Math.round(ts * 0.3)}px 'Oswald'`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, ts * 0.06);
  ctx.strokeStyle = `rgba(10,40,15,${(0.85 * ta).toFixed(3)})`;
  ctx.strokeText(`+${amount}HP`, cx, fy);
  ctx.fillStyle = `rgba(130,255,140,${ta.toFixed(3)})`;
  ctx.fillText(`+${amount}HP`, cx, fy);
}

// ── HIT — unità colpita ─────────────────────────────────────────────────
// Lampo d'impatto, mirino a X ("hit marker"), schizzi rossi che volano via
// dal lato opposto a chi ha sparato (data.fromCol/fromRow; per le esplosioni
// il centro del blast) e numero del danno con rimbalzo e contorno.
const HIT_DROPS = 8;

function _drawHit(ctx, ts, fx, p) {
  const { col, row, dmg, fromCol, fromRow } = fx.data;
  const { x, y } = tileToScreen(col, row);
  const cx = x + ts * 0.5,
    cy = y + ts * 0.5;
  const seed = Math.floor(fx.t0) % 997;
  // Direzione degli schizzi: via da chi ha sparato, altrimenti tutt'intorno
  const hasDir = fromCol != null && (fromCol !== col || fromRow !== row);
  const baseAng = hasDir ? Math.atan2(row - fromRow, col - fromCol) : 0;
  const cone = hasDir ? 1.6 : Math.PI * 2;

  // 1) Schizzi rossi: volano via, rallentano e si posano
  const sp = Math.min(1, p / 0.45);
  const sa = 0.85 * (1 - Math.max(0, (p - 0.45) / 0.55));
  if (sa > 0) {
    ctx.fillStyle = `rgba(140,10,10,${sa.toFixed(3)})`;
    for (let i = 0; i < HIT_DROPS; i++) {
      const h = seed + i * 11;
      const ang = baseAng + (_hash01(h) - 0.5) * cone;
      const d = ts * (0.18 + _hash01(h + 1) * 0.32) * (1 - (1 - sp) ** 2);
      const r = Math.max(1, ts * (0.018 + _hash01(h + 2) * 0.022) * (1 - sp * 0.3));
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // 2) Lampo d'impatto sull'unità
  if (p < 0.2) {
    _smokePuff(ctx, cx, cy, ts * 0.42, "255,70,40", 0.75 * (1 - p / 0.2));
    _smokePuff(ctx, cx, cy, ts * 0.16, "255,230,200", 0.9 * (1 - p / 0.2));
  }
  // 3) Anello sottile che si allarga
  if (p < 0.35) {
    const rp = p / 0.35;
    ctx.strokeStyle = `rgba(255,120,80,${(0.8 * (1 - rp)).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.5, ts * 0.03 * (1 - rp));
    ctx.beginPath();
    ctx.arc(cx, cy, ts * (0.2 + 0.35 * (1 - (1 - rp) ** 2)), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // 4) Mirino a X: quattro tacche diagonali che si stringono e svaniscono
  if (p < 0.45) {
    const mp = p / 0.45;
    const r0 = ts * (0.3 - 0.08 * mp),
      r1 = r0 + ts * 0.14;
    ctx.strokeStyle = `rgba(255,245,235,${(0.95 * (1 - mp)).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.5, ts * 0.035);
    ctx.lineCap = "round";
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
  }

  // 5) Danno: compare con un rimbalzo, sale e svanisce; più grande se forte
  const pop = Math.min(1, p / 0.15);
  const scale = pop < 1 ? 1 + 2.2 * (pop - 1) ** 3 + 1.2 * (pop - 1) ** 2 : 1;
  const ta = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
  const size = ts * (0.32 + 0.04 * Math.min(dmg, 4)) * Math.max(0.01, scale);
  const fy = cy - ts * 0.25 - ts * 0.35 * p;
  ctx.font = `bold ${Math.round(size)}px 'Oswald'`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, size * 0.18);
  ctx.strokeStyle = `rgba(50,0,0,${(0.85 * ta).toFixed(3)})`;
  ctx.strokeText(`-${dmg}`, cx, fy);
  ctx.fillStyle = `rgba(255,85,55,${ta.toFixed(3)})`;
  ctx.fillText(`-${dmg}`, cx, fy);
}

// ── MISS — colpo mancato ────────────────────────────────────────────────
// Colpo singolo: scie d'aria del proiettile che passa accanto e rimbalzo
// (scintilla a terra + scia deviata, in sincronia col suono di ricochet).
// Esplosione (data.blast): polvere ai piedi, il bersaglio si è riparato.
// Poi la scritta "MANCATO" con rimbalzo e contorno.
function _drawMiss(ctx, ts, fx, p) {
  const { col, row, fromCol, fromRow, blast } = fx.data;
  const { x, y } = tileToScreen(col, row);
  const cx = x + ts * 0.5,
    cy = y + ts * 0.5;
  const seed = Math.floor(fx.t0) % 997;
  const hasDir = fromCol != null && (fromCol !== col || fromRow !== row);
  const ang = hasDir
    ? Math.atan2(row - fromRow, col - fromCol)
    : _hash01(seed) * Math.PI * 2;
  const ux = Math.cos(ang),
    uy = Math.sin(ang);
  const side = _hash01(seed + 1) < 0.5 ? -1 : 1;
  const nx = -uy * side,
    ny = ux * side;

  if (blast) {
    // Polvere sollevata ai piedi
    const dp = Math.min(1, p / 0.6);
    for (let i = 0; i < 4; i++) {
      const h = seed + i * 7;
      const a = _hash01(h) * Math.PI * 2;
      const d = ts * (0.1 + 0.22 * dp);
      _smokePuff(
        ctx,
        cx + Math.cos(a) * d,
        y + ts * 0.8 + Math.sin(a) * d * 0.35,
        ts * (0.08 + 0.12 * dp),
        "150,128,92",
        0.5 * (1 - dp),
      );
    }
  } else {
    // Punto di rimbalzo: di lato e un po' oltre l'unità
    const ix = cx + nx * ts * 0.32 + ux * ts * 0.18,
      iy = cy + ny * ts * 0.32 + uy * ts * 0.18;

    // Scie d'aria: due righe sottili che sfrecciano accanto all'unità
    if (p < 0.3) {
      const wp = p / 0.3;
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(1, ts * 0.018);
      for (let k = 0; k < 2; k++) {
        const off = ts * (0.24 + k * 0.1);
        const head = -ts * 0.5 + ts * 1.1 * wp - k * ts * 0.08;
        const tail = head - ts * 0.35;
        ctx.strokeStyle = `rgba(240,235,220,${(0.7 * (1 - wp)).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(cx + nx * off + ux * tail, cy + ny * off + uy * tail);
        ctx.lineTo(cx + nx * off + ux * head, cy + ny * off + uy * head);
        ctx.stroke();
      }
    }

    // Polvere nel punto d'impatto
    const dp = Math.min(1, p / 0.5);
    _smokePuff(ctx, ix, iy, ts * (0.06 + 0.12 * dp), "150,128,92", 0.5 * (1 - dp));

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // Scintilla del rimbalzo
    if (p < 0.15) {
      _smokePuff(ctx, ix, iy, ts * 0.13, "255,225,160", 0.95 * (1 - p / 0.15));
    }
    // Scia deviata: riparte dal punto d'impatto con un angolo verso l'esterno
    if (p < 0.4) {
      const rp = p / 0.4;
      const ra = ang + side * (0.7 + _hash01(seed + 2) * 0.5);
      const head = ts * 0.9 * (1 - (1 - rp) ** 2);
      const tail = Math.max(0, head - ts * 0.35);
      const hx = ix + Math.cos(ra) * head,
        hy = iy + Math.sin(ra) * head;
      const tx = ix + Math.cos(ra) * tail,
        ty = iy + Math.sin(ra) * tail;
      const g = ctx.createLinearGradient(tx, ty, hx, hy);
      g.addColorStop(0, "rgba(255,220,150,0)");
      g.addColorStop(1, `rgba(255,235,190,${(0.9 * (1 - rp)).toFixed(3)})`);
      ctx.strokeStyle = g;
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(1, ts * 0.022);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Scritta "MANCATO": rimbalzo, contorno, sale e svanisce
  const pop = Math.min(1, p / 0.15);
  const scale = pop < 1 ? 1 + 2.2 * (pop - 1) ** 3 + 1.2 * (pop - 1) ** 2 : 1;
  const ta = p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35;
  const size = ts * 0.26 * Math.max(0.01, scale);
  const fy = cy - ts * 0.25 - ts * 0.3 * p;
  ctx.font = `bold ${Math.round(size)}px 'Oswald'`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, size * 0.18);
  ctx.strokeStyle = `rgba(40,30,10,${(0.8 * ta).toFixed(3)})`;
  ctx.strokeText(t("fx.miss"), cx, fy);
  ctx.fillStyle = `rgba(230,210,150,${ta.toFixed(3)})`;
  ctx.fillText(t("fx.miss"), cx, fy);
}

// ── DEATH — unità eliminata ─────────────────────────────────────────────
// L'unità (già rimossa dalla mappa) viene ridisegnata mentre cade di lato e
// svanisce; all'impatto si alza polvere, poi si allarga una macchia scura.
// Senza data.cls (chiamate vecchie) si salta la caduta e resta il resto.
function _drawDeath(ctx, ts, data, p) {
  const { col, row, cls, enemy } = data;
  const { x, y } = tileToScreen(col, row);
  const cx = x + ts * 0.5,
    cy = y + ts * 0.5;
  const seed = col * 31 + row * 57;
  const dir = _hash01(seed) < 0.5 ? -1 : 1; // lato su cui cade
  const fall = Math.min(1, Math.max(0, (p - 0.05) / 0.32));
  const fe = fall * fall; // accelera come per gravità
  const footX = cx,
    footY = y + ts * 0.85;
  // Dove finisce il corpo a terra: macchia e polvere stanno lì
  const bodyX = cx + dir * ts * 0.22,
    bodyY = y + ts * 0.72;
  const fadeOut = (a, b) => 1 - Math.min(1, Math.max(0, (p - a) / (b - a)));

  // 1) Macchia scura che si allarga sul terreno
  const pool = Math.min(1, Math.max(0, (p - 0.3) / 0.4));
  if (pool > 0) {
    const pa = 0.55 * fadeOut(0.75, 1);
    for (let i = 0; i < 4; i++) {
      const h = seed + i * 13;
      _smokePuff(
        ctx,
        bodyX + (_hash01(h) - 0.5) * ts * 0.25,
        bodyY + (_hash01(h + 1) - 0.5) * ts * 0.12,
        ts * (0.12 + _hash01(h + 2) * 0.1) * (0.3 + 0.7 * (1 - (1 - pool) ** 2)),
        "85,8,8",
        pa,
      );
    }
  }

  // 2) Lampo rosso all'istante del colpo mortale
  if (p < 0.15) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    _smokePuff(ctx, cx, cy, ts * 0.55, "255,50,30", 0.7 * (1 - p / 0.15));
    ctx.restore();
  }

  // 3) L'unità cade di lato ruotando attorno ai piedi e svanisce
  // (non su tile nel FOW: l'artiglieria può uccidere VC nascosti)
  if (cls && typeof drawUnitSprite === "function" && isTileVisible(col, row)) {
    const sa = fadeOut(0.5, 0.9);
    if (sa > 0) {
      ctx.save();
      ctx.globalAlpha = sa;
      ctx.translate(footX, footY);
      ctx.rotate(dir * fe * Math.PI * 0.45);
      ctx.translate(-footX, -footY);
      drawUnitSprite(ctx, x, y, ts, cls, false, !!enemy);
      ctx.restore();
    }
  }

  // 4) Polvere sollevata quando il corpo tocca terra
  const dust = (p - 0.37) / 0.4;
  if (dust > 0 && dust < 1) {
    for (let i = 0; i < 4; i++) {
      const h = seed + i * 7;
      const ang = Math.PI + (_hash01(h) - 0.5) * 2.2; // verso l'alto/i lati
      const d = ts * (0.08 + 0.2 * dust) * (0.6 + _hash01(h + 1) * 0.6);
      _smokePuff(
        ctx,
        bodyX + Math.cos(ang) * d * dir * -1,
        bodyY + Math.sin(ang) * d * 0.4 - ts * 0.05 * dust,
        ts * (0.08 + 0.12 * dust),
        "150,128,92",
        0.5 * (1 - dust),
      );
    }
  }

  // 5) "KIA" con contorno scuro
  if (p > 0.15) {
    const ka = Math.min(1, (p - 0.15) / 0.1) * fadeOut(0.7, 1);
    const ky = cy - ts * 0.3 - ts * 0.15 * p;
    ctx.font = `bold ${Math.round(ts * 0.34)}px 'Special Elite'`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, ts * 0.06);
    ctx.strokeStyle = `rgba(60,0,0,${(0.85 * ka).toFixed(3)})`;
    ctx.strokeText(t("fx.kia"), cx, ky);
    ctx.fillStyle = `rgba(255,235,225,${ka.toFixed(3)})`;
    ctx.fillText(t("fx.kia"), cx, ky);
  }
}

// ── EXPLOSION — granate, RPG, artiglieria, mine ─────────────────────────
// Fasi: lampo → onda d'urto → palla di fuoco che si raffredda in fumo, con
// scie di scintille, detriti e bruciatura sul terreno. La dimensione segue il
// raggio AoE dell'arma (data.aoe, default 1 per le mine).
const EXPLOSION_PUFFS = 9;
const EXPLOSION_SPARKS = 12;
const EXPLOSION_DEBRIS = 10;

function _drawExplosion(ctx, ts, data, p) {
  const { col, row } = data;
  const { x, y } = tileToScreen(col, row);
  const cx = x + ts * 0.5,
    cy = y + ts * 0.5;
  const R = ts * (0.55 + 0.4 * (data.aoe || 1)); // raggio palla di fuoco
  const seed = col * 31 + row * 57;
  const out = 1 - (1 - p) ** 3; // espansione rapida che rallenta
  const fadeIn = (a, b) => Math.min(1, Math.max(0, (p - a) / (b - a)));

  // 1) Bruciatura sul terreno: compare subito, sparisce sul finale
  _smokePuff(ctx, cx, cy, R * 0.75, "20,14,8", 0.55 * fadeIn(0, 0.08) * (1 - fadeIn(0.7, 1)));

  // 2) Fumo: la palla di fuoco si raffredda in sbuffi scuri che salgono
  const smokeA = fadeIn(0.15, 0.4) * (1 - fadeIn(0.55, 1)) * 0.6;
  for (let i = 0; i < EXPLOSION_PUFFS; i++) {
    const h = seed + i * 11;
    const ang = (i / EXPLOSION_PUFFS) * Math.PI * 2 + _hash01(h) * 0.6;
    const d = R * (0.25 + _hash01(h + 1) * 0.35) * out;
    const r = R * (0.35 + _hash01(h + 2) * 0.2) * (0.6 + 0.6 * out);
    _smokePuff(
      ctx,
      cx + Math.cos(ang) * d,
      cy + Math.sin(ang) * d - R * 0.35 * p,
      r,
      i % 2 ? "58,54,50" : "82,78,72",
      smokeA,
    );
  }

  // 3) Detriti scuri lanciati verso l'esterno, rallentano e si posano
  for (let i = 0; i < EXPLOSION_DEBRIS; i++) {
    const h = seed + i * 23;
    const ang = _hash01(h) * Math.PI * 2;
    const d = R * (0.6 + _hash01(h + 1) * 0.9) * (1 - (1 - Math.min(1, p / 0.6)) ** 2);
    const s = Math.max(1.5, ts * (0.025 + _hash01(h + 2) * 0.025));
    ctx.fillStyle = `rgba(35,28,20,${(0.9 * (1 - fadeIn(0.6, 1))).toFixed(3)})`;
    ctx.fillRect(cx + Math.cos(ang) * d - s / 2, cy + Math.sin(ang) * d - s / 2, s, s);
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // 4) Lampo iniziale accecante
  if (p < 0.15) {
    _smokePuff(ctx, cx, cy, R * (0.9 + p * 2), "255,245,210", 0.95 * (1 - p / 0.15));
  }

  // 5) Onda d'urto: anello sottile che corre verso l'esterno
  if (p < 0.4) {
    const rp = p / 0.4;
    ctx.strokeStyle = `rgba(255,235,190,${(0.7 * (1 - rp)).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.5, ts * 0.04 * (1 - rp));
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.7 * (1 - (1 - rp) ** 2), 0, Math.PI * 2);
    ctx.stroke();
  }

  // 6) Palla di fuoco: sbuffi che passano da bianco-giallo a rosso scuro
  if (p < 0.5) {
    const heat = 1 - p / 0.5;
    const g = Math.floor(90 + 150 * heat),
      b = Math.floor(20 + 140 * heat ** 3);
    for (let i = 0; i < EXPLOSION_PUFFS; i++) {
      const h = seed + i * 11;
      const ang = (i / EXPLOSION_PUFFS) * Math.PI * 2 + _hash01(h) * 0.6;
      const d = R * (0.2 + _hash01(h + 1) * 0.3) * out;
      const r = R * (0.3 + _hash01(h + 2) * 0.18) * (0.5 + 0.7 * out);
      _smokePuff(ctx, cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, r, `255,${g},${b}`, 0.55 * heat);
    }
    _smokePuff(ctx, cx, cy, R * 0.55 * (0.6 + 0.5 * out), "255,250,220", 0.7 * heat ** 2);
  }

  // 7) Scintille: scie luminose radiali
  if (p < 0.55) {
    const sp = p / 0.55;
    ctx.lineCap = "round";
    for (let i = 0; i < EXPLOSION_SPARKS; i++) {
      const h = seed + i * 7;
      const ang = _hash01(h) * Math.PI * 2;
      const reach = R * (1 + _hash01(h + 1) * 0.9);
      const head = reach * (1 - (1 - sp) ** 2);
      const tail = reach * (1 - (1 - Math.max(0, sp - 0.15)) ** 2);
      ctx.strokeStyle = `rgba(255,${Math.floor(220 - sp * 120)},80,${(0.9 * (1 - sp)).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, ts * 0.02);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * tail, cy + Math.sin(ang) * tail);
      ctx.lineTo(cx + Math.cos(ang) * head, cy + Math.sin(ang) * head);
      ctx.stroke();
    }
  }
  ctx.restore();

  // 8) Testo BOOM
  if (p > 0.1 && p < 0.72) {
    const ta = p < 0.4 ? 1 : 1 - (p - 0.4) / 0.32;
    ctx.fillStyle = `rgba(255,240,80,${ta})`;
    ctx.font = `bold ${Math.round(ts * 0.33)}px 'Oswald'`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t("fx.explosion"), cx, cy - ts * 0.3 * p - R * 0.5);
  }
}
