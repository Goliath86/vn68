// Validatore dei JSON moddabili da riga di comando: stessi controlli del gioco
// (js/schema.js + js/validate.js, caricati con l'ambiente del simulatore,
// quindi con le costanti e config.json veri) più l'esistenza dei file citati.
// Esempi:
//   node tools/validate.js missions/mia_mappa.json
//   node tools/validate.js --all
//   node tools/validate.js --all --seeds 50 --lang en
// Opzioni:
//   <file> …        mappe, lezioni (missions/tutorial/*.json), catalog.json,
//                   missions/tutorial/index.json, config.json, mods/index.json,
//                   mods/<mod>/mod.json e le mappe delle mod, campagne
//                   (missions/campaigns/*.json e quelle delle mod)
//   --all           config, catalogo e sue mappe, tutorial, campagne, mod e
//                   loro mappe e campagne, mappe procedurali,
//                   guida ai campi e JSON Schema aggiornati (tools/schema-docs.js)
//   --seeds N       seed per generatore e dimensione con --all (default 20)
//   --lang it|en    lingua dei messaggi (default it)
//   --quiet         solo gli errori, niente avvisi
// Esce con codice 1 se c'è almeno un errore.
"use strict";
const fs = require("fs");
const path = require("path");
const { createGame, ROOT } = require("./sim/env");
const { staleOutputs } = require("./schema-docs");

function parseArgs(argv) {
  const opts = { files: [], all: false, seeds: 20, lang: "it", quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") opts.all = true;
    else if (a === "--seeds") opts.seeds = +argv[++i];
    else if (a === "--lang") opts.lang = argv[++i];
    else if (a === "--quiet") opts.quiet = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else opts.files.push(a.replace(/\\/g, "/"));
  }
  return opts;
}

