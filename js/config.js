let CONFIG = {}; // config.json unito alle mod attive (applyConfigData)
let CONFIG_FILE = null; // config.json così com'è, per il validatore
let WEAPONS_CONFIG = {}; // cls → [{id, label, atk, range, ammo?, aoe?, maxCarriers?}]
const UNIT_IMG_CACHE = {}; // cls → HTMLImageElement (pre-caricato)
const WEAPON_SND_CACHE = {}; // soundPath → HTMLAudioElement (pre-caricato dal campo sound delle armi)
const SFX_CACHE = {}; // sfxKey → HTMLAudioElement (pre-caricato da config.sounds)
const MISSION_SFX_CACHE = {}; // sfxKey → HTMLAudioElement (override per missione corrente)

async function loadConfig() {
  try {
    const resp = await fetch("config.json");
    if (!resp.ok) return;
    CONFIG_FILE = parseJsonText(await resp.text(), "config.json");
    applyConfigData(CONFIG_FILE);
  } catch (e) {
    // config.json assente o non valido — nessun effetto, si usano gli sprite
    // canvas; un errore di sintassi va in console all'avvio (init.js)
    if (e.issues) LOAD_ISSUES.push(e);
  }
}

// Unisce una configurazione (config.json, poi il campo "config" di ogni mod
// attiva, mods.js) a quella corrente: musica, immagini e suoni sostituiti per
// chiave, armi come nella mappa (array = loadout nuovo, oggetto = modifiche
// per id), classi e composizioni unite in profondità
function applyConfigData(cfg) {
  if (!cfg || typeof cfg !== "object") return;
  if (cfg.menuMusic) CONFIG.menuMusic = cfg.menuMusic;
  if (cfg.unitImages) CONFIG.unitImages = { ...CONFIG.unitImages, ...cfg.unitImages };
  if (cfg.sounds) CONFIG.sounds = { ...CONFIG.sounds, ...cfg.sounds };
  for (const [cls, ws] of Object.entries(cfg.weapons || {})) {
    WEAPONS_CONFIG[cls] = patchWeapons(WEAPONS_CONFIG[cls] || [], ws);
  }
  // Classi US modificate o nuove (le nuove partono dalle statistiche
  // dell'assalto, col nome della chiave finché "labels" non ne dà uno)
  for (const [cls, def] of Object.entries(cfg.unitClasses || {})) {
    if (ENEMY_CLASSES[cls]) console.warn(`[config] unitClasses.${cls}: nome già usato da una classe VC`);
    const base = UNIT_CLASSES[cls] || {
      ...UNIT_CLASSES.assault,
      name: cls,
      desc: "",
      symbol: cls.charAt(0).toUpperCase(),
    };
    UNIT_CLASSES[cls] = deepMerge(deepMerge({}, base), def);
  }
  // Classi VC modificate o nuove (le nuove partono dal guerrigliero) e
  // composizione di default
  for (const [cls, def] of Object.entries(cfg.enemyClasses || {})) {
    ENEMY_CLASSES[cls] = deepMerge(deepMerge({}, ENEMY_CLASSES[cls] || ENEMY_CLASSES.grunt), def);
  }
  deepMerge(VC_MIX, cfg.vcMix);
}

// File da scaricare prima del menu: musica, sprite, SFX e suoni delle armi
function configAssetPaths() {
  const weaponSounds = Object.values(WEAPONS_CONFIG).flatMap((ws) => ws.map((w) => w.sound));
  return [
    CONFIG.menuMusic,
    ...Object.values(CONFIG.unitImages || {}),
    ...Object.values(CONFIG.sounds || {}),
    ...weaponSounds,
  ].filter(Boolean);
}

// Crea le cache di sprite e suoni dai file già scaricati; attende che gli
// sprite siano decodificati, così la prima partita non mostra i segnaposto
async function buildAssetCaches() {
  const decoding = [];
  for (const [cls, path] of Object.entries(CONFIG.unitImages || {})) {
    if (!path) continue;
    const img = new Image();
    decoding.push(new Promise((r) => (img.onload = img.onerror = r)));
    img.src = assetUrl(path);
    UNIT_IMG_CACHE[cls] = img;
  }
  for (const [key, path] of Object.entries(CONFIG.sounds || {})) {
    if (!path) continue;
    const a = new Audio(assetUrl(path));
    a.onerror = () => {
      delete SFX_CACHE[key];
    };
    SFX_CACHE[key] = a;
  }
  for (const weapons of Object.values(WEAPONS_CONFIG)) {
    for (const w of weapons) {
      if (!w.sound || WEAPON_SND_CACHE[w.sound]) continue;
      const a = new Audio(assetUrl(w.sound));
      a.onerror = () => {
        delete WEAPON_SND_CACHE[w.sound];
      };
      WEAPON_SND_CACHE[w.sound] = a;
    }
  }
  await Promise.all(decoding);
}

