// ── SCHEMA DEI DATI ────────────────────────────────────────────────────
// Descrizione unica dei JSON moddabili: mappe (missions/*.json, lezioni del
// tutorial), catalogo, indice del tutorial e config.json. Lo legge il
// validatore (js/validate.js) nel gioco e in tools/validate.js; da qui
// tools/schema-docs.js genera la guida ai campi (docs/FIELDS*.md) e i JSON
// Schema per l'editor (schemas/): dopo una modifica va rilanciato.
//
// Ogni nodo: { type, req?, d?: [it, en], … }
//   type   "number" | "int" | "bool" | "string" | "null" | "object" | "map" |
//          "array" | "cell" | "zone" | "any"; un array di nodi = uno a scelta
//          (il primo il cui tipo combacia)
//   req    obbligatorio
//   d      descrizione [italiano, inglese] (Markdown, finisce nella guida)
//   min/max (number/int), allowed (string: valori ammessi), ref (string/map:
//   riferimento controllato da validate.js:VALIDATION_REFS)
//   object: fields { nome: nodo }, internal: campi scritti dal gioco
//           (accettati senza avvisi), open: campi extra accettati
//   map:    chiavi libere → values; keyRef (riferimento sulle chiavi),
//           keyValues (chiavi ammesse), key: [it, en] nome della chiave
//           nella guida (default "chiave")
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
const SCHEMA_TEXT = () => _sc.one(_sc.str(), _sc.map(_sc.str(), { key: ["lingua", "language"] }));
const SCHEMA_CELL = {
  type: "cell",
  d: ["Tile { col, row } (da 0, in alto a sinistra)", "Tile { col, row } (from 0, top left)"],
};
const SCHEMA_ZONE = {
  type: "zone",
  d: ["Rettangolo { colMin, colMax, rowMin, rowMax } (estremi inclusi)", "Rectangle { colMin, colMax, rowMin, rowMax } (inclusive)"],
};
const SCHEMA_RATE = (d) => _sc.num({ min: 0, max: 1, d });
const SCHEMA_COL = (d) => _sc.int({ req: true, min: 0, d: d || ["Colonna (da 0)", "Column (from 0)"] });
const SCHEMA_ROW = (d) => _sc.int({ req: true, min: 0, d: d || ["Riga (da 0)", "Row (from 0)"] });
const SCHEMA_FACING = _sc.int({ min: 0, max: 3, d: ["Orientamento: 0 nord, 1 est, 2 sud, 3 ovest", "Facing: 0 north, 1 east, 2 south, 3 west"] });
const SCHEMA_LANGS = { key: ["lingua", "language"] };
// Campo "$schema" letto dagli editor (VS Code, Zed…) per l'autocompletamento
const SCHEMA_SCHEMA = _sc.str({ d: ["Percorso del JSON Schema per l'editor (es. `../schemas/mission.schema.json`); ignorato dal gioco", "Path of the JSON Schema for the editor (e.g. `../schemas/mission.schema.json`); ignored by the game"] });

// Effetti sonori sostituibili (sounds.js:sfx); gli spari si configurano per arma
const SFX_KEYS = [
  "move", "stance", "hit", "death", "miss", "ambush", "demolition", "disarm", "melee", "reload", "heal",
  "overwatch", "spawn", "turn_end", "victory", "defeat", "click", "jet", "napalm",
];
const TUTORIAL_EVENTS = [
  "select", "move", "rotate", "stance", "attack", "kill", "aoe", "reload", "firstaid", "special",
  "trapFound", "tunnelFound", "endTurn", "turnStart",
];

const SCHEMA_TILE_ANIM = _sc.obj({
  col: SCHEMA_COL(),
  row: SCHEMA_ROW(),
  type: _sc.str({ req: true, allowed: ["smoke", "fire", "fog"], d: ["Fumo, fiamme o nebbia", "Smoke, fire or fog"] }),
});
const SCHEMA_TILE_ANIMS = (d) => _sc.arr(SCHEMA_TILE_ANIM, { d });

// ── Armi ────────────────────────────────────────────────────────────────
const SCHEMA_WEAPON_FIELDS = {
  id: _sc.str({ req: true, d: ["Identificatore interno", "Internal identifier"] }),
  label: _sc.str({ d: ["Nome mostrato in italiano", "Displayed name in Italian"] }),
  labelEn: _sc.str({ d: ["Nome mostrato in inglese; senza, anche in inglese si usa `label`", "Displayed name in English; without it, `label` is shown in English too"] }),
  atk: _sc.num({ min: 0, d: ["ATK dell'arma (sostituisce quello della classe)", "Weapon ATK (replaces the class one)"] }),
  range: _sc.int({ min: 0, d: ["Gittata massima in tile", "Maximum range in tiles"] }),
  ammo: _sc.one(_sc.int({ min: 0 }), { type: "null" }),
  mag: _sc.int({ min: 1, d: [
    "Solo US. Colpi per caricatore: ogni attacco (e ogni overwatch o raffica di soppressione) ne consuma 1; a caricatore vuoto serve ricaricare",
    "US only. Rounds per magazine: every attack (and every overwatch shot or suppression burst) uses 1; an empty magazine must be reloaded",
  ] }),
  mags: _sc.one(_sc.int({ min: 0 }), { type: "null" }),
  reloadAp: _sc.int({ min: 0, d: ["Con `mag`: AP per ricaricare; default 1", "With `mag`: AP to reload; default 1"] }),
  shotsPerTurn: _sc.int({ min: 1, d: ["Attacchi massimi per turno con quest'arma (il cecchino: 1)", "Maximum attacks per turn with this weapon (sniper: 1)"] }),
  aoe: _sc.int({ min: 0, d: [
    "Raggio dell'area d'effetto (distanza Manhattan): attacco risolto senza dado manuale, colpisce US e VC nel raggio",
    "Area of effect radius (Manhattan distance): resolved without a manual roll, hits US and VC in range",
  ] }),
  minRange: _sc.int({ min: 0, d: ["Solo armi AoE. Gittata minima in tile; default `aoe + 1`, così chi lancia non è mai nel raggio", "AoE weapons only. Minimum range in tiles; default `aoe + 1`, so the thrower is never inside the blast"] }),
  maxCarriers: _sc.int({ min: 0, d: ["Unità per missione che possono portare quest'arma (contatori separati per squadra US e VC)", "Units per mission that can carry this weapon (separate counters for the US squad and the VC)"] }),
  rangePenalty: _sc.bool({ d: [
    "Solo US. Penalità di gittata (−1 ATK ogni 2 tile), anche in overwatch; se assente vale solo per le classi `marksman`",
    "US only. Range penalty (−1 ATK every 2 tiles), overwatch included; when absent it applies only to `marksman` classes",
  ] }),
  noise: _sc.num({ min: 0, d: [
    "Raggio del rumore in tile: i VC entro questa distanza si allertano. Armi US: dal tiratore per le armi dirette, dal punto d'impatto per le AoE; armi VC: sempre dal tiratore. Default 4 (diretta) / 6 (AoE)",
    "Noise radius in tiles: VC within this distance become alerted. US weapons: from the shooter for direct weapons, from the impact point for AoE; VC weapons: always from the shooter. Default 4 (direct) / 6 (AoE)",
  ] }),
  melee: _sc.bool({ d: [
    "Solo US. Arma bianca: fendente al posto dei traccianti, esclusa da overwatch e soppressione; un colpo a segno uccide e l'unità avanza nel tile del bersaglio",
    "US only. Melee weapon: a slash instead of tracers, excluded from overwatch and suppression; a hit kills and the unit advances into the target's tile",
  ] }),
  rounds: _sc.int({ min: 1, max: 5, d: ["Solo grafica. Traccianti per attacco; default 1 per i tiratori scelti, 3 per le altre armi", "Visual only. Tracers per attack; default 1 for marksmen, 3 for other weapons"] }),
  smoke: _sc.int({ min: 1, d: ["Solo armi AoE. Fumogeno: nessun danno, fumo nel raggio `aoe` per N turni", "AoE weapons only. Smoke grenade: no damage, smoke within `aoe` for N turns"] }),
  artillery: _sc.bool({ d: [
    "Solo armi AoE. Richiesta d'artiglieria: la salva cade all'inizio del turno successivo, colpisce anche i VC nascosti e distrugge i tile colpiti",
    "AoE weapons only. Artillery call: the salvo lands at the start of the next turn, also hits hidden VC and destroys the tiles it hits",
  ] }),
  thrown: _sc.bool({ d: ["Solo armi AoE US. Lancio a mano: animazione ad arco con rimbalzi prima dell'esplosione", "US AoE weapons only. Hand thrown: arc animation with bounces before the explosion"] }),
  scatter: _sc.int({ min: 0, d: [
    "Solo armi AoE US. Raggio del quadrato in cui l'arma può cadere al posto del tile scelto (1 = 3×3); mai fuori mappa né su tile con `losBlock: \"full\"`. Con `artillery` è il quadrato di ogni colpo (default 2 = 5×5, più probabile al centro)",
    "US AoE weapons only. Radius of the square where the weapon may land instead of the chosen tile (1 = 3×3); never off the map or on tiles with `losBlock: \"full\"`. With `artillery` it is each round's square (default 2 = 5×5, likelier near the centre)",
  ] }),
  scatterChance: SCHEMA_RATE(["Con `scatter`: probabilità di deviare su un altro tile del quadrato; default 0.5", "With `scatter`: chance to deviate to another tile of the square; default 0.5"]),
  napalm: _sc.bool({ d: [
    "Attacco aereo al napalm: si sceglie una linea di tile (inizio e fine, anche in diagonale); cade all'inizio del turno successivo, incendia i tile e colpisce chi ci si trova senza copertura del terreno",
    "Napalm air strike: you pick a line of tiles (start and end, diagonals allowed); it lands at the start of the next turn, sets the tiles on fire and hits anyone on them with no terrain cover",
  ] }),
  length: _sc.int({ min: 1, d: ["Con `napalm`: lunghezza massima della linea in tile; default 5", "With `napalm`: maximum line length in tiles; default 5"] }),
  shells: _sc.one(_sc.int({ min: 1 }), _sc.arr(_sc.int({ min: 1 }), { len: 2 })),
  sound: _sc.str({ ref: "file", d: ["Suono dello sparo (sostituisce quello sintetizzato)", "Firing sound (replaces the synthesized one)"] }),
};
SCHEMA_WEAPON_FIELDS.ammo.d = ["Usi totali (granate, fumogeni, radio); `null` = illimitati", "Total uses (grenades, smoke, radio); `null` = unlimited"];
SCHEMA_WEAPON_FIELDS.mags.d = ["Con `mag`: caricatori di riserva, uno per ricarica; assente o `null` = illimitati", "With `mag`: spare magazines, one per reload; absent or `null` = unlimited"];
SCHEMA_WEAPON_FIELDS.shells.d = [
  "Con `artillery`: colpi della salva, numero o [min, max]; default [5, 6]. `atk` e `aoe` valgono per il singolo colpo",
  "With `artillery`: rounds in the salvo, a number or [min, max]; default [5, 6]. `atk` and `aoe` apply to each round",
];
const SCHEMA_WEAPON = _sc.obj(SCHEMA_WEAPON_FIELDS, { d: ["Arma", "Weapon"] });
// Modifica di un'arma esistente per id (campi parziali) o nuova arma; null la toglie
const SCHEMA_WEAPON_PATCH = _sc.one(
  { type: "null" },
  _sc.obj({ ...SCHEMA_WEAPON_FIELDS, id: _sc.str() }),
);
const SCHEMA_WEAPON_LOADOUTS = (d, patch) =>
  _sc.map(patch ? _sc.one(_sc.arr(SCHEMA_WEAPON), _sc.map(SCHEMA_WEAPON_PATCH, { key: ["id arma", "weapon id"] })) : _sc.arr(SCHEMA_WEAPON), {
    keyRef: "anyClass",
    key: ["classe", "class"],
    d,
  });

