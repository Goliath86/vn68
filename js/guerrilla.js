// ── GUERRIGLIA VC ──────────────────────────────────────────────────────
// Tattiche proprie dei Vietcong: rete di tunnel, trappole piazzate durante
// la missione, cecchini mimetizzati nella vegetazione. Lo stato vive in
// G.missionState (tunnels, trapsPlanted) e nei VC (inTunnel, exposed), così
// finisce nel salvataggio.

// ── TUNNEL ─────────────────────────────────────────────────────────────
// Ingressi nascosti su tile che nascondono (vegetazione, macerie). Un VC
// ferito (HP ≤ 50%) o in rotta che ne raggiunge uno ci si infila e sparisce
// dalla mappa; al suo turno successivo riemerge da un ingresso libero
// (recupera 2 HP e il morale) e resta in agguato. Anche i rinforzi possono
// arrivare dai tunnel. Un soldato adiacente nota l'ingresso (il geniere da 2
// tile), così come chi vede un VC entrarci o uscirne; il geniere può
// sigillarlo con la sua abilità. Se tutti gli ingressi sono sigillati, i VC
// rimasti dentro sono intrappolati (eliminati).
// Mappa: "tunnels": [{col,row}] (posizioni fisse) oppure "tunnelCount"
// (ingressi casuali, default 3; 0 = nessun tunnel).
const TUNNEL_DEFAULT_COUNT = 3;
const TUNNEL_MIN_START_DIST = 5; // distanza minima dalle posizioni di partenza
const TUNNEL_MIN_SPACING = 4; // distanza minima tra due ingressi
const TUNNEL_DIVE_HP = 0.5; // sotto questa frazione di HP il VC ripiega nei tunnel
const TUNNEL_HEAL = 2;
const TUNNEL_REINFORCE_CHANCE = 0.5; // rinforzo che arriva da un tunnel
const TUNNEL_EMERGE_DIST = 4; // distanza ideale dalla squadra all'uscita
const OFFMAP = -99; // posizione dei VC nei tunnel: fuori da ogni distanza

function initTunnels() {
  const md = G.mapData;
  const list = [];
  const free = (col, row) =>
    isTilePassable(col, row) &&
    !isOccupied(col, row) &&
    !trapAt(col, row) &&
    !list.some((t) => t.col === col && t.row === row);
  const make = (col, row) => ({ col, row, revealed: false, sealed: false });

  if (md.tunnels) {
    for (const tn of md.tunnels) if (free(tn.col, tn.row)) list.push(make(tn.col, tn.row));
  } else {
    const count = md.tunnelCount ?? TUNNEL_DEFAULT_COUNT;
    const starts = md.playerStart || [];
    const cands = [];
    for (let r = 0; r < md.rows; r++)
      for (let c = 0; c < md.cols; c++) {
        if (!free(c, r) || !isConcealingTile(c, r)) continue;
        if (starts.some((s) => dist(s, { col: c, row: r }) < TUNNEL_MIN_START_DIST)) continue;
        cands.push({ col: c, row: r });
      }
    cands.sort(() => Math.random() - 0.5);
    for (const c of cands) {
      if (list.length >= count) break;
      if (list.some((t) => dist(t, c) < TUNNEL_MIN_SPACING)) continue;
      list.push(make(c.col, c.row));
    }
  }
  G.missionState.tunnels = list;
}

function tunnelAt(col, row) {
  return (G.missionState?.tunnels || []).find((t) => t.col === col && t.row === row);
}

function isKnownTunnel(col, row) {
  const tn = tunnelAt(col, row);
  return !!tn && tn.revealed && !tn.sealed;
}

function openTunnels() {
  return (G.missionState?.tunnels || []).filter((t) => !t.sealed);
}

function revealTunnel(tn) {
  if (!tn || tn.revealed) return;
  tn.revealed = true;
  addFX("spot", { col: tn.col, row: tn.row, kind: "trap" }, 1100);
  log(t("log.tunnel_found", { col: tn.col, row: tn.row }), "success");
}

