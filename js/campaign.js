// ── CAMPAGNA / PLOTONE ─────────────────────────────────────────────────
// Un plotone di soldati con nome che sopravvive tra le operazioni: se ne
// schierano fino a 4 (CAMPAIGN_RULES.deploySize) su 8 e ferite, caduti,
// esperienza, gradi, perk e punti requisizione (PR) restano.
// Definizione: missions/campaigns/<id>.json (schema.js:SCHEMA_CAMPAIGN),
// elencate in missions/campaigns/index.json e nel campo "campaigns" delle mod
// (CAMPAIGN_FILES, mods.js:applyMod). Stato della campagna in
// localStorage[vn68_campaign] (una alla volta); la missione in corso si salva
// in CAMPAIGN_SAVE_KEY (saveGame.js:currentSaveKey), così una partita libera
// non la sovrascrive.
// Aggancio al ciclo di gioco: startCampaignOp → game.js:startGame con
// options.roster/options.campaign; game.js:showGameOver → campaignGameOver →
// campaignResolve; backModal.js: abbandono = ritirata (campaignRetreat).
// Le funzioni sullo stato (newCampaignState, campaignLaunch, campaignResolve,
// campaignBuy…) non toccano il DOM: le usa anche il simulatore
// (tools/sim/run.js --campaign).
const CAMPAIGN_INDEX_PATH = "missions/campaigns/index.json";
const CAMPAIGN_DIR = "missions/campaigns/";
const CAMPAIGN_KEY = "vn68_campaign";
let CAMPAIGN_FILES = []; // campagne delle mod attive (percorsi già risolti)
let CAMPAIGN = null; // stato della campagna in corso

// Regole di default; il campo "rules" della campagna le modifica (unito in
// profondità: numeri e array sostituiti, oggetti uniti)
const CAMPAIGN_RULES = {
  rosterSize: 8,
  deploySize: 4,
  startRequisition: 2,
  // Esperienza per missione (non in ritirata)
  xp: { survive: 1, kill: 1, win: 1, heal: 1 },
  // Gradi in ordine di XP: hp = punti ferita in più, perk = scelta di un perk
  ranks: [
    { id: "pvt", xp: 0 },
    { id: "pfc", xp: 3, hp: 1 },
    { id: "cpl", xp: 7, perk: true },
    { id: "sgt", xp: 12, perk: true, hp: 1 },
  ],
  perkChoices: 2,
  // Operazioni di convalescenza: ferito (HP ≤ 60%), grave (< 30% o
  // emorragia), evacuato (caduto in una missione vinta, con medevacChance)
  recovery: { light: 1, severe: 2, medevac: 3 },
  medevacChance: 1 / 3,
  // PR a fine missione: vittoria (o "reward" dell'operazione), nessun
  // ferito né caduto, ogni caduto
  requisition: { win: 3, clean: 1, kia: -1 },
  costs: { replacement: 2, fastHeal: 1 },
  // Dotazioni per una sola operazione: +ammo agli usi e +mags ai caricatori
  // di riserva delle armi che hanno il campo `field` (tutte se manca), tranne
  // quelle con un campo di `exclude`
  supplies: {
    ammo: { cost: 1, ammo: 1, mags: 1, exclude: ["artillery", "napalm"] },
    artillery: { cost: 2, field: "artillery", ammo: 1 },
    napalm: { cost: 3, field: "napalm", ammo: 1 },
  },
  // Operazioni a scelta: difficoltà, ricompensa e pressione VC per livello;
  // la pressione (0…maxPressure) aggiunge pressureVc VC a ogni missione
  tiers: {
    easy: { vcCount: -2, reward: 2, pressure: 1 },
    normal: { vcCount: 0, reward: 3, pressure: 0 },
    hard: { vcCount: 2, reward: 5, pressure: -1 },
  },
  pressureVc: 1,
  maxPressure: 4,
};

// Perk dei soldati. config.json "perks" li modifica o ne aggiunge
// (config.js:applyConfigData). Funzionano per campi, mai per nome:
//   hp           punti ferita in più
//   overwatchAtk ATK in più in overwatch (overwatch.js)
//   noise        rumore degli spari (mechanics.js:weaponNoise; esplosivi esclusi)
//   heal         HP in più curati dall'abilità di cura (specialActions.js)
//   vision       raggio visivo (mechanics.js:unitVision)
//   trapSense    individua trappole e tunnel come il geniere (hasTrapSense)
//   requires     campi della classe richiesti, es. { "special": "heal" }
//   labels       { "it": { name, desc }, "en": … } (default: translations campaign.perks)
const PERKS = {
  steady: { icon: "🎯", overwatchAtk: 1, requires: { special: "overwatch" } },
  tough: { icon: "🛡", hp: 2 },
  quiet: { icon: "🤫", noise: -1 },
  pointman: { icon: "👣", trapSense: true, requires: { trapSense: false } },
  fieldMedic: { icon: "➕", heal: 1, requires: { special: "heal" } },
};

// Nomi dei soldati (config.json "soldierNames" li sostituisce)
const SOLDIER_FIRST_NAMES = [
  "James", "Robert", "John", "Michael", "William", "David", "Richard", "Thomas", "Charles", "Gary",
  "Larry", "Ronald", "Dennis", "Danny", "Jerry", "Frank", "Raymond", "Eddie", "Luis", "Carlos",
  "Tony", "Walter", "Billy", "Roy", "Earl", "Willie", "Ray", "Joe", "Hank", "Leon",
];
const SOLDIER_LAST_NAMES = [
  "Hayes", "Kovacs", "Morales", "Briggs", "Tucker", "Webb", "Diaz", "Burns", "Walsh", "Novak",
  "Carter", "Reyes", "Sullivan", "Jackson", "Russo", "Kowalski", "Brennan", "Haskell", "Ortiz", "Mendez",
  "Fletcher", "Dawson", "Price", "Garrett", "Lindqvist", "O'Hara", "Baker", "Wilkes", "Thornton", "Murphy",
  "Castillo", "Brooks", "Hendricks", "Polanski", "Washington", "Kincaid", "Doyle", "Santoro", "Fischer", "Greene",
];
const BASE_SQUAD = ["assault", "sniper", "engineer", "medic"];

// ── Regole, testi, perk ────────────────────────────────────────────────
function campaignRules(st = CAMPAIGN) {
  return deepMerge(JSON.parse(JSON.stringify(CAMPAIGN_RULES)), st?.def?.rules);
}

// Testo della campagna (translations.<lingua>.<chiave>, italiano se manca)
function campaignText(def, key) {
  const get = (lang) => key.split(".").reduce((o, k) => o?.[k], def?.translations?.[lang]);
  const v = get(LANG) ?? get("it");
  return typeof v === "string" ? v : null;
}