// ── Classi ──────────────────────────────────────────────────────────────
const SCHEMA_UNIT_CLASS = _sc.obj({
  labels: _sc.map(_sc.obj({
    name: _sc.str({ d: ["Nome della classe", "Class name"] }),
    desc: _sc.str({ d: ["Descrizione breve nel briefing", "Short description in the briefing"] }),
    special: _sc.str({ d: ["Etichetta dell'abilità (default: quella di `special`)", "Ability label (default: the `special` one)"] }),
  }), {
    ...SCHEMA_LANGS,
    d: ["Testi per lingua; senza la lingua corrente si usa l'italiano. Le classi base prendono i testi dalle traduzioni", "Texts per language; without the current language Italian is used. Base classes take their texts from the translations"],
  }),
  symbol: _sc.str({ d: ["Lettera del distintivo", "Badge letter"] }),
  color: _sc.str({ ref: "color", d: ["Colore del distintivo", "Badge color"] }),
  hp: _sc.int({ min: 1, d: ["Punti ferita", "Hit points"] }),
  move: _sc.int({ min: 0, d: ["Movimento (AP di terreno per turno)", "Movement (terrain AP per turn)"] }),
  attack: _sc.num({ min: 0, d: ["ATK senza armi", "ATK without weapons"] }),
  defense: _sc.num({ min: 0, d: ["DEF", "DEF"] }),
  range: _sc.int({ min: 0, d: ["Gittata senza armi", "Range without weapons"] }),
  vision: _sc.int({ min: 0, d: ["Raggio visivo in tile", "Vision radius in tiles"] }),
  special: _sc.one(_sc.str({ allowed: ["suppression", "overwatch", "demolition", "heal"] }), { type: "null" }),
  marksman: _sc.bool({ d: ["Tiratore scelto: penalità di gittata per le armi senza `rangePenalty`, tracciante singolo", "Marksman: range penalty for weapons without `rangePenalty`, single tracer"] }),
  trapSense: _sc.bool({ d: ["Individua le trappole a 1 tile e gli ingressi dei tunnel a 2", "Spots traps 1 tile away and tunnel entrances 2 tiles away"] }),
  sprite: _sc.str({ allowed: ["assault", "sniper", "engineer", "medic"], d: ["Classe US di cui usare il soldato disegnato se `unitImages` non ha un'immagine", "US class whose drawn soldier is used when `unitImages` has no picture"] }),
}, {
  internal: ["name", "desc", "specialLabel"],
  d: ["Classe della squadra US", "US squad class"],
});
SCHEMA_UNIT_CLASS.fields.special.d = [
  "Abilità: `suppression` (fuoco soppressivo), `overwatch`, `demolition` (demolizione, incendio, disinnesco, sigillo dei tunnel), `heal` (cura); `null` = nessuna",
  "Ability: `suppression` (suppressive fire), `overwatch`, `demolition` (demolition, burning, disarming, sealing tunnels), `heal`; `null` = none",
];

const SCHEMA_ENEMY_CLASS = _sc.obj({
  name: _sc.one(_sc.int({ min: 0 }), _sc.map(_sc.str(), SCHEMA_LANGS)),
  role: _sc.str({ allowed: ["rifleman", "sniper", "commander"], d: [
    "Comportamento: `rifleman` (pattuglia, piazza trappole, aggira), `sniper` (mimetizzato, salta un turno dopo lo sparo, resta a distanza), `commander` (sempre in agguato, la sua morte fa ripiegare i VC vicini)",
    "Behaviour: `rifleman` (patrols, plants traps, flanks), `sniper` (camouflaged, skips a turn after firing, keeps its distance), `commander` (always holds in ambush, its death makes nearby VC fall back)",
  ] }),
  hp: _sc.int({ min: 1, d: ["Punti ferita", "Hit points"] }),
  ap: _sc.int({ min: 0, d: ["AP per turno", "AP per turn"] }),
  attack: _sc.num({ min: 0, d: ["ATK senza armi", "ATK without weapons"] }),
  range: _sc.int({ min: 0, d: ["Gittata senza armi", "Range without weapons"] }),
  defense: _sc.num({ min: 0, d: ["DEF", "DEF"] }),
  move: _sc.int({ min: 0, d: ["Movimento", "Movement"] }),
  sprite: _sc.str({ allowed: ["grunt", "sniper_vc", "commander", "nva"], d: ["Aspetto del soldato disegnato se `unitImages` non ha un'immagine: quello di una classe VC o `nva` (regolare nordvietnamita: elmetto di sughero, AK, zaino)", "Look of the drawn soldier when `unitImages` has no picture: that of a VC class or `nva` (North Vietnamese regular: pith helmet, AK, pack)"] }),
}, {
  d: ["Classe VC", "VC class"],
});
SCHEMA_ENEMY_CLASS.fields.name.d = [
  "Indice nei nomi VC tradotti (0 Guerrigliero, 1 Cecchino VC, 3 Comandante VC) oppure `{ \"it\", \"en\" }`",
  "Index into the translated VC names (0 Guerrilla, 1 VC Sniper, 3 VC Commander) or `{ \"it\", \"en\" }`",
];