// I soldati notano gli ingressi adiacenti (il geniere fino a 2 tile)
function revealTunnelsNearUnits() {
  for (const u of G.units) {
    if (!u.alive) continue;
    const range = u.cls === "engineer" ? 2 : 1;
    for (const tn of G.missionState?.tunnels || []) {
      if (!tn.revealed && dist(u, tn) <= range) revealTunnel(tn);
    }
  }
}

// VC ferito o in rotta: se raggiunge un ingresso libero in questo turno ci si
// infila. Restituisce true se l'attivazione è finita qui.
async function tryTunnelDive(enemy, stats) {
  const hurt = enemy.hp / enemy.maxHp <= TUNNEL_DIVE_HP || enemy.routed > 0;
  const open = openTunnels();
  if (!hurt || !open.length || enemy.ap < 1) return false;
  const entry = vcReachableTiles(enemy, Math.min(enemy.ap, stats.move))
    .filter((tl) => open.some((t) => t.col === tl.col && t.row === tl.row))
    .sort((a, b) => a.cost - b.cost)[0];
  if (!entry) return false;
  await vcMoveTo(enemy, entry, null);
  if (!enemy.alive) return true;
  diveIntoTunnel(enemy, tunnelAt(entry.col, entry.row));
  return true;
}

function diveIntoTunnel(enemy, tn) {
  if (isTileVisible(enemy.col, enemy.row)) {
    revealTunnel(tn);
    addFX("spawn", { col: enemy.col, row: enemy.row }, 900);
    log(t("log.vc_tunnel_dive", { name: enemy.name }), "enemy");
  }
  statAdd("tunnelDives");
  enemy.inTunnel = true;
  enemy.col = enemy.row = enemy.vx = enemy.vy = OFFMAP;
  enemy.ap = 0;
  enemy.ambush = false;
}

// Uscita migliore: libera, non vista dalla squadra, a distanza d'assalto
function bestTunnelExit() {
  const exits = openTunnels().filter((t) => !isOccupied(t.col, t.row));
  if (!exits.length) return null;
  const score = (tn) => {
    const near = nearestLiveUnit(tn);
    const d = near ? dist(tn, near) : TUNNEL_EMERGE_DIST;
    const seen = G.units.some(
      (u) => u.alive && isTileVisibleFromUnit(u, tn.col, tn.row),
    );
    return (
      -Math.abs(d - TUNNEL_EMERGE_DIST) * 2 -
      (seen ? 5 : 0) +
      coverBonus(tn.col, tn.row) +
      Math.random()
    );
  };
  return exits.reduce((b, tn) => (score(tn) > score(b) ? tn : b));
}

// VC nel tunnel: riemerge in agguato all'inizio della sua attivazione
function tunnelEmerge(enemy) {
  const exit = bestTunnelExit();
  if (!exit) return; // tutte le uscite occupate: resta sotto
  enemy.inTunnel = false;
  enemy.col = enemy.vx = exit.col;
  enemy.row = enemy.vy = exit.row;
  enemy.hp = Math.min(enemy.maxHp, enemy.hp + TUNNEL_HEAL);
  enemy.routed = 0;
  enemy.alerted = true;
  enemy.ap = 0;
  enemy.ambush = true;
  const near = nearestLiveUnit(enemy);
  if (near) faceToward(enemy, near);
  statAdd("tunnelEmerges");
  if (isTileVisible(exit.col, exit.row)) {
    revealTunnel(exit);
    addFX("spawn", { col: exit.col, row: exit.row, ambush: true }, 1200);
    log(t("log.vc_tunnel_emerge", { name: enemy.name }), "enemy");
  }
}

// Ingresso libero per un rinforzo (null se nessuno o se il tiro fallisce)
function tunnelForReinforcement() {
  if (Math.random() >= TUNNEL_REINFORCE_CHANCE) return null;
  const exits = openTunnels().filter((t) => !isOccupied(t.col, t.row));
  return exits.length ? pick(exits) : null;
}

