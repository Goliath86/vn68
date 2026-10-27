// ── COSTANTI GLOBALI ───────────────────────────────────────────────────
const TILE = 64; // dimensione tile in pixel (display)
const AP_PER_TURN = 3; // action points per unità per turno
const SAVE_KEY = "nam68_v1_save";
const CAMPAIGN_SAVE_KEY = "vn68_campaign_save"; // missione in corso di una campagna (campaign.js)
// Versione mostrata nell'intestazione e nel menu (init.js → .game-version)
const GAME_VERSION = "1.1.0";

// ── STATO GLOBALE ──────────────────────────────────────────────────────
const G = {
  mapData: null,
  tileImg: null,
  units: [], // array unità giocante
  enemies: [], // array Vietcong
  selectedUnit: null,
  phase: "player", // 'player' | 'enemy' | 'gameover'
  turn: 1,
  missionType: null,
  missionState: {}, // stato specifico missione
  diceQueue: null, // { resolve, context } per i lanci manuali
  pendingDice: null,
  actionMode: null, // 'move' | 'attack' | 'weapon_select' | 'aoe_confirm' | 'special' | 'rotate' | 'stance'
  currentWeapon: null, // arma attiva durante l'azione corrente
  pendingAoe: null, // { col, row, weapon } — AoE in attesa di conferma
  throwing: false, // granata in volo (combat.js:throwAoe): azioni bloccate
  aimTarget: null, // touch: VC puntato col primo tap, il secondo spara (canvas.js)
  lastMove: null, // { unit, fromCol, fromRow, prevAp } — ultimo movimento annullabile
  reachable: [], // celle raggiungibili
  attackable: [], // celle attaccabili / tile AoE in range
  overwatchList: [], // unità in overwatch
  suppressList: [], // unità assault in fuoco soppressivo
  activeFires: [], // incendi attivi {col, row, turnsLeft}
  canvas: null,
  ctx: null,
  oCanvas: null,
  oCtx: null,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  // vista
  camX: 0,
  camY: 0,
  dragging: false,
  dragStart: null,
  // tooltip
  hoveredTile: null,
  unitMoving: false, // movimento di un soldato in corso (unitMovement.js:moveUnit)
  // effetti grafici attivi
  effects: [],
  // fog of war
  fowEnabled: true,
  visibleTiles: new Set(), // "col,row" strings — aggiornato da recomputeVisibility()
};

// ── SAVE / LOAD ────────────────────────────────────────────────────────

// ── DEFINIZIONI CLASSI ─────────────────────────────────────────────────
// Classi della squadra US. config.json "unitClasses" modifica queste classi o
// ne aggiunge di nuove (config.js:loadConfig; le nuove partono dall'assalto).
// Il comportamento dipende dai campi, mai dal nome della classe:
//   special    abilità speciale: "suppression" | "overwatch" | "demolition" |
//              "heal" | null (nessuna); etichetta da translations units.specials
//   marksman   tiratore scelto: penalità di gittata per le armi senza
//              "rangePenalty", un solo tracciante in overwatch
//   trapSense  individua le trappole a 1 tile e i tunnel a 2
//   sprite     classe US di cui usare lo sprite disegnato se unitImages non
//              ha un'immagine per questa classe
//   labels     (classi da config.json) { "it": { name, desc, special? }, "en": … }
// name/desc/specialLabel vengono dalle traduzioni (i18n.js:applyTranslationsToData)
const UNIT_CLASSES = {
  assault: {
    name: "Assalto",
    symbol: "A",
    color: "#c84040",
    hp: 10,
    move: 4,
    attack: 3,
    defense: 1,
    range: 2,
    vision: 4,
    special: "suppression", // soppressione: riduce AP nemico
    specialLabel: "Fuoco Soppressivo",
    desc: "Forte in attacco ravvicinato, mediocre copertura",
  },
  sniper: {
    name: "Cecchino",
    symbol: "S",
    color: "#407840",
    hp: 7,
    move: 3,
    attack: 4,
    defense: 0,
    range: 6,
    vision: 6,
    special: "overwatch", // overwatch: attacca nemici che si muovono
    specialLabel: "Overwatch",
    marksman: true,
    desc: "Gittata massima, fragile a corto raggio",
  },
  engineer: {
    name: "Geniere",
    symbol: "G",
    color: "#a07828",
    hp: 9,
    move: 3,
    attack: 2,
    defense: 1,
    range: 2,
    vision: 4,
    special: "demolition", // demolisce bunker/ostacoli
    specialLabel: "Demolizione",
    trapSense: true,
    desc: "Può rimuovere bunker e aprire passaggi",
  },
  medic: {
    name: "Medico",
    symbol: "M",
    color: "#2860a0",
    hp: 8,
    move: 3,
    attack: 1,
    defense: 1,
    range: 1,
    vision: 3,
    special: "heal", // cura un'unità adiacente
    specialLabel: "Primo Soccorso",
    desc: "Cura alleati, debole in combattimento",
  },
};