// Perk dei soldati della campagna (campaign.js:PERKS)
const SCHEMA_PERK = _sc.obj({
  labels: _sc.map(_sc.obj({
    name: _sc.str({ d: ["Nome del perk", "Perk name"] }),
    desc: _sc.str({ d: ["Effetto, nel suggerimento", "Effect, in the tooltip"] }),
  }), { ...SCHEMA_LANGS, d: ["Testi per lingua; i perk del gioco li prendono dalle traduzioni", "Texts per language; the game's perks take them from the translations"] }),
  icon: _sc.str({ d: ["Icona (emoji)", "Icon (emoji)"] }),
  hp: _sc.int({ d: ["Punti ferita in più", "Extra hit points"] }),
  overwatchAtk: _sc.int({ d: ["ATK in più in overwatch", "Extra ATK on overwatch"] }),
  noise: _sc.int({ d: ["Rumore degli spari (negativo = più silenzioso; esplosivi esclusi)", "Gunfire noise (negative = quieter; explosives excluded)"] }),
  heal: _sc.int({ d: ["HP in più curati dall'abilità di cura", "Extra HP restored by the heal ability"] }),
  vision: _sc.int({ d: ["Raggio visivo in più", "Extra vision radius"] }),
  trapSense: _sc.bool({ d: ["Individua trappole e tunnel come il geniere", "Spots traps and tunnels like the Engineer"] }),
  requires: _sc.obj({
    special: _sc.one(_sc.str({ allowed: ["suppression", "overwatch", "demolition", "heal"] }), { type: "null" }),
    marksman: _sc.bool({ d: ["Solo tiratori scelti (o solo gli altri, con `false`)", "Marksmen only (or only the others, with `false`)"] }),
    trapSense: _sc.bool({ d: ["Solo classi con `trapSense` (o senza, con `false`)", "Classes with `trapSense` only (or without, with `false`)"] }),
  }, { d: ["Campi che la classe del soldato deve avere per riceverlo", "Fields the soldier's class must have to get it"] }),
}, { d: ["Perk", "Perk"] });
SCHEMA_PERK.fields.requires.fields.special.d = ["Abilità della classe", "Class ability"];

const SCHEMA_VC_MIX = (d) =>
  _sc.map(_sc.num({ min: 0 }), {
    keyRef: "enemyClass",
    key: ["classe VC", "VC class"],
    d: d || ["Composizione: peso per classe VC, es. `{ \"grunt\": 3, \"nva\": 2 }`", "Composition: weight per VC class, e.g. `{ \"grunt\": 3, \"nva\": 2 }`"],
  });

// ── Tile ────────────────────────────────────────────────────────────────
const SCHEMA_TILE_TYPE = _sc.obj({
  id: _sc.str({ req: true, d: ["Identificatore (usato in `tileLabels`, `mist` e per l'aspetto)", "Identifier (used in `tileLabels`, `mist` and for the look)"] }),
  label: _sc.str({ d: ["Nome di default, se manca la traduzione", "Default name, when the translation is missing"] }),
  moveCost: _sc.num({ min: 0, d: ["AP per attraversarlo (0 = gratis, 3 = palude)", "AP to cross it (0 = free, 3 = swamp)"] }),
  coverBonus: _sc.num({ min: 0, d: ["Bonus difesa a chi lo occupa", "Defense bonus to its occupant"] }),
  color: _sc.str({ ref: "color", d: ["Colore del disegno procedurale (#rrggbb)", "Procedural drawing color (#rrggbb)"] }),
  texture: _sc.str({ ref: "texture", d: [
    "Solo mappe senza `image`. Aspetto del tile: il nome di un terreno già disegnato dal gioco (`jungle`, `swamp`, `clearing`, `river`, `building`…) disegna l'`id` come quel terreno con tutti i suoi effetti (chiome, onde, erba al vento, nebbia, ombre), con la tinta di `color`; oppure il percorso di un'immagine (PNG/JPG/WebP/GIF) disegnata sopra `color`. Solo grafica",
    "Maps without `image` only. Tile look: the name of a terrain the game already draws (`jungle`, `swamp`, `clearing`, `river`, `building`…) draws the `id` like that terrain with all its effects (canopy, waves, wind-blown grass, mist, shadows), tinted by `color`; or the path of an image (PNG/JPG/WebP/GIF) drawn over `color`. Visual only",
  ] }),
  sound: _sc.str({ ref: "file", d: [
    "Passi su questo terreno (es. guado, palude, strada): a ogni movimento suona quello del terreno attraversato di più; senza, il suono `move` della mappa o di `config.json`",
    "Footsteps on this terrain (e.g. ford, swamp, street): each move plays the one of the terrain crossed most; without it, the map's or `config.json`'s `move` sound",
  ] }),
  impassable: _sc.bool({ d: ["Blocca il movimento (muri, fiumi)", "Blocks movement (walls, rivers)"] }),
  losBlock: _sc.str({ allowed: ["full", "partial"], d: ["`full` = blocca la vista, `partial` = −1 al raggio visivo per ogni tile attraversato", "`full` = blocks sight, `partial` = −1 to vision range per tile crossed"] }),
  burnable: _sc.bool({ d: ["Il geniere può incendiarlo (fuoco per 2 turni)", "The Engineer can set it on fire (burns for 2 turns)"] }),
  demolishable: _sc.bool({ d: ["Il geniere può demolirlo con dado ≥ 4", "The Engineer can demolish it with a roll ≥ 4"] }),
  demolishResult: _sc.str({ ref: "tileKey", d: ["Carattere della griglia del tile dopo la demolizione", "Grid character of the tile after demolition"] }),
  blastResult: _sc.one(_sc.str({ ref: "tileKey" }), _sc.bool()),
}, { d: ["Tipo di tile", "Tile type"] });
SCHEMA_TILE_TYPE.fields.blastResult.d = [
  "Carattere del tile che lo sostituisce quando ci cade un colpo d'artiglieria; `false` = indistruttibile. Default: `burnable` → terra bruciata in fiamme, muri/edifici/templi/bunker → macerie, altri `demolishable` → `demolishResult`",
  "Character of the tile replacing it when an artillery round lands on it; `false` = indestructible. Default: `burnable` → burning scorched earth, walls/buildings/temples/bunkers → rubble, other `demolishable` → `demolishResult`",
];

// ── Mappa ───────────────────────────────────────────────────────────────
const SCHEMA_OBJ_LABELS = _sc.arr(_sc.obj({ label: _sc.str({ d: ["Nome mostrato, nello stesso ordine di `objectives`", "Displayed name, in the same order as `objectives`"] }) }));
const SCHEMA_TRANSLATION = _sc.obj({
  name: _sc.str({ d: ["Nome della mappa", "Map name"] }),
  description: _sc.str({ d: ["Descrizione nel briefing", "Briefing description"] }),
  tileLabels: _sc.map(_sc.str(), { key: ["id del tile", "tile id"], d: ["Nomi dei tile per `id`", "Tile names by `id`"] }),
  objectives: _sc.obj({ recon: SCHEMA_OBJ_LABELS, capture_objective: SCHEMA_OBJ_LABELS }, { d: ["Nomi degli obiettivi", "Objective names"] }),
  tutorial: _sc.map(_sc.str(), { key: ["id del passo", "step id"], d: ["Testi dei passi del tutorial per `id`", "Tutorial step texts by `id`"] }),
}, { d: ["Testi di una lingua", "Texts of one language"] });

const SCHEMA_TUTORIAL = _sc.obj({
  missionType: _sc.str({ req: true, ref: "missionType", d: ["Tipo di missione della lezione", "Mission type of the lesson"] }),
  steps: _sc.arr(
    _sc.obj({
      id: _sc.str({ req: true, d: ["Identificatore; il testo sta in `translations.<lingua>.tutorial`", "Identifier; the text is in `translations.<language>.tutorial`"] }),
      until: _sc.one(
        _sc.str({ allowed: ["next"] }),
        _sc.obj({
          event: _sc.str({ req: true, allowed: TUTORIAL_EVENTS, d: ["Azione del giocatore che chiude il passo", "Player action that completes the step"] }),
          at: { ...SCHEMA_CELL, d: ["Tile in cui deve avvenire", "Tile where it must happen"] },
          within: _sc.int({ min: 0, d: ["Distanza massima da `at`; default 0", "Maximum distance from `at`; default 0"] }),
        }, { open: true, d: ["Gli altri campi devono combaciare con i dati dell'evento (valore o elenco di valori)", "Other fields must match the event data (a value or a list of values)"] }),
      ),
      highlight: { ...SCHEMA_CELL, d: ["Tile evidenziato sulla mappa", "Tile highlighted on the map"] },
      ui: _sc.arr(_sc.str(), { d: ["Id dei controlli dell'interfaccia che lampeggiano", "Ids of the interface controls that pulse"] }),
      fresh: _sc.bool({ d: ["Conta solo le azioni fatte dopo l'inizio del passo", "Count only actions done after the step starts"] }),
    }),
    { req: true, minItems: 1, d: ["Passi della lezione, in ordine", "Lesson steps, in order"] },
  ),
}, { internal: ["lessonId"], d: ["Lezione dell'addestramento", "Training lesson"] });
SCHEMA_TUTORIAL.fields.steps.items.fields.until.d = [
  "Quando il passo è completato: `\"next\"` = bottone Avanti, oppure un evento",
  "When the step is complete: `\"next\"` = Next button, or an event",
];

