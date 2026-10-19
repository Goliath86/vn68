// ── SCHEMA DEI DATI ────────────────────────────────────────────────────
// Descrizione unica dei JSON moddabili: mappe (missions/*.json, lezioni del
// tutorial), catalogo, indice del tutorial e config.json. Lo legge il
// validatore (js/validate.js) nel gioco e in tools/validate.js; servirà anche
// a generare la guida ai campi e i moduli dell'editor di mappe.
//
// Ogni nodo: { type, req?, d?: [it, en], … }
//   type   "number" | "int" | "bool" | "string" | "null" | "object" | "map" |
//          "array" | "cell" | "zone" | "any"; un array di nodi = uno a scelta
//          (il primo il cui tipo combacia)
//   req    obbligatorio
//   d      descrizione [italiano, inglese]
//   min/max (number/int), allowed (string: valori ammessi), ref (string/map:
//   riferimento controllato da validate.js:VALIDATION_REFS)
//   object: fields { nome: nodo }, internal: campi scritti dal gioco
//           (accettati senza avvisi), open: campi extra accettati
//   map:    chiavi libere → values; keyRef (riferimento sulle chiavi),
//           keyValues (chiavi ammesse)
//   array:  items, minItems, len (lunghezza esatta)
// Nessuna logica qui: i controlli incrociati (griglia, coordinate,
// raggiungibilità…) stanno in validate.js.

const _sc = {
  num: (o = {}) => ({ type: "number", ...o }),
  int: (o = {}) => ({ type: "int", ...o }),
  bool: (o = {}) => ({ type: "bool", ...o }),
  str: (o = {}) => ({ type: "string", ...o }),
  obj: (fields, o = {}) => ({ type: "object", fields, ...o }),
  map: (values, o = {}) => ({ type: "map", values, ...o }),
  arr: (items, o = {}) => ({ type: "array", items, ...o }),
  one: (...nodes) => nodes,
};

// Testo in una lingua o per lingua ({ "it": …, "en": … })
const SCHEMA_TEXT = _sc.one(_sc.str(), _sc.map(_sc.str()));
const SCHEMA_CELL = {
  type: "cell",
  d: ["Tile { col, row } (da 0, in alto a sinistra)", "Tile { col, row } (from 0, top left)"],
};
const SCHEMA_ZONE = {
  type: "zone",
  d: ["Rettangolo { colMin, colMax, rowMin, rowMax } (estremi inclusi)", "Rectangle { colMin, colMax, rowMin, rowMax } (inclusive)"],
};
const SCHEMA_RATE = (d) => _sc.num({ min: 0, max: 1, d });

// Effetti sonori sostituibili (sounds.js:sfx); gli spari si configurano per arma
const SFX_KEYS = [
  "move", "hit", "death", "miss", "ambush", "demolition", "disarm", "melee", "reload", "heal",
  "overwatch", "spawn", "turn_end", "victory", "defeat", "click", "jet", "napalm",
];
const TUTORIAL_EVENTS = [
  "select", "move", "rotate", "stance", "attack", "kill", "aoe", "reload", "firstaid", "special",
  "trapFound", "tunnelFound", "endTurn", "turnStart",
];

const SCHEMA_TILE_ANIM = _sc.obj({
  col: _sc.int({ req: true, min: 0 }),
  row: _sc.int({ req: true, min: 0 }),
  type: _sc.str({ req: true, allowed: ["smoke", "fire", "fog"], d: ["Fumo, fiamme o nebbia", "Smoke, fire or fog"] }),
});