// t() con un'alternativa se la chiave manca
function tOr(key, fallback, vars) {
  const v = t(key, vars);
  return v === key ? fallback : v;
}

function rankLabel(rules, i, field = "short") {
  const r = rules.ranks[Math.min(i, rules.ranks.length - 1)];
  if (!r) return "";
  return r.labels?.[LANG]?.[field] ?? r.labels?.it?.[field] ?? tOr(`campaign.ranks.${r.id}.${field}`, r.id);
}

function perkText(id, field) {
  const p = PERKS[id];
  return p?.labels?.[LANG]?.[field] ?? p?.labels?.it?.[field] ?? tOr(`campaign.perks.${id}.${field}`, field === "name" ? id : "");
}

// Il perk è adatto alla classe? (requires: campi della classe)
function perkAllowed(p, cls) {
  const def = UNIT_CLASSES[cls] || {};
  return Object.entries(p?.requires || {}).every(([k, v]) =>
    typeof v === "boolean" ? !!def[k] === v : def[k] === v,
  );
}

const unitPerks = (u) => (u?.perks || []).map((id) => PERKS[id]).filter(Boolean);
const perkSum = (u, field) => unitPerks(u).reduce((s, p) => s + (p[field] || 0), 0);
const perkHas = (u, field) => unitPerks(u).some((p) => p[field]);
// Individua trappole e tunnel: classe con trapSense o perk
const hasTrapSense = (u) => !!UNIT_CLASSES[u?.cls]?.trapSense || perkHas(u, "trapSense");

// Uccisione di un VC: conta per il soldato US che l'ha causata (attacco,
// esplosione, overwatch, artiglieria/napalm col suo id, tunnel sigillato)
function creditKill(by) {
  const u = by && G.units.find((x) => x.id === by.id);
  if (u) u.kills = (u.kills || 0) + 1;
}

function _shuffled(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Caricamento delle definizioni ──────────────────────────────────────
async function campaignFileList() {
  let base = [];
  try {
    const idx = await fetchJsonData(CAMPAIGN_INDEX_PATH);
    base = (idx.campaigns || []).map((f) => CAMPAIGN_DIR + f);
  } catch (e) {
    if (e.issues?.[0]?.key !== "file_missing") console.warn("[campaign]", e.message);
  }
  return [...base, ...CAMPAIGN_FILES];
}

// JSON di una campagna; quella di una mod con i percorsi dalla sua cartella
async function loadCampaignDef(file) {
  const def = await fetchJsonData(file);
  const mod = isModPath(file);
  assertValid(file, validateCampaign(def, mod ? { base: _dirOf(file) } : {}));
  if (mod) rebasePaths(SCHEMA_CAMPAIGN, def, _dirOf(file));
  return def;
}

// "map" di un'operazione: da missions/, o già risolto nelle campagne delle mod
function campaignMapPath(file, map) {
  return isModPath(file) ? map : "missions/" + map;
}

// ── Stato ──────────────────────────────────────────────────────────────
function loadCampaign() {
  try {
    const st = JSON.parse(localStorage.getItem(CAMPAIGN_KEY) || "null");
    CAMPAIGN = st?.version === 1 ? st : null;
  } catch (e) {
    CAMPAIGN = null;
  }
  return CAMPAIGN;
}

function saveCampaign() {
  try {
    if (CAMPAIGN) localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(CAMPAIGN));
    else localStorage.removeItem(CAMPAIGN_KEY);
  } catch (e) {
    console.warn("[campaign] save failed:", e);
  }
}

const campaignSeed = (st, i, j) => 10000 + ((st.seed * 31 + i * 7919 + j * 104729) % 890000);

function newCampaignState(def, file, seed = newMapSeed()) {
  const st = {
    version: 1,
    file,
    def,
    seed,
    mods: [...ACTIVE_MODS],
    started: Date.now(),
    opIndex: 0,
    ops: [],
    requisition: 0,
    pressure: 0,
    roster: [],
    fallen: [],
    log: [],
    supplies: [],
    inProgress: null,
    debrief: null,
    result: null,
    nextId: 1,
  };
  const rules = campaignRules(st);
  st.requisition = rules.startRequisition;
  st.ops = def.procedural
    ? generateCampaignOps(st)
    : (def.operations || []).map((op, i) => normalizeOp(st, op, i));
  const classes =
    def.startRoster || Array.from({ length: rules.rosterSize }, (_, i) => BASE_SQUAD[i % BASE_SQUAD.length]);
  for (const cls of classes.slice(0, rules.rosterSize)) recruitSoldier(st, cls);
  return st;
}

// Operazione: una missione o una scelta tra più ("choices")
function normalizeOp(st, op, i) {
  const id = op.id || `op${i + 1}`;
  const list = op.choices || [op];
  return {
    id,
    choices: list.map((c, j) => ({
      id: c.id || (op.choices ? `${id}_${j + 1}` : id),
      file: c.map ? campaignMapPath(st.file, c.map) : null,
      generator: c.generator || null,
      size: c.size || "small",
      missionType: c.missionType,
      night: !!c.night,
      tier: c.tier || null,
      reward: c.reward ?? null,
      overrides: c.overrides || null,
      mapSeed: c.seed ?? campaignSeed(st, i, j),
    })),
  };
}

// Campagna procedurale: operazioni generate dal seed, 2-3 missioni a scelta
// (facile/normale/difficile) su mappe procedurali
function generateCampaignOps(st) {
  const p = st.def.procedural;
  const rng = _mulberry32(st.seed * 97 + 3);
  const rpick = (a) => a[Math.floor(rng() * a.length)];
  const gens = p.generators || Object.keys(MAP_GENERATORS);
  const sizes = p.sizes || ["small", "medium"];
  const types = p.missionTypes || Object.keys(MISSION_TYPES);
  const tierOrder = ["easy", "normal", "hard"];
  // Nomi in codice consecutivi nell'elenco delle traduzioni: tutti diversi
  const codename = Math.floor(rng() * 1000);
  const ops = [];
  for (let i = 0; i < (p.operations || 5); i++) {
    const k = p.choices || 3;
    const tiers = _shuffled(tierOrder, rng).slice(0, Math.min(k, 3));
    while (tiers.length < k) tiers.push("normal");
    const used = new Set();
    const choices = tiers.map((tier, j) => {
      // Tipi di missione diversi tra le scelte, finché ce ne sono
      let type = rpick(types);
      for (let n = 0; n < 8 && used.has(type); n++) type = rpick(types);
      used.add(type);
      return {
        id: `op${i + 1}_${j + 1}`,
        file: null,
        generator: rpick(gens),
        size: rpick(sizes),
        missionType: type,
        night: rng() < (p.nightChance ?? 0.25),
        tier,
        reward: null,
        overrides: null,
        mapSeed: campaignSeed(st, i, j),
      };
    });
    choices.sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier));
    ops.push({ id: `op${i + 1}`, codename: codename + i, choices });
  }
  return ops;
}