// Geniere: sigilla un ingresso adiacente individuato (carica esplosiva)
function sealTunnel(engineer, tn) {
  tn.sealed = true;
  engineer.ap -= 1;
  engineer.specialUsed = true;
  statAdd("tunnelsSealed");
  sfx("demolition");
  addFX("demolition", { col: tn.col, row: tn.row, success: true }, 1000);
  log(t("log.tunnel_sealed", { name: engineer.name }), "success");
  makeNoise(tn, DEMOLITION_NOISE);
  // Rete chiusa: chi è rimasto sotto è intrappolato
  if (!openTunnels().length) {
    for (const e of G.enemies) {
      if (!e.alive || !e.inTunnel) continue;
      e.alive = false;
      e.hp = 0;
      if (G.missionType === "search_destroy")
        G.missionState.kills = (G.missionState.kills || 0) + 1;
      log(t("log.vc_tunnel_trapped", { name: e.name }), "success");
    }
    document.getElementById("vc-remain").textContent = G.enemies.filter(
      (e) => e.alive,
    ).length;
    checkVictory();
  }
  updateUI();
  render();
}

// ── TRAPPOLE PIAZZATE DAI VC ───────────────────────────────────────────
// Un guerrigliero in pattuglia, ogni tanto, lascia una trappola sul tile da
// cui parte (al massimo VC_TRAP_PLANT_MAX per missione, "vcTrapPlantMax" in
// mappa). Se il giocatore vede il VC mentre la piazza, la trappola è segnata.
const VC_TRAP_PLANT_CHANCE = 0.15;
const VC_TRAP_PLANT_MAX = 3;

function maybePlantTrap(enemy) {
  if (enemy.cls !== "grunt") return;
  const st = G.missionState;
  const max = G.mapData.vcTrapPlantMax ?? VC_TRAP_PLANT_MAX;
  if ((st.trapsPlanted || 0) >= max || Math.random() >= VC_TRAP_PLANT_CHANCE) return;
  const { col, row } = enemy;
  if (trapAt(col, row) || tunnelAt(col, row)) return;
  const seen = isTileVisible(col, row);
  addTrap(col, row, pick(["punji", "punji", "mine"]), seen);
  st.trapsPlanted = (st.trapsPlanted || 0) + 1;
  statAdd("trapsPlanted");
  if (seen) log(t("log.vc_plant_trap", { name: enemy.name }), "enemy");
}

// ── CECCHINI MIMETIZZATI ───────────────────────────────────────────────
// Un cecchino VC su un tile che nasconde (tra gli alberi, nelle macerie) è
// invisibile oltre CAMO_SPOT_DIST tile finché non spara: lo sparo lo svela
// (enemy.exposed) fino all'inizio del turno VC successivo.
const CAMO_SPOT_DIST = 2;

function isVcCamouflaged(e) {
  return (
    e.cls === "sniper_vc" && !e.exposed && !e.inTunnel && isConcealingTile(e.col, e.row)
  );
}

// Il giocatore vede il VC: tile nel FOW visibile e, se mimetizzato, un
// soldato entro CAMO_SPOT_DIST (con il FOW spento si vede tutto)
function isEnemyVisible(e) {
  if (e.inTunnel) return false;
  if (!G.fowEnabled) return true;
  if (!isTileVisible(e.col, e.row)) return false;
  if (!isVcCamouflaged(e)) return true;
  return G.units.some((u) => u.alive && dist(u, e) <= CAMO_SPOT_DIST);
}

// Un soldato specifico vede il VC (attacco diretto, overwatch, soppressione)
function unitSeesEnemy(u, e) {
  if (e.inTunnel || !isTileVisibleFromUnit(u, e.col, e.row)) return false;
  return !isVcCamouflaged(e) || dist(u, e) <= CAMO_SPOT_DIST;
}