// ── Armi ────────────────────────────────────────────────────────────────
const SCHEMA_WEAPON_FIELDS = {
  id: _sc.str({ req: true, d: ["Identificatore interno", "Internal identifier"] }),
  label: _sc.str({ d: ["Nome mostrato (italiano)", "Displayed name (Italian)"] }),
  labelEn: _sc.str({ d: ["Nome mostrato in inglese (default: label)", "Displayed name in English (default: label)"] }),
  atk: _sc.num({ min: 0, d: ["ATK dell'arma (sostituisce quello della classe)", "Weapon ATK (replaces the class one)"] }),
  range: _sc.int({ min: 0, d: ["Gittata massima in tile", "Maximum range in tiles"] }),
  ammo: _sc.one(_sc.int({ min: 0 }), { type: "null" }),
  mag: _sc.int({ min: 1, d: ["Colpi per caricatore (solo US)", "Rounds per magazine (US only)"] }),
  mags: _sc.one(_sc.int({ min: 0 }), { type: "null" }),
  reloadAp: _sc.int({ min: 0, d: ["AP per ricaricare (default 1)", "AP to reload (default 1)"] }),
  shotsPerTurn: _sc.int({ min: 1, d: ["Attacchi massimi per turno", "Maximum attacks per turn"] }),
  aoe: _sc.int({ min: 0, d: ["Raggio dell'area d'effetto", "Area of effect radius"] }),
  minRange: _sc.int({ min: 0, d: ["Gittata minima (armi AoE, default aoe + 1)", "Minimum range (AoE weapons, default aoe + 1)"] }),
  maxCarriers: _sc.int({ min: 0, d: ["Portatori massimi per missione", "Maximum carriers per mission"] }),
  rangePenalty: _sc.bool({ d: ["Penalità di gittata (−1 ATK ogni 2 tile)", "Range penalty (−1 ATK every 2 tiles)"] }),
  noise: _sc.num({ min: 0, d: ["Raggio del rumore in tile", "Noise radius in tiles"] }),
  melee: _sc.bool({ d: ["Arma bianca (solo US)", "Melee weapon (US only)"] }),
  rounds: _sc.int({ min: 1, max: 5, d: ["Traccianti per attacco (solo grafica)", "Tracers per attack (visual only)"] }),
  smoke: _sc.int({ min: 1, d: ["Fumogeno: turni di fumo", "Smoke grenade: turns of smoke"] }),
  artillery: _sc.bool({ d: ["Richiesta d'artiglieria", "Artillery request"] }),
  thrown: _sc.bool({ d: ["Lancio a mano con rimbalzi", "Hand thrown, with bounces"] }),
  scatter: _sc.int({ min: 0, d: ["Raggio della deviazione", "Scatter radius"] }),
  scatterChance: SCHEMA_RATE(["Probabilità di deviare (default 0.5)", "Chance to scatter (default 0.5)"]),
  napalm: _sc.bool({ d: ["Attacco aereo al napalm su una linea", "Napalm air strike along a line"] }),
  length: _sc.int({ min: 1, d: ["Lunghezza massima della linea di napalm", "Maximum napalm line length"] }),
  shells: _sc.one(_sc.int({ min: 1 }), _sc.arr(_sc.int({ min: 1 }), { len: 2 })),
  sound: _sc.str({ ref: "file", d: ["Suono dello sparo", "Firing sound"] }),
};
const SCHEMA_WEAPON = _sc.obj(SCHEMA_WEAPON_FIELDS, { d: ["Arma", "Weapon"] });
// Modifica di un'arma esistente per id (campi parziali) o nuova arma; null la toglie
const SCHEMA_WEAPON_PATCH = _sc.one(
  { type: "null" },
  _sc.obj({ ...SCHEMA_WEAPON_FIELDS, id: _sc.str() }),
);

// ── Classi ──────────────────────────────────────────────────────────────
const SCHEMA_UNIT_CLASS = _sc.obj({
  labels: _sc.map(_sc.obj({ name: _sc.str(), desc: _sc.str(), special: _sc.str() }), {
    d: ["Testi per lingua: name, desc, special", "Texts per language: name, desc, special"],
  }),
  symbol: _sc.str({ d: ["Lettera del distintivo", "Badge letter"] }),
  color: _sc.str({ ref: "color", d: ["Colore del distintivo", "Badge color"] }),
  hp: _sc.int({ min: 1 }),
  move: _sc.int({ min: 0 }),
  attack: _sc.num({ min: 0 }),
  defense: _sc.num({ min: 0 }),
  range: _sc.int({ min: 0 }),
  vision: _sc.int({ min: 0 }),
  special: _sc.one(_sc.str({ allowed: ["suppression", "overwatch", "demolition", "heal"] }), { type: "null" }),
  marksman: _sc.bool({ d: ["Tiratore scelto", "Marksman"] }),
  trapSense: _sc.bool({ d: ["Individua trappole e tunnel", "Spots traps and tunnels"] }),
  sprite: _sc.str({ allowed: ["assault", "sniper", "engineer", "medic"], d: ["Sprite disegnato da usare", "Drawn sprite to use"] }),
}, { internal: ["name", "desc", "specialLabel"] });

