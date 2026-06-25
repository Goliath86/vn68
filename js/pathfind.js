function getReachable(unit, maxAP) {
  // BFS pesata: restituisce mappa {`col,row`: apCost}
  const visited = {};
  const queue = [{ col: unit.col, row: unit.row, cost: 0 }];
  visited[`${unit.col},${unit.row}`] = 0;
  const DIRS = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  while (queue.length) {
    const cur = queue.shift();
    for (const [dc, dr] of DIRS) {
      const nc = cur.col + dc,
        nr = cur.row + dr;
      const key = `${nc},${nr}`;
      const tile = getTileAt(nc, nr);
      if (!tile || tile.impassable || isOnFire(nc, nr)) continue;
      if (isOccupied(nc, nr, unit.id)) continue;
      const cost = cur.cost + tile.moveCost;
      if (cost > maxAP) continue;
      if (key in visited && visited[key] <= cost) continue;
      visited[key] = cost;
      queue.push({ col: nc, row: nr, cost });
    }
  }
  return visited;
}

function getPath(fromCol, fromRow, toCol, toRow, coverAware = false) {
  // A* semplice; con coverAware=true penalizza i tile scoperti
  const key = (c, r) => `${c},${r}`;
  const h = (c, r) => Math.abs(c - toCol) + Math.abs(r - toRow);
  const tileCost = (tile) =>
    (tile.moveCost || 1) +
    (coverAware ? (3 - Math.min(3, tile.coverBonus || 0)) * 0.5 : 0);
  const open = [
    {
      col: fromCol,
      row: fromRow,
      g: 0,
      h: h(fromCol, fromRow),
      prev: null,
    },
  ];
  const closed = {};
  const DIRS = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  while (open.length) {
    open.sort((a, b) => a.g + a.h - (b.g + b.h));
    const cur = open.shift();
    const ck = key(cur.col, cur.row);
    if (closed[ck]) continue;
    closed[ck] = cur;
    if (cur.col === toCol && cur.row === toRow) {
      const path = [];
      let n = cur;
      while (n) {
        path.unshift({ col: n.col, row: n.row });
        n = n.prev;
      }
      return path;
    }
    for (const [dc, dr] of DIRS) {
      const nc = cur.col + dc,
        nr = cur.row + dr;
      if (closed[key(nc, nr)]) continue;
      const tile = getTileAt(nc, nr);
      if (!tile || tile.impassable || isOnFire(nc, nr)) continue;
      open.push({
        col: nc,
        row: nr,
        g: cur.g + tileCost(tile),
        h: h(nc, nr),
        prev: cur,
      });
    }
  }
  return null;
}

function isOccupied(col, row, exceptId = null) {
  const hasUnit = G.units.find(
    (u) => u.alive && u.col === col && u.row === row && u.id !== exceptId,
  );
  const hasEnemy = G.enemies.find(
    (e) => e.alive && e.col === col && e.row === row,
  );
  return !!(hasUnit || hasEnemy);
}
