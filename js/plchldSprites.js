// ── TILE TEXTURE DETAILS ───────────────────────────────────────────────
function drawTileDetails(ctx, tileDef, x, y, ts) {
  const id = tileDef.id;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, ts, ts);
  ctx.clip();

  if (id === "river") {
    ctx.strokeStyle = "rgba(100,180,255,0.35)";
    ctx.lineWidth = 1.5;
    for (let i = 1; i <= 3; i++) {
      const wy = y + (ts * i) / 4;
      ctx.beginPath();
      ctx.moveTo(x, wy);
      for (let wx = x; wx < x + ts + 1; wx += ts * 0.22) {
        ctx.quadraticCurveTo(
          wx + ts * 0.11,
          wy - ts * 0.07,
          wx + ts * 0.22,
          wy,
        );
      }
      ctx.stroke();
    }
  } else if (id === "wall" || id === "obstacle") {
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 1;
    for (let d = -ts; d < ts * 2; d += ts * 0.28) {
      ctx.beginPath();
      ctx.moveTo(x + d, y);
      ctx.lineTo(x + d + ts, y + ts);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.strokeRect(x + ts * 0.08, y + ts * 0.08, ts * 0.84, ts * 0.84);
  } else if (id === "building") {
    const ws = ts * 0.17;
    const pad = ts * 0.18;
    ctx.fillStyle = "rgba(200,220,255,0.22)";
    for (const [ox, oy] of [
      [pad, pad],
      [ts - pad - ws, pad],
      [pad, ts - pad - ws * 1.2],
      [ts - pad - ws, ts - pad - ws * 1.2],
    ]) {
      ctx.fillRect(x + ox, y + oy, ws, ws * 1.2);
    }
    ctx.strokeStyle = "rgba(80,80,100,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + ts * 0.05, y + ts * 0.05, ts * 0.9, ts * 0.9);
  } else if (id === "debris") {
    ctx.strokeStyle = "rgba(200,160,100,0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + ts * 0.22, y + ts * 0.22);
    ctx.lineTo(x + ts * 0.78, y + ts * 0.78);
    ctx.moveTo(x + ts * 0.78, y + ts * 0.22);
    ctx.lineTo(x + ts * 0.22, y + ts * 0.78);
    ctx.stroke();
    ctx.fillStyle = "rgba(160,130,90,0.45)";
    for (const [rx, ry, r2] of [
      [0.28, 0.42, 0.07],
      [0.62, 0.3, 0.05],
      [0.48, 0.68, 0.06],
      [0.72, 0.62, 0.05],
    ]) {
      ctx.beginPath();
      ctx.arc(x + rx * ts, y + ry * ts, r2 * ts, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (id === "temple") {
    ctx.strokeStyle = "rgba(255,220,110,0.38)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + ts * 0.14, y + ts * 0.14, ts * 0.72, ts * 0.72);
    ctx.beginPath();
    ctx.moveTo(x + ts * 0.5, y + ts * 0.24);
    ctx.lineTo(x + ts * 0.76, y + ts * 0.5);
    ctx.lineTo(x + ts * 0.5, y + ts * 0.76);
    ctx.lineTo(x + ts * 0.24, y + ts * 0.5);
    ctx.closePath();
    ctx.strokeStyle = "rgba(255,200,70,0.22)";
    ctx.stroke();
  } else if (id === "bridge" || id === "ford") {
    ctx.strokeStyle = "rgba(210,190,140,0.5)";
    ctx.lineWidth = 2;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y + (ts * i) / 4);
      ctx.lineTo(x + ts, y + (ts * i) / 4);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(170,150,100,0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + ts * 0.5, y);
    ctx.lineTo(x + ts * 0.5, y + ts);
    ctx.stroke();
  } else if (id === "street" || id === "urban") {
    ctx.strokeStyle = "rgba(160,150,130,0.18)";
    ctx.lineWidth = 0.5;
    for (let gi = 0; gi < 2; gi++) {
      for (let gj = 0; gj < 2; gj++) {
        const cx2 = x + ((gi + 0.5) * ts) / 2;
        const cy2 = y + ((gj + 0.5) * ts) / 2;
        ctx.beginPath();
        ctx.moveTo(cx2 - ts * 0.08, cy2);
        ctx.lineTo(cx2 + ts * 0.08, cy2);
        ctx.moveTo(cx2, cy2 - ts * 0.08);
        ctx.lineTo(cx2, cy2 + ts * 0.08);
        ctx.stroke();
      }
    }
  } else if (id === "jungle") {
    ctx.fillStyle = "rgba(80,150,40,0.32)";
    for (const [rx, ry, r2] of [
      [0.2, 0.25, 0.1],
      [0.7, 0.2, 0.09],
      [0.45, 0.52, 0.12],
      [0.15, 0.7, 0.08],
      [0.75, 0.65, 0.1],
      [0.5, 0.35, 0.08],
    ]) {
      ctx.beginPath();
      ctx.arc(x + rx * ts, y + ry * ts, r2 * ts, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (id === "swamp") {
    ctx.strokeStyle = "rgba(110,170,80,0.32)";
    ctx.lineWidth = 1;
    for (const [rx, ry, r2] of [
      [0.25, 0.38, 0.08],
      [0.62, 0.28, 0.06],
      [0.7, 0.65, 0.09],
      [0.32, 0.7, 0.06],
      [0.5, 0.5, 0.05],
    ]) {
      ctx.beginPath();
      ctx.arc(x + rx * ts, y + ry * ts, r2 * ts, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (id === "bunker") {
    ctx.fillStyle = "rgba(190,160,80,0.38)";
    ctx.fillRect(x + ts * 0.1, y + ts * 0.62, ts * 0.8, ts * 0.22);
    ctx.fillRect(x + ts * 0.22, y + ts * 0.4, ts * 0.56, ts * 0.22);
    ctx.strokeStyle = "rgba(100,80,40,0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + ts * 0.1, y + ts * 0.62, ts * 0.8, ts * 0.22);
    ctx.strokeRect(x + ts * 0.22, y + ts * 0.4, ts * 0.56, ts * 0.22);
  } else if (id === "garden" || id === "clearing") {
    ctx.fillStyle = "rgba(110,190,60,0.22)";
    for (const [rx, ry] of [
      [0.3, 0.3],
      [0.62, 0.25],
      [0.22, 0.62],
      [0.65, 0.65],
      [0.5, 0.45],
      [0.4, 0.7],
    ]) {
      ctx.beginPath();
      ctx.arc(x + rx * ts, y + ry * ts, ts * 0.055, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (id === "plaza") {
    ctx.strokeStyle = "rgba(220,200,150,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + ts * 0.18, y + ts * 0.18, ts * 0.64, ts * 0.64);
    ctx.beginPath();
    ctx.moveTo(x + ts * 0.18, y + ts * 0.18);
    ctx.lineTo(x + ts * 0.82, y + ts * 0.82);
    ctx.moveTo(x + ts * 0.82, y + ts * 0.18);
    ctx.lineTo(x + ts * 0.18, y + ts * 0.82);
    ctx.strokeStyle = "rgba(220,200,150,0.12)";
    ctx.stroke();
  } else if (id === "objective") {
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
    ctx.beginPath();
    ctx.arc(x + ts * 0.5, y + ts * 0.5, ts * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,200,30,0.55)";
    ctx.fill();
  } else if (id === "trail") {
    ctx.strokeStyle = "rgba(180,160,120,0.3)";
    ctx.lineWidth = 3;
    ctx.setLineDash([ts * 0.15, ts * 0.1]);
    ctx.beginPath();
    ctx.moveTo(x + ts * 0.5, y);
    ctx.lineTo(x + ts * 0.5, y + ts);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (id === "village") {
    ctx.fillStyle = "rgba(180,140,60,0.3)";
    ctx.fillRect(x + ts * 0.2, y + ts * 0.25, ts * 0.25, ts * 0.3);
    ctx.fillRect(x + ts * 0.55, y + ts * 0.3, ts * 0.25, ts * 0.28);
    ctx.fillStyle = "rgba(140,90,40,0.35)";
    ctx.beginPath();
    ctx.moveTo(x + ts * 0.18, y + ts * 0.25);
    ctx.lineTo(x + ts * 0.325, y + ts * 0.1);
    ctx.lineTo(x + ts * 0.47, y + ts * 0.25);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + ts * 0.52, y + ts * 0.3);
    ctx.lineTo(x + ts * 0.675, y + ts * 0.14);
    ctx.lineTo(x + ts * 0.83, y + ts * 0.3);
    ctx.fill();
  }

  ctx.restore();
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