const SCHEMA_MISSION = _sc.obj({
  $schema: SCHEMA_SCHEMA,
  name: SCHEMA_TEXT(),
  description: SCHEMA_TEXT(),
  cols: _sc.int({ req: true, min: 1, d: ["Colonne della griglia", "Grid columns"] }),
  rows: _sc.int({ req: true, min: 1, d: ["Righe della griglia", "Grid rows"] }),
  width: _sc.num({ d: ["(informativo) larghezza dell'immagine", "(informative) image width"] }),
  height: _sc.num({ d: ["(informativo) altezza dell'immagine", "(informative) image height"] }),
  tileSize: _sc.num({ d: ["(informativo) lato del tile in pixel", "(informative) tile side in pixels"] }),
  image: _sc.str({ ref: "missionImage", d: ["Immagine di sfondo in `missions/`, o nella cartella della mod (sostituisce il disegno dei tile)", "Background image in `missions/`, or in the mod folder (replaces the drawn tiles)"] }),
  ambient: _sc.str({ ref: "file", d: ["Musica d'ambiente in loop durante la partita", "Ambient music looping during the game"] }),
  sounds: _sc.map(_sc.str({ ref: "file" }), { keyValues: SFX_KEYS, key: ["effetto", "effect"], d: ["Effetti sonori della mappa (prevalgono su `config.json`)", "Map sound effects (override `config.json`)"] }),
  tileTypes: _sc.map(SCHEMA_TILE_TYPE, { req: true, key: ["carattere", "character"], d: ["Tipi di tile per carattere della griglia", "Tile types by grid character"] }),
  grid: _sc.arr(_sc.one(_sc.str(), _sc.arr(_sc.str())), {
    req: true,
    minItems: 1,
    d: ["Righe della mappa: stringhe (`\"JJCCT…\"`) o array di caratteri di `tileTypes`", "Map rows: strings (`\"JJCCT…\"`) or arrays of `tileTypes` characters"],
  }),
  playerStart: _sc.arr(SCHEMA_CELL, { d: ["Posizioni di partenza della squadra", "Squad start positions"] }),
  vcSpawnZones: _sc.arr(SCHEMA_ZONE, { d: ["Zone dello schieramento VC iniziale", "Initial VC deployment zones"] }),
  vcCount: _sc.int({ min: 0, d: ["VC iniziali; default 6", "Initial VC; default 6"] }),
  reinforcementTurn: _sc.int({ min: 1, d: ["Rinforzi VC ogni N turni; senza, nessun rinforzo", "VC reinforcements every N turns; without it, none"] }),
  reinforcementCount: _sc.int({ min: 0, d: ["VC per ondata di rinforzi; default 2", "VC per reinforcement wave; default 2"] }),
  vcAmbushTurn: _sc.int({ min: 1, d: ["Turno dell'imboscata (una sola, non annunciata); serve `vcAmbushZones`", "Ambush turn (one, unannounced); needs `vcAmbushZones`"] }),
  vcAmbushCount: _sc.int({ min: 0, d: ["VC dell'imboscata; default 2", "Ambush VC; default 2"] }),
  vcAmbushZones: _sc.arr(SCHEMA_ZONE, { d: ["Zone in cui compare l'imboscata", "Zones where the ambush appears"] }),
  ambushChance: SCHEMA_RATE(["Probabilità per turno che un VC in vista spari a sorpresa; default 0", "Chance per turn that a VC in sight fires by surprise; default 0"]),
  trapCount: _sc.int({ min: 0, d: ["Trappole casuali (punji o mina) a inizio missione; default 0", "Random traps (punji or mine) at mission start; default 0"] }),
  trapZones: _sc.arr(SCHEMA_ZONE, { d: ["Zone delle trappole casuali; senza, ovunque ad almeno 4 tile dalla partenza", "Random trap zones; without them, anywhere at least 4 tiles from the start"] }),
  traps: _sc.arr(_sc.obj({
    col: SCHEMA_COL(),
    row: SCHEMA_ROW(),
    type: _sc.str({ allowed: ["punji", "mine"], d: ["`punji` (2 HP) o `mine` (4 HP)", "`punji` (2 HP) or `mine` (4 HP)"] }),
    dmg: _sc.int({ min: 0, d: ["Danno (sostituisce quello del tipo)", "Damage (replaces the type's)"] }),
  }), { d: ["Trappole fisse", "Fixed traps"] }),
  tunnels: _sc.arr(SCHEMA_CELL, { d: ["Ingressi dei tunnel VC in posizione fissa (sostituiscono quelli casuali)", "Fixed VC tunnel entrances (replace the random ones)"] }),
  tunnelCount: _sc.int({ min: 0, d: ["Ingressi casuali dei tunnel, su tile che nascondono, lontano dalla partenza; default 3", "Random tunnel entrances, on concealing tiles, away from the start; default 3"] }),
  vcTrapPlantMax: _sc.int({ min: 0, d: ["Trappole che i VC in pattuglia possono piazzare; default 3", "Traps patrolling VC can plant; default 3"] }),
  night: _sc.bool({ d: ["Missione sempre notturna (l'opzione del briefing è bloccata)", "Always a night mission (the briefing option is locked)"] }),
  vcNoise: _sc.bool({ d: ["`false` = gli spari dei VC non allertano gli altri VC; default attivo", "`false` = VC gunfire doesn't alert other VC; on by default"] }),
  nightVisionPenalty: _sc.int({ min: 0, d: ["Riduzione notturna del raggio visivo dei soldati; default 1", "Night reduction of the soldiers' vision; default 1"] }),
  vcNightPenalty: _sc.int({ min: 0, d: ["Riduzione notturna della distanza d'allerta e della vista dei VC (base 5, minimo 2); default 2", "Night reduction of VC alert distance and sight (base 5, minimum 2); default 2"] }),
  bleedStopChance: SCHEMA_RATE(["Probabilità che un'emorragia si fermi da sola a inizio turno; default 1/3, 0 = solo il medico la ferma", "Chance a bleed stops by itself at turn start; default 1/3, 0 = only the Medic stops it"]),
  rain: _sc.one(_sc.bool(), _sc.obj({
    chance: SCHEMA_RATE(["Probabilità per turno che cominci un acquazzone; default 0.2", "Chance per turn that a shower starts; default 0.2"]),
    minTurns: _sc.int({ min: 1, d: ["Durata minima in turni; default 2", "Minimum length in turns; default 2"] }),
    maxTurns: _sc.int({ min: 1, d: ["Durata massima in turni; default 4", "Maximum length in turns; default 4"] }),
    fromStart: _sc.bool({ d: ["Il primo acquazzone è già in corso a inizio missione", "The first shower is already under way at mission start"] }),
  })),
  mist: _sc.one(_sc.bool(), _sc.obj({
    tiles: _sc.arr(_sc.str(), { d: ["`id` dei tile con la nebbiolina; default `[\"swamp\"]`", "`id` of the misty tiles; default `[\"swamp\"]`"] }),
    density: _sc.num({ min: 0, d: ["Spessore: 0.5 rada, 1 normale, 2 fitta", "Thickness: 0.5 thin, 1 normal, 2 thick"] }),
  })),
  temperature: _sc.obj({
    day: _sc.arr(_sc.num(), { len: 2, d: ["[min, max] di giorno; default [27, 34]", "Day [min, max]; default [27, 34]"] }),
    night: _sc.arr(_sc.num(), { len: 2, d: ["[min, max] di notte; default [21, 26]", "Night [min, max]; default [21, 26]"] }),
  }, { d: ["Solo informativo. Temperature in °C del pannello meteo; la pioggia toglie 3°, il cielo coperto 1°", "Informative only. Weather panel temperatures in °C; rain takes 3° off, overcast sky 1°"] }),
  cloudy: SCHEMA_RATE(["Solo informativo. Probabilità di cielo coperto a inizio missione; default 0.35 (poi cambia col 20% a turno)", "Informative only. Chance of overcast sky at mission start; default 0.35 (then 20% per turn to change)"]),
  squad: _sc.arr(_sc.obj({
    cls: _sc.str({ req: true, ref: "unitClass", d: ["Classe US", "US class"] }),
    col: SCHEMA_COL(),
    row: SCHEMA_ROW(),
    facing: SCHEMA_FACING,
    hp: _sc.int({ min: 1, d: ["Punti ferita iniziali", "Starting hit points"] }),
    bleeding: _sc.bool({ d: ["Parte con un'emorragia", "Starts bleeding"] }),
    stance: _sc.str({ allowed: ["stand", "crouch", "prone"], d: ["Postura iniziale", "Starting stance"] }),
  }), { d: ["Squadra fissa al posto della scelta nel briefing", "Fixed squad instead of the briefing choice"] }),
  enemies: _sc.arr(_sc.obj({
    cls: _sc.str({ ref: "enemyClass", d: ["Classe VC", "VC class"] }),
    col: SCHEMA_COL(),
    row: SCHEMA_ROW(),
    facing: SCHEMA_FACING,
    alerted: _sc.bool({ d: ["Parte in allerta", "Starts alerted"] }),
    hold: _sc.bool({ d: ["Sentinella: non pattuglia finché non è allertata", "Sentry: doesn't patrol until alerted"] }),
    hp: _sc.int({ min: 1, d: ["Punti ferita iniziali", "Starting hit points"] }),
  }), { d: ["VC in posizione fissa al posto dello schieramento casuale", "VC at fixed positions instead of random deployment"] }),
  supportedMissions: _sc.arr(_sc.str({ ref: "missionType" }), { d: ["Tipi di missione giocabili sulla mappa", "Mission types playable on the map"] }),
  objectives: _sc.obj({
    recon: _sc.arr(_sc.obj({
      col: SCHEMA_COL(),
      row: SCHEMA_ROW(),
      label: _sc.str({ d: ["Nome della zona", "Zone name"] }),
    }), { d: ["Ricognizione: zone da raggiungere", "Recon: zones to reach"] }),
    search_destroy: _sc.obj({
      eliminateAll: _sc.bool({ d: ["Vanno eliminati tutti i VC", "All VC must be killed"] }),
      minKills: _sc.int({ min: 1, d: ["VC da eliminare; default 4", "VC to kill; default 4"] }),
      tileAnimations: SCHEMA_TILE_ANIMS(["Animazioni visibili solo in questa modalità", "Animations shown only in this mode"]),
    }, { d: ["Cerca e distruggi", "Search and destroy"] }),
    rescue_pilot: _sc.obj({
      pilotCol: SCHEMA_COL(["Colonna del pilota (nascosto nella FOW)", "Pilot column (hidden in the FOW)"]),
      pilotRow: SCHEMA_ROW(["Riga del pilota", "Pilot row"]),
      extractCol: SCHEMA_COL(["Colonna del punto d'estrazione", "Extraction point column"]),
      extractRow: SCHEMA_ROW(["Riga del punto d'estrazione", "Extraction point row"]),
      tileAnimations: SCHEMA_TILE_ANIMS(["Animazioni visibili solo in questa modalità (es. fumo sul relitto)", "Animations shown only in this mode (e.g. smoke on the wreck)"]),
    }, { d: ["Recupero pilota", "Pilot rescue"] }),
    capture_objective: _sc.arr(_sc.obj({
      col: SCHEMA_COL(),
      row: SCHEMA_ROW(),
      label: _sc.str({ d: ["Nome della posizione", "Position name"] }),
      holdTurns: _sc.int({ min: 1, d: ["Turni consecutivi da tenerla; default 2", "Consecutive turns to hold it; default 2"] }),
    }), { d: ["Conquista: posizioni da occupare", "Capture: positions to hold"] }),
  }, { d: ["Obiettivi per tipo di missione; servono quelli dei tipi in `supportedMissions`", "Objectives per mission type; those of the `supportedMissions` types are needed"] }),
  tileAnimations: SCHEMA_TILE_ANIMS(["Animazioni ambientali sempre visibili; il fumo si vede anche attraverso la FOW", "Ambient animations always shown; smoke shows through the FOW too"]),
  weapons: SCHEMA_WEAPON_LOADOUTS([
    "Armi per classe, solo per questa missione. Un array sostituisce il loadout; un oggetto modifica le armi per `id` (campi uniti all'arma, `null` la toglie, un `id` nuovo la aggiunge in fondo)",
    "Weapons per class, for this mission only. An array replaces the loadout; an object changes weapons by `id` (fields merged into the weapon, `null` removes it, a new `id` adds it at the end)",
  ], true),
  vcMix: SCHEMA_VC_MIX([
    "Composizione dello schieramento iniziale e, senza `ambushMix`, dell'imboscata; pesi per classe VC. Default `{ \"grunt\": 3, \"sniper_vc\": 1, \"commander\": 1 }`",
    "Composition of the initial deployment and, without `ambushMix`, of the ambush; weights per VC class. Default `{ \"grunt\": 3, \"sniper_vc\": 1, \"commander\": 1 }`",
  ]),
  ambushMix: SCHEMA_VC_MIX(["Composizione dell'imboscata; default `{ \"grunt\": 2, \"sniper_vc\": 1, \"commander\": 1 }`", "Ambush composition; default `{ \"grunt\": 2, \"sniper_vc\": 1, \"commander\": 1 }`"]),
  reinforcementMix: SCHEMA_VC_MIX(["Composizione dei rinforzi; default `{ \"grunt\": 1 }`", "Reinforcement composition; default `{ \"grunt\": 1 }`"]),
  tuning: _sc.map({ type: "any" }, {
    keyRef: "tunable",
    key: ["gruppo", "group"],
    d: [
      "Parametri di bilanciamento per questa missione, uniti in profondità ai valori del gioco (numeri e array sostituiti, oggetti uniti), es. `{ \"VC_TACTICS\": { \"holdChance\": 0.8 } }`",
      "Balance parameters for this mission, deep-merged into the game values (numbers and arrays replaced, objects merged), e.g. `{ \"VC_TACTICS\": { \"holdChance\": 0.8 } }`",
    ],
  }),
  translations: _sc.map(SCHEMA_TRANSLATION, { ...SCHEMA_LANGS, d: ["Testi per lingua (`it`, `en`)", "Texts per language (`it`, `en`)"] }),
  tutorial: SCHEMA_TUTORIAL,
}, {
  // Scritti dai generatori procedurali
  internal: ["procedural", "seed", "size", "layout", "startEdge"],
  d: ["Mappa (`missions/<nome>.json`)", "Map (`missions/<name>.json`)"],
});
SCHEMA_MISSION.fields.name.d = ["Nome della mappa: testo o `{ \"it\", \"en\" }` (di solito in `translations`)", "Map name: text or `{ \"it\", \"en\" }` (usually in `translations`)"];
SCHEMA_MISSION.fields.description.d = ["Descrizione: testo o `{ \"it\", \"en\" }` (di solito in `translations`)", "Description: text or `{ \"it\", \"en\" }` (usually in `translations`)"];
SCHEMA_MISSION.fields.rain.d = [
  "Solo grafica. `true` = piove tutta la missione; un oggetto = acquazzoni casuali, che cominciano a inizio turno giocatore se non piove già",
  "Visual only. `true` = it rains all mission long; an object = random showers, starting at the beginning of a player turn when it isn't raining",
];
SCHEMA_MISSION.fields.mist.d = ["Solo grafica. Banchi di nebbiolina: `true` = sui tile palude, un oggetto per scegliere tile e spessore", "Visual only. Mist banks: `true` = on swamp tiles, an object to choose tiles and thickness"];

