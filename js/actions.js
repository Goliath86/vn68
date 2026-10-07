function setActionMode(mode, weapon = null) {
  G.actionMode = mode;
  G.currentWeapon = weapon;
  G.pendingAoe = null;
  G.reachable = [];
  G.attackable = [];

  const u = G.selectedUnit;

  if (!u || !u.alive) {
    render();
    return;
  }

  if (mode === "move") {
    const apLeft = u.ap;
    const reach = getReachable(u, apLeft);
    G.reachable = Object.keys(reach).map((k) => {
      const [c, r] = k.split(",").map(Number);
      return { col: c, row: r, cost: reach[k] };
    });
  }

  if (mode === "attack") {
    const def = UNIT_CLASSES[u.cls];
    const range = weapon?.range ?? def.range;
    if (weapon?.aoe) {
      // AoE: evidenzia le tile tra gittata minima e massima (click → aoe_confirm)
      const minRange = weaponMinRange(weapon);
      for (let c = 0; c < G.mapData.cols; c++) {
        for (let r = 0; r < G.mapData.rows; r++) {
          const d = dist(u, { col: c, row: r });
          if (d >= minRange && d <= range)
            G.attackable.push({ col: c, row: r });
        }
      }
    } else {
      // Singolo bersaglio: solo nemici vivi in gittata e in linea di vista
      // dell'unità che spara (non basta che li veda un compagno)
      G.attackable = G.enemies.filter(
        (e) =>
          e.alive &&
          dist(u, e) <= range &&
          isTileVisible(e.col, e.row) &&
          isTileVisibleFromUnit(u, e.col, e.row),
      );
    }
  }

  if (mode === "special") {
    // Medico: adiacenti alleati
    if (u.cls === "medic") {
      G.reachable = G.units.filter(
        (t) => t.alive && t.id !== u.id && dist(u, t) <= 1,
      );
    }

    // Cecchino: overwatch
    //
    // Geniere: demolisce tile demolishable OPPURE incendia tile burnable adiacenti
    if (u.cls === "engineer") {
      const DIRS = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ];

      G.reachable = DIRS.map(([dc, dr]) => ({
        col: u.col + dc,
        row: u.row + dr,
      })).filter(({ col, row }) => {
        const t = getTileAt(col, row);
        return (
          isKnownTrap(col, row) ||
          (t && (t.demolishable || (t.burnable && !isOnFire(col, row))))
        );
      });
    }
  }

  render();

  updateUI();
}
