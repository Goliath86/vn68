function render() {
  if (!G.mapData) return;
  renderMap();
  renderOverlay();
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

function renderMap() {
  if (G.fowEnabled) recomputeVisibility();
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
    // Griglia tile colorata con texture
    for (let r = 0; r < md.rows; r++) {
      for (let c = 0; c < md.cols; c++) {
        const key = md.grid[r][c];
        const tileDef = md.tileTypes[key];
        if (!tileDef) continue;
        const { x, y } = tileToScreen(c, r);
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = tileDef.color || "#2d5a1b";
        ctx.fillRect(x, y, ts, ts);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, ts, ts);
        drawTileDetails(ctx, tileDef, x, y, ts);
      }
    }
  }

  // Indicatori missione
  renderMissionMarkers(ctx, ts);

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
  }

  // Animazioni tile (smoke, fire, fog) — dopo il FOW: il fumo è visibile
  // anche nell'oscurità (il fumo del relitto si vede da lontano)
  renderTileAnimations(ctx, ts);

  // Unità nemiche (nascoste nella nebbia)
  for (const e of G.enemies) {
    if (!e.alive) continue;
    if (!isTileVisible(e.col, e.row)) continue;
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
    drawUnitSprite(ctx, x, y, ts, e.cls, false, true);
    const hpRatio = e.hp / e.maxHp;
    ctx.fillStyle = "#111";
    ctx.fillRect(x + 2, y + ts - 5, ts - 4, 3);
    ctx.fillStyle = hpRatio > 0.5 ? "#aa4422" : "#882200";
    ctx.fillRect(x + 2, y + ts - 5, (ts - 4) * hpRatio, 3);
  }

  // Unità alleate
  for (const u of G.units) {
    if (!u.alive) continue;
    const { x, y } = tileToScreen(u.col, u.row);
    const isSelected = G.selectedUnit && G.selectedUnit.id === u.id;
    const isDone = u.ap <= 0;

    // Ombra + sfondo
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.fillRect(x + ts * 0.11 + 2, y + ts * 0.11 + 2, ts * 0.78, ts * 0.78);
    ctx.fillStyle = isDone ? "rgba(55,68,38,0.72)" : "rgba(38,58,20,0.72)";
    ctx.fillRect(x + ts * 0.11, y + ts * 0.11, ts * 0.78, ts * 0.78);

    // Sprite personaggio
    drawUnitSprite(ctx, x, y, ts, u.cls, isDone, false);

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

    // HP bar
    const hpRatio = u.hp / u.maxHp;
    ctx.fillStyle = "#111";
    ctx.fillRect(x + 2, y + ts - 5, ts - 4, 3);
    ctx.fillStyle = hpRatio > 0.5 ? "#44aa22" : "#cc4422";
    ctx.fillRect(x + 2, y + ts - 5, (ts - 4) * hpRatio, 3);
  }
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
    const isAoe = !!G.currentWeapon?.aoe;
    if (isAoe) {
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
              isTileVisible(e.col, e.row),
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
      for (const e of G.attackable) {
        const { x, y } = tileToScreen(e.col, e.row);
        const cx = x + ts / 2,
          cy = y + ts / 2;
        const ro = ts * 0.3,
          ri = ts * 0.09,
          gap = ts * 0.05;
        const lw = Math.max(1.5, ts * 0.045);
        ctx.strokeStyle = "rgba(255,60,60,0.95)";
        ctx.lineWidth = lw;
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
      }
    }
  }

  // Anteprima AoE in attesa di conferma
  if (G.actionMode === "aoe_confirm" && G.pendingAoe) {
    const { col: tc, row: tr, weapon: w } = G.pendingAoe;
    // Raggio AoE attorno al tile bersaglio
    ctx.fillStyle = "rgba(255,90,0,0.28)";
    ctx.strokeStyle = "rgba(255,160,0,0.75)";
    ctx.lineWidth = 1.5;
    for (let c = 0; c < G.mapData.cols; c++) {
      for (let r = 0; r < G.mapData.rows; r++) {
        if (dist({ col: c, row: r }, { col: tc, row: tr }) <= w.aoe) {
          const { x, y } = tileToScreen(c, r);
          ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
          ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
        }
      }
    }
    // Tile bersaglio: bordo più marcato
    const { x: bx, y: by } = tileToScreen(tc, tr);
    ctx.strokeStyle = "rgba(255,220,0,0.95)";
    ctx.lineWidth = 3;
    ctx.strokeRect(bx + 2, by + 2, ts - 4, ts - 4);
    // Icona esplosione al centro
    ctx.font = `${Math.round(ts * 0.45)}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("💥", bx + ts / 2, by + ts / 2);
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

  // Selezione unità corrente
  if (G.selectedUnit && G.selectedUnit.alive && G.actionMode === null) {
    const u = G.selectedUnit;
    const { x, y } = tileToScreen(u.col, u.row);
    ctx.strokeStyle = "#f0c030";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
    ctx.setLineDash([]);
    // Cerchio raggio attacco
    const def = UNIT_CLASSES[u.cls];
    ctx.strokeStyle = "rgba(240,192,48,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + ts / 2, y + ts / 2, def.range * ts, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Zone soppressione (assalti in fuoco soppressivo)
  for (const sup of G.suppressList) {
    if (!sup.alive) continue;
    const { x: sx, y: sy } = tileToScreen(sup.col, sup.row);
    ctx.strokeStyle = "rgba(255,165,50,0.55)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(
      sx + ts / 2,
      sy + ts / 2,
      UNIT_CLASSES[sup.cls].range * ts,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Effetti grafici
  renderEffects(ctx, ts);
}
function renderUnitsOnMap() {
  render();
}