function soldierNamePool() {
  const n = CONFIG.soldierNames || {};
  return {
    first: n.first?.length ? n.first : SOLDIER_FIRST_NAMES,
    last: n.last?.length ? n.last : SOLDIER_LAST_NAMES,
  };
}

function recruitSoldier(st, cls) {
  const names = soldierNamePool();
  const used = new Set([...st.roster, ...st.fallen].map((s) => s.last));
  let last = pick(names.last);
  for (let i = 0; i < 50 && used.has(last); i++) last = pick(names.last);
  const s = {
    id: "s" + st.nextId++,
    first: pick(names.first),
    last,
    cls,
    rank: 0,
    xp: 0,
    status: "fit",
    recoverOps: 0,
    missions: 0,
    kills: 0,
    perks: [],
    perkOffers: [],
  };
  st.roster.push(s);
  return s;
}

const soldierFullName = (s) => `${s.first} ${s.last}`;

function soldierHpBonus(rules, s) {
  const ranks = rules.ranks.slice(0, s.rank + 1).reduce((a, r) => a + (r.hp || 0), 0);
  return ranks + s.perks.reduce((a, id) => a + (PERKS[id]?.hp || 0), 0);
}

// Soldato → voce di options.roster per startGame
function soldierUnitDef(st, s) {
  const rules = campaignRules(st);
  return {
    cid: s.id,
    cls: s.cls,
    name: `${rankLabel(rules, s.rank)} ${s.last}`,
    hpBonus: soldierHpBonus(rules, s),
    perks: [...s.perks],
  };
}

const fitSoldiers = (st) => st.roster.filter((s) => s.status === "fit");

// Schieramento proposto: il più esperto di ogni classe, poi gli altri per XP
function defaultDeployment(st) {
  const fit = [...fitSoldiers(st)].sort((a, b) => b.xp - a.xp);
  const n = campaignDeployCount(st);
  const ids = [];
  for (const s of fit) if (ids.length < n && !ids.some((id) => st.roster.find((x) => x.id === id).cls === s.cls)) ids.push(s.id);
  for (const s of fit) if (ids.length < n && !ids.includes(s.id)) ids.push(s.id);
  return ids;
}

// Soldati da schierare: tutti quelli disponibili fino a deploySize
const campaignDeployCount = (st) => Math.min(campaignRules(st).deploySize, fitSoldiers(st).length);

function campaignChoice(st, choiceIdx = st.inProgress?.choice ?? 0) {
  return st.ops[st.opIndex]?.choices[choiceIdx] ?? null;
}

function choiceReward(st, c) {
  const rules = campaignRules(st);
  return c.reward ?? rules.tiers[c.tier]?.reward ?? rules.requisition.win;
}

// Campi della mappa cambiati per l'operazione: curva di difficoltà
// ("difficulty", interpolata tra la prima e l'ultima operazione), poi
// "overrides" dell'operazione, poi livello della scelta e pressione VC
function campaignOverrides(st, opIdx, c, md = {}) {
  const rules = campaignRules(st);
  const diff = st.def.difficulty || st.def.procedural?.difficulty;
  const n = st.ops.length;
  const f = n > 1 ? opIdx / (n - 1) : 0;
  const lerp = ([a, b]) => a + (b - a) * f;
  const o = {};
  if (diff?.vcCount) o.vcCount = Math.round(lerp(diff.vcCount));
  if (diff?.reinforcementTurn) o.reinforcementTurn = Math.max(1, Math.round(lerp(diff.reinforcementTurn)));
  if (diff?.vcMix) {
    const [a, b] = diff.vcMix;
    o.vcMix = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      o.vcMix[k] = Math.round(lerp([a[k] || 0, b[k] || 0]) * 100) / 100;
    }
  }
  deepMerge(o, c.overrides || {});
  const extra = (rules.tiers[c.tier]?.vcCount || 0) + (st.pressure || 0) * rules.pressureVc;
  if (extra) o.vcCount = Math.max(1, (o.vcCount ?? md.vcCount ?? 6) + extra);
  return o;
}

// mapData della missione scelta, con le modifiche dell'operazione; una
// missione non valida o non giocabile sulla mappa lancia MapDataError
async function campaignMissionData(st, opIdx, choiceIdx) {
  const c = st.ops[opIdx].choices[choiceIdx];
  const md = c.generator
    ? generateProceduralMap(c.generator, c.mapSeed, c.size)
    : await fetchMapFile(c.file);
  deepMerge(md, campaignOverrides(st, opIdx, c, md));
  const issues = validateMission(md);
  if (!(md.supportedMissions || []).includes(c.missionType))
    issues.push({ level: "error", path: "missionType", key: "campaign_mission_unsupported", vars: { type: c.missionType } });
  assertValid(c.file || c.generator, issues);
  return md;
}

// Avvio di un'operazione: soldati schierati e dotazioni comprate passano alla
// missione; restituisce options.roster per startGame
function campaignLaunch(st, choiceIdx, ids) {
  st.inProgress = { opIndex: st.opIndex, choice: choiceIdx, deployed: [...ids], supplies: [...st.supplies] };
  st.supplies = [];
  st.debrief = null;
  return ids.map((id) => soldierUnitDef(st, st.roster.find((s) => s.id === id)));
}

// Operazione interrotta prima del primo salvataggio (pagina chiusa al
// primo turno): si torna all'HQ come se non fosse partita
function campaignCancelLaunch(st) {
  if (!st.inProgress) return;
  st.supplies = st.inProgress.supplies || [];
  st.inProgress = null;
}

// Dotazioni comprate: usi e caricatori in più alle armi della squadra
function applyCampaignSupplies(st, ids) {
  const rules = campaignRules(st);
  for (const id of ids || []) {
    const sp = rules.supplies[id];
    if (!sp) continue;
    for (const u of G.units) {
      for (const w of u.weapons || []) {
        if (sp.field && !w[sp.field]) continue;
        if ((sp.exclude || []).some((f) => w[f])) continue;
        if (sp.ammo && w.ammo != null) w.ammo += sp.ammo;
        if (sp.mags && w.mag && w.mags != null) w.mags += sp.mags;
      }
    }
  }
}

function rankIndexFor(rules, xp) {
  let r = 0;
  rules.ranks.forEach((k, i) => {
    if (xp >= k.xp) r = i;
  });
  return r;
}

