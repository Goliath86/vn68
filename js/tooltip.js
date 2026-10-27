function showTooltip(e, col, row) {
  const tt = document.getElementById("tile-tooltip");
  const key = G.mapData.grid[row][col];
  const def = G.mapData.tileTypes[key];
  if (!def) {
    tt.style.display = "none";
    return;
  }
  const unit = G.units.find((u) => u.alive && u.col === col && u.row === row);
  // Solo nemici visibili (FOW, tunnel, cecchini mimetizzati: guerrilla.js)
  const enemy =
    G.enemies.find(
      (en) => en.alive && en.col === col && en.row === row && isEnemyVisible(en),
    ) ?? null;
  const tileLabel2 = mt(`tileLabels.${def.id}`) ?? def.label;
  let txt = t("tooltip.tile", {
    label: tileLabel2,
    cost: def.moveCost || "∞",
    cover: def.coverBonus || 0,
  });
  if (unit)
    txt += t("tooltip.unit_append", {
      name: unit.name,
      hp: unit.hp,
      maxHp: unit.maxHp,
      ap: unit.ap,
    });
  if (enemy)
    txt += t("tooltip.enemy_append", {
      name: enemy.name,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
    });
  // Cecchino VC che ha sparato: salterà il prossimo turno di fuoco
  // (needReload vale solo durante la fase nemica, poi viene azzerato)
  if (
    enemy &&
    enemyRole(enemy) === "sniper" &&
    (enemy.hasShot || (G.phase !== "player" && enemy.needReload))
  )
    txt += t("tooltip.enemy_reloading");
  if (enemy?.routed > 0) txt += t("tooltip.enemy_routed");
  if (enemy?.ambush) txt += t("tooltip.enemy_ambush");
  const trap = trapAt(col, row);
  if (trap?.revealed) txt += t("tooltip.trap", { trap: trapLabel(trap) });
  const tunnel = tunnelAt(col, row);
  if (tunnel?.revealed)
    txt += t(tunnel.sealed ? "tooltip.tunnel_sealed" : "tooltip.tunnel");
  if (enemy && isVcCamouflaged(enemy)) txt += t("tooltip.enemy_camouflaged");
  const smoke = (G.missionState?.smokes || []).find(
    (s) => s.col === col && s.row === row,
  );
  if (smoke) txt += t("tooltip.smoke", { turns: smoke.turnsLeft });
  // In modalità attacco (bersaglio singolo) o sui VC del click contestuale:
  // anteprima probabilità di colpire
  const qa = quickActions();
  const aimed =
    enemy &&
    G.selectedUnit &&
    ((G.actionMode === "attack" &&
      !isAreaWeapon(G.currentWeapon) &&
      G.attackable.includes(enemy)) ||
      qa?.targets.includes(enemy));
  if (aimed) {
    const weapon = qa ? qa.weapon : G.currentWeapon;
    const { pHit, expDmg, pKill, b } = attackOdds(G.selectedUnit, enemy, weapon);
    txt += t("tooltip.hit_odds", {
      pct: Math.round(pHit * 100),
      dmg: expDmg.toFixed(1),
      kill: Math.round(pKill * 100),
    });
    if (b.sector !== "front") txt += t(`tooltip.${b.sector}`);
    // Seconda riga: da dove vengono ATK e DEF
    txt += "\n" + oddsBreakdownText(b);
  }
  // Quali soldati vedono il VC (🎯 = anche a tiro: actions.js:spotStatus)
  if (enemy && G.phase === "player") {
    const names = G.units
      .map((u) => [u, spotStatus(u, enemy)])
      .filter(([, st]) => st)
      .map(([u, st]) => (st === "fire" ? `${u.name} 🎯` : u.name));
    txt += names.length
      ? t("tooltip.seen_by", { names: names.join(", ") })
      : t("tooltip.seen_by_none");
  }
  tt.textContent = txt;
  tt.style.display = "block";
  const rect = G.canvas.getBoundingClientRect();
  const pw = tt.parentElement.clientWidth;
  const ph = tt.parentElement.clientHeight;
  let x = e.clientX - rect.left + 12;
  let y = e.clientY - rect.top - 28;
  x = Math.max(4, Math.min(x, pw - tt.offsetWidth - 4));
  y = Math.max(4, Math.min(y, ph - tt.offsetHeight - 4));
  tt.style.left = x + "px";
  tt.style.top = y + "px";
}