// ── PRECARICAMENTO ASSET ───────────────────────────────────────────────
// La schermata di caricamento (init.js) scarica immagini e audio prima di
// aprire il menu: ogni file diventa un blob locale (object URL), quindi
// musica e sprite sono pronti da subito anche dove il browser non
// precarica l'audio (iOS). Un file mancante si salta: resta il percorso
// originale e quindi il fallback (sprite canvas, SFX sintetizzati).
const ASSET_BLOBS = {}; // percorso → object URL

function assetUrl(path) {
  return ASSET_BLOBS[path] || path;
}

// Scarica un file; onBytes(ricevuti, totale|0) durante il download
async function _fetchAsset(path, onBytes) {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`${path}: ${resp.status}`);
  const total = +resp.headers.get("Content-Length") || 0;
  const type = resp.headers.get("Content-Type") || "";
  if (!resp.body) return resp.blob();
  const reader = resp.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onBytes(got, total);
  }
  return new Blob(chunks, { type });
}

// Scarica `paths` in parallelo; onProgress(frazione 0..1) pesata sui byte
// (i file di cui non si conosce ancora la dimensione valgono la media)
async function preloadAssets(paths, onProgress = () => {}) {
  const list = [...new Set(paths)].filter((p) => p && !ASSET_BLOBS[p]);
  const got = list.map(() => 0);
  const size = list.map(() => 0);
  const report = () => {
    const known = size.filter((s) => s > 0);
    const avg = known.length ? known.reduce((s, x) => s + x, 0) / known.length : 1;
    const total = size.reduce((s, x) => s + (x || avg), 0);
    const done = got.reduce((s, x, i) => s + Math.min(x, size[i] || avg), 0);
    onProgress(list.length ? Math.min(1, done / total) : 1);
  };
  report();
  await Promise.all(
    list.map(async (path, i) => {
      try {
        const blob = await _fetchAsset(path, (g, total) => {
          got[i] = g;
          size[i] = Math.max(total, g);
          report();
        });
        ASSET_BLOBS[path] = URL.createObjectURL(blob);
      } catch (e) {
        console.warn("[assets] non scaricato:", path);
      }
      size[i] = size[i] || got[i] || 1;
      got[i] = size[i];
      report();
    }),
  );
}

// Armi con caricatore (`mag`): parte carica; `mags` = caricatori di riserva
// (null/assente = illimitati)
function initWeaponMag(w) {
  if (w.mag) {
    w.loaded = w.loaded ?? w.mag;
    w.mags = w.mags ?? null;
  }
  return w;
}

// Armi di una classe nella missione corrente. Il JSON della mappa può
// sostituire il loadout ("weapons": { "assault": [ … ] }) oppure cambiarne
// singole armi per id ("weapons": { "assault": { "grenade": { "ammo": 4 },
// "smoke": null } }: campi uniti all'arma, null la toglie, un id nuovo
// aggiunge l'arma in fondo)
function classWeapons(cls, md = G.mapData) {
  const base = WEAPONS_CONFIG[cls] || [];
  const ov = md?.weapons?.[cls];
  return ov ? patchWeapons(base, ov) : base;
}

// Loadout modificato: un array lo sostituisce, un oggetto cambia le armi per id
function patchWeapons(base, ov) {
  if (Array.isArray(ov)) return ov;
  const out = base
    .filter((w) => ov[w.id] !== null)
    .map((w) => (ov[w.id] ? { ...w, ...ov[w.id] } : w));
  for (const [id, w] of Object.entries(ov)) {
    if (w && !base.some((b) => b.id === id)) out.push({ id, ...w });
  }
  return out;
}

// Suoni delle armi definite da una mappa (da precaricare come quelli di config.json)
function missionWeaponSounds(md) {
  return Object.keys(md?.weapons || {})
    .flatMap((cls) => classWeapons(cls, md).map((w) => w.sound))
    .filter(Boolean);
}

// Crea l'array di armi per un'unità rispettando il limite maxCarriers per missione
function buildWeapons(cls, carrierCounts) {
  return classWeapons(cls).reduce((acc, w) => {
    if (w.maxCarriers != null) {
      const key = cls + ":" + w.id;
      if ((carrierCounts[key] || 0) >= w.maxCarriers) return acc;
      carrierCounts[key] = (carrierCounts[key] || 0) + 1;
    }
    acc.push(initWeaponMag({ ...w, ammo: w.ammo ?? null }));
    return acc;
  }, []);
}
