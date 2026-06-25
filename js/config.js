let CONFIG = {};
let WEAPONS_CONFIG = {}; // cls → [{id, label, atk, range, ammo?, aoe?, maxCarriers?}]
const UNIT_IMG_CACHE = {}; // cls → HTMLImageElement (pre-caricato)
const WEAPON_SND_CACHE = {}; // soundPath → HTMLAudioElement (pre-caricato dal campo sound delle armi)
const SFX_CACHE = {}; // sfxKey → HTMLAudioElement (pre-caricato da config.sounds)
const MISSION_SFX_CACHE = {}; // sfxKey → HTMLAudioElement (override per missione corrente)

async function loadConfig() {
  try {
    const resp = await fetch("config.json");
    if (!resp.ok) return;
    CONFIG = await resp.json();
    WEAPONS_CONFIG = CONFIG.weapons || {};
    for (const [cls, path] of Object.entries(CONFIG.unitImages || {})) {
      if (!path) continue;
      const img = new Image();
      img.src = path;
      UNIT_IMG_CACHE[cls] = img;
    }
    for (const [key, path] of Object.entries(CONFIG.sounds || {})) {
      if (!path) continue;
      const a = new Audio(path);
      a.onerror = () => {
        delete SFX_CACHE[key];
      };
      SFX_CACHE[key] = a;
    }
    const _seenSnd = new Set();
    for (const weapons of Object.values(WEAPONS_CONFIG)) {
      for (const w of weapons) {
        if (!w.sound || _seenSnd.has(w.sound)) continue;
        _seenSnd.add(w.sound);
        const a = new Audio(w.sound);
        a.onerror = () => {
          delete WEAPON_SND_CACHE[w.sound];
        };
        WEAPON_SND_CACHE[w.sound] = a;
      }
    }
  } catch (e) {
    // config.json assente o non valido — nessun effetto, si usano gli sprite canvas
  }
}

// Crea l'array di armi per un'unità rispettando il limite maxCarriers per missione
function buildWeapons(cls, carrierCounts) {
  return (WEAPONS_CONFIG[cls] || []).reduce((acc, w) => {
    if (w.maxCarriers != null) {
      const key = cls + ":" + w.id;
      if ((carrierCounts[key] || 0) >= w.maxCarriers) return acc;
      carrierCounts[key] = (carrierCounts[key] || 0) + 1;
    }
    acc.push({ ...w, ammo: w.ammo ?? null });
    return acc;
  }, []);
}