function offerPerks(st, s) {
  const rules = campaignRules(st);
  const offered = new Set(s.perkOffers.flat());
  const opts = Object.keys(PERKS).filter(
    (id) => !s.perks.includes(id) && !offered.has(id) && perkAllowed(PERKS[id], s.cls),
  );
  const offer = _shuffled(opts).slice(0, rules.perkChoices);
  if (offer.length) s.perkOffers.push(offer);
}

function campaignChoosePerk(st, sid, perkId) {
  const s = st.roster.find((x) => x.id === sid);
  if (!s?.perkOffers[0]?.includes(perkId)) return false;
  s.perks.push(perkId);
  s.perkOffers.shift();
  return true;
}

// Fine di una missione: aggiorna plotone, PR e avanzamento; units = unità
// della missione (G.units, o quelle dell'ultimo salvataggio in ritirata).
// Restituisce il debriefing (salvato anche in st.debrief)
function campaignResolve(st, units, win, { retreat = false } = {}) {
  const rules = campaignRules(st);
  const ip = st.inProgress || { opIndex: st.opIndex, choice: 0, deployed: units.map((u) => u.cid) };
  const op = st.ops[ip.opIndex];
  const choice = op?.choices[ip.choice] || {};
  const deployed = new Set(ip.deployed);
  const deb = {
    opIndex: ip.opIndex,
    choice: ip.choice,
    win: win && !retreat,
    retreat,
    soldiers: [],
    recovered: [],
    pr: 0,
    pressure: 0,
  };
  // Chi è rimasto all'HQ recupera un'operazione di convalescenza
  for (const s of st.roster) {
    if (deployed.has(s.id) || s.status !== "wounded") continue;
    s.recoverOps = Math.max(0, s.recoverOps - 1);
    if (!s.recoverOps) {
      s.status = "fit";
      deb.recovered.push(s.id);
    }
  }
  let kia = 0;
  let hurt = 0;
  for (const u of units) {
    const s = st.roster.find((x) => x.id === u.cid);
    if (!s) continue;
    const kills = u.kills || 0;
    const r = { id: s.id, name: soldierFullName(s), cls: s.cls, kills, xp: 0, rankBefore: s.rank, outcome: "fit" };
    s.missions++;
    s.kills += kills;
    if (!u.alive) {
      if (deb.win && Math.random() < rules.medevacChance) {
        r.outcome = "medevac";
        s.status = "wounded";
        s.recoverOps = rules.recovery.medevac;
        hurt++;
      } else {
        r.outcome = "kia";
        kia++;
        st.roster.splice(st.roster.indexOf(s), 1);
        st.fallen.push({ ...s, status: "kia", opIndex: ip.opIndex, opName: campaignOpName(st, ip.opIndex) });
      }
    } else {
      const ratio = u.hp / u.maxHp;
      const severe = ratio < SEVERE_WOUND_THRESHOLD || u.bleeding;
      if (severe || ratio <= WOUND_THRESHOLD) {
        r.outcome = severe ? "severe" : "light";
        s.status = "wounded";
        s.recoverOps = severe ? rules.recovery.severe : rules.recovery.light;
        hurt++;
      }
    }
    // Esperienza e promozioni (non in ritirata, non ai caduti)
    if (!retreat && r.outcome !== "kia") {
      r.xp =
        (u.alive ? rules.xp.survive : 0) +
        kills * rules.xp.kill +
        (deb.win ? rules.xp.win : 0) +
        (u.heals || 0) * rules.xp.heal;
      s.xp += r.xp;
      const rank = rankIndexFor(rules, s.xp);
      for (let i = s.rank + 1; i <= rank; i++) if (rules.ranks[i].perk) offerPerks(st, s);
      if (rank > s.rank) r.promoted = rank;
      s.rank = Math.max(s.rank, rank);
    }
    deb.soldiers.push(r);
  }
  // Punti requisizione e pressione VC
  if (!retreat) {
    if (deb.win) {
      deb.pr += choiceReward(st, choice);
      if (!kia && !hurt) deb.pr += rules.requisition.clean;
    }
    deb.pr += kia * rules.requisition.kia;
    if (deb.win && choice.tier) {
      const before = st.pressure || 0;
      st.pressure = clamp(before + (rules.tiers[choice.tier]?.pressure || 0), 0, rules.maxPressure);
      deb.pressure = st.pressure - before;
    }
  }
  const prBefore = st.requisition;
  st.requisition = Math.max(0, st.requisition + deb.pr);
  deb.pr = st.requisition - prBefore;
  st.log.push({ op: ip.opIndex, choice: choice.id, win: deb.win, retreat, kia, pr: deb.pr });
  if (deb.win) st.opIndex++;
  st.inProgress = null;
  st.debrief = deb;
  campaignCheckEnd(st);
  return deb;
}

// Vittoria dopo l'ultima operazione; sconfitta se non si possono più
// schierare deploySize soldati, contando i feriti e i rimpiazzi pagabili
function campaignCheckEnd(st) {
  const rules = campaignRules(st);
  if (st.opIndex >= st.ops.length) {
    st.result = "victory";
    return;
  }
  const free = Math.max(0, rules.rosterSize - st.roster.length);
  const affordable = Math.min(free, Math.floor(st.requisition / rules.costs.replacement));
  if (st.roster.length + affordable < rules.deploySize) st.result = "defeat";
}

// Nessun soldato disponibile: un'operazione di riposo (i feriti recuperano)
function campaignRest(st) {
  if (fitSoldiers(st).length) return false;
  for (const s of st.roster) {
    s.recoverOps = Math.max(0, s.recoverOps - 1);
    if (!s.recoverOps) s.status = "fit";
  }
  st.log.push({ op: st.opIndex, rest: true });
  return true;
}

// Spese all'HQ: rimpiazzo (arg = classe), cura accelerata (arg = soldato),
// dotazioni (si comprano e si restituiscono finché l'operazione non parte)
function campaignBuy(st, item, arg) {
  const rules = campaignRules(st);
  if (st.inProgress || st.result) return false;
  if (item === "replacement") {
    const cost = rules.costs.replacement;
    if (st.roster.length >= rules.rosterSize || st.requisition < cost || !UNIT_CLASSES[arg]) return false;
    st.requisition -= cost;
    recruitSoldier(st, arg);
    return true;
  }
  if (item === "fastHeal") {
    const s = st.roster.find((x) => x.id === arg);
    const cost = rules.costs.fastHeal;
    if (s?.status !== "wounded" || st.requisition < cost) return false;
    st.requisition -= cost;
    s.status = "fit";
    s.recoverOps = 0;
    return true;
  }
  const sp = rules.supplies[item];
  if (!sp) return false;
  if (st.supplies.includes(item)) {
    st.supplies = st.supplies.filter((x) => x !== item);
    st.requisition += sp.cost;
    return true;
  }
  if (st.requisition < sp.cost) return false;
  st.requisition -= sp.cost;
  st.supplies.push(item);
  return true;
}

