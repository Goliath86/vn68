function loadMissionSounds(mapData) {
  for (const k of Object.keys(MISSION_SFX_CACHE)) delete MISSION_SFX_CACHE[k];
  for (const [key, path] of Object.entries(mapData.sounds || {})) {
    if (!path) continue;
    const a = new Audio(path);
    a.onerror = () => {
      delete MISSION_SFX_CACHE[key];
    };
    MISSION_SFX_CACHE[key] = a;
  }
}

const AUDIO = {
  ctx: null,
  master: null,
  ambient: null,
  sfxVol: 0.65,
  musicVol: 0.35,
  muted: false,
};

function audioInit() {
  try {
    AUDIO.ctx = new (window.AudioContext || window.webkitAudioContext)();
    AUDIO.master = AUDIO.ctx.createGain();
    AUDIO.master.gain.value = AUDIO.sfxVol;
    AUDIO.master.connect(AUDIO.ctx.destination);
  } catch (e) {
    console.warn("[audio] Web Audio not available");
  }
}

function _audioResume() {
  if (AUDIO.ctx && AUDIO.ctx.state === "suspended") AUDIO.ctx.resume();
}

function sfx(type) {
  if (AUDIO.muted) return;
  const cached = MISSION_SFX_CACHE[type] || SFX_CACHE[type];
  if (cached) {
    const clone = cached.cloneNode();
    clone.volume = AUDIO.sfxVol;
    clone.play().catch(() => {});
    return;
  }
  if (!AUDIO.ctx) return;
  _audioResume();
  const ac = AUDIO.ctx,
    out = AUDIO.master,
    t0 = ac.currentTime;
  switch (type) {
    case "shoot":
      _sfxShoot(ac, out, t0);
      break;
    case "shoot_vc":
      _sfxShoot(ac, out, t0, true);
      break;
    case "move":
      _sfxMove(ac, out, t0);
      break;
    case "hit":
      _sfxHit(ac, out, t0);
      break;
    case "death":
      _sfxDeath(ac, out, t0);
      break;
    case "miss":
      _sfxMiss(ac, out, t0);
      break;
    case "ambush":
      _sfxAmbush(ac, out, t0);
      break;
    case "demolition":
      _sfxDemolition(ac, out, t0);
      break;
    case "heal":
      _sfxHeal(ac, out, t0);
      break;
    case "overwatch":
      _sfxOverwatch(ac, out, t0);
      break;
    case "spawn":
      _sfxSpawn(ac, out, t0);
      break;
    case "turn_end":
      _sfxTurnEnd(ac, out, t0);
      break;
    case "victory":
      _sfxVictory(ac, out, t0);
      break;
    case "defeat":
      _sfxDefeat(ac, out, t0);
      break;
    case "click":
      _sfxClick(ac, out, t0);
      break;
  }
}

function ambientPlay(url) {
  ambientStop();
  if (!url || AUDIO.muted) return;
  const a = new Audio(url);
  a.loop = true;
  a.volume = AUDIO.musicVol;
  a.play().catch(() => {});
  AUDIO.ambient = a;
}

function ambientStop() {
  if (AUDIO.ambient) {
    AUDIO.ambient.pause();
    AUDIO.ambient.src = "";
    AUDIO.ambient = null;
  }
}

function ambientFadeOut(ms = 800) {
  return new Promise((resolve) => {
    const a = AUDIO.ambient;
    if (!a) {
      resolve();
      return;
    }
    const steps = 20;
    const startVol = a.volume;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      a.volume = Math.max(0, startVol * (1 - step / steps));
      if (step >= steps) {
        clearInterval(timer);
        ambientStop();
        resolve();
      }
    }, ms / steps);
  });
}

function audioToggleMute() {
  AUDIO.muted = !AUDIO.muted;
  if (AUDIO.master) AUDIO.master.gain.value = AUDIO.muted ? 0 : AUDIO.sfxVol;
  if (AUDIO.ambient) AUDIO.ambient.volume = AUDIO.muted ? 0 : AUDIO.musicVol;
  document.getElementById("btn-mute").textContent = AUDIO.muted ? "🔇" : "🔊";
}
const _VC_CLS = new Set(["grunt", "sniper_vc", "commander"]);
function sfxShoot(cls, weapon = null) {
  if (AUDIO.muted) return;
  const path = weapon?.sound;
  const a = path ? WEAPON_SND_CACHE[path] : null;
  if (a) {
    const clone = a.cloneNode();
    clone.volume = AUDIO.sfxVol;
    clone.play().catch(() => sfx(_VC_CLS.has(cls) ? "shoot_vc" : "shoot"));
    return;
  }
  sfx(_VC_CLS.has(cls) ? "shoot_vc" : "shoot");
}