const SCHEMA_ENEMY_CLASS = _sc.obj({
  name: _sc.one(_sc.int({ min: 0 }), _sc.map(_sc.str())),
  role: _sc.str({ allowed: ["rifleman", "sniper", "commander"] }),
  hp: _sc.int({ min: 1 }),
  ap: _sc.int({ min: 0 }),
  attack: _sc.num({ min: 0 }),
  range: _sc.int({ min: 0 }),
  defense: _sc.num({ min: 0 }),
  move: _sc.int({ min: 0 }),
  sprite: _sc.str({ allowed: ["grunt", "sniper_vc", "commander"] }),
});

const SCHEMA_VC_MIX = _sc.map(_sc.num({ min: 0 }), {
  keyRef: "enemyClass",
  d: ["Pesi per classe VC", "Weights per VC class"],
});

// ── Tile ────────────────────────────────────────────────────────────────
const SCHEMA_TILE_TYPE = _sc.obj({
  id: _sc.str({ req: true, d: ["Identificatore (usato in tileLabels)", "Identifier (used in tileLabels)"] }),
  label: _sc.str({ d: ["Nome di default", "Default name"] }),
  moveCost: _sc.num({ min: 0, d: ["AP per attraversarlo", "AP to cross it"] }),
  coverBonus: _sc.num({ min: 0, d: ["Bonus difesa a chi lo occupa", "Defense bonus to its occupant"] }),
  color: _sc.str({ ref: "color", d: ["Colore del disegno procedurale", "Procedural drawing color"] }),
  texture: _sc.str({ ref: "texture", d: ["Aspetto: terreno noto o immagine", "Look: known terrain or image"] }),
  impassable: _sc.bool({ d: ["Blocca il movimento", "Blocks movement"] }),
  losBlock: _sc.str({ allowed: ["full", "partial"], d: ["Blocca (full) o riduce (partial) la vista", "Blocks (full) or reduces (partial) sight"] }),
  burnable: _sc.bool({ d: ["Si può incendiare", "Can be set on fire"] }),
  demolishable: _sc.bool({ d: ["Il geniere può demolirlo", "The engineer can demolish it"] }),
  demolishResult: _sc.str({ ref: "tileKey", d: ["Tile dopo la demolizione", "Tile after demolition"] }),
  blastResult: _sc.one(_sc.str({ ref: "tileKey" }), _sc.bool()),
});

// ── Mappa ───────────────────────────────────────────────────────────────
const SCHEMA_TRANSLATION = _sc.obj({
  name: _sc.str(),
  description: _sc.str(),
  tileLabels: _sc.map(_sc.str(), { d: ["Nomi dei tile per id", "Tile names by id"] }),
  objectives: _sc.obj({
    recon: _sc.arr(_sc.obj({ label: _sc.str() })),
    capture_objective: _sc.arr(_sc.obj({ label: _sc.str() })),
  }),
  tutorial: _sc.map(_sc.str(), { d: ["Testi dei passi per id", "Step texts by id"] }),
});

const SCHEMA_TUTORIAL = _sc.obj({
  missionType: _sc.str({ req: true, ref: "missionType" }),
  steps: _sc.arr(
    _sc.obj({
      id: _sc.str({ req: true }),
      until: _sc.one(
        _sc.str({ allowed: ["next"] }),
        _sc.obj({ event: _sc.str({ req: true, allowed: TUTORIAL_EVENTS }), at: SCHEMA_CELL, within: _sc.int({ min: 0 }) }, { open: true }),
      ),
      highlight: SCHEMA_CELL,
      ui: _sc.arr(_sc.str()),
      fresh: _sc.bool(),
    }),
    { req: true, minItems: 1 },
  ),
}, { internal: ["lessonId"] });