function campaignOpName(st, i) {
  const op = st.ops[i];
  if (!op) return "";
  const named = campaignText(st.def, `ops.${op.id}.name`);
  if (named) return named;
  const names = T.campaign?.codenames;
  if (op.codename != null && Array.isArray(names) && names.length)
    return t("campaign.op_codename", { name: names[op.codename % names.length] });
  return t("campaign.op_number", { n: i + 1 });
}

// ── Integrazione col gioco ─────────────────────────────────────────────
const campaignMissionActive = () => !!G.missionState?.campaign && G.phase !== "gameover";
let _campaignDebriefPending = false;

// Da game.js:showGameOver (dopo clearSave)
function campaignGameOver(win) {
  const btn = document.getElementById("btn-restart");
  _campaignDebriefPending = false;
  if (!G.missionState?.campaign) {
    btn.textContent = t("buttons.new_mission");
    return;
  }
  loadCampaign();
  if (!CAMPAIGN?.inProgress) return;
  campaignResolve(CAMPAIGN, G.units, win);
  saveCampaign();
  _campaignDebriefPending = true;
  btn.textContent = t("campaign.back_to_hq");
}

// Bottone di fine partita (backModal.js): in campagna torna all'HQ
function campaignReturnToHQ() {
  if (!_campaignDebriefPending) return false;
  _campaignDebriefPending = false;
  if (CONFIG.menuMusic) ambientPlay(CONFIG.menuMusic);
  openCampaignModal();
  return true;
}

// Abbandono della missione (backModal.js): ritirata, con i soldati come
// all'ultimo salvataggio (o come sono partiti, se non ce n'è ancora uno)
function campaignRetreat() {
  if (!campaignMissionActive()) return false;
  loadCampaign();
  if (!CAMPAIGN?.inProgress) return false;
  const save = loadSave(CAMPAIGN_SAVE_KEY);
  const units = save?.units || G.units.map((u) => ({ ...u, alive: true, hp: u.maxHp, bleeding: false, kills: 0 }));
  campaignResolve(CAMPAIGN, units, false, { retreat: true });
  clearSave(CAMPAIGN_SAVE_KEY);
  saveCampaign();
  return true;
}

// ── Interfaccia ────────────────────────────────────────────────────────
const campaignOverlay = () => document.getElementById("campaign-overlay");
const campaignOverlayOpen = () => !campaignOverlay().classList.contains("hidden");
const _esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let _cmpView = "list";
let _cmpUi = { choice: null, deploy: new Set(), replaceCls: "assault", confirmNew: null, error: null };

// view: "list" per aprire l'elenco anche con una campagna in corso
async function openCampaignModal(view = null) {
  document.getElementById("modal-overlay").style.display = "none";
  document.getElementById("btn-menu").style.display = "none";
  document.getElementById("tutorial-panel").classList.add("hidden");
  campaignOverlay().classList.remove("hidden");
  loadCampaign();
  // Missione lanciata ma mai salvata (pagina chiusa al primo turno)
  if (CAMPAIGN?.inProgress && !loadSave(CAMPAIGN_SAVE_KEY)) {
    campaignCancelLaunch(CAMPAIGN);
    saveCampaign();
  }
  _cmpUi = { choice: null, deploy: new Set(), replaceCls: "assault", confirmNew: null, error: null };
  if (!CAMPAIGN) _cmpView = "list";
  else if (CAMPAIGN.debrief) _cmpView = "debrief";
  else _cmpView = CAMPAIGN.result ? "end" : "hq";
  if (view === "list") _cmpView = "list";
  renderCampaignView();
}

function closeCampaignModal() {
  campaignOverlay().classList.add("hidden");
  document.getElementById("modal-overlay").style.display = "flex";
  initModal();
}

function renderCampaignView() {
  if (_cmpView === "list") return renderCampaignList();
  if (_cmpView === "debrief") return renderCampaignDebrief();
  if (_cmpView === "end") return renderCampaignEnd();
  return renderCampaignHQ();
}

function classBadge(cls) {
  const d = UNIT_CLASSES[cls];
  if (!d) return "";
  return `<span class="tut-class" style="background:${d.color}" title="${_esc(d.name)}">${_esc(d.symbol)}</span>`;
}

const campaignName = (def, file) => campaignText(def, "name") ?? def?.name ?? file;

// Elenco delle campagne: in corso (continua) e disponibili (nuova)
async function renderCampaignList() {
  const box = document.getElementById("campaign-box");
  box.innerHTML = `
    <button class="modal-back-btn" id="cmp-back">${t("campaign.back_menu")}</button>
    <h2>${t("campaign.title")}</h2>
    <p>${t("campaign.subtitle")}</p>
    <div class="modal-mission-list" id="cmp-list"><div class="tut-loading">${t("modal.loading")}</div></div>`;
  box.querySelector("#cmp-back").onclick = closeCampaignModal;
  const list = box.querySelector("#cmp-list");
  const files = await campaignFileList();
  const defs = await Promise.all(
    files.map((f) => loadCampaignDef(f).then((def) => ({ f, def }), (err) => ({ f, err }))),
  );
  list.innerHTML = "";
  if (CAMPAIGN && !CAMPAIGN.result) {
    const missing = (CAMPAIGN.mods || []).filter((id) => !ACTIVE_MODS.includes(id));
    const cur = document.createElement("div");
    cur.className = "mission-option active cmp-current";
    cur.innerHTML = `
      <div class="mission-icon">🎖</div>
      <div style="flex:1">
        <div class="mname">${_esc(campaignName(CAMPAIGN.def, CAMPAIGN.file))}</div>
        <div class="mdesc">${t("campaign.in_progress", { n: CAMPAIGN.opIndex + 1, total: CAMPAIGN.ops.length, men: CAMPAIGN.roster.length })}</div>
        ${missing.length ? `<div class="mdesc cmp-bad">${t("mods.save_missing", { mods: missing.join(", ") })}</div>` : ""}
      </div>
      <button class="btn" id="cmp-continue" ${missing.length ? "disabled" : ""}>${t("campaign.continue")}</button>`;
    cur.querySelector("#cmp-continue").onclick = () => {
      sfx("click");
      _cmpView = CAMPAIGN.debrief ? "debrief" : "hq";
      renderCampaignView();
    };
    list.appendChild(cur);
  }
  for (const { f, def, err } of defs) {
    const div = document.createElement("div");
    div.className = "mission-option";
    if (err) {
      div.innerHTML = `<div class="mission-icon">⚠</div><div class="mdesc load-error" style="flex:1"></div>`;
      showLoadError(div.querySelector(".mdesc"), err);
      list.appendChild(div);
      continue;
    }
    const count = def.procedural ? def.procedural.operations || 5 : (def.operations || []).length;
    const mod = isModPath(f) ? `<span class="mod-meta">${_esc(f.split("/")[1])}</span>` : "";
    div.innerHTML = `
      <div class="mission-icon">${_esc(def.icon || "🎖")}</div>
      <div style="flex:1">
        <div class="mname">${_esc(campaignName(def, f))} ${mod}</div>
        <div class="mdesc">${_esc(campaignText(def, "description") ?? "")}</div>
        <div class="mdesc">${t(def.procedural ? "campaign.ops_procedural" : "campaign.ops_count", { n: count })}</div>
      </div>
      <button class="btn btn-attack cmp-new">${_cmpUi.confirmNew === f ? t("campaign.confirm_new") : t("campaign.new")}</button>`;
    div.querySelector(".cmp-new").onclick = () => {
      sfx("click");
      // Una campagna in corso si perde: secondo click per confermare
      if (CAMPAIGN && !CAMPAIGN.result && _cmpUi.confirmNew !== f) {
        _cmpUi.confirmNew = f;
        return renderCampaignList();
      }
      clearSave(CAMPAIGN_SAVE_KEY);
      CAMPAIGN = newCampaignState(def, f);
      saveCampaign();
      _cmpUi.confirmNew = null;
      _cmpView = "hq";
      renderCampaignView();
    };
    list.appendChild(div);
  }
  if (!defs.length && !list.children.length) list.innerHTML = `<p>${t("campaign.none")}</p>`;
}

