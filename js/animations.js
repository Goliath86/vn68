let _tileAnimLoopActive = false;
let _tileAnimDt = 16;
let _tileAnimLastTime = 0;
let _fxLoopActive = false;

// delay (ms, opzionale): l'effetto parte più tardi, es. all'arrivo del tracciante
function addFX(type, data, duration, delay = 0) {
  G.effects.push({ type, data, duration, t0: performance.now() + delay });
  // Rinculo del tiratore e sobbalzo del colpito (pose in unitAnimPose)
  _unitFxAnim(type, data, duration, performance.now() + delay);
  // Ogni esplosione (granate, RPG, artiglieria, mine) scuote gli alberi
  // vicini e lascia un cratere
  if (type === "explosion") {
    addBlastShake(data.col, data.row, data.aoe ?? 0, delay);
    addCrater(data.col, data.row, !!data.big, delay);
  }
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
    turnsLeft: f.turnsLeft,
  }));
  const smokes = (G.missionState?.smokes || []).map((s) => ({
    col: s.col,
    row: s.row,
    type: "smokeCloud",
    turnsLeft: s.turnsLeft,
  }));
  return [...global, ...mission, ...fires, ...smokes];
}

// Indicatori pulsanti sulle pedine (scosso, emorragia): richiedono il ciclo
// di ridisegno anche sulle mappe senza animazioni del terreno
function _unitsPulsing() {
  return G.units.some((u) => u.alive && (u.shaken || u.bleeding));
}

// Animazioni che vogliono la frequenza piena (fuoco, fumo, pulsazioni)
function _needsFastAnim() {
  return (
    _getTileAnims().length > 0 ||
    _unitsPulsing() ||
    // Rinculo, sobbalzo o girata in corso: a 30 fps sarebbero a scatti
    performance.now() < _unitFxBusyUntil ||
    // Tile evidenziato dall'istruttore del tutorial (lampeggia)
    (tutorialActive() && !!currentTutorialStep()?.highlight)
  );
}

function _needsAnimLoop() {
  return (
    _needsFastAnim() ||
    windActive() ||
    weatherActive() ||
    waterTiles().length > 0 ||
    cratersFading() ||
    unitAnimActive()
  );
}

// ── ANIMAZIONI DEI SOLDATI ─────────────────────────────────────────────
// Pedine disegnate (plchldSprites.js:drawUnitSprite con `anim`): respiro
// continuo (più rapido da feriti), gesti a riposo scelti dal tempo e dall'id
// dell'unità (nessuno stato da salvare: guardarsi intorno, perlustrare con
// l'arma, controllarla) e la ricarica, avviata da actions.js:reloadWeapon
// con unit.animReload = istante d'inizio. Preferenza in
// localStorage[UNIT_ANIM_PREF_KEY]; spente con "riduci movimento".
const UNIT_ANIM_PREF_KEY = "vn68_unit_anim";
const UNIT_ANIM = {
  breathPeriod: 3.4, // s, a riposo
  breathPeriodWounded: 2.1,
  breathAmp: 0.014, // scala del busto
  slot: 6.5, // s: ogni unità valuta un gesto per intervallo
  idleChance: { look: 0.3, sweep: 0.15, check: 0.15 }, // il resto: fermo
  look: { dur: 2.4, head: 0.75 },
  sweep: { dur: 2.6, gun: 0.3 },
  check: { dur: 2.4, gun: -0.55, dx: -0.03, dy: 0.06, head: 0.35 },
  reload: { dur: 1.7, gun: 0.3 },
  proneDamp: 0.5, // sdraiati: gesti più piccoli
  turnMs: 170, // girata morbida verso il nuovo facing
  stanceMs: 300, // cambio di postura: dissolvenza tra le due figure
  breathAmpWounded: 0.026, // ferito grave: respiro affannato, più ampio
  shakenTremor: 0.02, // scosso: tremito dell'arma (radianti)
  // Rinculo a ogni colpo della raffica: l'arma arretra (kick, tile) e scarta
  // (jitter, radianti), poi torna in decayMs; coltello: affondo in lungeMs
  recoil: { kick: 0.06, jitter: 0.06, decayMs: 70, lungeMs: 260, lunge: 0.09 },
  // Colpito: la figura sobbalza lontano dal tiratore (push, tile) e si torce
  // Picco in fretta, poi ritorno lento: resta visibile dopo il lampo
  // d'impatto di _drawHit, che copre il tile per i primi ~160 ms
  flinch: { ms: 620, peak: 0.1, push: 0.16, twist: 0.22 },
  // Camminata per postura: bob = beccheggio (scala a ogni passo), sway =
  // oscillazione di braccia e arma, twist = torsione del busto (radianti)
  walk: {
    stand: { bob: 0.03, sway: 0.06, twist: 0.04 },
    crouch: { bob: 0.018, sway: 0.04, twist: 0.03 },
    prone: { bob: 0, sway: 0.06, twist: 0.08 },
  },
};

// Stato delle animazioni non salvato (fuori dagli oggetti unità, che finiscono
// nel salvataggio): fase del passo durante un movimento (ai.js:
// animateEnemyMove) e girata in corso
const _unitWalk = new WeakMap(); // unità → fase del passo (giri, cresce col percorso)
const _unitTurn = new WeakMap(); // unità → { facing, from, t0 }
const _unitStance = new WeakMap(); // unità → { stance, from, t0 } postura disegnata
let _unitFxBusyUntil = 0; // fino a quando serve il ciclo d'animazione veloce

function _unitFxBusy(until) {
  _unitFxBusyUntil = Math.max(_unitFxBusyUntil, until);
  _startTileAnimLoop();
}

function setUnitWalk(u, phase) {
  if (phase == null) _unitWalk.delete(u);
  else _unitWalk.set(u, phase);
}

// Rotazione (radianti) che manca per arrivare al facing attuale: al cambio
// di facing la figura parte dall'angolo mostrato e gira per il verso breve
function _unitTurnOffset(u, now) {
  const f = u.facing ?? 0;
  const st = _unitTurn.get(u);
  if (!st) {
    _unitTurn.set(u, { facing: f, from: 0, t0: 0 });
    return 0;
  }
  const left = (s) => s.from * (1 - _easeInOut(Math.min(1, (now - s.t0) / UNIT_ANIM.turnMs)));
  if (st.facing !== f) {
    let d = (st.facing - f) * (Math.PI / 2) + left(st);
    d = Math.atan2(Math.sin(d), Math.cos(d)); // verso breve
    _unitTurn.set(u, { facing: f, from: d, t0: now });
    _unitFxBusy(now + UNIT_ANIM.turnMs);
    return d;
  }
  return left(st);
}

// Cambio di postura: al cambio della postura disegnata parte una dissolvenza
// dalla figura di prima (a metà di un cambio: da quella che dominava).
// Imposta pose.stanceFrom e pose.stanceK (0..1) per drawUnitSprite
function _applyStanceChange(u, stance, pose, now) {
  const st = _unitStance.get(u);
  if (!st) {
    _unitStance.set(u, { stance, from: null, t0: 0 });
    return;
  }
  if (st.stance !== stance) {
    const k = st.from ? (now - st.t0) / UNIT_ANIM.stanceMs : 1;
    const from = k < 0.5 && st.from ? st.from : st.stance;
    _unitStance.set(u, { stance, from: from === stance ? null : from, t0: now });
    _unitFxBusy(now + UNIT_ANIM.stanceMs);
    return _applyStanceChange(u, stance, pose, now);
  }
  if (!st.from) return;
  const k = (now - st.t0) / UNIT_ANIM.stanceMs;
  if (k >= 1) {
    st.from = null;
    return;
  }
  pose.stanceFrom = st.from;
  pose.stanceK = _easeInOut(Math.max(0, k));
}

function _easeInOut(k) {
  return k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
}

// Spari e colpi a segno (da addFX): chi spara rincula colpo per colpo con la
// cadenza dei traccianti di _drawShot, chi è colpito sobbalza. L'unità è
// quella sul tile d'origine o d'arrivo dell'effetto
const _unitFire = new WeakMap(); // unità → { t0, rounds, stagger, melee }
const _unitHit = new WeakMap(); // unità → { t0, dx, dy } (verso del sobbalzo)

function _unitAt(col, row) {
  const at = (o) => o.alive && o.col === col && o.row === row;
  return G.units.find(at) || G.enemies.find(at) || null;
}

function _unitFxAnim(type, d, duration, t0) {
  if (!d || !G.mapData) return;
  let fire = null;
  if (type === "shot") fire = [d.fromCol, d.fromRow, d.rounds ?? (d.sniper ? 1 : 3), duration];
  else if (type === "overwatch") fire = [d.owCol, d.owRow, d.rounds ?? (d.sniper ? 1 : 3), OW_SHOT_MS];
  else if (type === "suppression") fire = [d.supCol, d.supRow, 5, SUP_SHOT_MS];
  else if (type === "slash") fire = [d.fromCol, d.fromRow, 1, duration];
  if (fire) {
    const u = _unitAt(fire[0], fire[1]);
    const rounds = clamp(Math.round(fire[2]), 1, 5);
    if (u) {
      _unitFire.set(u, { t0, rounds, stagger: 0.12 * fire[3], melee: type === "slash" });
      _unitFxBusy(t0 + rounds * 0.12 * fire[3] + UNIT_ANIM.recoil.lungeMs + 200);
    }
  }
  if (type === "hit") {
    const u = _unitAt(d.col, d.row);
    if (!u) return;
    // Lontano da chi ha sparato; senza tiratore (esplosioni, trappole) a caso
    let dx = d.col - (d.fromCol ?? d.col),
      dy = d.row - (d.fromRow ?? d.row);
    if (!dx && !dy) {
      const a = Math.random() * Math.PI * 2;
      dx = Math.cos(a);
      dy = Math.sin(a);
    }
    const len = Math.hypot(dx, dy);
    _unitHit.set(u, { t0, dx: dx / len, dy: dy / len });
    _unitFxBusy(t0 + UNIT_ANIM.flinch.ms);
  }
}

// Ritardo (ms) con cui far partire uno sparo perché il tiratore finisca di
// girarsi verso il bersaglio (combat.js:resolveCombat); 0 se è già girato,
// senza animazioni o se è un VC che non si vede
function aimTurnLead(shooter, target, isEnemy) {
  if (!G.unitAnimEnabled) return 0;
  const f = facingToward(shooter, target);
  if (f === null || f === (shooter.facing ?? 0)) return 0;
  if (isEnemy && !isEnemyVisible(shooter)) return 0;
  return UNIT_ANIM.turnMs;
}

// Rinculo/affondo e sobbalzo nella posa (aggiunti a quella del momento)
function _applyFireHit(u, pose, now) {
  const F = _unitFire.get(u);
  let busy = false;
  if (F) {
    const R = UNIT_ANIM.recoil;
    const dt = now - F.t0;
    if (dt > F.rounds * F.stagger + R.lungeMs + 200) _unitFire.delete(u);
    else if (dt >= 0) {
      busy = true;
      if (F.melee) {
        const k = Math.min(1, dt / R.lungeMs);
        pose.gunDy -= R.lunge * Math.sin(Math.PI * k);
        pose.bodyRot = (pose.bodyRot || 0) + 0.12 * Math.sin(Math.PI * k);
      } else {
        let kick = 0;
        for (let i = 0; i < F.rounds; i++) {
          const di = dt - i * F.stagger;
          if (di >= 0) kick += Math.min(1, di / 12) * Math.exp(-di / R.decayMs);
        }
        pose.gunDy += R.kick * kick;
        pose.gunRot += R.jitter * kick * (Math.floor(dt / F.stagger) % 2 ? 1 : -1);
        pose.bodyRot = (pose.bodyRot || 0) - 0.3 * R.jitter * kick;
      }
    }
  }
  const H = _unitHit.get(u);
  if (H) {
    const Fl = UNIT_ANIM.flinch;
    const k = (now - H.t0) / Fl.ms;
    if (k >= 1) _unitHit.delete(u);
    else if (k >= 0) {
      busy = true;
      // Colpo secco, poi ritorno lento
      const a = k < Fl.peak ? k / Fl.peak : 1 - _easeInOut((k - Fl.peak) / (1 - Fl.peak));
      pose.dx = H.dx * Fl.push * a;
      pose.dy = H.dy * Fl.push * a;
      pose.bodyRot = (pose.bodyRot || 0) + Fl.twist * a * (H.dx - H.dy >= 0 ? 1 : -1);
      pose.headRot += 0.3 * a;
    }
  }
  return busy;
}

G.unitAnimEnabled = (() => {
  try {
    const v = localStorage.getItem(UNIT_ANIM_PREF_KEY);
    if (v !== null) return v === "1";
  } catch {}
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
})();

// Velocità del movimento delle pedine (ai.js:animateEnemyMove): normale o
// veloce, preferenza in localStorage[MOVE_SPEED_PREF_KEY], dalle Opzioni
const MOVE_SPEED_PREF_KEY = "vn68_move_speed";
G.moveSpeedFast = (() => {
  try {
    return localStorage.getItem(MOVE_SPEED_PREF_KEY) === "fast";
  } catch {}
  return false;
})();

function toggleMoveSpeed() {
  G.moveSpeedFast = !G.moveSpeedFast;
  try {
    localStorage.setItem(MOVE_SPEED_PREF_KEY, G.moveSpeedFast ? "fast" : "normal");
  } catch {}
}

function moveAnimFactor() {
  return G.moveSpeedFast ? MOVE_ANIM.fastFactor : 1;
}

function toggleUnitAnim() {
  G.unitAnimEnabled = !G.unitAnimEnabled;
  try {
    localStorage.setItem(UNIT_ANIM_PREF_KEY, G.unitAnimEnabled ? "1" : "0");
  } catch {}
  render();
  _startTileAnimLoop();
}

function unitAnimActive() {
  return G.unitAnimEnabled && !!G.mapData && G.units.some((u) => u.alive);
}

// Numero pseudo-casuale stabile in [0, 1) da una stringa e un intero
function _animHash(id, n) {
  let h = 2166136261 ^ n;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

// Finestra morbida: 0 ai bordi, 1 nel mezzo (salita e discesa su `edge`)
function _animEnv(p, edge = 0.2) {
  const s = (x) => x * x * (3 - 2 * x);
  return p < edge ? s(p / edge) : p > 1 - edge ? s((1 - p) / edge) : 1;
}

const _lerp2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];

// Posa del momento per un'unità (US o VC); null = figura ferma
function unitAnimPose(u, isEnemy = false) {
  if (!G.unitAnimEnabled || !u?.alive) return null;
  const now = performance.now();
  const t = now / 1000;
  const id = String(u.id);
  const wounded = !isEnemy && u.maxHp && u.hp / u.maxHp <= WOUND_THRESHOLD;
  const period = wounded ? UNIT_ANIM.breathPeriodWounded : UNIT_ANIM.breathPeriod;
  const amp = wounded ? UNIT_ANIM.breathAmpWounded : UNIT_ANIM.breathAmp;
  const pose = {
    breath: 1 + amp * Math.sin((2 * Math.PI * t) / period + _animHash(id, 0) * 6.28),
    // Scosso (panico): l'arma trema
    gunRot: !isEnemy && u.shaken ? UNIT_ANIM.shakenTremor * Math.sin(t * 31 + _animHash(id, 2) * 6.28) : 0,
    gunDx: 0,
    gunDy: 0,
    headRot: 0,
    turn: _unitTurnOffset(u, now),
  };
  _applyStanceChange(u, isEnemy ? pieceStance(u) : u.stance || "stand", pose, now);
  const walk = _unitWalk.get(u);
  // Sparo (rinculo, affondo del coltello) o colpo appena preso (sobbalzo)
  if (walk == null && _applyFireHit(u, pose, now)) return pose;
  // In cammino: passo, beccheggio, braccia e busto che oscillano col passo
  if (walk != null) {
    const stance = isEnemy ? pieceStance(u) : u.stance;
    const W = UNIT_ANIM.walk[stance] || UNIT_ANIM.walk.stand;
    const s = Math.sin(2 * Math.PI * walk);
    pose.walk = walk;
    pose.breath *= 1 + W.bob * Math.abs(s);
    pose.gunRot = W.sway * s;
    pose.gunDx = 0.01 * s;
    pose.bodyRot = W.twist * s;
    pose.headRot = -0.5 * W.twist * s;
    return pose;
  }
  const damp = u.stance === "prone" ? UNIT_ANIM.proneDamp : 1;
  // Ricarica in corso: la mano sinistra va alla giberna e torna col caricatore
  const R = UNIT_ANIM.reload;
  const rp = u.animReload ? (now - u.animReload) / 1000 / R.dur : 2;
  if (rp >= 0 && rp < 1) {
    const sp = SOLDIER_POSES[SOLDIER_POSES[u.stance] ? u.stance : "stand"];
    const look = SOLDIER_LOOKS[soldierLook(u.cls, isEnemy)];
    const grip = look?.weapon === "pistol" ? sp.grip : sp.armL[2];
    const [gx, gy, mx, my] = sp.gun;
    const well = look?.weapon === "pistol" ? [sp.grip[0], sp.grip[1] + 0.02] : _lerp2([gx, gy], [mx, my], 0.33);
    const pouch = [sp.torso[0] - sp.torso[2] * 0.75, sp.torso[1] + sp.torso[3] * 0.7];
    const seg = (a, b, k) => _lerp2(a, b, k * k * (3 - 2 * k));
    let handL;
    if (rp < 0.2) handL = seg(grip, well, rp / 0.2);
    else if (rp < 0.45) handL = seg(well, pouch, (rp - 0.2) / 0.25);
    else if (rp < 0.7) handL = seg(pouch, well, (rp - 0.45) / 0.25);
    else if (rp < 0.82) handL = well;
    else handL = seg(well, grip, (rp - 0.82) / 0.18);
    pose.handL = handL;
    pose.mag = rp > 0.2 && rp < 0.72;
    pose.gunRot = R.gun * damp * _animEnv(rp, 0.15);
    // Colpo secco del caricatore inserito
    if (rp > 0.7 && rp < 0.8) pose.gunDy = 0.015 * Math.sin(((rp - 0.7) / 0.1) * Math.PI);
    pose.headRot = 0.25 * _animEnv(rp, 0.2);
    return pose;
  }
  // Gesti a riposo: uno per intervallo, all'inizio dell'intervallo
  const slotT = t + _animHash(id, 1) * UNIT_ANIM.slot;
  const slot = Math.floor(slotT / UNIT_ANIM.slot);
  const into = slotT - slot * UNIT_ANIM.slot - 0.5;
  const r = _animHash(id, slot + 7);
  const ch = UNIT_ANIM.idleChance;
  const kind = r < ch.look ? "look" : r < ch.look + ch.sweep ? "sweep" : r < ch.look + ch.sweep + ch.check ? "check" : null;
  // I VC in agguato o mimetizzati restano immobili, a parte il respiro
  if (!kind || (isEnemy && (u.ambush || kind === "check"))) return pose;
  const A = UNIT_ANIM[kind];
  if (into < 0 || into > A.dur) return pose;
  const p = into / A.dur;
  const env = _animEnv(p);
  const dir = _animHash(id, slot + 13) < 0.5 ? 1 : -1;
  if (kind === "look") pose.headRot = A.head * damp * dir * Math.sin(2 * Math.PI * p) * env;
  else if (kind === "sweep") {
    pose.gunRot = A.gun * damp * dir * Math.sin(2 * Math.PI * p) * env;
    pose.headRot = pose.gunRot * 0.8;
  } else {
    pose.gunRot = A.gun * damp * env;
    pose.gunDx = A.dx * env;
    pose.gunDy = A.dy * damp * env;
    pose.headRot = A.head * damp * env;
  }
  return pose;
}

