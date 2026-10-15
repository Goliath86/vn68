// Ambiente headless per simulare partite: carica gli script del gioco (stesso
// ordine di index.html, init.js escluso) in un contesto vm di Node con un DOM
// finto, spegne rendering/audio/animazioni e azzera le attese.
// Ogni partita usa un contesto nuovo: lo stato globale G non si trascina.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..", "..");
const SKIP = new Set(["js/init.js"]);

// Script del gioco nell'ordine di index.html, compilati una volta sola
const SCRIPTS = [...fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
  .matchAll(/<script\s+src="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((src) => !SKIP.has(src))
  .map((src) => new vm.Script(fs.readFileSync(path.join(ROOT, src), "utf8"), { filename: src }));
const BOT = new vm.Script(fs.readFileSync(path.join(__dirname, "bot.js"), "utf8"), {
  filename: "tools/sim/bot.js",
});

// Oggetto DOM "assorbente": ogni proprietà è un altro stub, ogni chiamata
// restituisce uno stub, i valori assegnati vengono ricordati; si converte in 0
// / "" e non è un thenable (await non lo scambia per una Promise)
function makeStub() {
  const target = function () {};
  const store = new Map();
  const proxy = new Proxy(target, {
    get(_, prop) {
      if (store.has(prop)) return store.get(prop);
      if (prop === "then") return undefined;
      if (prop === Symbol.toPrimitive) return (hint) => (hint === "string" ? "" : 0);
      if (prop === Symbol.iterator) return function* () {};
      if (prop === "length") return 0;
      const child = makeStub();
      store.set(prop, child);
      return child;
    },
    set(_, prop, value) {
      store.set(prop, value);
      return true;
    },
    apply: () => makeStub(),
    construct: () => makeStub(),
  });
  return proxy;
}

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

// fetch dei JSON del gioco dal disco (config, traduzioni, catalogo, missioni)
async function fakeFetch(url) {
  const file = path.join(ROOT, String(url).replace(/^\.?\//, ""));
  if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => ({}) };
  const text = fs.readFileSync(file, "utf8");
  return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Funzioni del gioco sostituite nella simulazione (solo presentazione/attese)
const NOOP = [
  "render", "renderMap", "renderOverlay", "renderUnitsOnMap", "renderMissionMarkers",
  "updateUI", "updateUnitList", "updateSelInfo", "updateActionButtons", "updateObjectivePanel",
  "addFX", "sfx", "sfxAt", "sfxShoot", "ambientPlay", "ambientStop", "loadMissionSounds",
  "_startTileAnimLoop", "renderTutorialPanel", "saveGame", "clearSave", "clampCamera",
];

const PATCH = `
  sleep = () => Promise.resolve();
  // Movimento istantaneo; l'orientamento finale è quello dell'ultimo passo
  animateEnemyMove = function (unit, fromCol, fromRow, toCol, toRow) {
    if (fromCol !== toCol || fromRow !== toRow) {
      const p = _movePath(fromCol, fromRow, toCol, toRow);
      unit.facing = facingToward(p[p.length - 2], p[p.length - 1]) ?? unit.facing;
    }
    unit.vx = toCol;
    unit.vy = toRow;
    return Promise.resolve();
  };
  log = function (msg, type) {
    if (__sim.logs) __sim.logs.push(G.turn + " [" + (type || "") + "] " + msg);
  };
  showGameOver = function (win) {
    if (G.phase === "gameover") return;
    G.phase = "gameover";
    __sim.result = win ? "win" : "loss";
    __sim.summary = missionSummary(win);
  };
`;

// Crea un contesto con il gioco caricato e pronto (config, lingua, catalogo)
async function createGame({ seed = 1, lang = "it", logs = false } = {}) {
  const timers = [];
  const sim = { timers, logs: logs ? [] : null, result: null, summary: null };
  const ctx = {
    console,
    __sim: sim,
    document: makeStub(),
    navigator: makeStub(),
    history: makeStub(),
    location: makeStub(),
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    Image: function () { return makeStub(); },
    Audio: function () { return makeStub(); },
    AudioContext: function () { return makeStub(); },
    webkitAudioContext: function () { return makeStub(); },
    fetch: fakeFetch,
    performance: { now: () => 0 },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    // I timer non scattano da soli: la simulazione li esegue in ordine
    // (es. endPlayerTurn → runEnemyTurn), vedi drainTimers
    setTimeout: (fn, _ms, ...args) => timers.push(() => fn(...args)),
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    innerWidth: 1280,
    innerHeight: 800,
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  ctx.window = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);
  const rand = mulberry32(seed);
  ctx.__rand = rand;
  vm.runInContext("Math.random = __rand;", ctx);

  for (const s of SCRIPTS) s.runInContext(ctx);
  for (const name of NOOP) vm.runInContext(`${name} = function () {};`, ctx);
  vm.runInContext(PATCH, ctx);
  BOT.runInContext(ctx);

  ctx.__lang = lang;
  await vm.runInContext(
    `Promise.all([loadLang(__lang), loadCatalog(), loadConfig()]).then(() => {
       rebuildMapsFromCatalog();
       applyTranslationsToData();
     })`,
    ctx,
  );
  return { ctx, sim, run: (code) => vm.runInContext(code, ctx), drainTimers: () => drainTimers(timers) };
}

async function drainTimers(timers) {
  while (timers.length) await timers.shift()();
}

module.exports = { createGame, mulberry32, ROOT };