// Percorsi relativi alla cartella del gioco (come nei JSON); un file fuori
// dalla cartella resta assoluto
const rel = (f) => {
  const r = path.relative(ROOT, path.resolve(f));
  return (r.startsWith("..") || path.isAbsolute(r) ? path.resolve(f) : r).replace(/\\/g, "/");
};
const abs = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));
const exists = (p) => fs.existsSync(abs(p));
// JSON letto senza controlli (elenchi da percorrere); null se non valido
const readJson = (p) => {
  try {
    return JSON.parse(fs.readFileSync(abs(p), "utf8"));
  } catch (e) {
    return null;
  }
};

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || (!opts.all && !opts.files.length)) {
    console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(0, 16).join("\n"));
    return;
  }
  const { ctx, run } = await createGame({ lang: opts.lang });
  ctx.__exists = exists;
  const vopts = "{ fileExists: __exists }";
  // Tutte le mod attive, così le loro classi sono note anche nelle mappe
  const modIds = exists("mods/index.json") ? readJson("mods/index.json")?.mods || [] : [];
  ctx.__mods = modIds;
  run("setEnabledModIds(__mods)");
  await run("loadMods()");
  let errors = 0;
  let warnings = 0;

  // Stampa i problemi di un file; ne restituisce gli errori
  const print = (label, issues) => {
    const errs = issues.filter((i) => i.level === "error");
    const shown = opts.quiet ? errs : issues;
    errors += errs.length;
    warnings += issues.length - errs.length;
    if (!shown.length) {
      console.log(`✔ ${label}`);
      return;
    }
    console.log(`${errs.length ? "✖" : "⚠"} ${label}`);
    ctx.__issues = shown;
    const lines = run("__issues.map((i) => formatIssue(i))");
    shown.forEach((i, n) => console.log(`    ${i.level === "error" ? "errore " : "avviso "} ${lines[n]}`));
  };

  // Legge e interpreta un file con riga/colonna degli errori di sintassi
  const load = (file) => {
    if (!exists(file)) {
      print(file, [{ level: "error", path: "", key: "file_missing", vars: { file } }]);
      return null;
    }
    ctx.__text = fs.readFileSync(abs(file), "utf8");
    ctx.__file = file;
    try {
      return run("parseJsonText(__text, __file)");
    } catch (e) {
      if (!e.issues) throw e;
      print(file, e.issues);
      return null;
    }
  };

  // Campagne delle mod: elencate nel campo "campaigns" del loro mod.json
  const modCampaigns = (file) => {
    const m = /^mods\/([^/]+)\//.exec(file);
    const mod = m && exists(`mods/${m[1]}/mod.json`) ? readJson(`mods/${m[1]}/mod.json`) : null;
    return (mod?.campaigns || []).map((f) => path.posix.normalize(`mods/${m[1]}/${f}`));
  };
  // Mappe citate dalle campagne: lette così come sono (serve supportedMissions)
  ctx.__missionData = (p) => (exists(p) ? readJson(p) : null);

  let tutorialIndex = null;
  const checkFile = (file) => {
    const data = load(file);
    if (data == null) return;
    ctx.__data = data;
    if (file === "config.json") return print(file, run(`validateConfig(__data, ${vopts})`));
    if (file === "missions/catalog.json") return print(file, run(`validateCatalog(__data, ${vopts})`));
    if (file === "mods/index.json") return print(file, run(`validateModIndex(__data, ${vopts})`));
    if (file === "missions/campaigns/index.json") return print(file, run(`validateCampaignIndex(__data, ${vopts})`));
    if (file.startsWith("missions/campaigns/")) {
      return print(file, run("validateCampaign(__data, { fileExists: __exists, missionData: __missionData })"));
    }
    // Mod: percorsi dalla sua cartella; le sue mappe con i percorsi risolti
    ctx.__base = file.slice(0, file.lastIndexOf("/") + 1);
    if (/^mods\/[^/]+\/mod\.json$/.test(file)) {
      return print(file, run(`validateMod(__data, { fileExists: __exists, base: __base })`));
    }
    if (modCampaigns(file).includes(file)) {
      return print(file, run("validateCampaign(__data, { fileExists: __exists, base: __base, missionData: __missionData })"));
    }
    if (file.startsWith("mods/")) run("rebasePaths(SCHEMA_MISSION, __data, __base)");
    if (file === "missions/tutorial/index.json") {
      tutorialIndex = data;
      return print(file, run(`validateTutorialIndex(__data, ${vopts})`));
    }
    if (file.startsWith("missions/tutorial/")) {
      tutorialIndex ??= load("missions/tutorial/index.json") || {};
      ctx.__index = tutorialIndex;
      ctx.__lesson = (tutorialIndex.lessons || []).find((l) => "missions/tutorial/" + l.file === file) || {};
      run("prepareTutorialLesson(__index, __lesson, __data)");
    }
    return print(file, run(`validateMission(__data, ${vopts})`));
  };

  const files = opts.files.map(rel);
  if (opts.all) {
    files.push("config.json", "missions/catalog.json");
    const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "missions/catalog.json"), "utf8"));
    for (const e of catalog) if (e.file) files.push("missions/" + e.file);
    files.push("missions/tutorial/index.json");
    const index = JSON.parse(fs.readFileSync(path.join(ROOT, "missions/tutorial/index.json"), "utf8"));
    for (const l of index.lessons || []) files.push("missions/tutorial/" + l.file);
    if (exists("missions/campaigns/index.json")) {
      files.push("missions/campaigns/index.json");
      for (const f of readJson("missions/campaigns/index.json")?.campaigns || []) files.push("missions/campaigns/" + f);
    }
    if (modIds.length) files.push("mods/index.json");
    for (const id of modIds) {
      const file = `mods/${id}/mod.json`;
      files.push(file);
      const mod = exists(file) ? readJson(file) : null;
      for (const e of mod?.maps || []) {
        if (e.file) files.push(path.posix.normalize(`mods/${id}/${e.file}`));
      }
      for (const f of mod?.campaigns || []) files.push(path.posix.normalize(`mods/${id}/${f}`));
    }
  }
  for (const f of [...new Set(files)]) checkFile(f);

  // Mappe procedurali: ogni generatore × dimensione × seed; problemi
  // raggruppati per percorso e messaggio, con il primo seed che li mostra
  if (opts.all) {
    const gens = run("Object.keys(MAP_GENERATORS)");
    const sizes = run("Object.keys(PROC_SIZES)");
    for (const gen of gens) {
      for (const size of sizes) {
        const groups = new Map();
        for (let seed = 1; seed <= opts.seeds; seed++) {
          ctx.__gen = gen;
          ctx.__size = size;
          ctx.__seed = seed;
          const issues = run(`validateMission(generateProceduralMap(__gen, __seed, __size), ${vopts})`);
          for (const i of issues) {
            const k = `${i.level}|${i.path}|${i.key}`;
            if (!groups.has(k)) groups.set(k, { issue: i, seeds: [] });
            groups.get(k).seeds.push(seed);
          }
        }
        const issues = [...groups.values()].map(({ issue, seeds }) => ({
          ...issue,
          path: `${issue.path} (seed ${seeds.slice(0, 5).join(", ")}${seeds.length > 5 ? "…" : ""}; ${seeds.length}/${opts.seeds})`,
        }));
        print(`generatore ${gen}, ${size}, ${opts.seeds} seed`, issues);
      }
    }
  }

  // Guida ai campi e JSON Schema generati dallo schema
  if (opts.all) {
    const stale = await staleOutputs();
    for (const f of stale) console.log(`⚠ ${f} non aggiornato: node tools/schema-docs.js`);
    warnings += stale.length;
  }

  console.log(`\n${errors} errori, ${warnings} avvisi`);
  process.exitCode = errors ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
