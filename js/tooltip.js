function showTooltip(e, col, row) {
  const tt = document.getElementById("tile-tooltip");
  const key = G.mapData.grid[row][col];
  const def = G.mapData.tileTypes[key];
  if (!def) {
    tt.style.display = "none";
    return;
  }
  const unit = G.units.find((u) => u.alive && u.col === col && u.row === row);
  const enemy = isTileVisible(col, row)
    ? G.enemies.find((en) => en.alive && en.col === col && en.row === row)
    : null;
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