function _startTileAnimLoop() {
  if (_tileAnimLoopActive) return;
  if (!_needsAnimLoop()) return;
  _tileAnimLoopActive = true;
  _tileAnimLastTime = 0;
  requestAnimationFrame(_tileAnimTick);
}

function _tileAnimTick(now) {
  if (G.phase === "gameover" || !_needsAnimLoop()) {
    _tileAnimLoopActive = false;
    _tileAnimLastTime = 0;
    return;
  }
  // Solo vento/meteo: un fotogramma ogni WIND_FRAME_MS basta
  if (_tileAnimLastTime && now - _tileAnimLastTime < WIND_FRAME_MS && !_needsFastAnim()) {
    requestAnimationFrame(_tileAnimTick);
    return;
  }
  _tileAnimDt = _tileAnimLastTime ? Math.min(now - _tileAnimLastTime, 64) : 16;
  _tileAnimLastTime = now;
  renderMap(true);
  requestAnimationFrame(_tileAnimTick);
}

// ── VENTO ──────────────────────────────────────────────────────────────
// Erba (e poi chiome) mossa da un unico campo di vento: una leggera
// oscillazione continua più raffiche che attraversano la mappa nella
// direzione del vento, così piante vicine si muovono insieme. Solo terreno
// procedurale (le mappe con immagine di sfondo non hanno piante disegnate).
// Preferenza in localStorage[WIND_PREF_KEY]; di default spento su mobile e
// con "riduci movimento" di sistema.
const WIND_PREF_KEY = "vn68_wind";
const WIND_FRAME_MS = 33; // ~30 fps
const WIND_GRASS_IDS = new Set(["clearing", "garden", "village", "trail"]);
const WIND = {
  dirX: 0.8, // direzione (normalizzata) verso cui soffia
  dirY: 0.6,
  gustSpeed: 90, // velocità delle raffiche (unità mondo/s, TILE = 64)
  gustLen: 480, // lunghezza d'onda delle raffiche
  base: 0.25, // piega costante sottovento
  sway: 0.2, // ampiezza dell'oscillazione continua
};

G.windEnabled = (() => {
  try {
    const v = localStorage.getItem(WIND_PREF_KEY);
    if (v !== null) return v === "1";
  } catch {}
  return !isMobile() && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
})();

function windActive() {
  return G.windEnabled && !!G.mapData && !G.tileImg;
}

function toggleWind() {
  G.windEnabled = !G.windEnabled;
  try {
    localStorage.setItem(WIND_PREF_KEY, G.windEnabled ? "1" : "0");
  } catch {}
  updateWindButton();
  // l'erba passa dalla cache del terreno al disegno per fotogramma e viceversa
  invalidateTerrainCache();
  render();
}

function updateWindButton() {
  const btn = document.getElementById("btn-wind");
  if (!btn) return;
  btn.classList.toggle("wind-on", G.windEnabled);
  btn.title = t(G.windEnabled ? "buttons.wind_on" : "buttons.wind_off");
}

// Raffica in un punto del mondo all'istante t (s): 0 calma … ~1.4 piena
function windGust(wx, wy, t) {
  const p = wx * WIND.dirX + wy * WIND.dirY;
  const k = (Math.PI * 2) / WIND.gustLen;
  const g1 = Math.sin(p * k - t * WIND.gustSpeed * k);
  const g2 = Math.sin(p * k * 0.37 + wy * 0.004 - t * WIND.gustSpeed * k * 0.6 + 1.7);
  return Math.max(0, (g1 + g2) * 0.6) ** 2;
}

// Piega totale: ~0 calma, ~2 raffica piena
function windAt(wx, wy, t) {
  const p = wx * WIND.dirX + wy * WIND.dirY;
  return WIND.base + Math.sin(t * 1.7 + p * 0.03) * WIND.sway + windGust(wx, wy, t);
}

// ── CRATERI ────────────────────────────────────────────────────────────
// Buca annerita con bordo di zolle sul tile dell'esplosione, per il resto
// della missione: G.missionState.craters [{ col, row, seed, big }] (salvato).
// Uno per tile (un'esplosione più grande lo allarga); niente crateri su
// acqua, ponti e tile alti (muri, edifici, bunker, ostacoli). Sprite
// disegnato una volta per cratere; compare in dissolvenza sotto il fumo.
// Disegnato sopra le chiome: l'esplosione apre un varco nella vegetazione.
const CRATER = {
  radius: 0.2, // raggio della buca in tile (granata, mina, RPG)
  bigRadius: 0.3, // artiglieria
  fadeInMs: 500,
};
const _craterSprites = new Map(); // "col,row" → { canvas, big, seed }
const _craterBorn = new Map(); // "col,row" → istante di comparsa (solo runtime)

function _craterAllowed(col, row) {
  const tile = getTileAt(col, row);
  return (
    !!tile &&
    !tile.impassable &&
    tile.losBlock !== "full" &&
    !WATER_IDS.has(tileLook(tile)) &&
    tileLook(tile) !== "bridge"
  );
}

function addCrater(col, row, big, delayMs = 0) {
  if (!G.missionState || !_craterAllowed(col, row)) return;
  const list = (G.missionState.craters ||= []);
  const old = list.find((c) => c.col === col && c.row === row);
  if (old) {
    if (big && !old.big) old.big = true;
    return;
  }
  list.push({ col, row, seed: Math.floor(Math.random() * 1e6), big });
  const born = performance.now() + delayMs;
  _craterBorn.set(col + "," + row, born);
  // Ridisegno della mappa finché la dissolvenza non è finita
  _craterFadeUntil = Math.max(_craterFadeUntil, born + CRATER.fadeInMs);
  _startTileAnimLoop();
}

let _craterFadeUntil = 0;
function cratersFading() {
  return performance.now() < _craterFadeUntil;
}