// ── Catalogo, indice del tutorial, config.json ─────────────────────────
const SCHEMA_CATALOG_ENTRY = _sc.obj({
  file: _sc.str({ ref: "missionFile", d: ["JSON della mappa in `missions/`", "Map JSON in `missions/`"] }),
  generator: _sc.str({ ref: "generator", d: ["Mappa procedurale (al posto di `file`)", "Procedural map (instead of `file`)"] }),
  tutorial: _sc.bool({ d: ["Scheda dell'addestramento (lezioni da `missions/tutorial/index.json`)", "Training card (lessons from `missions/tutorial/index.json`)"] }),
  campaign: _sc.bool({ d: ["Scheda della campagna (campagne da `missions/campaigns/index.json` e dalle mod)", "Campaign card (campaigns from `missions/campaigns/index.json` and the mods)"] }),
  icon: _sc.str({ d: ["Icona (emoji)", "Icon (emoji)"] }),
  color: _sc.str({ ref: "color", d: ["Colore della scheda", "Card color"] }),
  theaterColor: _sc.str({ ref: "color", d: ["Colore dell'etichetta del teatro", "Theater badge color"] }),
  labels: _sc.map(_sc.obj({
    label: _sc.str({ d: ["Nome", "Name"] }),
    subtitle: _sc.str({ d: ["Sottotitolo (luogo · anno)", "Subtitle (place · year)"] }),
    theater: _sc.str({ d: ["Teatro", "Theater"] }),
  }), { ...SCHEMA_LANGS, d: ["Testi della scheda per lingua", "Card texts per language"] }),
}, { d: ["Voce del menu delle mappe", "Map menu entry"] });
const SCHEMA_CATALOG = _sc.arr(SCHEMA_CATALOG_ENTRY, { req: true, d: ["Mappe del menu, in ordine (`missions/catalog.json`)", "Menu maps, in order (`missions/catalog.json`)"] });