// Etichetta della mappa di una scelta: voce del catalogo con lo stesso file
// o generatore, altrimenti il nome del file
function choiceMapLabel(c) {
  const m = MAPS.find((x) => (c.generator ? x.generator === c.generator : x.file === c.file));
  return m?.label || c.generator || c.file?.split("/").pop();
}

function soldierStatusLabel(s) {
  if (s.status === "fit") return `<span class="cmp-good">${t("campaign.status.fit")}</span>`;
  return `<span class="cmp-warn">${t("campaign.status.wounded", { n: s.recoverOps })}</span>`;
}

function renderCampaignHQ() {
  const st = CAMPAIGN;
  const rules = campaignRules(st);
  const box = document.getElementById("campaign-box");
  const op = st.ops[st.opIndex];
  const save = st.inProgress ? loadSave(CAMPAIGN_SAVE_KEY) : null;
  const locked = !!st.inProgress;
  const fit = fitSoldiers(st);
  const need = campaignDeployCount(st);
  // Scelta e schieramento di default: la prima missione, i più esperti
  if (_cmpUi.choice == null || !op.choices[_cmpUi.choice]) _cmpUi.choice = st.inProgress?.choice ?? 0;
  _cmpUi.deploy = new Set([..._cmpUi.deploy].filter((id) => fit.some((s) => s.id === id)));
  if (!_cmpUi.deploy.size && !locked) _cmpUi.deploy = new Set(defaultDeployment(st));
  if (locked) _cmpUi.deploy = new Set(st.inProgress.deployed);

  const choices = op.choices
    .map((c, i) => {
      const mtp = MISSION_TYPES[c.missionType] || {};
      const brief = campaignText(st.def, `ops.${c.id}.briefing`) ?? (op.choices.length === 1 ? campaignText(st.def, `ops.${op.id}.briefing`) : null);
      const title = op.choices.length > 1 ? campaignText(st.def, `ops.${c.id}.name`) : null;
      const tags = [
        `${mtp.icon || ""} ${_esc(mtp.label || c.missionType)}`,
        `🗺 ${_esc(choiceMapLabel(c))}${c.generator ? ` · ${t(`modal.size_${c.size}`)}` : ""}`,
        c.night ? t("campaign.night") : null,
        c.tier ? `<span class="cmp-tier cmp-tier-${c.tier}">${t(`campaign.tiers.${c.tier}`)}</span>` : null,
        t("campaign.reward", { n: choiceReward(st, c) }),
      ].filter(Boolean);
      return `
      <div class="mission-option cmp-choice ${i === _cmpUi.choice ? "active" : ""}" data-choice="${i}">
        <div style="flex:1">
          ${title ? `<div class="mname">${_esc(title)}</div>` : ""}
          <div class="mdesc cmp-tags">${tags.join(" · ")}</div>
          ${brief ? `<div class="mdesc">${_esc(brief)}</div>` : ""}
        </div>
      </div>`;
    })
    .join("");

  const rows = st.roster
    .map((s) => {
      const canDeploy = s.status === "fit" && !locked;
      const checked = _cmpUi.deploy.has(s.id);
      const perks = s.perks
        .map((id) => `<span class="cmp-perk" title="${_esc(perkText(id, "desc"))}">${PERKS[id]?.icon || "★"} ${_esc(perkText(id, "name"))}</span>`)
        .join("");
      const offer = s.perkOffers[0]
        ? `<div class="cmp-offer">${t("campaign.choose_perk")} ${s.perkOffers[0]
            .map((id) => `<button class="btn cmp-pick" data-sid="${s.id}" data-perk="${id}" title="${_esc(perkText(id, "desc"))}">${PERKS[id]?.icon || "★"} ${_esc(perkText(id, "name"))}</button>`)
            .join(" ")}</div>`
        : "";
      const heal =
        s.status === "wounded" && !locked
          ? `<button class="btn cmp-heal" data-sid="${s.id}" ${st.requisition < rules.costs.fastHeal ? "disabled" : ""}>${t("campaign.fast_heal", { n: rules.costs.fastHeal })}</button>`
          : "";
      const next = rules.ranks[s.rank + 1];
      return `
      <label class="cmp-soldier ${checked ? "deployed" : ""} ${s.status !== "fit" ? "unfit" : ""}">
        <input type="checkbox" data-sid="${s.id}" ${checked ? "checked" : ""} ${canDeploy ? "" : "disabled"} />
        ${classBadge(s.cls)}
        <div class="cmp-sname">
          <div><b>${_esc(rankLabel(rules, s.rank))} ${_esc(soldierFullName(s))}</b> ${perks}</div>
          <div class="mdesc">${_esc(UNIT_CLASSES[s.cls]?.name || s.cls)} · ${t("campaign.soldier_line", { xp: s.xp, next: next ? next.xp : "—", kills: s.kills, missions: s.missions })} · ${soldierStatusLabel(s)}</div>
          ${offer}
        </div>
        ${heal}
      </label>`;
    })
    .join("");

  const supplies = Object.entries(rules.supplies)
    .map(([id, sp]) => {
      const on = st.supplies.includes(id) || st.inProgress?.supplies?.includes(id);
      return `<button class="btn cmp-supply ${on ? "active" : ""}" data-supply="${id}" title="${_esc(tOr(`campaign.supplies.${id}.desc`, ""))}" ${locked || (!on && st.requisition < sp.cost) ? "disabled" : ""}>${on ? "✓ " : ""}${_esc(tOr(`campaign.supplies.${id}.name`, id))} (${sp.cost} PR)</button>`;
    })
    .join("");
  const classOpts = Object.keys(UNIT_CLASSES)
    .map((k) => `<option value="${k}" ${k === _cmpUi.replaceCls ? "selected" : ""}>${_esc(UNIT_CLASSES[k].name)}</option>`)
    .join("");
  const canReplace = !locked && st.roster.length < rules.rosterSize && st.requisition >= rules.costs.replacement;

  const memorial = st.fallen.length
    ? `<details class="cmp-section"><summary>${t("campaign.memorial", { n: st.fallen.length })}</summary>${memorialHTML(st)}</details>`
    : "";

  const ready = _cmpUi.deploy.size === need && need > 0;
  let mainBtn;
  if (locked && save)
    mainBtn = `<button class="btn btn-attack" id="cmp-resume">${t("campaign.resume_op", { turn: save.turn })}</button>`;
  else if (!fit.length) mainBtn = `<button class="btn" id="cmp-rest">${t("campaign.rest")}</button>`;
  else mainBtn = `<button class="btn btn-attack" id="cmp-start" ${ready ? "" : "disabled"}>${t("campaign.start_op")}</button>`;

  box.innerHTML = `
    <button class="modal-back-btn" id="cmp-back">${t("campaign.back_menu")}</button>
    <h2>${_esc(campaignName(st.def, st.file))}</h2>
    <div class="cmp-status">
      <span>${t("campaign.op_progress", { n: st.opIndex + 1, total: st.ops.length })}</span>
      <span>${t("campaign.pr", { n: st.requisition })}</span>
      ${st.pressure ? `<span class="cmp-warn">${t("campaign.pressure", { n: st.pressure })}</span>` : ""}
    </div>
    <div class="cmp-section">
      <h3>${_esc(campaignOpName(st, st.opIndex))}</h3>
      ${op.choices.length > 1 ? `<p class="cmp-hint">${t("campaign.choose_mission")}</p>` : ""}
      <div class="modal-mission-list">${choices}</div>
    </div>
    <div class="cmp-section">
      <h3>${t("campaign.platoon")} <span class="cmp-hint">${t("campaign.deploy_hint", { n: need, sel: _cmpUi.deploy.size })}</span></h3>
      <div class="cmp-roster">${rows}</div>
    </div>
    <div class="cmp-section">
      <h3>${t("campaign.requisitions")}</h3>
      <div class="cmp-req">
        <select id="cmp-replace-cls" ${locked ? "disabled" : ""}>${classOpts}</select>
        <button class="btn" id="cmp-replace" ${canReplace ? "" : "disabled"}>${t("campaign.replacement", { n: rules.costs.replacement })}</button>
      </div>
      <div class="cmp-req">${supplies}</div>
    </div>
    ${memorial}
    <div class="cmp-error load-error" id="cmp-error">${_esc(_cmpUi.error || "")}</div>
    <div class="gen-bar hidden" id="cmp-gen-bar"><div class="gen-fill" id="cmp-gen-fill"></div></div>
    <div class="cmp-actions">
      ${mainBtn}
      <button class="btn" id="cmp-abandon">${_cmpUi.confirmNew === "abandon" ? t("campaign.confirm_abandon") : t("campaign.abandon")}</button>
    </div>`;

  box.querySelector("#cmp-back").onclick = closeCampaignModal;
  box.querySelectorAll(".cmp-choice").forEach((el) => {
    el.onclick = () => {
      if (locked) return;
      sfx("click");
      _cmpUi.choice = +el.dataset.choice;
      renderCampaignHQ();
    };
  });
  box.querySelectorAll(".cmp-soldier input").forEach((el) => {
    el.onchange = () => {
      const id = el.dataset.sid;
      if (el.checked) {
        // Al completo: il nuovo prende il posto del primo scelto
        if (_cmpUi.deploy.size >= need) _cmpUi.deploy.delete([..._cmpUi.deploy][0]);
        _cmpUi.deploy.add(id);
      } else _cmpUi.deploy.delete(id);
      renderCampaignHQ();
    };
  });
  const act = (fn) => () => {
    sfx("click");
    if (fn()) saveCampaign();
    renderCampaignHQ();
  };
  box.querySelectorAll(".cmp-pick").forEach((el) => {
    el.onclick = (e) => {
      e.preventDefault();
      act(() => campaignChoosePerk(st, el.dataset.sid, el.dataset.perk))();
    };
  });
  box.querySelectorAll(".cmp-heal").forEach((el) => {
    el.onclick = (e) => {
      e.preventDefault();
      act(() => campaignBuy(st, "fastHeal", el.dataset.sid))();
    };
  });
  box.querySelectorAll(".cmp-supply").forEach((el) => (el.onclick = act(() => campaignBuy(st, el.dataset.supply))));
  box.querySelector("#cmp-replace-cls").onchange = (e) => (_cmpUi.replaceCls = e.target.value);
  box.querySelector("#cmp-replace").onclick = act(() => campaignBuy(st, "replacement", _cmpUi.replaceCls));
  box.querySelector("#cmp-rest")?.addEventListener("click", act(() => campaignRest(st)));
  box.querySelector("#cmp-start")?.addEventListener("click", () => startCampaignOp(_cmpUi.choice, [..._cmpUi.deploy]));
  box.querySelector("#cmp-resume")?.addEventListener("click", () => resumeCampaignOp());
  box.querySelector("#cmp-abandon").onclick = () => {
    sfx("click");
    if (_cmpUi.confirmNew !== "abandon") {
      _cmpUi.confirmNew = "abandon";
      return renderCampaignHQ();
    }
    clearSave(CAMPAIGN_SAVE_KEY);
    CAMPAIGN = null;
    saveCampaign();
    _cmpUi.confirmNew = null;
    _cmpView = "list";
    renderCampaignView();
  };
}