// Abilità speciale dell'unità (null = nessuna)
function unitSpecial(u) {
  return (u && UNIT_CLASSES[u.cls]?.special) || null;
}

// Nomi soldati americani casuali
const SOLDIER_NAMES = [
  "Cpl. Hayes",
  "Sgt. Kovacs",
  "Pvt. Morales",
  "Cpt. Briggs",
  "Pvt. Tucker",
  "Sgt. Webb",
  "Cpl. Diaz",
  "Lt. Burns",
];

// Nomi VC
const VC_NAMES = [
  "Guerrigliero",
  "Cecchino VC",
  "Pattuglia VC",
  "Comandante VC",
];

// ── CLASSI VC ──────────────────────────────────────────────────────────
// Statistiche di base dei nemici. config.json "enemyClasses" modifica queste
// classi o ne aggiunge di nuove (config.js:loadConfig), il "tuning" di una
// mappa le cambia per quella missione (game.js:applyMissionTuning).
//   name   indice in VC_NAMES (tradotti) oppure { "it": …, "en": … }
//   role   comportamento: "rifleman" (pattuglia, piazza trappole, aggira),
//          "sniper" (mimetizzato, salta un turno dopo lo sparo),
//          "commander" (resta in agguato, la sua morte fa ripiegare i vicini)
//   sprite classe VC di cui usare lo sprite disegnato se unitImages non ha
//          un'immagine per questa classe
// Le armi stanno in config.json "weapons" sotto lo stesso nome di classe.
const ENEMY_CLASSES = {
  grunt: { name: 0, role: "rifleman", hp: 5, ap: 2, attack: 2, range: 2, defense: 0, move: 3 },
  sniper_vc: { name: 1, role: "sniper", hp: 6, ap: 2, attack: 3, range: 4, defense: 0, move: 2 },
  commander: { name: 3, role: "commander", hp: 8, ap: 2, attack: 3, range: 2, defense: 1, move: 3 },
};

// Composizione dei VC: pesi per classe. Una mappa li sostituisce con
// "vcMix" (schieramento iniziale e imboscate), "ambushMix" e
// "reinforcementMix" (combat.js:vcMix)
const VC_MIX = {
  spawn: { grunt: 3, sniper_vc: 1, commander: 1 },
  ambush: { grunt: 2, sniper_vc: 1, commander: 1 },
  reinforcement: { grunt: 1 },
};

// ── TIPI MISSIONE ──────────────────────────────────────────────────────
const MISSION_TYPES = {
  recon: {
    label: "Ricognizione",
    icon: "🔭",
    desc: "Esplora tutte le zone indicate mantenendo la squadra operativa",
    color: "#88aaff",
  },
  search_destroy: {
    label: "Search & Destroy",
    icon: "💥",
    desc: "Elimina il numero richiesto di Vietcong o neutralizzali tutti",
    color: "#ff8888",
  },
  rescue_pilot: {
    label: "Recupero Pilota",
    icon: "🪂",
    desc: "Localizza il pilota abbattuto e scortalo al punto di estrazione",
    color: "#ffcc44",
  },
  capture_objective: {
    label: "Conquista Obiettivo",
    icon: "🎯",
    desc: "Occupa e mantieni la posizione obiettivo per il numero di turni richiesto",
    color: "#88ffaa",
  },
};