const SCHEMA_MISSION = _sc.obj({
  name: SCHEMA_TEXT,
  description: SCHEMA_TEXT,
  cols: _sc.int({ req: true, min: 1, d: ["Colonne della griglia", "Grid columns"] }),
  rows: _sc.int({ req: true, min: 1, d: ["Righe della griglia", "Grid rows"] }),
  width: _sc.num({ d: ["(informativo) larghezza dell'immagine", "(informative) image width"] }),
  height: _sc.num({ d: ["(informativo) altezza dell'immagine", "(informative) image height"] }),
  tileSize: _sc.num({ d: ["(informativo) lato del tile in pixel", "(informative) tile side in pixels"] }),
  image: _sc.str({ ref: "missionImage", d: ["Immagine di sfondo in missions/", "Background image in missions/"] }),
  ambient: _sc.str({ ref: "file", d: ["Musica d'ambiente", "Ambient music"] }),
  sounds: _sc.map(_sc.str({ ref: "file" }), { keyValues: SFX_KEYS, d: ["Effetti sonori della mappa", "Map sound effects"] }),
  tileTypes: _sc.map(SCHEMA_TILE_TYPE, { req: true, d: ["Tipi di tile per carattere della griglia", "Tile types by grid character"] }),
  grid: _sc.arr(_sc.one(_sc.str(), _sc.arr(_sc.str())), { req: true, minItems: 1 }),
  playerStart: _sc.arr(SCHEMA_CELL, { d: ["Posizioni di partenza della squadra", "Squad start positions"] }),
  vcSpawnZones: _sc.arr(SCHEMA_ZONE),
  vcCount: _sc.int({ min: 0, d: ["VC iniziali (default 6)", "Initial VC (default 6)"] }),
  reinforcementTurn: _sc.int({ min: 1 }),
  reinforcementCount: _sc.int({ min: 0 }),
  vcAmbushTurn: _sc.int({ min: 1 }),
  vcAmbushCount: _sc.int({ min: 0 }),
  vcAmbushZones: _sc.arr(SCHEMA_ZONE),
  ambushChance: SCHEMA_RATE(["Probabilità di fuoco d'imboscata per turno", "Ambush fire chance per turn"]),
  trapCount: _sc.int({ min: 0 }),
  trapZones: _sc.arr(SCHEMA_ZONE),
  traps: _sc.arr(_sc.obj({
    col: _sc.int({ req: true, min: 0 }),
    row: _sc.int({ req: true, min: 0 }),
    type: _sc.str({ allowed: ["punji", "mine"] }),
    dmg: _sc.int({ min: 0 }),
  })),
  tunnels: _sc.arr(SCHEMA_CELL),
  tunnelCount: _sc.int({ min: 0 }),
  vcTrapPlantMax: _sc.int({ min: 0 }),
  night: _sc.bool(),
  vcNoise: _sc.bool(),
  nightVisionPenalty: _sc.int({ min: 0 }),
  vcNightPenalty: _sc.int({ min: 0 }),
  bleedStopChance: SCHEMA_RATE(["Probabilità che un'emorragia si fermi da sola", "Chance a bleed stops by itself"]),
  rain: _sc.one(_sc.bool(), _sc.obj({
    chance: SCHEMA_RATE(),
    minTurns: _sc.int({ min: 1 }),
    maxTurns: _sc.int({ min: 1 }),
    fromStart: _sc.bool(),
  })),
  mist: _sc.one(_sc.bool(), _sc.obj({ tiles: _sc.arr(_sc.str()), density: _sc.num({ min: 0 }) })),
  temperature: _sc.obj({
    day: _sc.arr(_sc.num(), { len: 2 }),
    night: _sc.arr(_sc.num(), { len: 2 }),
  }),
  cloudy: SCHEMA_RATE(["Probabilità di cielo coperto", "Chance of overcast sky"]),
  squad: _sc.arr(_sc.obj({
    cls: _sc.str({ req: true, ref: "unitClass" }),
    col: _sc.int({ req: true, min: 0 }),
    row: _sc.int({ req: true, min: 0 }),
    facing: _sc.int({ min: 0, max: 3 }),
    hp: _sc.int({ min: 1 }),
    bleeding: _sc.bool(),
    stance: _sc.str({ allowed: ["stand", "crouch", "prone"] }),
  })),
  enemies: _sc.arr(_sc.obj({
    cls: _sc.str({ ref: "enemyClass" }),
    col: _sc.int({ req: true, min: 0 }),
    row: _sc.int({ req: true, min: 0 }),
    facing: _sc.int({ min: 0, max: 3 }),
    alerted: _sc.bool(),
    hold: _sc.bool(),
    hp: _sc.int({ min: 1 }),
  })),
  supportedMissions: _sc.arr(_sc.str({ ref: "missionType" })),
  objectives: _sc.obj({
    recon: _sc.arr(_sc.obj({ col: _sc.int({ req: true, min: 0 }), row: _sc.int({ req: true, min: 0 }), label: _sc.str() })),
    search_destroy: _sc.obj({
      eliminateAll: _sc.bool(),
      minKills: _sc.int({ min: 1 }),
      tileAnimations: _sc.arr(SCHEMA_TILE_ANIM),
    }),
    rescue_pilot: _sc.obj({
      pilotCol: _sc.int({ req: true, min: 0 }),
      pilotRow: _sc.int({ req: true, min: 0 }),
      extractCol: _sc.int({ req: true, min: 0 }),
      extractRow: _sc.int({ req: true, min: 0 }),
      tileAnimations: _sc.arr(SCHEMA_TILE_ANIM),
    }),
    capture_objective: _sc.arr(_sc.obj({
      col: _sc.int({ req: true, min: 0 }),
      row: _sc.int({ req: true, min: 0 }),
      label: _sc.str(),
      holdTurns: _sc.int({ min: 1 }),
    })),
  }),
  tileAnimations: _sc.arr(SCHEMA_TILE_ANIM),
  weapons: _sc.map(_sc.one(_sc.arr(SCHEMA_WEAPON), _sc.map(SCHEMA_WEAPON_PATCH)), {
    keyRef: "anyClass",
    d: ["Armi per classe: array = loadout nuovo, oggetto = modifiche per id", "Weapons per class: array = new loadout, object = changes by id"],
  }),
  vcMix: SCHEMA_VC_MIX,
  ambushMix: SCHEMA_VC_MIX,
  reinforcementMix: SCHEMA_VC_MIX,
  tuning: _sc.map({ type: "any" }, { keyRef: "tunable", d: ["Parametri di bilanciamento", "Balance parameters"] }),
  translations: _sc.map(SCHEMA_TRANSLATION, { d: ["Testi per lingua", "Texts per language"] }),
  tutorial: SCHEMA_TUTORIAL,
}, {
  // Scritti dai generatori procedurali
  internal: ["procedural", "seed", "size", "layout", "startEdge"],
});