const SCHEMA_TUTORIAL_INDEX = _sc.obj({
  $schema: SCHEMA_SCHEMA,
  tileTypes: _sc.map(SCHEMA_TILE_TYPE, { key: ["carattere", "character"], d: ["Tipi di tile condivisi dalle lezioni (una lezione può sovrascriverli)", "Tile types shared by the lessons (a lesson may override them)"] }),
  tileLabels: _sc.map(_sc.map(_sc.str(), { key: ["id del tile", "tile id"] }), { ...SCHEMA_LANGS, d: ["Nomi dei tile condivisi, per lingua", "Shared tile names, per language"] }),
  lessons: _sc.arr(_sc.obj({
    id: _sc.str({ req: true, d: ["Identificatore (lezioni superate)", "Identifier (passed lessons)"] }),
    file: _sc.str({ req: true, ref: "tutorialFile", d: ["JSON della lezione in `missions/tutorial/`", "Lesson JSON in `missions/tutorial/`"] }),
    icon: _sc.str({ d: ["Icona (emoji)", "Icon (emoji)"] }),
    classes: _sc.arr(_sc.str({ ref: "unitClass" }), { d: ["Classi mostrate nella scheda", "Classes shown on the card"] }),
    labels: _sc.map(_sc.obj({ title: _sc.str({ d: ["Titolo", "Title"] }), desc: _sc.str({ d: ["Descrizione", "Description"] }) }), { ...SCHEMA_LANGS, d: ["Testi della scheda per lingua", "Card texts per language"] }),
  }), { req: true, d: ["Lezioni, in ordine", "Lessons, in order"] }),
}, { d: ["Indice dell'addestramento (`missions/tutorial/index.json`)", "Training index (`missions/tutorial/index.json`)"] });

const SCHEMA_CONFIG = _sc.obj({
  $schema: SCHEMA_SCHEMA,
  menuMusic: _sc.str({ ref: "file", d: ["Musica del menu", "Menu music"] }),
  menuImage: _sc.str({ ref: "file", d: ["Immagine a destra nel menu desktop (sfumata in basso e a sinistra per il titolo); default `assets/menu_hero.jpg`", "Picture on the right of the desktop menu (faded at the bottom and left for the title); default `assets/menu_hero.jpg`"] }),
  unitImages: _sc.map(
    _sc.one(
      _sc.str({ ref: "file", d: ["Una sola immagine per tutte le posture", "One picture for every stance"] }),
      _sc.obj({
        stand: _sc.str({ ref: "file", d: ["In piedi (anche per le posture non indicate)", "Standing (also for the stances not given)"] }),
        crouch: _sc.str({ ref: "file", d: ["Accovacciato", "Crouching"] }),
        prone: _sc.str({ ref: "file", d: ["Sdraiato", "Prone"] }),
      }),
    ),
    { keyRef: "anyClass", key: ["classe", "class"], d: ["Immagine della pedina per classe (US o VC): il soldato visto dall'alto **rivolto a nord**, sfondo trasparente, ruotata dal gioco verso dove guarda l'unità; senza, soldato disegnato (vedi `sprite` delle classi)", "Piece picture per class (US or VC): the soldier seen from above **facing north**, transparent background, rotated by the game toward where the unit faces; without it, a drawn soldier (see the classes' `sprite`)"] },
  ),
  sounds: _sc.map(_sc.str({ ref: "file" }), { keyValues: SFX_KEYS, key: ["effetto", "effect"], d: ["Effetti sonori; senza, suoni sintetizzati", "Sound effects; without them, synthesized sounds"] }),
  weapons: SCHEMA_WEAPON_LOADOUTS(["Loadout per classe (US o VC); senza, ATK e gittata della classe", "Loadout per class (US or VC); without it, the class ATK and range"]),
  unitClasses: _sc.map(SCHEMA_UNIT_CLASS, { key: ["classe", "class"], d: ["Classi US: i campi scritti cambiano una classe esistente; un nome nuovo aggiunge una classe, che parte dalle statistiche dell'assalto e compare nel briefing (armi in `weapons`, immagine in `unitImages`)", "US classes: the fields written change an existing class; a new name adds a class, starting from the Assault's stats and shown in the briefing (weapons in `weapons`, picture in `unitImages`)"] }),
  enemyClasses: _sc.map(SCHEMA_ENEMY_CLASS, { key: ["classe", "class"], d: ["Classi VC: i campi scritti cambiano una classe esistente; un nome nuovo aggiunge una classe, che parte dai valori del guerrigliero e compare in partita solo se inserita in una composizione (`vcMix`)", "VC classes: the fields written change an existing class; a new name adds a class, starting from the guerrilla's values and appearing in game only when put in a composition (`vcMix`)"] }),
  vcMix: _sc.obj({
    spawn: SCHEMA_VC_MIX(["Schieramento iniziale", "Initial deployment"]),
    ambush: SCHEMA_VC_MIX(["Imboscata", "Ambush"]),
    reinforcement: SCHEMA_VC_MIX(["Rinforzi", "Reinforcements"]),
  }, { d: ["Composizioni VC di default per tutte le mappe", "Default VC compositions for every map"] }),
  perks: _sc.map(_sc.one(SCHEMA_PERK, { type: "null" }), { key: ["perk", "perk"], d: ["Perk dei soldati della campagna: i campi scritti cambiano un perk esistente (`steady`, `tough`, `quiet`, `pointman`, `fieldMedic`), un nome nuovo ne aggiunge uno, `null` lo toglie", "Campaign soldier perks: the fields written change an existing perk (`steady`, `tough`, `quiet`, `pointman`, `fieldMedic`), a new name adds one, `null` removes it"] }),
  soldierNames: _sc.obj({
    first: _sc.arr(_sc.str(), { d: ["Nomi", "First names"] }),
    last: _sc.arr(_sc.str(), { d: ["Cognomi", "Last names"] }),
  }, { d: ["Nomi dei soldati del plotone in campagna; senza, quelli del gioco", "Names of the campaign platoon soldiers; without them, the game's"] }),
}, { d: ["Configurazione globale (`config.json`)", "Global configuration (`config.json`)"] });