function _craterSprite(cr) {
  const key = cr.col + "," + cr.row;
  const cached = _craterSprites.get(key);
  if (cached && cached.big === cr.big && cached.seed === cr.seed) return cached.canvas;
  const r = TILE * (cr.big ? CRATER.bigRadius : CRATER.radius);
  const ext = r * 2.2; // ingombro con bruciatura e detriti
  const dens = 2;
  const cv = document.createElement("canvas");
  cv.width = cv.height = Math.ceil(ext * 2 * dens);
  const g = cv.getContext("2d");
  g.scale(dens, dens);
  g.translate(ext, ext);
  let n = cr.seed;
  const rng = () => _hash01(n++ * 1.618);

  // 1) Bruciatura irregolare attorno alla buca
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2;
    const d = r * (0.2 + rng() * 0.5);
    const rr = r * (1.1 + rng() * 0.6);
    const grad = g.createRadialGradient(Math.cos(a) * d, Math.sin(a) * d, 0, Math.cos(a) * d, Math.sin(a) * d, rr);
    grad.addColorStop(0, "rgba(18,12,6,0.32)");
    grad.addColorStop(1, "rgba(18,12,6,0)");
    g.fillStyle = grad;
    g.fillRect(-ext, -ext, ext * 2, ext * 2);
  }
  // 2) Detriti sparsi
  for (let i = 0; i < 16; i++) {
    const a = rng() * Math.PI * 2;
    const d = r * (1.1 + rng() * 0.9);
    g.fillStyle = rng() < 0.5 ? "rgba(95,75,48,0.75)" : "rgba(40,30,20,0.7)";
    g.beginPath();
    g.ellipse(Math.cos(a) * d, Math.sin(a) * d * 0.85, r * (0.04 + rng() * 0.05), r * (0.03 + rng() * 0.04), rng() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // 3) Bordo di zolle sollevate
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rng() * 0.3;
    const d = r * (0.9 + rng() * 0.18);
    const x = Math.cos(a) * d,
      y = Math.sin(a) * d * 0.85;
    const rr = r * (0.13 + rng() * 0.1);
    g.fillStyle = "rgba(30,22,12,0.5)"; // ombra della zolla (luce da nord-ovest)
    g.beginPath();
    g.ellipse(x + rr * 0.3, y + rr * 0.35, rr, rr * 0.75, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = rng() < 0.5 ? "rgb(112,88,56)" : "rgb(96,76,48)";
    g.beginPath();
    g.ellipse(x, y, rr, rr * 0.75, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(170,145,105,0.35)";
    g.beginPath();
    g.ellipse(x - rr * 0.3, y - rr * 0.3, rr * 0.45, rr * 0.3, 0, 0, Math.PI * 2);
    g.fill();
  }
  // 4) Buca: fondo scuro, parete a nord-ovest in ombra, a sud-est illuminata
  g.save();
  g.beginPath();
  g.ellipse(0, 0, r * 0.82, r * 0.68, 0, 0, Math.PI * 2);
  g.clip();
  const pit = g.createRadialGradient(r * 0.1, r * 0.1, 0, 0, 0, r * 0.85);
  pit.addColorStop(0, "rgb(28,20,12)");
  pit.addColorStop(0.7, "rgb(52,38,24)");
  pit.addColorStop(1, "rgb(78,60,38)");
  g.fillStyle = pit;
  g.fillRect(-r, -r, r * 2, r * 2);
  const wall = g.createLinearGradient(-r * 0.8, -r * 0.7, r * 0.8, r * 0.7);
  wall.addColorStop(0, "rgba(0,0,0,0.45)");
  wall.addColorStop(0.45, "rgba(0,0,0,0)");
  wall.addColorStop(0.8, "rgba(150,120,80,0)");
  wall.addColorStop(1, "rgba(150,120,80,0.35)");
  g.fillStyle = wall;
  g.fillRect(-r, -r, r * 2, r * 2);
  g.restore();

  _craterSprites.set(key, { canvas: cv, big: cr.big, seed: cr.seed });
  return cv;
}

function renderCraters(ctx) {
  const list = G.missionState?.craters;
  if (!list?.length) return;
  const now = performance.now();
  ctx.save();
  ctx.translate(G.camX, G.camY);
  ctx.scale(G.scale, G.scale);
  for (const cr of list) {
    const born = _craterBorn.get(cr.col + "," + cr.row);
    if (born !== undefined && now < born) continue; // esplosione non ancora avvenuta
    const a = born === undefined ? 1 : Math.min(1, (now - born) / CRATER.fadeInMs);
    const cv = _craterSprite(cr);
    const ext = cv.width / 4; // metà dell'ingombro in unità mondo (densità 2)
    // Leggero scarto dal centro, fisso per cratere
    const ox = (_hash01(cr.seed * 0.37) - 0.5) * TILE * 0.15;
    const oy = (_hash01(cr.seed * 0.73) - 0.5) * TILE * 0.15;
    ctx.globalAlpha = a;
    ctx.drawImage(cv, (cr.col + 0.5) * TILE + ox - ext, (cr.row + 0.5) * TILE + oy - ext, ext * 2, ext * 2);
  }
  ctx.restore();
}

// ── SCOSSONE DELLE ESPLOSIONI SUGLI ALBERI ─────────────────────────────
// L'onda d'urto spinge di colpo le chiome vicine lontano dal punto
// d'esplosione, poi le chiome tornano indietro con un'oscillazione smorzata
// (molla). L'onda viaggia: gli alberi più lontani si muovono un attimo dopo
// e meno. Usa le chiome animate dal vento (renderWindCanopy): col vento
// spento le chiome sono nella cache del terreno e restano ferme.
const BLAST_SHAKE = {
  reach: 1.6, // tile oltre il raggio dell'esplosione
  push: 0.5, // spostamento massimo, in raggi della chioma
  shockSpeed: 10, // tile/s dell'onda d'urto
  decay: 0.35, // s: smorzamento dell'oscillazione
  freq: 3.2, // oscillazioni/s del ritorno
  duration: 1.8, // s, poi lo scossone si dimentica
};
let _blasts = []; // { x, y, reach, t0 } in coordinate mondo, t0 in s

function addBlastShake(col, row, aoe, delayMs = 0) {
  if (!windActive()) return;
  _blasts.push({
    x: (col + 0.5) * TILE,
    y: (row + 0.5) * TILE,
    reach: (aoe + BLAST_SHAKE.reach) * TILE,
    t0: (performance.now() + delayMs) / 1000,
  });
  _startTileAnimLoop();
}

// Spostamento (in raggi della chioma) e intensità dello scossone in un punto
function blastShakeAt(wx, wy, t) {
  let dx = 0,
    dy = 0,
    k = 0;
  for (const b of _blasts) {
    const ox = wx - b.x,
      oy = wy - b.y;
    const d = Math.hypot(ox, oy);
    if (d > b.reach) continue;
    const local = t - b.t0 - d / (BLAST_SHAKE.shockSpeed * TILE);
    if (local < 0) continue;
    const fall = (1 - d / b.reach) ** 1.5;
    // Parte dal massimo (colpo secco), poi molla smorzata
    const env = Math.exp(-local / BLAST_SHAKE.decay) * Math.cos(Math.PI * 2 * BLAST_SHAKE.freq * local);
    const amount = BLAST_SHAKE.push * fall * env;
    if (d > 1) {
      dx += (ox / d) * amount;
      dy += (oy / d) * amount;
    }
    k = Math.max(k, Math.abs(env) * fall);
  }
  return { dx, dy, k };
}

// Chiome (plchldSprites.js:windCanopy): sprite della variante spostato
// sottovento in proporzione alla piega, con un dondolio trasversale e un
// lieve "respiro"; dove passa la raffica si sovrappone la sagoma chiara
function renderWindCanopy(ctx, canopy) {
  if (!canopy?.length || !windActive()) return;
  const sprites = canopySprites();
  const t = performance.now() / 1000;
  // area inquadrata in coordinate di mondo, con margine per le chiome
  const m = TILE * 0.6;
  const x0 = -G.camX / G.scale - m;
  const y0 = -G.camY / G.scale - m;
  const x1 = (G.canvas.width - G.camX) / G.scale + m;
  const y1 = (G.canvas.height - G.camY) / G.scale + m;
  const half = CANOPY_SPRITE_R * CANOPY_SPRITE_EXT;
  _blasts = _blasts.filter((b) => t - b.t0 < BLAST_SHAKE.duration);
  ctx.save();
  ctx.translate(G.camX, G.camY);
  ctx.scale(G.scale, G.scale);
  for (const k of canopy) {
    if (k.cx < x0 || k.cx > x1 || k.cy < y0 || k.cy > y1) continue;
    const w = windAt(k.cx, k.cy, t);
    const wob = Math.sin(t * 2.3 + k.ph) * k.rad * 0.025 * (0.5 + w);
    // Scossone delle esplosioni: spinta via dal centro, chioma che si schiaccia
    const bs = _blasts.length ? blastShakeAt(k.cx, k.cy, t) : null;
    const s =
      (k.rad / CANOPY_SPRITE_R) * (1 + Math.sin(t * 1.9 + k.ph) * 0.015) * (1 - (bs ? bs.k * 0.08 : 0));
    const cx = k.cx + WIND.dirX * w * k.rad * 0.07 - WIND.dirY * wob + (bs ? bs.dx * k.rad : 0);
    const cy = k.cy + WIND.dirY * w * k.rad * 0.07 + WIND.dirX * wob + (bs ? bs.dy * k.rad : 0);
    const sp = sprites[k.v];
    ctx.drawImage(sp.base, cx - half * s, cy - half * s, half * 2 * s, half * 2 * s);
    // Foglie rovesciate (sagoma chiara) dove passa la raffica o l'onda d'urto
    const g = Math.max(windGust(k.cx, k.cy, t), bs ? bs.k * 1.6 : 0);
    if (g > 0.05) {
      ctx.globalAlpha = Math.min(0.35, g * 0.22);
      ctx.drawImage(sp.light, cx - half * s, cy - half * s, half * 2 * s, half * 2 * s);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

// ── FOGLIE NELLE RAFFICHE ──────────────────────────────────────────────
// Sui tile di radura, quando il fronte di una raffica (windGust) arriva sul
// tile, ogni tanto un mucchietto di foglie secche si solleva: le foglie
// partono raccolte, accelerano sottovento con la raffica del punto in cui
// si trovano, salgono, frullano e svaniscono. Solo col vento attivo.
const LEAF_GUST = {
  tileIds: new Set(["clearing"]),
  threshold: 0.5, // raffica che fa partire un mucchietto (fronte in salita)
  chance: 0.08, // probabilità per tile a ogni fronte di raffica
  leaves: [5, 8], // foglie per mucchietto
  life: [1.6, 2.6], // durata in s
  fade: 0.4, // ultima frazione della vita in dissolvenza
  speed: 70, // unità mondo/s a raffica piena (TILE = 64)
  max: 160, // tetto di foglie in volo
  colors: ["#8a6a2a", "#a8823a", "#6b5a22", "#b59a4a", "#7a5530"],
};
let _leafTiles = null; // { mapData, tiles: [{ x, y, last }] } (centro del tile, mondo)
let _leaves = [];
let _leafLast = 0;

function leafTiles() {
  const md = G.mapData;
  if (_leafTiles && _leafTiles.mapData === md) return _leafTiles.tiles;
  const tiles = [];
  for (let r = 0; r < md.rows; r++)
    for (let c = 0; c < md.cols; c++)
      if (LEAF_GUST.tileIds.has(tileLook(md.tileTypes[md.grid[r][c]])))
        tiles.push({ x: (c + 0.5) * TILE, y: (r + 0.5) * TILE, last: 0 });
  _leafTiles = { mapData: md, tiles };
  _leaves = [];
  return tiles;
}

const _rndIn = ([a, b]) => a + Math.random() * (b - a);

function _spawnLeafPile(tile) {
  const L = LEAF_GUST;
  const px = tile.x + (Math.random() - 0.5) * TILE * 0.6;
  const py = tile.y + (Math.random() - 0.5) * TILE * 0.6;
  const n = Math.round(_rndIn(L.leaves));
  for (let i = 0; i < n && _leaves.length < L.max; i++) {
    // Età negativa = ferma nel mucchietto; partenze sfalsate: si sfalda
    const age = -0.2 - Math.random() * 0.25;
    _leaves.push({
      born: age, // età alla comparsa (per la dissolvenza in entrata)
      x: px + (Math.random() - 0.5) * 6,
      y: py + (Math.random() - 0.5) * 4,
      z: 0, // altezza da terra
      vz: 6 + Math.random() * 14,
      age,
      life: _rndIn(L.life),
      spread: (Math.random() - 0.5) * 0.6, // deviazione dalla direzione del vento
      gain: 0.7 + Math.random() * 0.6,
      spin: Math.random() * 6.28,
      spinV: (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 7),
      size: 2.2 + Math.random() * 1.4,
      col: L.colors[Math.floor(Math.random() * L.colors.length)],
    });
  }
}

function renderWindLeaves(ctx) {
  if (!windActive()) {
    _leaves = [];
    _leafLast = 0;
    return;
  }
  const now = performance.now();
  const dt = _leafLast ? Math.min(now - _leafLast, 100) / 1000 : 0;
  _leafLast = now;
  const t = now / 1000;
  const L = LEAF_GUST;

  // Fronti di raffica sui tile inquadrati
  const m = TILE;
  const x0 = -G.camX / G.scale - m;
  const y0 = -G.camY / G.scale - m;
  const x1 = (G.canvas.width - G.camX) / G.scale + m;
  const y1 = (G.canvas.height - G.camY) / G.scale + m;
  for (const tile of leafTiles()) {
    if (tile.x < x0 || tile.x > x1 || tile.y < y0 || tile.y > y1) continue;
    const g = windGust(tile.x, tile.y, t);
    if (tile.last < L.threshold && g >= L.threshold && Math.random() < L.chance) _spawnLeafPile(tile);
    tile.last = g;
  }
  if (!_leaves.length) return;

  ctx.save();
  ctx.translate(G.camX, G.camY);
  ctx.scale(G.scale, G.scale);
  _leaves = _leaves.filter((f) => {
    f.age += dt;
    if (f.age >= f.life) return false;
    if (f.age < 0) return true; // ancora nel mucchietto
    // Spinta della raffica nel punto della foglia, partenza progressiva
    const push = Math.min(1, f.age / 0.35) * (0.25 + windGust(f.x, f.y, t)) * f.gain;
    const v = L.speed * push * dt;
    const dx = WIND.dirX - WIND.dirY * f.spread;
    const dy = WIND.dirY + WIND.dirX * f.spread;
    f.x += dx * v;
    f.y += dy * v;
    f.vz -= 9 * dt; // ricade piano
    f.z = Math.max(0, f.z + f.vz * dt);
    f.spin += f.spinV * dt * (0.4 + push);
    return true;
  });
  // Comparsa rapida del mucchietto, dissolvenza nell'ultima parte del volo
  const alpha = (f) => {
    const k = f.age / f.life;
    const fadeIn = Math.min(1, (f.age - f.born) / 0.15);
    return fadeIn * (k > 1 - L.fade ? (1 - k) / L.fade : 1);
  };
  // Ombre a terra, sempre più tenui man mano che la foglia sale
  ctx.fillStyle = "#000";
  for (const f of _leaves) {
    if (f.z <= 1) continue;
    ctx.globalAlpha = alpha(f) * 0.25 * Math.max(0, 1 - f.z / 40);
    ctx.beginPath();
    ctx.ellipse(f.x, f.y, f.size * 0.8, f.size * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const f of _leaves) {
    const flip = Math.cos(f.spin * 0.7); // la foglia si gira: si assottiglia
    ctx.globalAlpha = alpha(f) * 0.9;
    ctx.save();
    ctx.translate(f.x, f.y - f.z);
    ctx.rotate(f.spin);
    ctx.fillStyle = f.col;
    ctx.beginPath();
    ctx.ellipse(0, 0, f.size, f.size * 0.5 * Math.max(0.15, Math.abs(flip)), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// Fili d'erba raccolti da getTerrainCache, solo sui tile inquadrati; due
// tracciati (chiaro/scuro) per tutti i fili, quindi due soli stroke
function renderWindGrass(ctx, grass) {
  if (!grass || !windActive()) return;
  const s = TILE * G.scale;
  const c0 = Math.max(0, Math.floor(-G.camX / s));
  const c1 = Math.min(grass.cols - 1, Math.floor((G.canvas.width - G.camX) / s));
  const r0 = Math.max(0, Math.floor(-G.camY / s));
  const r1 = Math.min(grass.rows - 1, Math.floor((G.canvas.height - G.camY) / s));
  const t = performance.now() / 1000;
  const light = new Path2D();
  const dark = new Path2D();
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const blades = grass.tiles[r * grass.cols + c];
      if (!blades) continue;
      for (const b of blades) {
        const w = windAt(b.x, b.y, t);
        const flutter = Math.sin(t * 6 + b.x * 1.3 + b.y * 0.7) * 0.06 * w;
        const path = b.light ? light : dark;
        path.moveTo(b.x, b.y);
        path.lineTo(
          b.x + b.lean + b.l * (WIND.dirX * w * 0.55 + flutter),
          b.y - b.l * (1 - Math.min(0.35, w * w * 0.08)) + b.l * WIND.dirY * w * 0.15,
        );
      }
    }
  }
  ctx.save();
  ctx.translate(G.camX, G.camY);
  ctx.scale(G.scale, G.scale);
  ctx.lineWidth = 0.8;
  ctx.lineCap = "round";
  ctx.strokeStyle = GRASS_LIGHT;
  ctx.stroke(light);
  ctx.strokeStyle = GRASS_DARK;
  ctx.stroke(dark);
  ctx.restore();
}

// ── METEO: PIOGGIA E NEBBIOLINA ────────────────────────────────────────
// Pioggia (mechanics.js:isRaining): gocce e schizzi in coordinate schermo,
// sopra a tutto, con un velo grigio-azzurro; entra ed esce in dissolvenza.
// Nebbiolina: campo mappa "mist": true (tile palude) oppure
// { tiles: ["swamp", ...], density: 0–1+ }; banchi morbidi che sconfinano
// sui tile vicini, disegnati prima del FOW così l'oscurità li copre.
const RAIN_FADE_MS = 2500;
const MIST_DEFAULT_TILES = ["swamp"];
let _rainLevel = 0;
let _rainLast = 0;
let _mistCache = null; // { mapData, grid, tiles: [{c, r, ph}], density }
let _mistSprite = null;

function weatherActive() {
  return (
    !!G.mapData &&
    (isRaining() || _rainLevel > 0 || mistTiles().length > 0 ||
      cloudShadowsWanted() || _cloudShadowLevel > 0)
  );
}

// ── ONDE SUL FIUME E SUL GUADO ────────────────────────────────────────
// Sopra la texture ferma della cache (plchldSprites.js:_tdRiver): creste
// chiare e cavi scuri che scorrono nel verso della corrente, più riflessi
// che luccicano. La corrente è orizzontale se il tile ha acqua (o un ponte)
// a est/ovest, altrimenti verticale. Fase in coordinate mondo, così le
// creste proseguono senza salti tra tile vicini. Solo terreno procedurale
// (le mappe con immagine hanno il fiume già dipinto).
const WATER_WAVES = {
  lines: 3, // file di creste per tile
  speed: 2.2, // rad/s: scorrimento delle creste (~4 s per tile)
  crest: 0.55, // soglia del seno oltre cui si disegna una cresta
  amp: 0.03, // ondeggiamento trasversale (frazione di tile)
  glints: 2, // riflessi per tile
  fordAlpha: 0.6, // il guado è acqua bassa: onde più tenui
};
let _waterCache = null; // { mapData, tiles: [{ c, r, horiz, ford }] }

function waterTiles() {
  const md = G.mapData;
  if (!md || G.tileImg) return [];
  if (_waterCache && _waterCache.mapData === md) return _waterCache.tiles;
  const idAt = (c, r) =>
    c < 0 || r < 0 || c >= md.cols || r >= md.rows ? null : tileLook(md.tileTypes[md.grid[r][c]]);
  const wet = (c, r) => {
    const id = idAt(c, r);
    return id === "river" || id === "ford" || id === "bridge";
  };
  const tiles = [];
  for (let r = 0; r < md.rows; r++)
    for (let c = 0; c < md.cols; c++) {
      const id = idAt(c, r);
      if (id !== "river" && id !== "ford") continue;
      const h = wet(c - 1, r) + wet(c + 1, r);
      const v = wet(c, r - 1) + wet(c, r + 1);
      tiles.push({ c, r, horiz: h >= v, ford: id === "ford" });
    }
  _waterCache = { mapData: md, tiles };
  return tiles;
}

function renderWaterWaves(ctx, ts) {
  const tiles = waterTiles();
  if (!tiles.length) return;
  const W = WATER_WAVES;
  const t = performance.now() / 1000;
  const k = ts / TILE;
  const step = 3; // unità mondo tra i punti delle creste
  const paths = { light: new Path2D(), dark: new Path2D(), fordLight: new Path2D(), fordDark: new Path2D() };
  const glints = [];
  const c0 = Math.floor(-G.camX / ts) - 1;
  const c1 = Math.floor((G.canvas.width - G.camX) / ts) + 1;
  const r0 = Math.floor(-G.camY / ts) - 1;
  const r1 = Math.floor((G.canvas.height - G.camY) / ts) + 1;

  for (const w of tiles) {
    if (w.c < c0 || w.c > c1 || w.r < r0 || w.r > r1) continue;
    const { x, y } = tileToScreen(w.c, w.r);
    const along0 = (w.horiz ? w.c : w.r) * TILE; // inizio del tile lungo la corrente (mondo)
    const lineBase = (w.horiz ? w.r : w.c) * W.lines;
    const light = w.ford ? paths.fordLight : paths.light;
    const dark = w.ford ? paths.fordDark : paths.dark;
    // Punto del tile a distanza s lungo la corrente e `a` (0–1) di traverso
    const pt = (s, a) => (w.horiz ? [x + s * k, y + a * ts] : [x + a * ts, y + s * k]);

    for (let i = 0; i < W.lines; i++) {
      const id = lineBase + i;
      const ph = _hash01(id * 3.7) * 6.28;
      const freq = 6.28 / (TILE * (0.45 + 0.35 * _hash01(id * 5.1 + 1)));
      const across = (i + 0.3 + 0.4 * _hash01(id * 9.3 + 2)) / W.lines;
      let lightOn = false;
      let darkOn = false;
      for (let s = 0; s <= TILE; s += step) {
        const wa = along0 + s;
        const wave = Math.sin(wa * freq - t * W.speed + ph);
        const a = across + Math.sin(wa * freq * 0.5 + t * 0.7 + ph) * W.amp;
        const [px, py] = pt(s, a);
        if (wave > W.crest) {
          lightOn ? light.lineTo(px, py) : light.moveTo(px, py);
          lightOn = true;
        } else lightOn = false;
        // cavo: mezza fila più in là, in controfase
        const [qx, qy] = pt(s, a + 0.5 / W.lines);
        if (wave < -W.crest - 0.15 && a + 0.5 / W.lines < 0.97) {
          darkOn ? dark.lineTo(qx, qy) : dark.moveTo(qx, qy);
          darkOn = true;
        } else darkOn = false;
      }
    }

    for (let g = 0; g < W.glints; g++) {
      const h = _hash01(w.c * 31.1 + w.r * 17.3 + g * 5.9);
      const lum = Math.max(0, Math.sin(t * (1.5 + h) + h * 40));
      const a = lum ** 6 * (w.ford ? W.fordAlpha : 1);
      if (a < 0.03) continue;
      const [gx, gy] = pt(TILE * (0.15 + 0.7 * _hash01(h * 91)), 0.15 + 0.7 * _hash01(h * 57));
      glints.push({ gx, gy, a, horiz: w.horiz });
    }
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1, 1.2 * k);
  ctx.strokeStyle = "rgba(195,232,255,0.38)";
  ctx.stroke(paths.light);
  ctx.strokeStyle = "rgba(0,22,44,0.22)";
  ctx.stroke(paths.dark);
  ctx.globalAlpha = W.fordAlpha;
  ctx.strokeStyle = "rgba(195,232,255,0.38)";
  ctx.stroke(paths.fordLight);
  ctx.strokeStyle = "rgba(0,22,44,0.22)";
  ctx.stroke(paths.fordDark);
  ctx.lineWidth = Math.max(1, 1.5 * k);
  const len = 4 * k;
  for (const { gx, gy, a, horiz } of glints) {
    ctx.globalAlpha = a * 0.8;
    ctx.strokeStyle = "#f4fbff";
    ctx.beginPath();
    ctx.moveTo(gx - (horiz ? len : 0), gy - (horiz ? 0 : len));
    ctx.lineTo(gx + (horiz ? len : 0), gy + (horiz ? 0 : len));
    ctx.stroke();
  }
  ctx.restore();
}

// ── OMBRE DELLE NUVOLE ────────────────────────────────────────────────
// Di giorno con cielo nuvoloso (mechanics.js:currentWeather) e senza
// pioggia: macchie scure morbide che attraversano la mappa sottovento,
// in coordinate mondo (seguono pan e zoom). Dissolvenza come la pioggia.
const CLOUD_SHADOW = {
  fadeMs: 4000,
  tilesPerCloud: 60, // una nuvola ogni ~60 tile di mappa
  minClouds: 3,
  maxClouds: 10,
  speed: 22, // unità mondo/s (TILE = 64): ~3 s per tile
  alpha: 0.6,
  variants: 3,
};
let _cloudShadowLevel = 0;
let _cloudShadowLast = 0;
let _cloudSprites = null;

function cloudShadowsWanted() {
  const w = G.missionState?.weather;
  return !!w?.cloudy && !isNight() && !isRaining();
}

// Sagome di nuvola: grappoli di sbuffi scuri a gradiente, disegnati una volta
function _getCloudSprites() {
  if (_cloudSprites) return _cloudSprites;
  _cloudSprites = [];
  const W = 256;
  const H = 160;
  for (let v = 0; v < CLOUD_SHADOW.variants; v++) {
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const g = cv.getContext("2d");
    const puffs = 6 + v * 2;
    for (let i = 0; i < puffs; i++) {
      const cx = W * (0.22 + 0.56 * _hash01(v * 31 + i * 7));
      const cy = H * (0.35 + 0.3 * _hash01(v * 17 + i * 13));
      const r = H * (0.22 + 0.16 * _hash01(v * 11 + i * 5));
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, "rgba(6,14,8,0.7)");
      grad.addColorStop(0.6, "rgba(6,14,8,0.4)");
      grad.addColorStop(1, "rgba(6,14,8,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }
    _cloudSprites.push(cv);
  }
  return _cloudSprites;
}

function renderCloudShadows(ctx, ts) {
  const now = performance.now();
  const dt = _cloudShadowLast ? Math.min(now - _cloudShadowLast, 100) : 16;
  _cloudShadowLast = now;
  const target = cloudShadowsWanted() ? 1 : 0;
  _cloudShadowLevel += Math.sign(target - _cloudShadowLevel) * (dt / CLOUD_SHADOW.fadeMs);
  _cloudShadowLevel = clamp(_cloudShadowLevel, 0, 1);
  if (_cloudShadowLevel <= 0) return;

  const md = G.mapData;
  const sprites = _getCloudSprites();
  const k = ts / TILE; // mondo → schermo
  const t = now / 1000;
  const n = clamp(
    Math.round((md.cols * md.rows) / CLOUD_SHADOW.tilesPerCloud),
    CLOUD_SHADOW.minClouds,
    CLOUD_SHADOW.maxClouds,
  );
  // Le nuvole girano su un'area più grande della mappa, così entrano ed
  // escono dal bordo invece di comparire di colpo
  const margin = TILE * 6;
  const spanX = md.cols * TILE + margin * 2;
  const spanY = md.rows * TILE + margin * 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(G.camX, G.camY, md.cols * ts, md.rows * ts);
  ctx.clip();
  ctx.globalAlpha = CLOUD_SHADOW.alpha * _cloudShadowLevel;
  for (let i = 0; i < n; i++) {
    const sp = CLOUD_SHADOW.speed * (0.8 + 0.4 * _hash01(i * 5 + 2));
    let wx = (_hash01(i * 3 + 1) * spanX + t * sp * WIND.dirX) % spanX;
    let wy = (_hash01(i * 9 + 4) * spanY + t * sp * WIND.dirY) % spanY;
    if (wx < 0) wx += spanX;
    if (wy < 0) wy += spanY;
    const w = TILE * (4 + 3 * _hash01(i * 7 + 3));
    const h = w * 0.62;
    const sx = G.camX + (wx - margin) * k;
    const sy = G.camY + (wy - margin) * k;
    ctx.drawImage(sprites[i % sprites.length], sx - (w * k) / 2, sy - (h * k) / 2, w * k, h * k);
  }
  ctx.restore();
}

// "tiles" della nebbia: per id oppure per aspetto ("texture")
function _mistOn(ids, def) {
  return !!def && (ids.has(def.id) || ids.has(tileLook(def)));
}

function mistTiles() {
  const md = G.mapData;
  if (!md?.mist) return [];
  if (_mistCache && _mistCache.mapData === md) return _mistCache.tiles;
  const cfg = md.mist === true ? {} : md.mist;
  const ids = new Set(cfg.tiles || MIST_DEFAULT_TILES);
  const tiles = [];
  for (let r = 0; r < md.rows; r++)
    for (let c = 0; c < md.cols; c++)
      if (_mistOn(ids, md.tileTypes[md.grid[r][c]])) tiles.push({ c, r, ph: _hash01(c * 37 + r * 91) * 6.28 });
  _mistCache = { mapData: md, tiles, density: cfg.density ?? 1 };
  return tiles;
}

// Sbuffo bianco a gradiente radiale, disegnato una volta e poi scalato
function _getMistSprite() {
  if (_mistSprite) return _mistSprite;
  const s = 128;
  _mistSprite = document.createElement("canvas");
  _mistSprite.width = _mistSprite.height = s;
  const g = _mistSprite.getContext("2d");
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, "rgba(220,228,226,1)");
  grad.addColorStop(0.5, "rgba(214,222,220,0.55)");
  grad.addColorStop(1, "rgba(210,218,216,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return _mistSprite;
}

function renderMist(ctx, ts) {
  const tiles = mistTiles();
  if (!tiles.length) return;
  const sprite = _getMistSprite();
  const t = performance.now() / 1000;
  const dens = _mistCache.density;
  // Tile inquadrati, con un margine per gli sbuffi che sconfinano
  const c0 = Math.floor(-G.camX / ts) - 1;
  const c1 = Math.floor((G.canvas.width - G.camX) / ts) + 1;
  const r0 = Math.floor(-G.camY / ts) - 1;
  const r1 = Math.floor((G.canvas.height - G.camY) / ts) + 1;
  ctx.save();
  for (const m of tiles) {
    if (m.c < c0 || m.c > c1 || m.r < r0 || m.r > r1) continue;
    const { x, y } = tileToScreen(m.c, m.r);
    for (let i = 0; i < 2; i++) {
      const ph = m.ph + i * 2.4;
      // Deriva lenta avanti e indietro lungo il vento, banchi che "respirano"
      const drift = Math.sin(t * 0.12 + ph) * ts * 0.3;
      const side = Math.sin(t * 0.09 + ph * 1.7) * ts * 0.12;
      const cx = x + ts * (0.35 + 0.3 * i) + WIND.dirX * drift - WIND.dirY * side;
      const cy = y + ts * (0.4 + 0.2 * _hash01(ph)) + WIND.dirY * drift + WIND.dirX * side;
      const size = ts * (1.5 + 0.3 * Math.sin(t * 0.2 + ph));
      const a = (0.16 + 0.1 * Math.sin(t * 0.25 + ph * 1.3)) * dens;
      if (a <= 0.01) continue;
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(sprite, cx - size / 2, cy - size * 0.35, size, size * 0.7);
    }
  }
  ctx.restore();
}

function renderRain(ctx, ts) {
  const now = performance.now();
  const dt = _rainLast ? Math.min(now - _rainLast, 100) : 16;
  _rainLast = now;
  const target = isRaining() ? 1 : 0;
  _rainLevel += Math.sign(target - _rainLevel) * (dt / RAIN_FADE_MS);
  _rainLevel = clamp(_rainLevel, 0, 1);
  if (_rainLevel <= 0) return;

  const md = G.mapData;
  const W = G.canvas.width;
  const H = G.canvas.height;
  const lv = _rainLevel;
  const t = now / 1000;
  ctx.save();
  // Solo sopra la mappa
  ctx.beginPath();
  ctx.rect(G.camX, G.camY, md.cols * ts, md.rows * ts);
  ctx.clip();

  // Velo: cielo coperto
  ctx.fillStyle = `rgba(28,38,52,${(0.2 * lv).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);

  // Gocce: inclinate nella direzione del vento, una sola stroke
  const drops = Math.round(Math.min(450, (W * H) / 5000) * lv);
  const slant = WIND.dirX * 0.22;
  const span = H + 60;
  const path = new Path2D();
  for (let i = 0; i < drops; i++) {
    const speed = 700 + _hash01(i * 3 + 1) * 400; // px/s
    const len = 12 + _hash01(i * 3 + 2) * 12;
    const y = ((_hash01(i * 3) * span + t * speed) % span) - 30;
    let x = (_hash01(i * 7 + 5) * W + y * slant) % W;
    if (x < 0) x += W;
    path.moveTo(x, y);
    path.lineTo(x + len * slant, y + len);
  }
  ctx.strokeStyle = "rgba(190,205,222,0.42)";
  ctx.lineWidth = 1;
  ctx.stroke(path);

  // Schizzi a terra: anelli che si allargano e svaniscono
  ctx.strokeStyle = "rgba(200,214,228,0.5)";
  const splashes = Math.round(drops / 5);
  const period = 0.55;
  for (let i = 0; i < splashes; i++) {
    const p = t / period + _hash01(i * 11 + 3);
    const k = Math.floor(p);
    const f = p - k;
    const sx = _hash01(i * 13 + k * 7.1) * W;
    const sy = _hash01(i * 17 + k * 3.3) * H;
    ctx.globalAlpha = (1 - f) * lv;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 1 + f * 5, 0.5 + f * 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function renderTileAnimations(ctx, ts) {
  const anims = _getTileAnims();
  // Dimentica gli istanti di comparsa di fumo/fuoco ormai spenti
  const live = new Set(anims.map(_animKey));
  for (const k of _tileAnimBorn.keys())
    if (!live.has(k)) _tileAnimBorn.delete(k);
  if (!anims.length) return;
  const now = performance.now();
  const seed0 = (anim) => anim.col * 7 + anim.row * 13;
  // Nessun check isTileVisible: il FOW overlay è disegnato dopo e copre
  // naturalmente le animazioni sui tile non visibili. Le particelle che
  // sconfinano in tile visibili adiacenti danno un effetto realistico.
  const clouds = [];
  for (const anim of anims) {
    const { x, y } = tileToScreen(anim.col, anim.row);
    if (anim.type === "smoke") _drawTileSmoke(ctx, x, y, ts, _tileAnimDt, anim);
    else if (anim.type === "fire") _drawTileFire(ctx, x, y, ts, now, anim);
    else if (anim.type === "fog") _drawTileFog(ctx, x, y, ts, now, seed0(anim));
    else if (anim.type === "smokeCloud") clouds.push(anim);
  }
  _drawSmokeClouds(ctx, ts, now, clouds);
}

// Runtime-only (non salvato): istante di comparsa di ogni tile animato, per
// far crescere fumo e fuoco invece di farli apparire di colpo
const _tileAnimBorn = new Map();

function _animKey(anim) {
  return `${anim.type}:${anim.col},${anim.row}`;
}

// 0→1 nei primi `ms` millisecondi dalla comparsa, con easing che rallenta
function _animGrow(anim, now, ms) {
  const key = _animKey(anim);
  if (!_tileAnimBorn.has(key)) _tileAnimBorn.set(key, now);
  const g = Math.min(1, (now - _tileAnimBorn.get(key)) / ms);
  return 1 - (1 - g) ** 3;
}

// ── SMOKE CLOUD — cortina fumogena (fumogeni) ───────────────────────────
// Sbuffi morbidi che sconfinano nei tile vicini: più tile fumati si fondono
// in un'unica nube. Disegnata a strati su tutti i tile insieme (ombre → velo
// → luci) così un tile non copre gli sbuffi del vicino creando cuciture.
const SMOKE_PUFFS = 5;

function _hash01(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function _smokePuff(ctx, cx, cy, r, rgb, alpha) {
  if (alpha <= 0.005 || r <= 0) return;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(${rgb},${alpha.toFixed(3)})`);
  g.addColorStop(0.55, `rgba(${rgb},${(alpha * 0.55).toFixed(3)})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function _drawSmokeClouds(ctx, ts, now, clouds) {
  if (!clouds.length) return;

  // Geometria animata di ogni tile (calcolata una volta, usata da tutti gli strati)
  const tiles = clouds.map((anim) => {
    const ease = _animGrow(anim, now, 1400); // espansione rapida che rallenta
    const thin = anim.turnsLeft <= 1 ? 0.6 : 1; // ultimo turno: si dirada
    const seed = anim.col * 31 + anim.row * 57;
    const { x, y } = tileToScreen(anim.col, anim.row);
    const cx = x + ts * 0.5,
      cy = y + ts * 0.5;
    const windX = Math.sin(now / 4200 + seed * 0.1) * ts * 0.05;
    const puffs = [];
    for (let i = 0; i < SMOKE_PUFFS; i++) {
      const h = seed + i * 17;
      const dir = i % 2 ? 1 : -1;
      const ang = _hash01(h) * Math.PI * 2 + dir * now * (0.00012 + _hash01(h + 1) * 0.00015);
      const d = (0.12 + _hash01(h + 2) * 0.22) * ts * (0.5 + 0.5 * ease);
      const r =
        ts *
        (0.3 + _hash01(h + 3) * 0.16) *
        (1 + 0.08 * Math.sin(now / 1700 + h)) *
        (0.4 + 0.6 * ease);
      puffs.push({
        px: cx + Math.cos(ang) * d + windX,
        py: cy + Math.sin(ang) * d * 0.8,
        r,
      });
    }
    return { cx, cy, a: ease * thin, ease, puffs };
  });

  ctx.save();
  // 1) Ombre: danno volume alla parte bassa degli sbuffi
  for (const tl of tiles)
    for (const p of tl.puffs)
      _smokePuff(ctx, p.px + ts * 0.05, p.py + ts * 0.07, p.r, "95,98,94", 0.22 * tl.a);
  // 2) Velo di base: copre bene il tile e sfuma oltre i bordi
  for (const tl of tiles)
    _smokePuff(ctx, tl.cx, tl.cy, ts * 0.8 * (0.5 + 0.5 * tl.ease), "165,167,162", 0.55 * tl.a);
  // 3) Corpo e luci degli sbuffi
  for (const tl of tiles)
    for (const p of tl.puffs) {
      _smokePuff(ctx, p.px, p.py, p.r, "196,197,191", 0.42 * tl.a);
      _smokePuff(ctx, p.px - ts * 0.03, p.py - ts * 0.04, p.r * 0.6, "232,232,226", 0.38 * tl.a);
    }
  ctx.restore();
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

// ── FIRE — incendio: terreno bruciato, bagliore, lingue di fiamma, faville ──
// Strati: base carbonizzata → fumo che sale → bagliore e fiamme in modalità
// additiva ("lighter", così si illuminano a vicenda) → faville.
const FIRE_TONGUES = 7;
const FIRE_EMBERS = 7;

// Lingua di fiamma a goccia: base arrotondata in (bx,by), punta in (tipX, by-h)
function _flameTongue(ctx, bx, by, w, h, tipX, stops) {
  const g = ctx.createLinearGradient(bx, by, bx, by - h);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(bx - w, by);
  ctx.quadraticCurveTo(bx - w, by - h * 0.55, tipX, by - h);
  ctx.quadraticCurveTo(bx + w, by - h * 0.55, bx + w, by);
  ctx.arc(bx, by, w, 0, Math.PI);
  ctx.fill();
}

function _drawTileFire(ctx, x, y, ts, now, anim) {
  const seed = anim.col * 31 + anim.row * 57;
  const grow = _animGrow(anim, now, 900);
  const dying = anim.turnsLeft <= 1 ? 0.65 : 1; // ultimo turno: si affievolisce
  const k = grow * dying;
  const cx = x + ts * 0.5,
    baseY = y + ts * 0.8;
  // Sfarfallio globale: somma di sinusoidi a frequenze diverse
  const flick =
    0.88 + 0.08 * Math.sin(now / 83 + seed) + 0.04 * Math.sin(now / 31 + seed * 2);

  ctx.save();
  // 1) Terreno carbonizzato
  _smokePuff(ctx, cx, y + ts * 0.62, ts * 0.48, "25,14,6", 0.5 * grow);

  // 2) Fumo scuro che sale dalle punte delle fiamme
  for (let i = 0; i < 3; i++) {
    const ph = (now / 2600 + i / 3 + _hash01(seed + i)) % 1;
    const sx = cx + Math.sin(now / 900 + i * 2 + seed) * ts * 0.1 + ph * ts * 0.12;
    const sy = baseY - ts * (0.45 + ph * 0.75);
    const sa = (ph < 0.2 ? ph / 0.2 : 1 - (ph - 0.2) / 0.8) * 0.3 * k;
    _smokePuff(ctx, sx, sy, ts * (0.14 + ph * 0.22), "45,42,40", sa);
  }

  ctx.globalCompositeOperation = "lighter";
  // 3) Bagliore sul terreno circostante
  _smokePuff(ctx, cx, baseY - ts * 0.15, ts * 0.85, "255,110,20", 0.22 * k * flick);

  // 4) Lingue di fiamma: esterne rosso-arancio, poi nuclei giallo-bianchi
  const tongues = [];
  for (let i = 0; i < FIRE_TONGUES; i++) {
    const h0 = seed + i * 13;
    const bx = x + ts * (0.22 + (0.56 * (i + 0.5)) / FIRE_TONGUES) + (_hash01(h0) - 0.5) * ts * 0.06;
    // Le lingue centrali sono più alte
    const centre = 1 - Math.abs(i - (FIRE_TONGUES - 1) / 2) / FIRE_TONGUES;
    const lick = 0.8 + 0.2 * Math.sin(now / (110 + _hash01(h0 + 1) * 90) + h0);
    const h = ts * (0.22 + 0.38 * centre) * lick * k;
    const w = ts * (0.07 + _hash01(h0 + 2) * 0.04) * (0.6 + 0.4 * k);
    const sway = Math.sin(now / 240 + h0) * w * 0.9;
    const by = baseY + (_hash01(h0 + 3) - 0.5) * ts * 0.06;
    tongues.push({ bx, by, w, h, tipX: bx + sway });
  }
  for (const f of tongues)
    _flameTongue(ctx, f.bx, f.by, f.w, f.h, f.tipX, [
      [0, "rgba(255,150,30,0.75)"],
      [0.5, "rgba(230,70,10,0.55)"],
      [1, "rgba(150,20,0,0)"],
    ]);
  for (const f of tongues)
    _flameTongue(ctx, f.bx, f.by, f.w * 0.5, f.h * 0.6, f.bx + (f.tipX - f.bx) * 0.6, [
      [0, "rgba(255,250,215,0.8)"],
      [0.45, "rgba(255,210,70,0.55)"],
      [1, "rgba(255,140,20,0)"],
    ]);

  // 5) Faville: salgono ondeggiando e si spengono
  for (let i = 0; i < FIRE_EMBERS; i++) {
    const h0 = seed + i * 29;
    const ph = (now / (1300 + _hash01(h0) * 900) + _hash01(h0 + 1)) % 1;
    const ex = x + ts * (0.3 + _hash01(h0 + 2) * 0.4) + Math.sin(ph * 9 + h0) * ts * 0.08;
    const ey = baseY - ts * (0.15 + ph * 0.95);
    const ea = (1 - ph) * k;
    ctx.fillStyle = `rgba(255,${Math.floor(200 - ph * 120)},40,${ea.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(ex, ey, Math.max(1, ts * 0.018 * (1 - ph * 0.5)), 0, Math.PI * 2);
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
    if (_fxHiddenByFow(fx)) continue;
    const t = Math.min(1, (now - fx.t0) / fx.duration);
    if (t < 0) {
      // Effetto in attesa: l'unità uccisa è già rimossa dalla mappa, la si
      // tiene in piedi finché il colpo non arriva e parte la caduta
      if (fx.type === "death") _drawDeathPending(ctx, ts, fx.data);
      continue;
    }
    _drawEffect(ctx, ts, fx, t);
  }
}

// ── FOG OF WAR sugli effetti ────────────────────────────────────────────
// Gli effetti sono sul canvas overlay, sopra al velo del FOW: senza filtri
// rivelerebbero i VC nascosti. Gli effetti su un tile di un VC (data.enemy
// per hit/miss/death; spot e spawn sono sempre VC, tranne le trappole)
// vengono saltati se il tile non è visibile. Le unità US non si filtrano:
// alla loro morte il tile può uscire dalla visibilità.
function _fxHiddenByFow(fx) {
  const d = fx.data || {};
  switch (fx.type) {
    case "spot":
      return d.kind !== "trap" && !isTileVisible(d.col, d.row);
    case "spawn":
      return !isTileVisible(d.col, d.row);
    case "hit":
    case "miss":
    case "death":
      return !!d.enemy && !isTileVisible(d.col, d.row);
  }
  return false;
}

// Effetti a linea che partono o arrivano nel FOW (tiratore VC nascosto,
// soppressione su un VC nascosto): si disegnano solo sui tile visibili, così
// il tracciante sbuca dall'oscurità senza rivelare il punto d'origine
function _fxNeedsFowClip(fx) {
  const d = fx.data || {};
  if (fx.type === "shot") return !!d.enemy && !isTileVisible(d.fromCol, d.fromRow);
  if (fx.type === "suppression") return !isTileVisible(d.tCol, d.tRow);
  return false;
}

function _clipToVisible(ctx, ts) {
  ctx.beginPath();
  for (const k of G.visibleTiles) {
    const [c, r] = k.split(",").map(Number);
    const { x, y } = tileToScreen(c, r);
    ctx.rect(x, y, ts, ts);
  }
  ctx.clip();
}

function _drawEffect(ctx, ts, fx, p) {
  ctx.save();
  if (_fxNeedsFowClip(fx)) _clipToVisible(ctx, ts);
  switch (fx.type) {
    case "move": {
      // Polvere dei passi (da animateEnemyMove): sbuffi bassi ai piedi
      // che si allargano e svaniscono; più grande all'arrivo (data.big)
      const { col, row, big } = fx.data;
      const { x, y } = tileToScreen(col, row);
      const cx = x + ts * 0.5,
        fy = y + ts * 0.82;
      const seed = Math.floor(fx.t0) % 997;
      const n = big ? 4 : 2;
      for (let i = 0; i < n; i++) {
        const h = seed + i * 7;
        const a = (i / n) * Math.PI * 2 + _hash01(h) * 1.2;
        const d = ts * (0.06 + (big ? 0.22 : 0.12) * p);
        _smokePuff(
          ctx,
          cx + Math.cos(a) * d,
          fy + Math.sin(a) * d * 0.35 - ts * 0.04 * p,
          ts * ((big ? 0.1 : 0.07) + (big ? 0.12 : 0.07) * p),
          "160,140,105",
          (big ? 0.45 : 0.35) * (1 - p),
        );
      }
      break;
    }

    case "shot": {
      _drawShot(ctx, ts, fx, p);
      break;
    }

    case "slash": {
      _drawSlash(ctx, ts, fx, p);
      break;
    }

    case "hit": {
      _drawHit(ctx, ts, fx, p);
      break;
    }

    case "miss": {
      _drawMiss(ctx, ts, fx, p);
      break;
    }

    case "death": {
      _drawDeath(ctx, ts, fx.data, p);
      break;
    }

    case "spot": {
      _drawSpot(ctx, ts, fx.data, p);
      break;
    }

    case "heal": {
      _drawHeal(ctx, ts, fx.data, p);
      break;
    }

    case "overwatch": {
      _drawOverwatch(ctx, ts, fx, p);
      break;
    }

    case "suppression": {
      _drawSuppression(ctx, ts, fx, p);
      break;
    }

    case "spawn": {
      _drawSpawn(ctx, ts, fx.data, p);
      break;
    }

    case "demolition": {
      _drawDemolition(ctx, ts, fx, p);
      break;
    }

    case "explosion": {
      _drawExplosion(ctx, ts, fx.data, p);
      break;
    }

    case "noise": {
      _drawNoise(ctx, ts, fx.data, p);
      break;
    }

    case "grenade": {
      _drawGrenadeThrow(ctx, ts, fx.data, p);
      break;
    }

    case "birds": {
      _drawBirds(ctx, ts, fx.data, p);
      break;
    }

    case "napalmPlane": {
      _drawNapalmPlane(ctx, ts, fx.data, p);
      break;
    }

    case "napalm": {
      _drawNapalm(ctx, ts, fx.data, p);
      break;
    }
  }
  ctx.restore();
}

// ── NAPALM — ombra dell'aereo e fiammate ───────────────────────────────
// L'ombra entra da fuori mappa lungo la linea scelta (mechanics.js:
// resolveNapalm), la attraversa tutta ed esce dal bordo opposto; quando passa
// sopra un tile della linea, lì parte la fiammata ("napalm": lampo allungato
// nel verso di volo, palle di fuoco che rotolano avanti, fumo nero che sale).
// Sotto resta l'incendio del tile (_drawTileFire).
const NAPALM_FLIGHT = {
  speed: 11, // tile/s
  margin: 2.5, // tile fuori mappa all'entrata e all'uscita
  size: 1.9, // lunghezza della sagoma, in tile
  alpha: 0.42,
  fxMs: 2600, // durata della fiammata su ogni tile
};
const NAPALM_FX_MS = NAPALM_FLIGHT.fxMs;

// Rotta dell'aereo (coordinate in tile): retta per i centri dei tile della
// linea, tagliata sui bordi della mappa più il margine; dropAt = ms dalla
// partenza al passaggio sopra ciascun tile
function planNapalmFlight(line) {
  const a = line[0];
  const b = line[line.length - 1];
  let dx = b.col - a.col;
  let dy = b.row - a.row;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  if (!dx && !dy) dx = 1;
  const px = a.col + 0.5;
  const py = a.row + 0.5;
  let sIn = -Infinity;
  let sOut = Infinity;
  for (const [p, d, size] of [
    [px, dx, G.mapData.cols],
    [py, dy, G.mapData.rows],
  ]) {
    if (Math.abs(d) < 1e-9) continue;
    const s1 = -p / d;
    const s2 = (size - p) / d;
    sIn = Math.max(sIn, Math.min(s1, s2));
    sOut = Math.min(sOut, Math.max(s1, s2));
  }
  const s0 = sIn - NAPALM_FLIGHT.margin;
  const dist = sOut + NAPALM_FLIGHT.margin - s0;
  const msPerTile = 1000 / NAPALM_FLIGHT.speed;
  return {
    x0: px + dx * s0,
    y0: py + dy * s0,
    dx,
    dy,
    dist,
    angle: Math.atan2(dy, dx),
    ms: dist * msPerTile,
    dropAt: line.map((t) => ((t.col - a.col) * dx + (t.row - a.row) * dy - s0) * msPerTile),
  };
}

// Sagoma di un cacciabombardiere vista dall'alto, muso verso +x, lunghezza 1
const _JET_SHAPE = [
  [0.5, 0], [0.4, 0.035], [0.12, 0.05], [-0.16, 0.46], [-0.27, 0.46], [-0.15, 0.06],
  [-0.36, 0.05], [-0.47, 0.2], [-0.53, 0.2], [-0.48, 0.03], [-0.5, 0],
];

function _drawNapalmPlane(ctx, ts, d, p) {
  const s = d.dist * p;
  const sx = G.camX + (d.x0 + d.dx * s) * TILE * G.scale;
  const sy = G.camY + (d.y0 + d.dy * s) * TILE * G.scale;
  const spr = _jetShadowSprite(ts);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(d.angle);
  ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
  ctx.restore();
}

// Ombra del jet già sfocata, preparata una volta per zoom: ctx.filter blur a
// ogni fotogramma costa molto (soprattutto su mobile), drawImage no
let _jetShadow = null; // { key, canvas }

function _jetShadowSprite(ts) {
  const L = Math.round(ts * NAPALM_FLIGHT.size);
  if (_jetShadow?.key === L) return _jetShadow.canvas;
  const blur = Math.max(1, ts * 0.03);
  const pts = [..._JET_SHAPE, ..._JET_SHAPE.slice(1, -1).reverse().map(([x, y]) => [x, -y])];
  const ext = Math.max(...pts.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y)))) * L;
  const half = Math.ceil(ext + blur * 3);
  const cv = document.createElement("canvas");
  cv.width = cv.height = half * 2;
  const g = cv.getContext("2d");
  g.translate(half, half);
  g.filter = `blur(${blur.toFixed(1)}px)`;
  g.fillStyle = `rgba(8,10,6,${NAPALM_FLIGHT.alpha})`;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x * L, y * L) : g.moveTo(x * L, y * L)));
  g.closePath();
  g.fill();
  _jetShadow = { key: L, canvas: cv };
  return cv;
}

function _drawNapalm(ctx, ts, d, p) {
  const { x, y } = tileToScreen(d.col, d.row);
  const cx = x + ts * 0.5;
  const cy = y + ts * 0.5;
  const seed = d.col * 31 + d.row * 57;
  const ca = Math.cos(d.dir || 0);
  const sa = Math.sin(d.dir || 0);
  const fade = (a, b) => Math.min(1, Math.max(0, (p - a) / (b - a)));
  // punto a `along` tile nel verso di volo e `side` di lato
  const at = (along, side) => [cx + (ca * along - sa * side) * ts, cy + (sa * along + ca * side) * ts];

  // 1) Fumo nero denso che sale e si allarga
  const smokeA = fade(0.08, 0.3) * (1 - fade(0.6, 1)) * 0.6;
  for (let i = 0; i < 8; i++) {
    const h = seed + i * 13;
    const [px, py] = at((_hash01(h) - 0.35) * 1.3, (_hash01(h + 1) - 0.5) * 0.6);
    const r = ts * (0.22 + 0.32 * p) * (0.7 + _hash01(h + 3) * 0.6);
    const rise = ts * (0.15 + _hash01(h + 2) * 0.55) * p;
    _smokePuff(ctx, px, py - rise, r, i % 2 ? "28,24,22" : "52,46,40", smokeA);
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // 2) Lampo dell'impatto, allungato nel verso di volo
  if (p < 0.25) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(d.dir || 0);
    ctx.scale(1.9, 0.75);
    _smokePuff(ctx, 0, 0, ts * 0.6, "255,230,160", 0.85 * (1 - p / 0.25));
    ctx.restore();
  }
  // 3) Palle di fuoco che rotolano avanti e salgono raffreddandosi
  const fireA = fade(0, 0.06) * (1 - fade(0.4, 0.85));
  const out = 1 - (1 - Math.min(1, p / 0.5)) ** 2;
  const heat = 1 - Math.min(1, p / 0.7);
  for (let i = 0; i < 10; i++) {
    const h = seed + i * 7;
    const along = (_hash01(h) - 0.4) * 0.9 + out * (0.2 + _hash01(h + 1) * 0.5);
    const [px, py] = at(along, (_hash01(h + 2) - 0.5) * 0.7 * (0.5 + out));
    const r = ts * (0.14 + 0.2 * out) * (0.7 + _hash01(h + 3) * 0.6);
    const g = Math.floor(90 + 150 * heat);
    const b = Math.floor(10 + 90 * heat ** 3);
    _smokePuff(ctx, px, py - ts * 0.3 * p, r, `255,${g},${b}`, 0.6 * fireA);
  }
  ctx.restore();
}

// ── BIRDS — stormo che si alza dalla giungla ───────────────────────────
// Quando un'unità (US o VC) attraversa la giungla, con probabilità bassa un
// piccolo stormo si alza da uno dei tile giungla del percorso e vola via,
// allontanandosi dalla direzione da cui arriva l'intruso. Gli uccelli
// salgono sopra le chiome, quindi si vedono anche sopra la Fog of War: un
// indizio di movimento nemico nascosto (showInFog: false per toglierlo).
const BIRDS = {
  tileIds: new Set(["jungle"]),
  chance: 0.08, // per movimento che attraversa almeno un tile giungla
  count: [5, 9],
  ms: 2600,
  distance: 5, // tile percorsi dallo stormo
  showInFog: true,
};

// Indice del passo del percorso in cui si alza lo stormo, -1 = nessuno
function birdFlushStep(path) {
  const idx = [];
  for (let i = 1; i < path.length; i++) {
    if (BIRDS.tileIds.has(tileLook(getTileAt(path[i].col, path[i].row)))) idx.push(i);
  }
  if (!idx.length || Math.random() >= BIRDS.chance) return -1;
  return pick(idx);
}

function flushBirds(at, from) {
  if (!BIRDS.showInFog && !isTileVisible(at.col, at.row)) return;
  // Via dall'intruso: direzione del passo, con una deviazione casuale
  const base = from ? Math.atan2(at.row - from.row, at.col - from.col) : Math.random() * Math.PI * 2;
  const dir = base + (Math.random() - 0.5) * 2;
  const n = Math.round(BIRDS.count[0] + Math.random() * (BIRDS.count[1] - BIRDS.count[0]));
  const birds = [];
  for (let i = 0; i < n; i++) {
    birds.push({
      ox: (Math.random() - 0.5) * 0.5, // partenza sparsa nel tile
      oy: (Math.random() - 0.5) * 0.5,
      delay: Math.random() * 0.2, // frazione della durata
      dev: (Math.random() - 0.5) * 0.7, // deviazione dalla rotta dello stormo
      speed: 0.85 + Math.random() * 0.3,
      flap: 14 + Math.random() * 6, // battiti (rad/s)
      ph: Math.random() * 6.28,
      size: 0.075 + Math.random() * 0.03, // in tile
    });
  }
  addFX("birds", { col: at.col, row: at.row, dir, birds }, BIRDS.ms);
  // Frullo d'ali: assets/birds.mp3 o il suono "birds" della config/mappa,
  // muto se il file non c'è (config.js:OPTIONAL_SOUNDS)
  sfx("birds");
}

function _drawBirds(ctx, ts, d, p) {
  const { x, y } = tileToScreen(d.col, d.row);
  const cx = x + ts / 2,
    cy = y + ts / 2;
  const t = (p * BIRDS.ms) / 1000;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const b of d.birds) {
    const q = (p - b.delay) / (1 - b.delay);
    if (q <= 0) continue;
    const heading = d.dir + b.dev * Math.min(1, q * 2);
    // Partenza lenta (decollo), poi volo spedito; leggero ondeggiamento
    const dist = BIRDS.distance * b.speed * q ** 1.6;
    const wob = Math.sin(t * 3 + b.ph) * 0.12 * q;
    const bx = cx + (b.ox + Math.cos(heading) * dist - Math.sin(heading) * wob) * ts;
    const by = cy + (b.oy + Math.sin(heading) * dist + Math.cos(heading) * wob) * ts;
    // Salendo verso la camera sembrano più grandi; svaniscono sul finale
    const s = ts * b.size * (0.7 + 0.6 * Math.min(1, q / 0.35));
    const alpha = Math.min(1, q / 0.1) * (q > 0.7 ? (1 - q) / 0.3 : 1);
    // Ali viste dall'alto: apertura che cambia col battito
    const flap = Math.sin(t * b.flap + b.ph);
    const span = s * (0.55 + 0.45 * Math.abs(flap));
    const sweep = s * (0.15 + 0.25 * (flap * 0.5 + 0.5));
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(heading);
    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = "rgb(22,22,18)";
    ctx.lineWidth = Math.max(1, s * 0.28);
    ctx.beginPath();
    ctx.moveTo(-sweep, -span);
    ctx.quadraticCurveTo(s * 0.1, -span * 0.25, s * 0.25, 0);
    ctx.quadraticCurveTo(s * 0.1, span * 0.25, -sweep, span);
    ctx.stroke();
    ctx.fillStyle = "rgb(22,22,18)";
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.32, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ── GRENADE — lancio a mano con rimbalzi ───────────────────────────────
// Volo ad arco dal lanciatore al tile mirato, poi rimbalzi sempre più bassi
// (e rotolamento) fino al punto di caduta reale (combat.js:throwLanding),
// una breve pausa a terra e l'esplosione. Traiettoria pianificata una volta
// (planGrenadeThrow) in coordinate tile: { ms, segs, rest, spin }.
const GRENADE_THROW = {
  flightMs: 420, // volo base
  flightMsPerTile: 90,
  peak: 0.55, // altezza dell'arco (tile), più alta per i lanci lunghi
  peakPerTile: 0.12,
  bounces: [0.28, 0.11, 0.04], // altezze dei rimbalzi (tile)
  bounceMs: 270, // durata del primo rimbalzo, i successivi in proporzione
  restMs: 160, // ferma a terra prima di esplodere
};

function planGrenadeThrow(from, aim, land) {
  const G_ = GRENADE_THROW;
  const jit = () => (Math.random() - 0.5) * 0.3;
  const sx = from.col + 0.5,
    sy = from.row + 0.5;
  // Primo impatto sul tile mirato, fine corsa sul tile reale
  const ix = aim.col + 0.5 + jit(),
    iy = aim.row + 0.5 + jit();
  let fx = land.col + 0.5 + jit(),
    fy = land.row + 0.5 + jit();
  const moved = land.col !== aim.col || land.row !== aim.row;
  if (!moved) {
    // Stesso tile: piccolo rotolamento in avanti, senza uscire dal tile
    const d = Math.hypot(ix - sx, iy - sy) || 1;
    fx = clamp(ix + ((ix - sx) / d) * 0.25, land.col + 0.15, land.col + 0.85);
    fy = clamp(iy + ((iy - sy) / d) * 0.25, land.row + 0.15, land.row + 0.85);
  }
  const range = Math.hypot(ix - sx, iy - sy);
  const segs = [];
  let t = G_.flightMs + G_.flightMsPerTile * range;
  segs.push({ x0: sx, y0: sy, x1: ix, y1: iy, h: G_.peak + G_.peakPerTile * range, t0: 0, t1: t, z0: 0.35 });
  // Rimbalzi: durata ∝ √altezza; il tragitto I→F si copre in proporzione
  const hs = moved ? G_.bounces : G_.bounces.slice(0, 2);
  const durs = hs.map((h) => G_.bounceMs * Math.sqrt(h / G_.bounces[0]));
  const total = durs.reduce((a, b) => a + b, 0);
  let done = 0;
  hs.forEach((h, i) => {
    const a = done / total;
    done += durs[i];
    const b = done / total;
    segs.push({
      x0: ix + (fx - ix) * a, y0: iy + (fy - iy) * a,
      x1: ix + (fx - ix) * b, y1: iy + (fy - iy) * b,
      h, t0: t, t1: t + durs[i], z0: 0,
    });
    t += durs[i];
  });
  return { segs, rest: { x: fx, y: fy }, ms: t + G_.restMs, spin: Math.random() < 0.5 ? -1 : 1 };
}

function _drawGrenadeThrow(ctx, ts, d, p) {
  const now = p * d.ms;
  let gx = d.rest.x,
    gy = d.rest.y,
    z = 0;
  for (const s of d.segs) {
    if (now < s.t0 || now >= s.t1) continue;
    const u = (now - s.t0) / (s.t1 - s.t0);
    gx = s.x0 + (s.x1 - s.x0) * u;
    gy = s.y0 + (s.y1 - s.y0) * u;
    // Parabola; nel volo parte dall'altezza della mano (z0) e arriva a terra
    z = 4 * s.h * u * (1 - u) + s.z0 * (1 - u);
    break;
  }
  const { x: ox, y: oy } = tileToScreen(0, 0);
  const px = ox + gx * ts,
    py = oy + gy * ts;
  const r = ts * 0.075;

  // Ombra a terra: più piccola e tenue quando la granata è in alto
  const sh = 1 / (1 + z * 1.5);
  ctx.fillStyle = `rgba(0,0,0,${(0.35 * sh).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(px, py + r * 0.6, r * 1.1 * sh, r * 0.45 * sh, 0, 0, Math.PI * 2);
  ctx.fill();

  // Corpo: verde oliva con riflesso, leva (cucchiaio) che gira con la rotazione
  const bx = px,
    by = py - z * ts;
  // Rotazione: veloce in volo, più lenta nei rimbalzi, ferma a terra
  const flightEnd = d.segs[0].t1;
  const bounceEnd = d.segs[d.segs.length - 1].t1;
  const ang =
    d.spin *
    (Math.min(now, flightEnd) * 0.018 + Math.max(0, Math.min(now, bounceEnd) - flightEnd) * 0.008);
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(ang);
  ctx.fillStyle = "#3d4a26";
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = Math.max(1, ts * 0.012);
  ctx.stroke();
  ctx.fillStyle = "#8a8f7a"; // spoletta e leva
  ctx.fillRect(-r * 0.3, -r * 1.25, r * 0.6, r * 0.45);
  ctx.fillRect(r * 0.15, -r * 1.1, r * 0.25, r * 1.4);
  ctx.fillStyle = "rgba(220,230,190,0.35)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.35, -r * 0.3, r * 0.35, r * 0.25, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // A terra in attesa dell'esplosione: la spoletta sfrigola
  if (now >= d.segs[d.segs.length - 1].t1) {
    const k = (now / 60) % 1;
    ctx.fillStyle = `rgba(255,200,90,${(0.8 * (1 - k)).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(bx + (k - 0.5) * r, by - r * (1.4 + k), r * 0.22 * (1 - k * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── NOISE — onda sonora di uno sparo/esplosione ─────────────────────────
// Due rombi (distanza Manhattan, come il raggio di allerta) che si allargano
// dalla fonte fino al raggio del rumore e svaniscono (rossastri per gli spari VC)
function _drawNoise(ctx, ts, d, p) {
  const { x, y } = tileToScreen(d.col, d.row);
  const cx = x + ts / 2,
    cy = y + ts / 2;
  const rgb = d.vc ? "255,130,110" : "235,230,205";
  ctx.lineWidth = Math.max(1, ts * 0.025);
  for (const lag of [0, 0.25]) {
    const q = (p - lag) / (1 - lag);
    if (q <= 0) continue;
    const r = (0.5 + d.radius * Math.sqrt(q)) * ts;
    ctx.strokeStyle = `rgba(${rgb},${(0.55 * (1 - q)).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.stroke();
  }
}

// ── SLASH — fendente all'arma bianca ────────────────────────────────────
// Arco luminoso che attraversa il bersaglio di traverso rispetto alla
// direzione d'attacco: la punta corre lungo l'arco lasciando una scia che
// si assottiglia e svanisce
function _drawSlash(ctx, ts, fx, p) {
  const { fromCol, fromRow, toCol, toRow } = fx.data;
  const { x, y } = tileToScreen(toCol, toRow);
  const cx = x + ts * 0.5,
    cy = y + ts * 0.5;
  const dir = Math.atan2(toRow - fromRow, toCol - fromCol);
  const seed = Math.floor(fx.t0) % 997;
  const side = _hash01(seed) < 0.5 ? -1 : 1;
  // Centro dell'arco arretrato verso l'attaccante: l'arco taglia il bersaglio
  const r = ts * 0.55;
  const ax = cx - Math.cos(dir) * r * 0.75,
    ay = cy - Math.sin(dir) * r * 0.75;
  const span = 1.5;
  const a0 = dir - (side * span) / 2;
  const sweep = Math.min(1, p / 0.45); // la punta arriva in fondo
  const fade = p < 0.45 ? 1 : 1 - (p - 0.45) / 0.55;
  const head = a0 + side * span * (1 - (1 - sweep) ** 2);
  const tailLen = span * 0.6;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const q0 = i / steps,
      q1 = (i + 1) / steps;
    const s0 = head - side * tailLen * (1 - q0),
      s1 = head - side * tailLen * (1 - q1);
    // Non oltre l'inizio dell'arco
    if (side * (s1 - a0) < 0) continue;
    const from = side * (s0 - a0) < 0 ? a0 : s0;
    ctx.strokeStyle = `rgba(235,240,255,${(0.9 * q1 * fade).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, ts * 0.05 * q1 * fade);
    ctx.beginPath();
    ctx.arc(ax, ay, r, Math.min(from, s1), Math.max(from, s1));
    ctx.stroke();
  }
  ctx.restore();
}

// ── SHOT — colpo singolo: vampata, traccianti, impatto ──────────────────
// Traccianti rossi per gli US e verdi per i VC (munizioni sovietiche).
// Colpi per attacco dal campo `rounds` dell'arma; se assente raffica di 3,
// cecchino 1 colpo (più veloce). Se il colpo va a vuoto i traccianti deviano
// e finiscono a terra oltre il bersaglio.
const SHOT_TRACER_RGB = { us: "255,95,60", vc: "130,255,110" };
const SHOT_FX_MS = 700; // durata standard dell'effetto sparo
// Frazione della durata che il primo tracciante impiega ad arrivare
const SHOT_TRAVEL = 0.32,
  SHOT_TRAVEL_SNIPER = 0.2;

// Ms tra lo sparo e l'arrivo del primo tracciante: colpo/mancato/morte
// partono con questo ritardo così coincidono con l'impatto
function shotImpactDelay(sniper, shotMs = SHOT_FX_MS) {
  return (sniper ? SHOT_TRAVEL_SNIPER : SHOT_TRAVEL) * shotMs;
}

function _drawShot(ctx, ts, fx, p) {
  const { fromCol, fromRow, toCol, toRow, enemy, hit, sniper } = fx.data;
  const { x: fx0, y: fy0 } = tileToScreen(fromCol, fromRow);
  const { x: tx0, y: ty0 } = tileToScreen(toCol, toRow);
  const sx = fx0 + ts * 0.5,
    sy = fy0 + ts * 0.5,
    ex = tx0 + ts * 0.5,
    ey = ty0 + ts * 0.5;
  const len = Math.hypot(ex - sx, ey - sy) || 1;
  const ux = (ex - sx) / len,
    uy = (ey - sy) / len;
  const nx = -uy,
    ny = ux;
  const mx = sx + ux * ts * 0.32, // bocca dell'arma
    my = sy + uy * ts * 0.32;
  const rgb = enemy ? SHOT_TRACER_RGB.vc : SHOT_TRACER_RGB.us;
  const rounds = clamp(Math.round(fx.data.rounds ?? (sniper ? 1 : 3)), 1, 5);
  const stagger = 0.12,
    travel = sniper ? SHOT_TRAVEL_SNIPER : SHOT_TRAVEL;
  const seed = Math.floor(fx.t0) % 997;

  // Filo di fumo dalla bocca dell'arma
  if (p > 0.05) {
    const sp = (p - 0.05) / 0.95;
    _smokePuff(
      ctx,
      mx + ux * ts * 0.12 * sp,
      my + uy * ts * 0.12 * sp - ts * 0.1 * sp,
      ts * (0.08 + 0.14 * sp),
      "190,188,182",
      0.35 * (1 - sp),
    );
  }

  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < rounds; i++) {
    const t0 = i * stagger;
    const local = p - t0;
    if (local < 0) continue;
    const h = seed + i * 19;
    // Punto d'arrivo: vicino al centro se colpisce, deviato e oltre se manca
    const spread = hit ? 0.08 : 0.3 + _hash01(h) * 0.15;
    const side = (_hash01(h + 1) - 0.5) * 2 * spread * ts;
    const over = hit ? 0 : ts * (0.25 + _hash01(h + 2) * 0.3);
    const ix = ex + nx * side + ux * over,
      iy = ey + ny * side + uy * over;

    // Vampata alla bocca dell'arma
    ctx.globalCompositeOperation = "lighter";
    const f = local / 0.1;
    if (f < 1) {
      _smokePuff(ctx, mx, my, ts * 0.2, "255,225,150", 0.9 * (1 - f));
      const fl = ts * (sniper ? 0.38 : 0.28) * (1 - f * 0.5),
        fw = ts * 0.07 * (1 - f);
      ctx.fillStyle = `rgba(255,240,190,${(0.85 * (1 - f)).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(mx + nx * fw, my + ny * fw);
      ctx.lineTo(mx + ux * fl, my + uy * fl);
      ctx.lineTo(mx - nx * fw, my - ny * fw);
      ctx.fill();
    }

    // Tracciante: testa luminosa con coda sfumata
    const q = local / travel;
    if (q < 1) {
      const hx = mx + (ix - mx) * q,
        hy = my + (iy - my) * q;
      const dx = ix - mx,
        dy = iy - my;
      const dl = Math.hypot(dx, dy) || 1;
      const tail = Math.min(ts * (sniper ? 1.6 : 0.9), dl * q);
      const tx = hx - (dx / dl) * tail,
        ty = hy - (dy / dl) * tail;
      const g = ctx.createLinearGradient(tx, ty, hx, hy);
      g.addColorStop(0, `rgba(${rgb},0)`);
      g.addColorStop(1, `rgba(${rgb},0.95)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(1.5, ts * (sniper ? 0.025 : 0.035));
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      _smokePuff(ctx, hx, hy, ts * 0.07, "255,245,220", 0.9);
      continue;
    }

    // Impatto
    const r = (local - travel) / 0.22;
    if (r >= 1) continue;
    if (hit) {
      // Scintille che rimbalzano indietro verso il tiratore
      _smokePuff(ctx, ix, iy, ts * 0.14, "255,200,120", 0.8 * (1 - r));
      ctx.lineWidth = Math.max(1, ts * 0.015);
      ctx.strokeStyle = `rgba(255,210,120,${(0.9 * (1 - r)).toFixed(3)})`;
      for (let k = 0; k < 5; k++) {
        const a = Math.atan2(-uy, -ux) + (_hash01(h + 3 + k) - 0.5) * 2.4;
        const d0 = ts * 0.2 * r,
          d1 = ts * (0.08 + 0.22 * r);
        ctx.beginPath();
        ctx.moveTo(ix + Math.cos(a) * d0, iy + Math.sin(a) * d0);
        ctx.lineTo(ix + Math.cos(a) * d1, iy + Math.sin(a) * d1);
        ctx.stroke();
      }
    } else {
      // Polvere sollevata dal proiettile che finisce a terra
      ctx.globalCompositeOperation = "source-over";
      _smokePuff(ctx, ix, iy, ts * (0.08 + 0.14 * r), "150,128,92", 0.55 * (1 - r));
      ctx.fillStyle = `rgba(90,70,45,${(0.8 * (1 - r)).toFixed(3)})`;
      for (let k = 0; k < 3; k++) {
        const a = _hash01(h + 9 + k) * Math.PI * 2,
          d = ts * 0.18 * r;
        ctx.fillRect(ix + Math.cos(a) * d - 1, iy + Math.sin(a) * d - 1, 2, 2);
      }
    }
  }
  ctx.restore();
}

// ── SPOT — avvistamento / allerta ───────────────────────────────────────
// Default: VC che avvista la squadra → fumetto rosso con "!", trattini di
// sorpresa e due onde d'allerta. data.relay: VC allertato dai compagni →
// versione più piccola e sobria. data.kind === "trap": trappola individuata
// dal geniere → anello di scansione che si stringe e triangolo di pericolo.
function _drawSpot(ctx, ts, data, p) {
  const { col, row, relay, kind } = data;
  const { x, y } = tileToScreen(col, row);
  const cx = x + ts * 0.5,
    cy = y + ts * 0.5;
  const trap = kind === "trap";
  const rgb = trap ? "255,200,40" : "255,80,40";
  const fadeOut = (a, b) => 1 - Math.min(1, Math.max(0, (p - a) / (b - a)));

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (trap) {
    // Anello di scansione tratteggiato che si stringe sulla trappola
    if (p < 0.4) {
      const sp = p / 0.4;
      ctx.strokeStyle = `rgba(${rgb},${(0.9 * (1 - sp * 0.5)).toFixed(3)})`;
      ctx.lineWidth = Math.max(1.5, ts * 0.03);
      ctx.setLineDash([ts * 0.07, ts * 0.05]);
      ctx.lineDashOffset = -sp * ts;
      ctx.beginPath();
      ctx.arc(cx, cy, ts * (0.85 - 0.5 * (1 - (1 - sp) ** 2)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Bagliore ambra sulla trappola appena agganciata
    if (p >= 0.35) {
      ctx.globalCompositeOperation = "lighter";
      _smokePuff(ctx, cx, cy, ts * 0.38, rgb, 0.45 * Math.sin(Math.PI * Math.min(1, (p - 0.35) / 0.65)));
      ctx.globalCompositeOperation = "source-over";
    }
  } else {
    // Onde d'allerta che si propagano dal VC (una sola se allertato di riflesso)
    for (let k = 0; k < (relay ? 1 : 2); k++) {
      const r = (p - k * 0.15) / 0.5;
      if (r <= 0 || r >= 1) continue;
      ctx.strokeStyle = `rgba(${rgb},${(0.75 * (1 - r)).toFixed(3)})`;
      ctx.lineWidth = Math.max(1.5, ts * 0.035 * (1 - r));
      ctx.beginPath();
      ctx.arc(cx, cy, ts * (0.2 + 0.6 * (1 - (1 - r) ** 2)), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Fumetto / triangolo sopra la testa: rimbalzo d'entrata, scossa, uscita
  const size = ts * (relay ? 0.3 : 0.4);
  const pop = Math.min(1, p / 0.15);
  const scale = pop < 1 ? 1 + 2.2 * (pop - 1) ** 3 + 1.2 * (pop - 1) ** 2 : 1;
  const ba = fadeOut(0.8, 1);
  const shake = !relay && p > 0.15 && p < 0.35 ? Math.sin(p * 120) * ts * 0.02 : 0;
  const bx = cx + shake,
    by = y - size * 0.15 - (trap ? 0 : ts * 0.04 * Math.sin(Math.min(1, p / 0.3) * Math.PI));
  if (ba > 0 && scale > 0.01) {
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(scale, scale);
    ctx.globalAlpha = ba;
    ctx.lineWidth = Math.max(2, ts * 0.04);
    ctx.strokeStyle = "rgba(25,10,5,0.9)";
    if (trap) {
      // Triangolo di pericolo
      const h = size * 1.1;
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.62);
      ctx.lineTo(h * 0.6, h * 0.42);
      ctx.lineTo(-h * 0.6, h * 0.42);
      ctx.closePath();
      ctx.fillStyle = `rgb(${rgb})`;
      ctx.fill();
      ctx.stroke();
    } else {
      // Fumetto tondo con codina verso l'unità
      const r = size * 0.55;
      ctx.beginPath();
      ctx.arc(0, 0, r, Math.PI * 0.62, Math.PI * 0.38 + Math.PI * 2);
      ctx.lineTo(0, r * 1.45);
      ctx.closePath();
      ctx.fillStyle = `rgb(${rgb})`;
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = trap ? "rgb(25,15,5)" : "rgb(255,245,225)";
    ctx.font = `bold ${Math.round(size * 0.75)}px 'Oswald'`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t("fx.spot"), 0, trap ? size * 0.08 : size * 0.02);
    ctx.restore();
  }

  // Trattini di sorpresa attorno al fumetto (solo avvistamento diretto)
  if (!trap && !relay && p > 0.08 && p < 0.45) {
    const lp = (p - 0.08) / 0.37;
    ctx.strokeStyle = `rgba(${rgb},${(1 - lp).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.5, ts * 0.03);
    for (const a of [-2.3, -1.57, -0.84]) {
      const r0 = size * (0.75 + 0.25 * lp),
        r1 = r0 + size * 0.3;
      ctx.beginPath();
      ctx.moveTo(bx + Math.cos(a) * r0, by + Math.sin(a) * r0);
      ctx.lineTo(bx + Math.cos(a) * r1, by + Math.sin(a) * r1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ── HEAL — cura del medico ──────────────────────────────────────────────
// Sfera di luce dal medico al ferito (se su tile diversi) → alone e anelli
// verdi → piccole croci che salgono → croce medica con rimbalzo → "+N HP".
const HEAL_MOTES = 10;

// Croce "+" centrata in (cx,cy) con lato s
function _plusPath(ctx, cx, cy, s) {
  const a = s * 0.5,
    b = s * 0.17;
  ctx.beginPath();
  ctx.moveTo(cx - b, cy - a);
  ctx.lineTo(cx + b, cy - a);
  ctx.lineTo(cx + b, cy - b);
  ctx.lineTo(cx + a, cy - b);
  ctx.lineTo(cx + a, cy + b);
  ctx.lineTo(cx + b, cy + b);
  ctx.lineTo(cx + b, cy + a);
  ctx.lineTo(cx - b, cy + a);
  ctx.lineTo(cx - b, cy + b);
  ctx.lineTo(cx - a, cy + b);
  ctx.lineTo(cx - a, cy - b);
  ctx.lineTo(cx - b, cy - b);
  ctx.closePath();
}

function _drawHeal(ctx, ts, data, p) {
  const { col, row, amount, fromCol, fromRow } = data;
  const { x, y } = tileToScreen(col, row);
  const cx = x + ts * 0.5,
    cy = y + ts * 0.5;
  const seed = col * 31 + row * 57;
  const hasFrom =
    fromCol != null && (fromCol !== col || fromRow !== row);
  const t0 = hasFrom ? 0.2 : 0;
  const q = Math.max(0, (p - t0) / (1 - t0)); // tempo locale dopo l'arrivo

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // 1) Sfera di luce dal medico al ferito, con scia
  if (hasFrom && p < t0 + 0.05) {
    const { x: mx0, y: my0 } = tileToScreen(fromCol, fromRow);
    const mx = mx0 + ts * 0.5,
      my = my0 + ts * 0.5;
    const o = Math.min(1, p / t0);
    const e = o * o * (3 - 2 * o);
    const ox = mx + (cx - mx) * e,
      oy = my + (cy - my) * e;
    const trail = Math.max(0, e - 0.25);
    const g = ctx.createLinearGradient(mx + (cx - mx) * trail, my + (cy - my) * trail, ox, oy);
    g.addColorStop(0, "rgba(120,255,140,0)");
    g.addColorStop(1, "rgba(120,255,140,0.7)");
    ctx.strokeStyle = g;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(2, ts * 0.06);
    ctx.beginPath();
    ctx.moveTo(mx + (cx - mx) * trail, my + (cy - my) * trail);
    ctx.lineTo(ox, oy);
    ctx.stroke();
    _smokePuff(ctx, ox, oy, ts * 0.18, "160,255,170", 0.9);
  }

  if (q > 0) {
    // 2) Alone verde che pulsa sotto l'unità
    _smokePuff(ctx, cx, cy + ts * 0.1, ts * 0.65, "70,220,100", 0.45 * Math.sin(Math.PI * q));

    // 3) Due anelli che si allargano sfasati
    for (let k = 0; k < 2; k++) {
      const r = (q - k * 0.18) / 0.6;
      if (r <= 0 || r >= 1) continue;
      ctx.strokeStyle = `rgba(120,255,140,${(0.8 * (1 - r)).toFixed(3)})`;
      ctx.lineWidth = Math.max(1.5, ts * 0.035 * (1 - r));
      ctx.beginPath();
      ctx.arc(cx, cy, ts * (0.15 + 0.5 * (1 - (1 - r) ** 2)), 0, Math.PI * 2);
      ctx.stroke();
    }

    // 4) Piccole croci luminose che salgono ondeggiando
    for (let i = 0; i < HEAL_MOTES; i++) {
      const h = seed + i * 17;
      const start = _hash01(h) * 0.45;
      const m = (q - start) / 0.5;
      if (m <= 0 || m >= 1) continue;
      const mxp = cx + (_hash01(h + 1) - 0.5) * ts * 0.7 + Math.sin(m * 6 + h) * ts * 0.05;
      const myp = y + ts * (0.85 - 0.75 * m);
      const ma = Math.sin(Math.PI * m) * 0.9;
      _smokePuff(ctx, mxp, myp, ts * 0.07, "120,255,140", ma * 0.5);
      ctx.fillStyle = `rgba(210,255,215,${ma.toFixed(3)})`;
      _plusPath(ctx, mxp, myp, ts * (0.05 + _hash01(h + 2) * 0.04));
      ctx.fill();
    }
  }
  ctx.restore();

  if (q <= 0) return;

  // 5) Croce medica: compare con un rimbalzo, sale e svanisce
  const pop = Math.min(1, q / 0.2);
  const scale = pop < 1 ? 1 + 2.2 * (pop - 1) ** 3 + 1.2 * (pop - 1) ** 2 : 1; // back-out
  const ca = q < 0.6 ? 1 : Math.max(0, 1 - (q - 0.6) / 0.3);
  if (ca > 0) {
    const crossY = cy - ts * 0.12 * q;
    const s = ts * 0.34 * scale;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    _smokePuff(ctx, cx, crossY, ts * 0.32 * scale, "90,240,120", 0.55 * ca);
    ctx.restore();
    ctx.fillStyle = `rgba(255,255,255,${(0.95 * ca).toFixed(3)})`;
    ctx.strokeStyle = `rgba(40,150,60,${ca.toFixed(3)})`;
    ctx.lineWidth = Math.max(1.5, ts * 0.025);
    ctx.lineJoin = "round";
    _plusPath(ctx, cx, crossY, s);
    ctx.fill();
    ctx.stroke();
  }

  // 6) "+N HP" con contorno scuro, leggibile su qualsiasi terreno
  const fy = cy - ts * 0.35 - ts * 0.4 * q,
    ta = q < 0.7 ? Math.min(1, q / 0.1) : 1 - (q - 0.7) / 0.3;
  ctx.font = `bold ${Math.round(ts * 0.3)}px 'Oswald'`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, ts * 0.06);
  ctx.strokeStyle = `rgba(10,40,15,${(0.85 * ta).toFixed(3)})`;
  ctx.strokeText(`+${amount}HP`, cx, fy);
  ctx.fillStyle = `rgba(130,255,140,${ta.toFixed(3)})`;
  ctx.fillText(`+${amount}HP`, cx, fy);
}

// ── OVERWATCH — fuoco di reazione ───────────────────────────────────────
// Angoli azzurri che si chiudono sul tiratore, mirino che si aggancia al
// bersaglio, linea di mira tratteggiata e lo stesso sparo di _drawShot
// (traccianti, vampata, impatto) sulla sua timeline di 700ms.
const OW_RGB = "150,215,255";
const OW_SHOT_MS = 700;

// Quattro angoli a "L" attorno a (cx,cy), semi-lato h, lunghezza tacca l
function _cornerBrackets(ctx, cx, cy, h, l) {
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const px = cx + sx * h,
      py = cy + sy * h;
    ctx.beginPath();
    ctx.moveTo(px - sx * l, py);
    ctx.lineTo(px, py);
    ctx.lineTo(px, py - sy * l);
    ctx.stroke();
  }
}

function _drawOverwatch(ctx, ts, fx, p) {
  const { owCol, owRow, tCol, tRow, hit, sniper, rounds } = fx.data;
  const { x: ox, y: oy } = tileToScreen(owCol, owRow);
  const { x: tx, y: ty } = tileToScreen(tCol, tRow);
  const osx = ox + ts * 0.5,
    osy = oy + ts * 0.5,
    otx = tx + ts * 0.5,
    oty = ty + ts * 0.5;
  const fadeOut = (a, b) => 1 - Math.min(1, Math.max(0, (p - a) / (b - a)));

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 1) Angoli sul tiratore: si chiudono dall'esterno e svaniscono
  const ba = fadeOut(0.35, 0.6);
  if (ba > 0) {
    const close = Math.min(1, p / 0.18);
    const h = ts * (0.62 - 0.16 * (1 - (1 - close) ** 3));
    ctx.strokeStyle = `rgba(${OW_RGB},${(0.95 * ba).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.5, ts * 0.04);
    _cornerBrackets(ctx, osx, osy, h, ts * 0.16);
  }

  // 2) Linea di mira tratteggiata che corre verso il bersaglio
  const la = 0.6 * fadeOut(0.2, 0.45);
  if (la > 0) {
    const lt = Math.min(1, p / 0.15);
    ctx.strokeStyle = `rgba(${OW_RGB},${la.toFixed(3)})`;
    ctx.lineWidth = Math.max(1, ts * 0.018);
    ctx.setLineDash([ts * 0.08, ts * 0.06]);
    ctx.beginPath();
    ctx.moveTo(osx, osy);
    ctx.lineTo(osx + (otx - osx) * lt, osy + (oty - osy) * lt);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 3) Mirino sul bersaglio: entra grande e ruotato, si stringe e aggancia
  const ra = fadeOut(0.45, 0.7);
  if (ra > 0) {
    const lock = Math.min(1, p / 0.2);
    const le = 1 - (1 - lock) ** 3;
    const r = ts * (0.62 - 0.26 * le);
    ctx.save();
    ctx.translate(otx, oty);
    ctx.rotate((1 - le) * Math.PI * 0.5);
    ctx.strokeStyle = `rgba(${OW_RGB},${(0.95 * ra * Math.min(1, p / 0.06)).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.5, ts * 0.03);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
      ctx.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3);
      ctx.stroke();
    }
    ctx.restore();
    // Bagliore quando il mirino è agganciato
    if (lock >= 1) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      _smokePuff(ctx, otx, oty, ts * 0.3, OW_RGB, 0.35 * ra);
      ctx.restore();
    }
  }
  ctx.restore();

  // 4) Lo sparo vero e proprio, identico a un attacco normale
  const sp = (p * fx.duration) / OW_SHOT_MS;
  if (sp < 1)
    _drawShot(
      ctx,
      ts,
      {
        t0: fx.t0,
        data: {
          fromCol: owCol,
          fromRow: owRow,
          toCol: tCol,
          toRow: tRow,
          enemy: false,
          hit,
          sniper,
          rounds,
        },
      },
      sp,
    );

  // 5) Scritta "OVERWATCH" sopra il tiratore
  const pop = Math.min(1, p / 0.12);
  const scale = pop < 1 ? 1 + 2.2 * (pop - 1) ** 3 + 1.2 * (pop - 1) ** 2 : 1;
  const ta = fadeOut(0.55, 0.85);
  if (ta > 0) {
    const size = ts * 0.24 * Math.max(0.01, scale);
    ctx.font = `bold ${Math.round(size)}px 'Oswald'`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, size * 0.18);
    ctx.strokeStyle = `rgba(5,25,45,${(0.85 * ta).toFixed(3)})`;
    ctx.strokeText(t("fx.overwatch"), osx, oy - ts * 0.04);
    ctx.fillStyle = `rgba(${OW_RGB},${ta.toFixed(3)})`;
    ctx.fillText(t("fx.overwatch"), osx, oy - ts * 0.04);
  }
}

// ── SUPPRESSION — fuoco di soppressione ─────────────────────────────────
// Nessun danno: il bersaglio viene inchiodato. Angoli arancioni sul tiratore,
// raffica di 5 traccianti (tutti mancati, la polvere si alza attorno al VC)
// e chevron che scendono schiacciando il bersaglio a terra.
const SUP_RGB = "255,165,50";
const SUP_SHOT_MS = 900;

function _drawSuppression(ctx, ts, fx, p) {
  const { supCol, supRow, tCol, tRow } = fx.data;
  const { x: ox, y: oy } = tileToScreen(supCol, supRow);
  const { x: tx, y: ty } = tileToScreen(tCol, tRow);
  const osx = ox + ts * 0.5,
    osy = oy + ts * 0.5,
    otx = tx + ts * 0.5,
    oty = ty + ts * 0.5;
  const fadeOut = (a, b) => 1 - Math.min(1, Math.max(0, (p - a) / (b - a)));

  // 1) Angoli sul tiratore: si chiudono dall'esterno e svaniscono
  const ba = fadeOut(0.3, 0.5);
  if (ba > 0) {
    const close = Math.min(1, p / 0.15);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = `rgba(${SUP_RGB},${(0.95 * ba).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.5, ts * 0.04);
    _cornerBrackets(ctx, osx, osy, ts * (0.62 - 0.16 * (1 - (1 - close) ** 3)), ts * 0.16);
    ctx.restore();
  }

  // 2) Raffica: stessi traccianti dello sparo, tutti a vuoto attorno al VC
  const sp = (p * fx.duration) / SUP_SHOT_MS;
  if (sp < 1.15)
    _drawShot(
      ctx,
      ts,
      {
        t0: fx.t0,
        data: {
          fromCol: supCol,
          fromRow: supRow,
          toCol: tCol,
          toRow: tRow,
          enemy: false,
          hit: false,
          rounds: 5,
        },
      },
      sp,
    );

  // 3) Bersaglio inchiodato: bagliore arancione e tre chevron che scendono
  const pa = Math.min(1, Math.max(0, (p - 0.25) / 0.1)) * fadeOut(0.8, 1);
  if (pa > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    _smokePuff(ctx, otx, oty, ts * 0.45, SUP_RGB, 0.3 * pa);
    ctx.restore();

    const press = Math.min(1, Math.max(0, (p - 0.25) / 0.45));
    const pe = 1 - (1 - press) ** 2;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, ts * 0.045);
    const w = ts * 0.16;
    for (let k = 0; k < 3; k++) {
      // Partono distanziati sopra la testa e si compattano verso il basso
      const cy0 = oty - ts * (0.95 - k * 0.14);
      const cy1 = oty - ts * (0.48 - k * 0.07);
      const cy = cy0 + (cy1 - cy0) * pe;
      const a = pa * (0.55 + 0.15 * k);
      ctx.strokeStyle = `rgba(40,20,0,${(0.7 * a).toFixed(3)})`;
      ctx.lineWidth = Math.max(3, ts * 0.075);
      ctx.beginPath();
      ctx.moveTo(otx - w, cy - w * 0.55);
      ctx.lineTo(otx, cy);
      ctx.lineTo(otx + w, cy - w * 0.55);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${SUP_RGB},${a.toFixed(3)})`;
      ctx.lineWidth = Math.max(2, ts * 0.045);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 4) Scritta "SOPPRESSIONE" sopra il tiratore
  const pop = Math.min(1, p / 0.1);
  const scale = pop < 1 ? 1 + 2.2 * (pop - 1) ** 3 + 1.2 * (pop - 1) ** 2 : 1;
  const ta = fadeOut(0.55, 0.8);
  if (ta > 0) {
    const size = ts * 0.24 * Math.max(0.01, scale);
    ctx.font = `bold ${Math.round(size)}px 'Oswald'`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, size * 0.18);
    ctx.strokeStyle = `rgba(45,22,0,${(0.85 * ta).toFixed(3)})`;
    ctx.strokeText(t("fx.suppression"), osx, oy - ts * 0.04);
    ctx.fillStyle = `rgba(${SUP_RGB},${ta.toFixed(3)})`;
    ctx.fillText(t("fx.suppression"), osx, oy - ts * 0.04);
  }
}

// ── HIT — unità colpita ─────────────────────────────────────────────────
// Lampo d'impatto, mirino a X ("hit marker"), schizzi rossi che volano via
// dal lato opposto a chi ha sparato (data.fromCol/fromRow; per le esplosioni
// il centro del blast) e numero del danno con rimbalzo e contorno.
const HIT_DROPS = 8;

function _drawHit(ctx, ts, fx, p) {
  const { col, row, dmg, fromCol, fromRow } = fx.data;
  const { x, y } = tileToScreen(col, row);
  const cx = x + ts * 0.5,
    cy = y + ts * 0.5;
  const seed = Math.floor(fx.t0) % 997;
  // Direzione degli schizzi: via da chi ha sparato, altrimenti tutt'intorno
  const hasDir = fromCol != null && (fromCol !== col || fromRow !== row);
  const baseAng = hasDir ? Math.atan2(row - fromRow, col - fromCol) : 0;
  const cone = hasDir ? 1.6 : Math.PI * 2;

  // 1) Schizzi rossi: volano via, rallentano e si posano
  const sp = Math.min(1, p / 0.45);
  const sa = 0.85 * (1 - Math.max(0, (p - 0.45) / 0.55));
  if (sa > 0) {
    ctx.fillStyle = `rgba(140,10,10,${sa.toFixed(3)})`;
    for (let i = 0; i < HIT_DROPS; i++) {
      const h = seed + i * 11;
      const ang = baseAng + (_hash01(h) - 0.5) * cone;
      const d = ts * (0.18 + _hash01(h + 1) * 0.32) * (1 - (1 - sp) ** 2);
      const r = Math.max(1, ts * (0.018 + _hash01(h + 2) * 0.022) * (1 - sp * 0.3));
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // 2) Lampo d'impatto sull'unità
  if (p < 0.2) {
    _smokePuff(ctx, cx, cy, ts * 0.42, "255,70,40", 0.75 * (1 - p / 0.2));
    _smokePuff(ctx, cx, cy, ts * 0.16, "255,230,200", 0.9 * (1 - p / 0.2));
  }
  // 3) Anello sottile che si allarga
  if (p < 0.35) {
    const rp = p / 0.35;
    ctx.strokeStyle = `rgba(255,120,80,${(0.8 * (1 - rp)).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.5, ts * 0.03 * (1 - rp));
    ctx.beginPath();
    ctx.arc(cx, cy, ts * (0.2 + 0.35 * (1 - (1 - rp) ** 2)), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // 4) Mirino a X: quattro tacche diagonali che si stringono e svaniscono
  if (p < 0.45) {
    const mp = p / 0.45;
    const r0 = ts * (0.3 - 0.08 * mp),
      r1 = r0 + ts * 0.14;
    ctx.strokeStyle = `rgba(255,245,235,${(0.95 * (1 - mp)).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.5, ts * 0.035);
    ctx.lineCap = "round";
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
  }

  // 5) Danno: compare con un rimbalzo, sale e svanisce; più grande se forte
  const pop = Math.min(1, p / 0.15);
  const scale = pop < 1 ? 1 + 2.2 * (pop - 1) ** 3 + 1.2 * (pop - 1) ** 2 : 1;
  const ta = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
  const size = ts * (0.32 + 0.04 * Math.min(dmg, 4)) * Math.max(0.01, scale);
  const fy = cy - ts * 0.25 - ts * 0.35 * p;
  ctx.font = `bold ${Math.round(size)}px 'Oswald'`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, size * 0.18);
  ctx.strokeStyle = `rgba(50,0,0,${(0.85 * ta).toFixed(3)})`;
  ctx.strokeText(`-${dmg}`, cx, fy);
  ctx.fillStyle = `rgba(255,85,55,${ta.toFixed(3)})`;
  ctx.fillText(`-${dmg}`, cx, fy);
}

// ── MISS — colpo mancato ────────────────────────────────────────────────
// Colpo singolo: scie d'aria del proiettile che passa accanto e rimbalzo
// (scintilla a terra + scia deviata, in sincronia col suono di ricochet).
// Esplosione (data.blast): polvere ai piedi, il bersaglio si è riparato.
// Poi la scritta "MANCATO" con rimbalzo e contorno.
function _drawMiss(ctx, ts, fx, p) {
  const { col, row, fromCol, fromRow, blast } = fx.data;
  const { x, y } = tileToScreen(col, row);
  const cx = x + ts * 0.5,
    cy = y + ts * 0.5;
  const seed = Math.floor(fx.t0) % 997;
  const hasDir = fromCol != null && (fromCol !== col || fromRow !== row);
  const ang = hasDir
    ? Math.atan2(row - fromRow, col - fromCol)
    : _hash01(seed) * Math.PI * 2;
  const ux = Math.cos(ang),
    uy = Math.sin(ang);
  const side = _hash01(seed + 1) < 0.5 ? -1 : 1;
  const nx = -uy * side,
    ny = ux * side;

  if (blast) {
    // Polvere sollevata ai piedi
    const dp = Math.min(1, p / 0.6);
    for (let i = 0; i < 4; i++) {
      const h = seed + i * 7;
      const a = _hash01(h) * Math.PI * 2;
      const d = ts * (0.1 + 0.22 * dp);
      _smokePuff(
        ctx,
        cx + Math.cos(a) * d,
        y + ts * 0.8 + Math.sin(a) * d * 0.35,
        ts * (0.08 + 0.12 * dp),
        "150,128,92",
        0.5 * (1 - dp),
      );
    }
  } else {
    // Punto di rimbalzo: di lato e un po' oltre l'unità
    const ix = cx + nx * ts * 0.32 + ux * ts * 0.18,
      iy = cy + ny * ts * 0.32 + uy * ts * 0.18;

    // Scie d'aria: due righe sottili che sfrecciano accanto all'unità
    if (p < 0.3) {
      const wp = p / 0.3;
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(1, ts * 0.018);
      for (let k = 0; k < 2; k++) {
        const off = ts * (0.24 + k * 0.1);
        const head = -ts * 0.5 + ts * 1.1 * wp - k * ts * 0.08;
        const tail = head - ts * 0.35;
        ctx.strokeStyle = `rgba(240,235,220,${(0.7 * (1 - wp)).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(cx + nx * off + ux * tail, cy + ny * off + uy * tail);
        ctx.lineTo(cx + nx * off + ux * head, cy + ny * off + uy * head);
        ctx.stroke();
      }
    }

    // Polvere nel punto d'impatto
    const dp = Math.min(1, p / 0.5);
    _smokePuff(ctx, ix, iy, ts * (0.06 + 0.12 * dp), "150,128,92", 0.5 * (1 - dp));

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // Scintilla del rimbalzo
    if (p < 0.15) {
      _smokePuff(ctx, ix, iy, ts * 0.13, "255,225,160", 0.95 * (1 - p / 0.15));
    }
    // Scia deviata: riparte dal punto d'impatto con un angolo verso l'esterno
    if (p < 0.4) {
      const rp = p / 0.4;
      const ra = ang + side * (0.7 + _hash01(seed + 2) * 0.5);
      const head = ts * 0.9 * (1 - (1 - rp) ** 2);
      const tail = Math.max(0, head - ts * 0.35);
      const hx = ix + Math.cos(ra) * head,
        hy = iy + Math.sin(ra) * head;
      const tx = ix + Math.cos(ra) * tail,
        ty = iy + Math.sin(ra) * tail;
      const g = ctx.createLinearGradient(tx, ty, hx, hy);
      g.addColorStop(0, "rgba(255,220,150,0)");
      g.addColorStop(1, `rgba(255,235,190,${(0.9 * (1 - rp)).toFixed(3)})`);
      ctx.strokeStyle = g;
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(1, ts * 0.022);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Scritta "MANCATO": rimbalzo, contorno, sale e svanisce
  const pop = Math.min(1, p / 0.15);
  const scale = pop < 1 ? 1 + 2.2 * (pop - 1) ** 3 + 1.2 * (pop - 1) ** 2 : 1;
  const ta = p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35;
  const size = ts * 0.26 * Math.max(0.01, scale);
  const fy = cy - ts * 0.25 - ts * 0.3 * p;
  ctx.font = `bold ${Math.round(size)}px 'Oswald'`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, size * 0.18);
  ctx.strokeStyle = `rgba(40,30,10,${(0.8 * ta).toFixed(3)})`;
  ctx.strokeText(t("fx.miss"), cx, fy);
  ctx.fillStyle = `rgba(230,210,150,${ta.toFixed(3)})`;
  ctx.fillText(t("fx.miss"), cx, fy);
}

// ── DEATH — unità eliminata ─────────────────────────────────────────────
// L'unità (già rimossa dalla mappa) viene ridisegnata mentre cade di lato e
// svanisce; all'impatto si alza polvere, poi si allarga una macchia scura.
// Senza data.cls (chiamate vecchie) si salta la caduta e resta il resto.
function _drawDeathPending(ctx, ts, data) {
  const { col, row, cls, enemy, stance, facing } = data;
  if (!cls || typeof drawUnitSprite !== "function" || !isTileVisible(col, row))
    return;
  const { x, y } = tileToScreen(col, row);
  drawUnitSprite(ctx, x, y, ts, cls, false, !!enemy, stance, facing);
}

function _drawDeath(ctx, ts, data, p) {
  const { col, row, cls, enemy, stance, facing } = data;
  const { x, y } = tileToScreen(col, row);
  const cx = x + ts * 0.5,
    cy = y + ts * 0.5;
  const seed = col * 31 + row * 57;
  const dir = _hash01(seed) < 0.5 ? -1 : 1; // lato su cui cade
  const fall = Math.min(1, Math.max(0, (p - 0.05) / 0.32));
  const fe = fall * fall; // accelera come per gravità
  // Dove finisce il corpo a terra: macchia e polvere stanno lì
  const bodyX = cx + dir * ts * 0.22,
    bodyY = y + ts * 0.72;
  const fadeOut = (a, b) => 1 - Math.min(1, Math.max(0, (p - a) / (b - a)));

  // 1) Macchia scura che si allarga sul terreno
  const pool = Math.min(1, Math.max(0, (p - 0.3) / 0.4));
  if (pool > 0) {
    const pa = 0.55 * fadeOut(0.75, 1);
    for (let i = 0; i < 4; i++) {
      const h = seed + i * 13;
      _smokePuff(
        ctx,
        bodyX + (_hash01(h) - 0.5) * ts * 0.25,
        bodyY + (_hash01(h + 1) - 0.5) * ts * 0.12,
        ts * (0.12 + _hash01(h + 2) * 0.1) * (0.3 + 0.7 * (1 - (1 - pool) ** 2)),
        "85,8,8",
        pa,
      );
    }
  }

  // 2) Lampo rosso all'istante del colpo mortale
  if (p < 0.15) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    _smokePuff(ctx, cx, cy, ts * 0.55, "255,50,30", 0.7 * (1 - p / 0.15));
    ctx.restore();
  }

  // 3) L'unità si accascia di lato fino a terra (postura sdraiata, girata
  // verso il lato della caduta) e svanisce
  // (non su tile nel FOW: l'artiglieria può uccidere VC nascosti)
  if (cls && typeof drawUnitSprite === "function" && isTileVisible(col, row)) {
    const sa = fadeOut(0.5, 0.9);
    if (sa > 0) {
      ctx.save();
      if (fall < 1) {
        ctx.globalAlpha = sa * (1 - fall);
        drawUnitSprite(ctx, x, y, ts, cls, false, !!enemy, stance, facing);
      }
      ctx.globalAlpha = sa * fall;
      drawUnitSprite(
        ctx,
        x + (bodyX - cx) * fe * 0.5,
        y + (bodyY - cy) * fe * 0.5,
        ts,
        cls,
        false,
        !!enemy,
        "prone",
        facing,
        dir * fe * 0.6,
      );
      ctx.restore();
    }
  }

  // 4) Polvere sollevata quando il corpo tocca terra
  const dust = (p - 0.37) / 0.4;
  if (dust > 0 && dust < 1) {
    for (let i = 0; i < 4; i++) {
      const h = seed + i * 7;
      const ang = Math.PI + (_hash01(h) - 0.5) * 2.2; // verso l'alto/i lati
      const d = ts * (0.08 + 0.2 * dust) * (0.6 + _hash01(h + 1) * 0.6);
      _smokePuff(
        ctx,
        bodyX + Math.cos(ang) * d * dir * -1,
        bodyY + Math.sin(ang) * d * 0.4 - ts * 0.05 * dust,
        ts * (0.08 + 0.12 * dust),
        "150,128,92",
        0.5 * (1 - dust),
      );
    }
  }

  // 5) "KIA" con contorno scuro
  if (p > 0.15) {
    const ka = Math.min(1, (p - 0.15) / 0.1) * fadeOut(0.7, 1);
    const ky = cy - ts * 0.3 - ts * 0.15 * p;
    ctx.font = `bold ${Math.round(ts * 0.34)}px 'Special Elite'`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, ts * 0.06);
    ctx.strokeStyle = `rgba(60,0,0,${(0.85 * ka).toFixed(3)})`;
    ctx.strokeText(t("fx.kia"), cx, ky);
    ctx.fillStyle = `rgba(255,235,225,${ka.toFixed(3)})`;
    ctx.fillText(t("fx.kia"), cx, ky);
  }
}

// ── SPAWN — arrivo di VC ────────────────────────────────────────────────
// Rinforzi: sbucano da un tunnel → botola scura che si apre, zolle di terra
// lanciate in aria che ricadono, polvere. data.ambush: escono dalla
// vegetazione → lampo rosso e foglie che schizzano via e ricadono.
// In entrambi i casi onde rosse d'allarme.
const SPAWN_CLODS = 8;
const SPAWN_LEAVES = 12;

function _drawSpawn(ctx, ts, data, p) {
  const { col, row, ambush } = data;
  const { x, y } = tileToScreen(col, row);
  const cx = x + ts * 0.5,
    cy = y + ts * 0.5;
  const seed = col * 31 + row * 57;
  const holeY = y + ts * 0.78;

  if (!ambush) {
    // Botola del tunnel: si apre, resta, si richiude sul finale
    const open = Math.min(1, p / 0.2) * (1 - Math.max(0, (p - 0.8) / 0.2));
    if (open > 0) {
      const w = ts * 0.3 * (1 - (1 - open) ** 3),
        h = w * 0.42;
      ctx.fillStyle = "rgba(105,80,50,0.85)"; // bordo di terra smossa
      ctx.beginPath();
      ctx.ellipse(cx, holeY, w * 1.25, h * 1.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(15,10,6,0.95)";
      ctx.beginPath();
      ctx.ellipse(cx, holeY, w, h, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Polvere attorno all'imbocco
    const dp = Math.min(1, Math.max(0, (p - 0.08) / 0.6));
    if (dp > 0 && dp < 1)
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + _hash01(seed + i) * 0.8;
        const d = ts * (0.15 + 0.25 * dp);
        _smokePuff(
          ctx,
          cx + Math.cos(a) * d,
          holeY + Math.sin(a) * d * 0.4 - ts * 0.08 * dp,
          ts * (0.1 + 0.12 * dp),
          "150,128,92",
          0.5 * (1 - dp),
        );
      }
    // Zolle di terra: parabole verso l'alto che ricadono
    const cp = Math.min(1, Math.max(0, (p - 0.1) / 0.55));
    if (cp > 0 && cp < 1)
      for (let i = 0; i < SPAWN_CLODS; i++) {
        const h = seed + i * 13;
        const vx = (_hash01(h) - 0.5) * ts * 0.9;
        const vy = ts * (0.5 + _hash01(h + 1) * 0.45);
        const s = Math.max(2, ts * (0.03 + _hash01(h + 2) * 0.03));
        ctx.fillStyle = `rgba(${i % 2 ? "95,70,42" : "70,52,32"},${(1 - Math.max(0, (cp - 0.8) / 0.2)).toFixed(3)})`;
        ctx.fillRect(
          cx + vx * cp - s / 2,
          holeY - vy * 4 * cp * (1 - cp) - s / 2, // parabola: su e giù
          s,
          s,
        );
      }
  } else {
    // Lampo rosso dell'imboscata
    if (p < 0.18) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      _smokePuff(ctx, cx, cy, ts * 0.6, "255,40,30", 0.6 * (1 - p / 0.18));
      ctx.restore();
    }
    // Foglie che schizzano via dalla vegetazione e ricadono ondeggiando
    const lp = Math.min(1, p / 0.85);
    for (let i = 0; i < SPAWN_LEAVES; i++) {
      const h = seed + i * 17;
      const a = _hash01(h) * Math.PI * 2;
      const d = ts * (0.25 + _hash01(h + 1) * 0.45) * (1 - (1 - Math.min(1, lp / 0.4)) ** 2);
      const fall = ts * 0.25 * Math.max(0, lp - 0.3);
      const lx = cx + Math.cos(a) * d + Math.sin(lp * 10 + h) * ts * 0.04;
      const ly = cy + Math.sin(a) * d * 0.8 + fall;
      const la = 1 - Math.max(0, (lp - 0.6) / 0.4);
      const s = ts * (0.04 + _hash01(h + 2) * 0.03);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(a + lp * (4 + _hash01(h + 3) * 4));
      ctx.fillStyle = `rgba(${i % 3 ? "60,110,40" : "95,140,55"},${(0.95 * la).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, s, s * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Onde rosse d'allarme (tre per l'imboscata)
  const waves = ambush ? 3 : 2;
  for (let k = 0; k < waves; k++) {
    const r = (p - k * 0.2) / 0.55;
    if (r <= 0 || r >= 1) continue;
    ctx.strokeStyle = `rgba(230,50,40,${(0.8 * (1 - r)).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.5, ts * 0.045 * (1 - r));
    ctx.beginPath();
    ctx.arc(cx, cy, ts * (0.15 + 0.6 * (1 - (1 - r) ** 2)), 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ── DEMOLITION — speciale del geniere ───────────────────────────────────
// Tre varianti:
//  - riuscita: carica che lampeggia → esplosione → calcinacci che volano e
//    nube di polvere che copre il crollo (il tile cambia sotto la polvere)
//  - fallita: piccola esplosione e crepe sulla struttura che regge
//  - ignite (incendio di un tile burnable): fiammata che si alza
const DEMO_RUBBLE = 12;

// Scritta finale con rimbalzo e contorno
function _demoLabel(ctx, ts, cx, cy, text, rgb, p, start) {
  if (p < start) return;
  const lp = (p - start) / (1 - start);
  const pop = Math.min(1, lp / 0.15);
  const scale = pop < 1 ? 1 + 2.2 * (pop - 1) ** 3 + 1.2 * (pop - 1) ** 2 : 1;
  const ta = lp < 0.7 ? 1 : 1 - (lp - 0.7) / 0.3;
  const size = ts * 0.28 * Math.max(0.01, scale);
  const fy = cy - ts * 0.45 - ts * 0.25 * lp;
  ctx.font = `bold ${Math.round(size)}px 'Special Elite'`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, size * 0.2);
  ctx.strokeStyle = `rgba(20,15,5,${(0.85 * ta).toFixed(3)})`;
  ctx.strokeText(text, cx, fy);
  ctx.fillStyle = `rgba(${rgb},${ta.toFixed(3)})`;
  ctx.fillText(text, cx, fy);
}

function _drawDemolition(ctx, ts, fx, p) {
  const { col, row, success, ignite } = fx.data;
  const { x, y } = tileToScreen(col, row);
  const cx = x + ts * 0.5,
    cy = y + ts * 0.5;
  const seed = col * 31 + row * 57;

  if (ignite) {
    // Fiammata: lampo, lingue di fuoco che si alzano e si allargano, faville
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    if (p < 0.15)
      _smokePuff(ctx, cx, cy + ts * 0.1, ts * 0.5, "255,200,90", 0.9 * (1 - p / 0.15));
    const wp = Math.min(1, p / 0.55);
    const wa = 1 - Math.max(0, (p - 0.35) / 0.5);
    if (wa > 0)
      for (let i = 0; i < 7; i++) {
        const h = seed + i * 13;
        const a = -Math.PI / 2 + (_hash01(h) - 0.5) * 2.2;
        const d = ts * (0.1 + 0.45 * (1 - (1 - wp) ** 2)) * (0.6 + _hash01(h + 1) * 0.5);
        const heat = 1 - wp;
        _smokePuff(
          ctx,
          cx + Math.cos(a) * d,
          cy + ts * 0.15 + Math.sin(a) * d,
          ts * (0.12 + 0.12 * wp),
          `255,${Math.floor(110 + 120 * heat)},${Math.floor(20 + 60 * heat)}`,
          0.7 * wa,
        );
      }
    for (let i = 0; i < 6; i++) {
      const h = seed + i * 29;
      const ep = Math.min(1, p / (0.6 + _hash01(h) * 0.3));
      if (ep >= 1) continue;
      ctx.fillStyle = `rgba(255,${Math.floor(210 - ep * 120)},50,${(1 - ep).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(
        cx + (_hash01(h + 1) - 0.5) * ts * 0.6 + Math.sin(ep * 8 + h) * ts * 0.05,
        cy + ts * 0.2 - ts * 0.9 * ep,
        Math.max(1, ts * 0.02),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.restore();
    _demoLabel(ctx, ts, cx, cy, t("fx.ignite"), "255,170,60", p, 0.15);
    return;
  }

  // Carica che lampeggia prima della detonazione
  const fuse = 0.12;
  if (p < fuse) {
    const on = Math.floor((p / fuse) * 4) % 2 === 0;
    ctx.fillStyle = "rgba(60,50,35,0.9)";
    ctx.fillRect(cx - ts * 0.07, cy - ts * 0.05, ts * 0.14, ts * 0.1);
    if (on) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      _smokePuff(ctx, cx, cy - ts * 0.02, ts * 0.12, "255,40,30", 0.95);
      ctx.restore();
    }
  }
  const lp = (p - fuse) / (1 - fuse); // tempo locale dopo la detonazione
  if (lp <= 0) return;

  if (success) {
    // Nube di polvere: si allarga e resta fino alla fine, copre il crollo
    const dp = Math.min(1, lp / 0.5);
    const da = Math.min(1, lp / 0.15) * (1 - Math.max(0, (lp - 0.6) / 0.4));
    for (let i = 0; i < 7; i++) {
      const h = seed + i * 17;
      const a = (i / 7) * Math.PI * 2 + _hash01(h) * 0.7;
      const d = ts * (0.15 + 0.4 * (1 - (1 - dp) ** 2)) * (0.6 + _hash01(h + 1) * 0.5);
      _smokePuff(
        ctx,
        cx + Math.cos(a) * d,
        cy + Math.sin(a) * d * 0.8 - ts * 0.15 * lp,
        ts * (0.25 + 0.25 * dp),
        i % 2 ? "165,145,110" : "140,122,94",
        0.6 * da,
      );
    }
    _drawExplosion(ctx, ts, { col, row, aoe: 1, noText: true }, Math.min(1, lp / 0.75));

    // Calcinacci: blocchi che volano, ruotano, rallentano e si posano
    const rp = Math.min(1, lp / 0.65);
    const ra = 1 - Math.max(0, (lp - 0.7) / 0.3);
    for (let i = 0; i < DEMO_RUBBLE; i++) {
      const h = seed + i * 23;
      const a = _hash01(h) * Math.PI * 2;
      const d = ts * (0.35 + _hash01(h + 1) * 0.75) * (1 - (1 - rp) ** 2);
      const s = ts * (0.04 + _hash01(h + 2) * 0.05);
      ctx.save();
      ctx.translate(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
      ctx.rotate((_hash01(h + 3) - 0.5) * 10 * rp);
      ctx.fillStyle = `rgba(${i % 3 ? "120,105,85" : "85,75,62"},${ra.toFixed(3)})`;
      ctx.fillRect(-s / 2, -s / 2, s, s * 0.75);
      ctx.restore();
    }
    _demoLabel(ctx, ts, cx, cy, t("fx.demolition_success"), "120,255,120", lp, 0.25);
  } else {
    // Piccola esplosione che non abbatte la struttura
    _drawExplosion(ctx, ts, { col, row, aoe: 0, noText: true }, Math.min(1, lp / 0.7));
    // Crepe scure che si propagano dal centro e restano visibili
    const cp = Math.min(1, lp / 0.3);
    const ca = 1 - Math.max(0, (lp - 0.6) / 0.4);
    ctx.save();
    ctx.strokeStyle = `rgba(25,18,10,${(0.85 * ca).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.5, ts * 0.025);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      const h = seed + i * 31;
      let a = (i / 4) * Math.PI * 2 + _hash01(h) * 0.8;
      let px = cx,
        py = cy;
      ctx.beginPath();
      ctx.moveTo(px, py);
      const segs = 4;
      for (let s = 1; s <= segs; s++) {
        if (s / segs > cp) break;
        a += (_hash01(h + s) - 0.5) * 1.2; // andamento a zig-zag
        const step = ts * 0.1;
        px += Math.cos(a) * step;
        py += Math.sin(a) * step;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
    _demoLabel(ctx, ts, cx, cy, t("fx.demolition_fail"), "255,130,90", lp, 0.2);
  }
}

// ── EXPLOSION — granate, RPG, artiglieria, mine ─────────────────────────
// Fasi: lampo → onda d'urto → palla di fuoco che si raffredda in fumo, con
// scie di scintille, detriti e bruciatura sul terreno. La dimensione segue il
// raggio AoE dell'arma (data.aoe, default 1 per le mine).
const EXPLOSION_PUFFS = 9;
const EXPLOSION_SPARKS = 12;
const EXPLOSION_DEBRIS = 10;

function _drawExplosion(ctx, ts, data, p) {
  const { col, row } = data;
  const { x, y } = tileToScreen(col, row);
  const cx = x + ts * 0.5,
    cy = y + ts * 0.5;
  const R = ts * (0.55 + 0.4 * (data.aoe ?? 1)); // raggio palla di fuoco
  const seed = col * 31 + row * 57;
  const out = 1 - (1 - p) ** 3; // espansione rapida che rallenta
  const fadeIn = (a, b) => Math.min(1, Math.max(0, (p - a) / (b - a)));

  // 1) Bruciatura sul terreno: compare subito, sparisce sul finale
  _smokePuff(ctx, cx, cy, R * 0.75, "20,14,8", 0.55 * fadeIn(0, 0.08) * (1 - fadeIn(0.7, 1)));

  // 2) Fumo: la palla di fuoco si raffredda in sbuffi scuri che salgono
  const smokeA = fadeIn(0.15, 0.4) * (1 - fadeIn(0.55, 1)) * 0.6;
  for (let i = 0; i < EXPLOSION_PUFFS; i++) {
    const h = seed + i * 11;
    const ang = (i / EXPLOSION_PUFFS) * Math.PI * 2 + _hash01(h) * 0.6;
    const d = R * (0.25 + _hash01(h + 1) * 0.35) * out;
    const r = R * (0.35 + _hash01(h + 2) * 0.2) * (0.6 + 0.6 * out);
    _smokePuff(
      ctx,
      cx + Math.cos(ang) * d,
      cy + Math.sin(ang) * d - R * 0.35 * p,
      r,
      i % 2 ? "58,54,50" : "82,78,72",
      smokeA,
    );
  }

  // 3) Detriti scuri lanciati verso l'esterno, rallentano e si posano
  for (let i = 0; i < EXPLOSION_DEBRIS; i++) {
    const h = seed + i * 23;
    const ang = _hash01(h) * Math.PI * 2;
    const d = R * (0.6 + _hash01(h + 1) * 0.9) * (1 - (1 - Math.min(1, p / 0.6)) ** 2);
    const s = Math.max(1.5, ts * (0.025 + _hash01(h + 2) * 0.025));
    ctx.fillStyle = `rgba(35,28,20,${(0.9 * (1 - fadeIn(0.6, 1))).toFixed(3)})`;
    ctx.fillRect(cx + Math.cos(ang) * d - s / 2, cy + Math.sin(ang) * d - s / 2, s, s);
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // 4) Lampo iniziale accecante
  if (p < 0.15) {
    _smokePuff(ctx, cx, cy, R * (0.9 + p * 2), "255,245,210", 0.95 * (1 - p / 0.15));
  }

  // 5) Onda d'urto: anello sottile che corre verso l'esterno
  if (p < 0.4) {
    const rp = p / 0.4;
    ctx.strokeStyle = `rgba(255,235,190,${(0.7 * (1 - rp)).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.5, ts * 0.04 * (1 - rp));
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.7 * (1 - (1 - rp) ** 2), 0, Math.PI * 2);
    ctx.stroke();
  }

  // 6) Palla di fuoco: sbuffi che passano da bianco-giallo a rosso scuro
  if (p < 0.5) {
    const heat = 1 - p / 0.5;
    const g = Math.floor(90 + 150 * heat),
      b = Math.floor(20 + 140 * heat ** 3);
    for (let i = 0; i < EXPLOSION_PUFFS; i++) {
      const h = seed + i * 11;
      const ang = (i / EXPLOSION_PUFFS) * Math.PI * 2 + _hash01(h) * 0.6;
      const d = R * (0.2 + _hash01(h + 1) * 0.3) * out;
      const r = R * (0.3 + _hash01(h + 2) * 0.18) * (0.5 + 0.7 * out);
      _smokePuff(ctx, cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, r, `255,${g},${b}`, 0.55 * heat);
    }
    _smokePuff(ctx, cx, cy, R * 0.55 * (0.6 + 0.5 * out), "255,250,220", 0.7 * heat ** 2);
  }

  // 7) Scintille: scie luminose radiali
  if (p < 0.55) {
    const sp = p / 0.55;
    ctx.lineCap = "round";
    for (let i = 0; i < EXPLOSION_SPARKS; i++) {
      const h = seed + i * 7;
      const ang = _hash01(h) * Math.PI * 2;
      const reach = R * (1 + _hash01(h + 1) * 0.9);
      const head = reach * (1 - (1 - sp) ** 2);
      const tail = reach * (1 - (1 - Math.max(0, sp - 0.15)) ** 2);
      ctx.strokeStyle = `rgba(255,${Math.floor(220 - sp * 120)},80,${(0.9 * (1 - sp)).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, ts * 0.02);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * tail, cy + Math.sin(ang) * tail);
      ctx.lineTo(cx + Math.cos(ang) * head, cy + Math.sin(ang) * head);
      ctx.stroke();
    }
  }
  ctx.restore();

  // 8) Testo BOOM (data.noText: chi chiama mostra una scritta sua)
  if (!data.noText && p > 0.1 && p < 0.72) {
    const ta = p < 0.4 ? 1 : 1 - (p - 0.4) / 0.32;
    ctx.fillStyle = `rgba(255,240,80,${ta})`;
    ctx.font = `bold ${Math.round(ts * 0.33)}px 'Oswald'`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t("fx.explosion"), cx, cy - ts * 0.3 * p - R * 0.5);
  }
}