// ── Catalogo, indice del tutorial, config.json ─────────────────────────
const SCHEMA_CATALOG_ENTRY = _sc.obj({
  file: _sc.str({ ref: "missionFile" }),
  generator: _sc.str({ ref: "generator" }),
  tutorial: _sc.bool(),
  icon: _sc.str(),
  color: _sc.str({ ref: "color" }),
  theaterColor: _sc.str({ ref: "color" }),
  labels: _sc.map(_sc.obj({ label: _sc.str(), subtitle: _sc.str(), theater: _sc.str() })),
});
const SCHEMA_CATALOG = _sc.arr(SCHEMA_CATALOG_ENTRY, { req: true });

const SCHEMA_TUTORIAL_INDEX = _sc.obj({
  tileTypes: _sc.map(SCHEMA_TILE_TYPE),
  tileLabels: _sc.map(_sc.map(_sc.str())),
  lessons: _sc.arr(_sc.obj({
    id: _sc.str({ req: true }),
    file: _sc.str({ req: true, ref: "tutorialFile" }),
    icon: _sc.str(),
    classes: _sc.arr(_sc.str({ ref: "unitClass" })),
    labels: _sc.map(_sc.obj({ title: _sc.str(), desc: _sc.str() })),
  }), { req: true }),
});

const SCHEMA_CONFIG = _sc.obj({
  menuMusic: _sc.str({ ref: "file" }),
  unitImages: _sc.map(_sc.str({ ref: "file" }), { keyRef: "anyClass" }),
  sounds: _sc.map(_sc.str({ ref: "file" }), { keyValues: SFX_KEYS }),
  weapons: _sc.map(_sc.arr(SCHEMA_WEAPON), { keyRef: "anyClass" }),
  unitClasses: _sc.map(SCHEMA_UNIT_CLASS),
  enemyClasses: _sc.map(SCHEMA_ENEMY_CLASS),
  vcMix: _sc.obj({ spawn: SCHEMA_VC_MIX, ambush: SCHEMA_VC_MIX, reinforcement: SCHEMA_VC_MIX }),
});