// ── Campagna (campaign.js) ─────────────────────────────────────────────
const SCHEMA_PAIR = (d) => _sc.arr(_sc.num(), { len: 2, d });
// Campi della mappa che un'operazione può cambiare (uniti in profondità)
const SCHEMA_CAMPAIGN_OVERRIDES = _sc.obj(
  Object.fromEntries(
    Object.entries(SCHEMA_MISSION.fields)
      .filter(([k]) => !["$schema", "cols", "rows", "grid", "tileTypes", "squad", "tutorial", "translations"].includes(k))
      .map(([k, f]) => [k, Array.isArray(f) ? f : { ...f, req: false }]),
  ),
  { d: ["Campi della mappa", "Map fields"] },
);
const SCHEMA_CAMPAIGN_MISSION_FIELDS = {
  id: _sc.str({ d: ["Identificatore: i testi stanno in `translations.<lingua>.ops.<id>`; default `op<n>` (`op<n>_<m>` per le scelte)", "Identifier: texts are in `translations.<language>.ops.<id>`; default `op<n>` (`op<n>_<m>` for choices)"] }),
  map: _sc.str({ ref: "missionFile", d: ["JSON della mappa in `missions/` (in una mod: dalla sua cartella)", "Map JSON in `missions/` (in a mod: from its folder)"] }),
  generator: _sc.str({ ref: "generator", d: ["Mappa procedurale (al posto di `map`)", "Procedural map (instead of `map`)"] }),
  size: _sc.str({ allowed: ["small", "medium", "large"], d: ["Dimensione della mappa procedurale; default `small`", "Procedural map size; default `small`"] }),
  seed: _sc.int({ min: 0, d: ["Seed della mappa procedurale; default dal seed della campagna", "Procedural map seed; default from the campaign seed"] }),
  missionType: _sc.str({ ref: "missionType", d: ["Tipo di missione (tra i `supportedMissions` della mappa)", "Mission type (among the map's `supportedMissions`)"] }),
  night: _sc.bool({ d: ["Missione notturna", "Night mission"] }),
  tier: _sc.str({ d: ["Livello della scelta (chiave di `rules.tiers`: `easy`, `normal`, `hard`): VC in più o in meno, ricompensa e pressione VC", "Choice level (`rules.tiers` key: `easy`, `normal`, `hard`): more or fewer VC, reward and VC pressure"] }),
  reward: _sc.int({ min: 0, d: ["PR per la vittoria; default quella del livello o `rules.requisition.win`", "RP for winning; default the level's or `rules.requisition.win`"] }),
  overrides: SCHEMA_CAMPAIGN_OVERRIDES,
};
SCHEMA_CAMPAIGN_OVERRIDES.d = [
  "Campi della [mappa](#map) cambiati per questa operazione, uniti in profondità come `tuning` (es. `{ \"vcCount\": 9, \"reinforcementTurn\": 4 }`)",
  "[Map](#map) fields changed for this operation, deep-merged like `tuning` (e.g. `{ \"vcCount\": 9, \"reinforcementTurn\": 4 }`)",
];
const SCHEMA_CAMPAIGN_CHOICE = _sc.obj(
  { ...SCHEMA_CAMPAIGN_MISSION_FIELDS, missionType: { ...SCHEMA_CAMPAIGN_MISSION_FIELDS.missionType, req: true } },
  { d: ["Missione di un'operazione", "Operation mission"] },
);
const SCHEMA_CAMPAIGN_OP = _sc.obj({
  ...SCHEMA_CAMPAIGN_MISSION_FIELDS,
  choices: _sc.arr(SCHEMA_CAMPAIGN_CHOICE, { minItems: 1, d: ["Missioni tra cui scegliere all'HQ (al posto dei campi della missione)", "Missions to choose from at HQ (instead of the mission fields)"] }),
}, { d: ["Operazione: una missione (`map` o `generator` + `missionType`) oppure `choices`", "Operation: one mission (`map` or `generator` + `missionType`) or `choices`"] });

const SCHEMA_CAMPAIGN_RULES = _sc.obj({
  rosterSize: _sc.int({ min: 1, d: ["Soldati nel plotone; default 8", "Soldiers in the platoon; default 8"] }),
  deploySize: _sc.int({ min: 1, max: 4, d: ["Soldati schierati per missione (posizioni di partenza delle mappe: 4); default 4", "Soldiers deployed per mission (maps have 4 start positions); default 4"] }),
  startRequisition: _sc.int({ min: 0, d: ["PR iniziali; default 2", "Starting RP; default 2"] }),
  xp: _sc.obj({
    survive: _sc.int({ min: 0, d: ["Per chi sopravvive; default 1", "For surviving; default 1"] }),
    kill: _sc.int({ min: 0, d: ["Per ogni VC ucciso; default 1", "Per VC killed; default 1"] }),
    win: _sc.int({ min: 0, d: ["Per la vittoria; default 1", "For winning; default 1"] }),
    heal: _sc.int({ min: 0, d: ["Per ogni cura del medico; default 1", "Per Medic heal; default 1"] }),
  }, { d: ["Esperienza per missione (niente in ritirata)", "Experience per mission (none on retreat)"] }),
  ranks: _sc.arr(_sc.obj({
    id: _sc.str({ req: true, d: ["Identificatore; testi da translations `campaign.ranks.<id>` o da `labels`", "Identifier; texts from translations `campaign.ranks.<id>` or from `labels`"] }),
    xp: _sc.int({ req: true, min: 0, d: ["XP necessari", "XP needed"] }),
    hp: _sc.int({ min: 0, d: ["Punti ferita in più (si sommano ai gradi precedenti)", "Extra hit points (adding to the previous ranks)"] }),
    perk: _sc.bool({ d: ["Al grado si sceglie un perk", "A perk is chosen at this rank"] }),
    labels: _sc.map(_sc.obj({ name: _sc.str({ d: ["Nome", "Name"] }), short: _sc.str({ d: ["Abbreviazione davanti al cognome", "Abbreviation before the surname"] }) }), { ...SCHEMA_LANGS, d: ["Testi per lingua", "Texts per language"] }),
  }), { minItems: 1, d: ["Gradi in ordine di XP; default Pvt 0, PFC 3 (+1 HP), Cpl 7 (perk), Sgt 12 (perk, +1 HP)", "Ranks by XP; default Pvt 0, PFC 3 (+1 HP), Cpl 7 (perk), Sgt 12 (perk, +1 HP)"] }),
  perkChoices: _sc.int({ min: 1, d: ["Perk offerti a ogni scelta; default 2", "Perks offered at each choice; default 2"] }),
  recovery: _sc.obj({
    light: _sc.int({ min: 0, d: ["Operazioni fuori per un ferito (HP ≤ 60%); default 1", "Operations out for a wounded soldier (HP ≤ 60%); default 1"] }),
    severe: _sc.int({ min: 0, d: ["Per un ferito grave (HP < 30% o emorragia); default 2", "For a badly wounded one (HP < 30% or bleeding); default 2"] }),
    medevac: _sc.int({ min: 0, d: ["Per un evacuato; default 3", "For an evacuated one; default 3"] }),
  }, { d: ["Convalescenza in operazioni", "Recovery in operations"] }),
  medevacChance: SCHEMA_RATE(["Probabilità che un caduto in una missione vinta sia evacuato ferito invece che morto; default 1/3, 0 = morte definitiva", "Chance a soldier fallen in a won mission is evacuated wounded instead of dead; default 1/3, 0 = permadeath"]),
  requisition: _sc.obj({
    win: _sc.int({ d: ["PR per la vittoria; default 3", "RP for winning; default 3"] }),
    clean: _sc.int({ d: ["In più se nessuno è ferito o caduto; default 1", "Extra when nobody is wounded or fallen; default 1"] }),
    kia: _sc.int({ d: ["Per ogni caduto; default −1", "Per fallen soldier; default −1"] }),
  }, { d: ["Punti requisizione (PR) a fine missione", "Requisition points (RP) at mission end"] }),
  costs: _sc.obj({
    replacement: _sc.int({ min: 0, d: ["Rimpiazzo (nuovo soldato); default 2", "Replacement (new soldier); default 2"] }),
    fastHeal: _sc.int({ min: 0, d: ["Cura accelerata (ferito subito disponibile); default 1", "Fast healing (wounded available at once); default 1"] }),
  }, { d: ["Costi in PR all'HQ", "HQ costs in RP"] }),
  supplies: _sc.map(_sc.obj({
    cost: _sc.int({ req: true, min: 0, d: ["Costo in PR", "Cost in RP"] }),
    field: _sc.str({ d: ["Solo le armi con questo campo (es. `artillery`); senza, tutte", "Only weapons with this field (e.g. `artillery`); without it, all"] }),
    exclude: _sc.arr(_sc.str(), { d: ["Escluse le armi con uno di questi campi", "Weapons with one of these fields are excluded"] }),
    ammo: _sc.int({ min: 0, d: ["Usi in più alle armi con `ammo`", "Extra uses for weapons with `ammo`"] }),
    mags: _sc.int({ min: 0, d: ["Caricatori di riserva in più alle armi con `mags`", "Extra spare magazines for weapons with `mags`"] }),
  }), { key: ["dotazione", "supply"], d: ["Dotazioni per una sola operazione; default `ammo` (1 PR), `artillery` (2 PR), `napalm` (3 PR). Testi da translations `campaign.supplies.<id>`", "Supplies for one operation; default `ammo` (1 RP), `artillery` (2 RP), `napalm` (3 RP). Texts from translations `campaign.supplies.<id>`"] }),
  tiers: _sc.map(_sc.obj({
    vcCount: _sc.int({ d: ["VC in più (o in meno)", "More (or fewer) VC"] }),
    reward: _sc.int({ min: 0, d: ["PR per la vittoria", "RP for winning"] }),
    pressure: _sc.int({ d: ["Variazione della pressione VC dopo la vittoria", "VC pressure change after winning"] }),
  }), { key: ["livello", "level"], d: ["Livelli delle scelte; default `easy` (−2 VC, 2 PR, pressione +1), `normal` (3 PR), `hard` (+2 VC, 5 PR, pressione −1)", "Choice levels; default `easy` (−2 VC, 2 RP, pressure +1), `normal` (3 RP), `hard` (+2 VC, 5 RP, pressure −1)"] }),
  pressureVc: _sc.int({ min: 0, d: ["VC in più per punto di pressione; default 1", "Extra VC per pressure point; default 1"] }),
  maxPressure: _sc.int({ min: 0, d: ["Pressione massima; default 4", "Maximum pressure; default 4"] }),
}, { d: ["Regole della campagna", "Campaign rules"] });

