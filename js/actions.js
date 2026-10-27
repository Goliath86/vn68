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
      G.attackable = directTargets(u, weapon);
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
    // Cura: alleati adiacenti
    if (unitSpecial(u) === "heal") {
      G.reachable = G.units.filter(
        (t) => t.alive && t.id !== u.id && dist(u, t) <= 1,
      );
    }

    // Demolizione (geniere): demolisce tile demolishable, incendia tile
    // burnable, disinnesca trappole e sigilla tunnel adiacenti
    if (unitSpecial(u) === "demolition") {
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

// Bersagli di un attacco diretto: solo nemici vivi in gittata e in linea di
// vista dell'unità che spara (non basta che li veda un compagno), senza
// compagni in piedi o accucciati sulla linea di tiro
function directTargets(u, weapon) {
  const range = weapon?.range ?? UNIT_CLASSES[u.cls].range;
  return G.enemies.filter(
    (e) =>
      e.alive &&
      dist(u, e) <= range &&
      isEnemyVisible(e) &&
      unitSeesEnemy(u, e) &&
      !allyBlockingFire(u, e),
  );
}

// Il soldato `u` vede il VC `e`? "fire" se lo ha anche a tiro con l'arma
// predefinita (gittata, linea di tiro libera), "seen" se lo vede soltanto,
// null se non lo vede (linee di avvistamento in render.js, tooltip)
function spotStatus(u, e) {
  if (!u.alive || !unitSeesEnemy(u, e)) return null;
  const w = defaultAttackWeapon(u);
  const range = w?.range ?? UNIT_CLASSES[u.cls].range;
  const inFire =
    canAttack(u) &&
    !isAreaWeapon(w) &&
    dist(u, e) <= range &&
    !allyBlockingFire(u, e);
  return inFire ? "fire" : "seen";
}

// ── CLICK CONTESTUALE (desktop) ─────────────────────────────────────────
// Soldato selezionato e nessuna azione scelta: il click su un tile
// raggiungibile lo muove, quello su un VC in tiro spara con l'arma
// predefinita (canvas.js:onCanvasClick); al passaggio del mouse percorso e
// costo in AP, o raggio di mira (render.js:drawQuickActions). Solo col mouse:
// su touch manca l'anteprima e restano i bottoni Muovi/Attacca.
// In cache: la chiave copre posizione e AP, il resto lo invalida updateUI
let _quickActions = null;

function invalidateQuickActions() {
  _quickActions = null;
}

function quickActions() {
  const u = G.selectedUnit;
  if (
    G.actionMode !== null ||
    G.phase !== "player" ||
    G.pendingDice ||
    G.throwing ||
    G.unitMoving ||
    !u?.alive ||
    u.ap < 1 ||
    !aimRayEnabled()
  )
    return null;
  const key = `${u.id},${u.col},${u.row},${u.ap},${G.turn}`;
  if (_quickActions?.key === key) return _quickActions;

  const reach = getReachable(u, u.ap);
  const weapon = defaultAttackWeapon(u);
  const targets =
    canAttack(u) && !isAreaWeapon(weapon) ? directTargets(u, weapon) : [];
  _quickActions = {
    key,
    weapon,
    reach: Object.keys(reach)
      .map((k) => {
        const [col, row] = k.split(",").map(Number);
        return { col, row, cost: reach[k] };
      })
      .filter((r) => r.col !== u.col || r.row !== u.row),
    targets,
    odds: new Map(targets.map((e) => [e, attackOdds(u, e, weapon).pHit])),
    path: null, // { col, row, tiles }: percorso verso il tile sotto il mouse
  };
  return _quickActions;
}

// Percorso che farà il soldato fino a (col,row): lo stesso dell'animazione
// (ai.js:_movePath), ricalcolato solo quando cambia il tile puntato
function quickPath(qa, col, row) {
  if (qa.path?.col !== col || qa.path?.row !== row) {
    const u = G.selectedUnit;
    qa.path = { col, row, tiles: _movePath(u.col, u.row, col, row) };
  }
  return qa.path.tiles;
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
  // Animazione della ricarica sulla pedina (animations.js:unitAnimPose)
  u.animReload = performance.now();
  _startTileAnimLoop();
  log(
    t("log.reload", {
      name: u.name,
      weapon: weaponLabel(w),
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
  sfx("stance");
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