// ── Noise buffer helper
function _nb(ac, dur) {
  const len = Math.ceil(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function _osc(ac, type, freq, out, t0, dur, vol, freqEnd) {
  const o = ac.createOscillator(),
    g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g);
  g.connect(out);
  o.start(t0);
  o.stop(t0 + dur + 0.01);
}

function _noise(ac, btype, freq, out, t0, dur, vol, q) {
  const src = ac.createBufferSource();
  src.buffer = _nb(ac, dur);
  const f = ac.createBiquadFilter();
  f.type = btype;
  f.frequency.value = freq;
  if (q) f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t0);
  src.stop(t0 + dur + 0.01);
}

// ── SFX implementations
function _sfxShoot(ac, out, t, vc) {
  // Crack: filtered noise + low thump
  _noise(ac, "bandpass", vc ? 900 : 1300, out, t, 0.1, 0.45, 0.7);
  _osc(ac, "sine", vc ? 100 : 130, out, t, 0.09, 0.35, vc ? 45 : 55);
}
function _sfxMove(ac, out, t) {
  // Soft thud (footstep on earth)
  _noise(ac, "lowpass", 280, out, t, 0.05, 0.14);
  _osc(ac, "sine", 160, out, t, 0.06, 0.12, 70);
}
function _sfxHit(ac, out, t) {
  // Impact
  _noise(ac, "bandpass", 420, out, t, 0.08, 0.3, 1.1);
  _osc(ac, "sine", 90, out, t, 0.07, 0.22, 40);
}
function _sfxMiss(ac, out, t) {
  // Whizz past
  _noise(ac, "highpass", 2200, out, t, 0.07, 0.1);
}
function _sfxDeath(ac, out, t) {
  // Low boom + descending tone
  _noise(ac, "lowpass", 200, out, t, 0.3, 0.5);
  _osc(ac, "sawtooth", 220, out, t, 0.35, 0.28, 40);
}
function _sfxAmbush(ac, out, t) {
  // Two rapid shots + alarm
  _sfxShoot(ac, out, t, true);
  _sfxShoot(ac, out, t + 0.09, true);
  _osc(ac, "square", 880, out, t, 0.14, 0.18);
}
function _sfxDemolition(ac, out, t) {
  // Explosion: rumble + sub
  _noise(ac, "lowpass", 160, out, t, 0.65, 0.7);
  _osc(ac, "sine", 75, out, t, 0.5, 0.58, 22);
  _noise(ac, "bandpass", 900, out, t + 0.05, 0.2, 0.3, 0.5);
}
function _sfxHeal(ac, out, t) {
  [523, 659, 784].forEach((f, i) => {
    const o = ac.createOscillator(),
      g = ac.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t + i * 0.07);
    g.gain.linearRampToValueAtTime(0.16, t + i * 0.07 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.24);
    o.connect(g);
    g.connect(out);
    o.start(t + i * 0.07);
    o.stop(t + i * 0.07 + 0.26);
  });
}
function _sfxOverwatch(ac, out, t) {
  _osc(ac, "triangle", 660, out, t, 0.08, 0.18, 880);
}
function _sfxSpawn(ac, out, t) {
  _osc(ac, "sawtooth", 110, out, t, 0.32, 0.22, 80);
  _noise(ac, "lowpass", 250, out, t, 0.2, 0.15);
}
function _sfxTurnEnd(ac, out, t) {
  [440, 330].forEach((f, i) =>
    _osc(ac, "triangle", f, out, t + i * 0.13, 0.18, 0.14),
  );
}
function _sfxVictory(ac, out, t) {
  [523, 659, 784, 1047].forEach((f, i) =>
    _osc(ac, "square", f, out, t + i * 0.12, 0.28, 0.18),
  );
}
function _sfxDefeat(ac, out, t) {
  [440, 349, 294, 220].forEach((f, i) =>
    _osc(ac, "sawtooth", f, out, t + i * 0.16, 0.38, 0.16),
  );
}
function _sfxClick(ac, out, t) {
  _osc(ac, "triangle", 1100, out, t, 0.04, 0.12);
}