function memorialHTML(st) {
  const rules = campaignRules(st);
  return `<div class="cmp-memorial">${st.fallen
    .map(
      (s) => `<div class="cmp-fallen">✝ ${classBadge(s.cls)} <b>${_esc(rankLabel(rules, s.rank))} ${_esc(soldierFullName(s))}</b>
        <span class="mdesc">${t("campaign.fallen_line", { op: _esc(s.opName), missions: s.missions, kills: s.kills })}</span></div>`,
    )
    .join("")}</div>`;
}

// Avvio della missione scelta: mappa (con barra se procedurale), squadra
// dal plotone, dotazioni
async function startCampaignOp(choiceIdx, ids) {
  const st = CAMPAIGN;
  const c = campaignChoice(st, choiceIdx);
  const btn = document.getElementById("cmp-start");
  const bar = document.getElementById("cmp-gen-bar");
  const errEl = document.getElementById("cmp-error");
  btn.disabled = true;
  errEl.textContent = "";
  sfx("click");
  let md;
  try {
    await nextPaint();
    md = await campaignMissionData(st, st.opIndex, choiceIdx);
    if (!md.image) {
      bar.classList.remove("hidden");
      await loadTileTextures(md);
      await prebuildTerrainCache(md, (p) => {
        document.getElementById("cmp-gen-fill").style.width = `${Math.round(p * 100)}%`;
      });
    }
  } catch (err) {
    bar.classList.add("hidden");
    showLoadError(errEl, err);
    btn.disabled = false;
    return;
  }
  await ambientFadeOut(800);
  campaignOverlay().classList.add("hidden");
  useMission(md);
  const roster = campaignLaunch(st, choiceIdx, ids);
  saveCampaign();
  startGame(c.missionType, undefined, {
    night: c.night,
    roster,
    campaign: { opIndex: st.opIndex, choice: choiceIdx },
  });
  applyCampaignSupplies(st, st.inProgress.supplies);
  updateUI();
  render();
}

