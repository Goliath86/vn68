function setActionMode(mode, weapon = null) {
  G.actionMode = mode;
  G.currentWeapon = weapon;
  G.pendingAoe = null;
  G.aimTarget = null;
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
    if (isAreaWeapon(weapon)) {
      // AoE: evidenzia le tile tra gittata minima e massima (click → aoe_confirm;
      // napalm: click = inizio della linea, poi la fine, canvas.js)
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
      // dell'unità che spara (non basta che li veda un compagno), senza
      // compagni in piedi o accucciati sulla linea di tiro
      G.attackable = G.enemies.filter(
        (e) =>
          e.alive &&
          dist(u, e) <= range &&
          isEnemyVisible(e) &&
          unitSeesEnemy(u, e) &&
          !allyBlockingFire(u, e),
      );
    }
  }

  if (mode === "rotate") {
    // I tile adiacenti indicano le direzioni (anche se non percorribili),
    // esclusa quella già rivolta: toccarla annulla senza consumare la rotazione
    G.reachable = FACING_DIRS.map(([dc, dr], f) => ({
      col: u.col + dc,
      row: u.row + dr,
      f,
    }))
      .filter(
        ({ col, row, f }) =>
          f !== (u.facing ?? 0) &&
          col >= 0 &&
          row >= 0 &&
          col < G.mapData.cols &&
          row < G.mapData.rows,
      )
      .map(({ col, row }) => ({ col, row }));
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
          isKnownTunnel(col, row) ||
          (t && (t.demolishable || (t.burnable && !isOnFire(col, row))))
        );
      });
    }
  }

  render();

  updateUI();
}

// Ricarica: riempie il caricatore di `w` (default: la prima arma
// ricaricabile) consumando un caricatore di riserva (se limitati).
// Costa weaponReloadAp AP.
function canReload(u, w = reloadableWeapon(u)) {
  return (
    !!w &&
    weaponNeedsReload(w) &&
    u.alive &&
    G.phase === "player" &&
    u.ap >= weaponReloadAp(w)
  );
}

function reloadWeapon(u, w = reloadableWeapon(u)) {
  if (!canReload(u, w)) return;
  clearLastMove();
  u.ap -= weaponReloadAp(w);
  w.loaded = w.mag;
  if (w.mags != null) w.mags--;
  statAdd("reloads");
  tutorialEvent("reload", { cls: u.cls, weapon: w.id });
  sfx("reload");
  log(
    t("log.reload", {
      name: u.name,
      weapon: w.label,
      mags: w.mags == null ? t("weapons.ammo_inf") : w.mags,
    }),
  );
  setActionMode(null);
  updateUI();
}

// Cambio postura: il primo del turno è gratuito, i successivi costano 1 AP
const STANCE_CHANGE_AP = 1;

function stanceChangeCost(u) {
  return u.stanceChanged ? STANCE_CHANGE_AP : 0;
}

function canChangeStance(u) {
  return !!u && u.alive && G.phase === "player" && u.ap >= stanceChangeCost(u);
}

function changeStance(u, stance) {
  if (!STANCES[stance] || !canChangeStance(u)) return;
  if ((u.stance || "stand") === stance) return;
  u.ap -= stanceChangeCost(u);
  u.stanceChanged = true;
  u.stance = stance;
  tutorialEvent("stance", { cls: u.cls, stance });
  sfx("move");
  log(t("log.stance_change", { name: u.name, stance: t(`stances.${stance}`) }));
  if (G.fowEnabled) recomputeVisibility();
  setActionMode(null);
  updateUI();
}

// Rotazione gratuita (0 AP), una volta per turno, verso il tile adiacente scelto
function rotateUnit(u, col, row) {
  if (!u || !u.alive || u.rotated) return;
  const f = facingToward(u, { col, row });
  if (f === null || f === (u.facing ?? 0)) return;
  u.facing = f;
  u.rotated = true;
  tutorialEvent("rotate", { cls: u.cls, facing: f });
  log(t("log.unit_rotate", { name: u.name, dir: t(`directions.${f}`) }));
}
