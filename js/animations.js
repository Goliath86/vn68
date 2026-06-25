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
  }));
  return [...global, ...mission, ...fires];
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
  if (!anims.length) return;
  const now = performance.now();
  const seed0 = (anim) => anim.col * 7 + anim.row * 13;
  // Nessun check isTileVisible: il FOW overlay è disegnato dopo e copre
  // naturalmente le animazioni sui tile non visibili. Le particelle che
  // sconfinano in tile visibili adiacenti danno un effetto realistico.
  for (const anim of anims) {
    const { x, y } = tileToScreen(anim.col, anim.row);
    if (anim.type === "smoke") _drawTileSmoke(ctx, x, y, ts, _tileAnimDt, anim);
    else if (anim.type === "fire")
      _drawTileFire(ctx, x, y, ts, now, seed0(anim));
    else if (anim.type === "fog") _drawTileFog(ctx, x, y, ts, now, seed0(anim));
  }
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

function _drawTileFire(ctx, x, y, ts, now, seed) {
  ctx.save();
  for (let i = 0; i < 9; i++) {
    const phase = (now / 700 + (i + seed * 0.11) / 9) % 1;
    const px = x + ts * (0.15 + ((i * 0.618 + seed * 0.07) % 0.7));
    const py = y + ts * (0.88 - phase * 0.72);
    const alpha = phase < 0.1 ? phase / 0.1 : Math.max(0, 1 - phase);
    const g = Math.floor(
      phase < 0.4 ? 60 + phase * 350 : Math.max(0, 200 - (phase - 0.4) * 400),
    );
    ctx.globalAlpha = alpha * 0.82;
    ctx.fillStyle = `rgb(255,${g},0)`;
    ctx.beginPath();
    ctx.arc(px, py, ts * (0.07 * (1 - phase * 0.5)), 0, Math.PI * 2);
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
  const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
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
      const { fromCol, fromRow, toCol, toRow } = fx.data;
      const { x: fx0, y: fy0 } = tileToScreen(fromCol, fromRow);
      const { x: tx0, y: ty0 } = tileToScreen(toCol, toRow);
      const sx = fx0 + ts * 0.5,
        sy = fy0 + ts * 0.5,
        ex = tx0 + ts * 0.5,
        ey = ty0 + ts * 0.5;
      if (p < 0.3) {
        const ft = p / 0.3;
        ctx.fillStyle = `rgba(255,220,50,${0.9 * (1 - ft)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, ts * 0.22 * (1 - ft), 0, Math.PI * 2);
        ctx.fill();
      }
      const tt = Math.min(1, p / 0.8);
      const bx = sx + (ex - sx) * tt,
        by = sy + (ey - sy) * tt;
      const tlX = sx + (ex - sx) * Math.max(0, tt - 0.25),
        tlY = sy + (ey - sy) * Math.max(0, tt - 0.25);
      const grad = ctx.createLinearGradient(tlX, tlY, bx, by);
      grad.addColorStop(0, "rgba(255,200,0,0)");
      grad.addColorStop(1, "rgba(255,240,80,.9)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tlX, tlY);
      ctx.lineTo(bx, by);
      ctx.stroke();
      break;
    }

    case "hit": {
      const { col, row, dmg } = fx.data;
      const { x, y } = tileToScreen(col, row);
      const cx = x + ts * 0.5,
        cy = y + ts * 0.5;
      if (p < 0.4) {
        const bt = p / 0.4;
        ctx.strokeStyle = `rgba(255,80,30,${(1 - bt) * 0.9})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, ts * 0.5 * bt, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,150,50,${0.9 - bt * 0.9})`;
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [0.7, 0.7],
          [-0.7, 0.7],
          [0.7, -0.7],
          [-0.7, -0.7],
        ].forEach(([dx, dy]) => {
          ctx.beginPath();
          ctx.arc(
            cx + dx * ts * 0.38 * bt,
            cy + dy * ts * 0.38 * bt,
            2.5,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        });
      }
      const fy = cy - ts * 0.5 * p,
        a2 = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      ctx.fillStyle = `rgba(255,80,30,${a2})`;
      ctx.font = `bold ${Math.round(ts * 0.35)}px 'Oswald'`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`-${dmg}`, cx, fy);
      break;
    }

    case "miss": {
      const { col, row } = fx.data;
      const { x, y } = tileToScreen(col, row);
      const fy = y + ts * 0.5 - ts * 0.35 * p,
        a = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
      ctx.fillStyle = `rgba(200,180,110,${a})`;
      ctx.font = `bold ${Math.round(ts * 0.26)}px 'Oswald'`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t("fx.miss"), x + ts * 0.5, fy);
      break;
    }

    case "death": {
      const { col, row } = fx.data;
      const { x, y } = tileToScreen(col, row);
      const cx = x + ts * 0.5,
        cy = y + ts * 0.5;
      const fa = p < 0.15 ? (p / 0.15) * 0.7 : 0.7 * (1 - (p - 0.15) / 0.85);
      ctx.fillStyle = `rgba(200,20,20,${fa})`;
      ctx.fillRect(x, y, ts, ts);
      ctx.strokeStyle = `rgba(255,60,60,${1 - p})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.65 * p, 0, Math.PI * 2);
      ctx.stroke();
      if (p > 0.15) {
        const ka = p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35;
        ctx.fillStyle = `rgba(255,255,255,${ka})`;
        ctx.font = `bold ${Math.round(ts * 0.34)}px 'Special Elite'`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(t("fx.kia"), cx, cy);
      }
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2,
          pr = ts * 0.55 * p;
        ctx.fillStyle = `rgba(255,${80 + i * 10},0,${1 - p})`;
        ctx.beginPath();
        ctx.arc(
          cx + Math.cos(ang) * pr,
          cy + Math.sin(ang) * pr,
          2.5 * (1 - p) + 1,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
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
      const { col, row, amount } = fx.data;
      const { x, y } = tileToScreen(col, row);
      const cx = x + ts * 0.5,
        cy = y + ts * 0.5;
      if (p < 0.45) {
        const ct = p / 0.45,
          s = ts * 0.28,
          ca = (1 - ct) * 0.85;
        ctx.fillStyle = `rgba(80,220,80,${ca})`;
        ctx.fillRect(cx - s * 0.15, cy - s * 0.5, s * 0.3, s);
        ctx.fillRect(cx - s * 0.5, cy - s * 0.15, s, s * 0.3);
      }
      ctx.strokeStyle = `rgba(80,200,80,${(1 - p) * 0.8})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.52 * ease, 0, Math.PI * 2);
      ctx.stroke();
      const fy2 = cy - ts * 0.6 * p,
        a2 = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      ctx.fillStyle = `rgba(100,255,100,${a2})`;
      ctx.font = `bold ${Math.round(ts * 0.3)}px 'Oswald'`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`+${amount}HP`, cx, fy2);
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
      const { col, row } = fx.data;
      const { x, y } = tileToScreen(col, row);
      const cx = x + ts * 0.5,
        cy = y + ts * 0.5;
      // Flash centrale
      if (p < 0.25) {
        const ft = p / 0.25;
        ctx.fillStyle = `rgba(255,240,150,${(1 - ft) * 0.95})`;
        ctx.beginPath();
        ctx.arc(cx, cy, ts * 0.65 * (1 - ft * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      // Anello espansivo
      const ringR = ts * 1.3 * ease;
      const ringA = p < 0.5 ? (1 - p * 2) * 0.8 : 0;
      if (ringA > 0) {
        ctx.strokeStyle = `rgba(255,200,50,${ringA})`;
        ctx.lineWidth = Math.max(2, ts * 0.07);
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Detriti radiali
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const r = ts * 0.8 * ease;
        const px2 = cx + Math.cos(angle) * r,
          py2 = cy + Math.sin(angle) * r;
        const pa = p < 0.6 ? 0.9 : 0.9 * (1 - (p - 0.6) / 0.4);
        ctx.fillStyle = `rgba(255,${100 + i * 18},30,${pa})`;
        ctx.beginPath();
        ctx.arc(px2, py2, Math.max(2, ts * 0.04), 0, Math.PI * 2);
        ctx.fill();
      }
      // Testo BOOM
      if (p > 0.1 && p < 0.72) {
        const ta = p < 0.4 ? 1 : 1 - (p - 0.4) / 0.32;
        ctx.fillStyle = `rgba(255,240,80,${ta})`;
        ctx.font = `bold ${Math.round(ts * 0.33)}px 'Oswald'`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(t("fx.explosion"), cx, cy - ts * 0.3 * p);
      }
      break;
    }
  }
  ctx.restore();
}