async function resumeCampaignOp() {
  const s = loadSave(CAMPAIGN_SAVE_KEY);
  if (!s) return renderCampaignHQ();
  document.getElementById("cmp-resume").disabled = true;
  const bar = document.getElementById("cmp-gen-bar");
  if (!s.mapData.image) bar.classList.remove("hidden");
  await Promise.all([
    ambientFadeOut(800),
    prebuildTerrainCache(s.mapData, (p) => {
      document.getElementById("cmp-gen-fill").style.width = `${Math.round(p * 100)}%`;
    }),
  ]);
  campaignOverlay().classList.add("hidden");
  resumeGame(s);
}

function renderCampaignDebrief() {
  const st = CAMPAIGN;
  const d = st.debrief;
  const rules = campaignRules(st);
  const box = document.getElementById("campaign-box");
  const title = d.retreat ? "campaign.debrief_retreat" : d.win ? "campaign.debrief_win" : "campaign.debrief_loss";
  const rows = d.soldiers
    .map((r) => {
      const promo = r.promoted != null ? ` <span class="cmp-good">${t("campaign.promoted", { rank: _esc(rankLabel(rules, r.promoted, "name")) })}</span>` : "";
      const tone = { fit: "cmp-good", light: "cmp-warn", severe: "cmp-warn", medevac: "cmp-warn", kia: "cmp-bad" }[r.outcome];
      return `<div class="cmp-deb-row">${classBadge(r.cls)} <b>${_esc(r.name)}</b>
        <span class="${tone}">${t(`campaign.outcome.${r.outcome}`, { n: rules.recovery[{ light: "light", severe: "severe", medevac: "medevac" }[r.outcome]] })}</span>
        <span class="mdesc">${t("campaign.deb_line", { xp: r.xp, kills: r.kills })}</span>${promo}</div>`;
    })
    .join("");
  const recovered = d.recovered
    .map((id) => st.roster.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => _esc(soldierFullName(s)));
  const pr = d.pr > 0 ? `+${d.pr}` : `${d.pr}`;
  box.innerHTML = `
    <h2 class="${d.win ? "win" : "lose"}">${t(title)}</h2>
    <p>${_esc(campaignOpName(st, d.opIndex))}</p>
    <div class="cmp-section cmp-debrief">${rows}</div>
    ${recovered.length ? `<p>${t("campaign.recovered", { names: recovered.join(", ") })}</p>` : ""}
    <p>${t("campaign.deb_pr", { pr, total: st.requisition })}${d.pressure ? ` · ${t("campaign.pressure_change", { n: d.pressure > 0 ? `+${d.pressure}` : d.pressure })}` : ""}</p>
    ${!d.win && !st.result ? `<p class="cmp-hint">${t("campaign.retry_hint")}</p>` : ""}
    <button class="btn btn-attack" id="cmp-deb-ok">${t("campaign.continue")}</button>`;
  box.querySelector("#cmp-deb-ok").onclick = () => {
    sfx("click");
    st.debrief = null;
    saveCampaign();
    _cmpUi.deploy = new Set();
    _cmpUi.choice = null;
    _cmpView = st.result ? "end" : "hq";
    renderCampaignView();
  };
}

function renderCampaignEnd() {
  const st = CAMPAIGN;
  const rules = campaignRules(st);
  const box = document.getElementById("campaign-box");
  const win = st.result === "victory";
  const kills = [...st.roster, ...st.fallen].reduce((a, s) => a + s.kills, 0);
  const played = st.log.filter((l) => !l.rest).length;
  const text = campaignText(st.def, win ? "victory" : "defeat") ?? t(win ? "campaign.victory_desc" : "campaign.defeat_desc");
  const survivors = st.roster
    .map((s) => `<div class="cmp-fallen">${classBadge(s.cls)} <b>${_esc(rankLabel(rules, s.rank))} ${_esc(soldierFullName(s))}</b> <span class="mdesc">${t("campaign.soldier_line", { xp: s.xp, next: "—", kills: s.kills, missions: s.missions })}</span></div>`)
    .join("");
  box.innerHTML = `
    <h2 class="${win ? "win" : "lose"}">${t(win ? "campaign.victory_title" : "campaign.defeat_title")}</h2>
    <p>${_esc(text)}</p>
    <p>${t("campaign.end_stats", { played, kills, fallen: st.fallen.length })}</p>
    <div class="cmp-section"><h3>${t("campaign.survivors")}</h3>${survivors || "—"}</div>
    ${st.fallen.length ? `<div class="cmp-section"><h3>${t("campaign.memorial", { n: st.fallen.length })}</h3>${memorialHTML(st)}</div>` : ""}
    <div class="cmp-actions">
      <button class="btn btn-attack" id="cmp-end-new">${t("campaign.new_campaign")}</button>
      <button class="btn" id="cmp-end-menu">${t("campaign.back_menu")}</button>
    </div>`;
  const finish = () => {
    CAMPAIGN = null;
    saveCampaign();
  };
  box.querySelector("#cmp-end-new").onclick = () => {
    finish();
    _cmpView = "list";
    renderCampaignView();
  };
  box.querySelector("#cmp-end-menu").onclick = () => {
    finish();
    closeCampaignModal();
  };
}