const SCHEMA_CAMPAIGN = _sc.obj({
  $schema: SCHEMA_SCHEMA,
  name: SCHEMA_TEXT(),
  description: SCHEMA_TEXT(),
  icon: _sc.str({ d: ["Icona (emoji)", "Icon (emoji)"] }),
  startRoster: _sc.arr(_sc.str({ ref: "unitClass" }), { minItems: 1, d: ["Classi del plotone iniziale; default 2 per classe base", "Starting platoon classes; default 2 per base class"] }),
  rules: SCHEMA_CAMPAIGN_RULES,
  operations: _sc.arr(SCHEMA_CAMPAIGN_OP, { d: ["Operazioni in ordine (campagna fissa)", "Operations in order (fixed campaign)"] }),
  procedural: _sc.obj({
    operations: _sc.int({ min: 1, d: ["Numero di operazioni; default 5", "Number of operations; default 5"] }),
    choices: _sc.int({ min: 1, d: ["Missioni a scelta per operazione (facile, normale, difficile); default 3", "Missions to choose from per operation (easy, normal, hard); default 3"] }),
    generators: _sc.arr(_sc.str({ ref: "generator" }), { minItems: 1, d: ["Generatori usati; default tutti", "Generators used; default all"] }),
    sizes: _sc.arr(_sc.str({ allowed: ["small", "medium", "large"] }), { minItems: 1, d: ["Dimensioni; default `small` e `medium`", "Sizes; default `small` and `medium`"] }),
    missionTypes: _sc.arr(_sc.str({ ref: "missionType" }), { minItems: 1, d: ["Tipi di missione; default tutti", "Mission types; default all"] }),
    nightChance: SCHEMA_RATE(["Probabilità di una missione notturna; default 0.25", "Chance of a night mission; default 0.25"]),
  }, { d: ["Campagna procedurale: operazioni generate dal seed al posto di `operations`", "Procedural campaign: operations generated from the seed instead of `operations`"] }),
  difficulty: _sc.obj({
    vcCount: SCHEMA_PAIR(["VC iniziali [prima, ultima operazione], interpolati", "Initial VC [first, last operation], interpolated"]),
    reinforcementTurn: SCHEMA_PAIR(["Turni tra i rinforzi [prima, ultima]", "Turns between reinforcements [first, last]"]),
    vcMix: _sc.arr(SCHEMA_VC_MIX(), { len: 2, d: ["Composizione VC [prima, ultima]: pesi interpolati", "VC composition [first, last]: weights interpolated"] }),
  }, { d: ["Curva di difficoltà, applicata prima degli `overrides` di ogni operazione", "Difficulty curve, applied before each operation's `overrides`"] }),
  translations: _sc.map(_sc.obj({
    name: _sc.str({ d: ["Nome della campagna", "Campaign name"] }),
    description: _sc.str({ d: ["Descrizione nell'elenco", "Description in the list"] }),
    victory: _sc.str({ d: ["Testo della vittoria finale", "Final victory text"] }),
    defeat: _sc.str({ d: ["Testo della sconfitta", "Defeat text"] }),
    ops: _sc.map(_sc.obj({
      name: _sc.str({ d: ["Nome dell'operazione (o della scelta)", "Operation (or choice) name"] }),
      briefing: _sc.str({ d: ["Briefing all'HQ", "HQ briefing"] }),
    }), { key: ["id", "id"], d: ["Testi delle operazioni e delle scelte per `id`", "Operation and choice texts by `id`"] }),
  }), { ...SCHEMA_LANGS, d: ["Testi per lingua (`it`, `en`)", "Texts per language (`it`, `en`)"] }),
}, { d: ["Campagna (`missions/campaigns/<nome>.json`)", "Campaign (`missions/campaigns/<name>.json`)"] });

const SCHEMA_CAMPAIGN_INDEX = _sc.obj({
  $schema: SCHEMA_SCHEMA,
  campaigns: _sc.arr(_sc.str({ ref: "campaignFile" }), { req: true, d: ["Campagne in `missions/campaigns/`, in ordine", "Campaigns in `missions/campaigns/`, in order"] }),
}, { d: ["Elenco delle campagne (`missions/campaigns/index.json`)", "Campaign list (`missions/campaigns/index.json`)"] });

// ── Mod (mods.js) ──────────────────────────────────────────────────────
// I percorsi di una mod (e delle sue mappe) partono dalla sua cartella
const SCHEMA_MOD_PATHS = [
  "I percorsi dei file partono dalla cartella della mod; `../../` risale alla cartella del gioco (es. `../../assets/footsteps_jungle.mp3`)",
  "File paths start from the mod folder; `../../` goes up to the game folder (e.g. `../../assets/footsteps_jungle.mp3`)",
];
const SCHEMA_MOD = _sc.obj({
  $schema: SCHEMA_SCHEMA,
  labels: _sc.map(_sc.obj({
    name: _sc.str({ d: ["Nome della mod", "Mod name"] }),
    desc: _sc.str({ d: ["Descrizione nel menu delle mod", "Description in the mod menu"] }),
  }), { ...SCHEMA_LANGS, d: ["Testi per lingua", "Texts per language"] }),
  author: _sc.str({ d: ["Autore", "Author"] }),
  version: _sc.str({ d: ["Versione", "Version"] }),
  config: _sc.obj({
    ...SCHEMA_CONFIG.fields,
    weapons: SCHEMA_WEAPON_LOADOUTS([
      "Armi per classe (US o VC): un array sostituisce il loadout, un oggetto modifica le armi per `id` (`null` la toglie, un `id` nuovo la aggiunge)",
      "Weapons per class (US or VC): an array replaces the loadout, an object changes weapons by `id` (`null` removes it, a new `id` adds it)",
    ], true),
  }, {
    d: [
      "Aggiunte a `config.json`, con gli stessi campi: classi e composizioni unite, immagini e suoni sostituiti per chiave. " + SCHEMA_MOD_PATHS[0],
      "Additions to `config.json`, with the same fields: classes and compositions merged, pictures and sounds replaced by key. " + SCHEMA_MOD_PATHS[1],
    ],
  }),
  maps: _sc.arr(SCHEMA_CATALOG_ENTRY, {
    d: [
      "Mappe aggiunte al menu, come le voci di `missions/catalog.json`; `file` è il JSON della mappa nella cartella della mod, e anche i percorsi dentro la mappa (immagine, suoni, texture) partono da lì",
      "Maps added to the menu, like the `missions/catalog.json` entries; `file` is the map JSON in the mod folder, and paths inside the map (image, sounds, textures) start from there too",
    ],
  }),
  campaigns: _sc.arr(_sc.str({ ref: "campaignFile" }), {
    d: [
      "Campagne aggiunte all'elenco: JSON nella cartella della mod; il loro `map` parte da lì (`../../missions/hue_city.json` = mappa del gioco)",
      "Campaigns added to the list: JSON in the mod folder; their `map` starts from there (`../../missions/hue_city.json` = game map)",
    ],
  }),
}, { d: ["Mod (`mods/<cartella>/mod.json`)", "Mod (`mods/<folder>/mod.json`)"] });
delete SCHEMA_MOD.fields.config.fields.$schema;

const SCHEMA_MOD_INDEX = _sc.obj({
  $schema: SCHEMA_SCHEMA,
  mods: _sc.arr(_sc.str({ ref: "modDir" }), {
    req: true,
    d: ["Cartelle delle mod in `mods/`, nell'ordine in cui si applicano", "Mod folders in `mods/`, in the order they are applied"],
  }),
}, { d: ["Elenco delle mod (`mods/index.json`)", "Mod list (`mods/index.json`)"] });
