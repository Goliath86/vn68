// ── COSTANTI GLOBALI ───────────────────────────────────────────────────
const TILE = 64; // dimensione tile in pixel (display)
const AP_PER_TURN = 3; // action points per unità per turno
const SAVE_KEY = "nam68_v1_save";

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
  actionMode: null, // 'move' | 'attack' | 'weapon_select' | 'aoe_confirm' | 'special'
  currentWeapon: null, // arma attiva durante l'azione corrente
  pendingAoe: null, // { col, row, weapon } — AoE in attesa di conferma
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
  // effetti grafici attivi
  effects: [],
  // fog of war
  fowEnabled: true,
  visibleTiles: new Set(), // "col,row" strings — aggiornato da recomputeVisibility()
};

// ── SAVE / LOAD ────────────────────────────────────────────────────────

// ── DEFINIZIONI CLASSI ─────────────────────────────────────────────────
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
