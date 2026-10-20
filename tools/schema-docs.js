// Genera da js/schema.js la guida ai campi dei JSON moddabili e i JSON Schema
// per l'autocompletamento negli editor; va rilanciato dopo ogni modifica dello
// schema (tools/validate.js --all avvisa se i file non sono aggiornati).
// Esempi:
//   node tools/schema-docs.js            scrive i file
//   node tools/schema-docs.js --check    esce con 1 se non sono aggiornati
// File generati:
//   docs/FIELDS.md, docs/FIELDS_EN.md    guida ai campi (italiano, inglese)
//   schemas/*.schema.json                JSON Schema (draft-07) di mappe,
//                                        lezioni, catalogo, indice del
//                                        tutorial e config.json
// Gli elenchi di classi, gruppi di tuning, generatori e terreni vengono dal
// gioco caricato con config.json (ambiente del simulatore).
"use strict";
const fs = require("fs");
const path = require("path");
const { createGame, ROOT } = require("./sim/env");

const GENERATED = {
  it: "Generata da `js/schema.js` con `node tools/schema-docs.js`: non modificarla a mano.",
  en: "Generated from `js/schema.js` by `node tools/schema-docs.js`: do not edit by hand.",
};

const L = {
  it: {
    title: "Guida ai campi dei JSON",
    other: "[English version](FIELDS_EN.md)",
    intro:
      "Tutti i campi letti dal gioco nei file moddabili: mappe, lezioni dell'addestramento, catalogo delle mappe e `config.json`. " +
      "Per come si crea una mappa e per gli esempi vedi il [README](../README.md#creare-una-nuova-missione); " +
      "`node tools/validate.js --all` controlla i file con queste stesse regole.",
    editorTitle: "Autocompletamento nell'editor",
    editor:
      "I JSON Schema in `schemas/` danno suggerimenti, descrizioni e controlli mentre si scrive. " +
      "VS Code li associa da solo ai file del gioco (`.vscode/settings.json`); in qualunque editor che legge i JSON Schema (VS Code, Zed, JetBrains…) " +
      "basta il campo `\"$schema\"` in cima al file, es. `\"$schema\": \"../schemas/mission.schema.json\"` in `missions/`.",
    contents: "Indice",
    field: "Campo",
    type: "Tipo",
    desc: "Descrizione",
    req: "**Obbligatorio.**",
    internal: "Campi scritti dal gioco, accettati senza avvisi:",
    rootArray: "Il file è un array di voci con questi campi.",
    lessonNote:
      "Una lezione (`missions/tutorial/*.json`) è una [mappa](#map) con il blocco `tutorial`; `tileTypes` e i nomi dei tile possono venire dall'[indice](#tutorial-index).",
    tuningTitle: "Gruppi di `tuning`",
    tuningIntro:
      "Valori attuali (dopo `config.json`) dei gruppi modificabili con `tuning` nella mappa. Si scrivono solo i campi da cambiare.",
    types: {
      number: "numero", int: "intero", bool: "booleano", string: "testo", null: "`null`", any: "qualsiasi",
      object: "oggetto", cell: "tile", zone: "zona", array: "array di", or: " o ", key: "chiave",
    },
    refs: {
      tileKey: "carattere di `tileTypes`", unitClass: "classe US", enemyClass: "classe VC", anyClass: "classe US o VC",
      missionType: "tipo di missione", tunable: "gruppo di bilanciamento (vedi [tuning](#tuning))",
      generator: "generatore procedurale", color: "colore `#rrggbb`", texture: "terreno noto o percorso di un'immagine",
      file: "percorso di un file dalla cartella del gioco", missionImage: "file in `missions/`",
      missionFile: "file in `missions/`", tutorialFile: "file in `missions/tutorial/`",
    },
    now: "attuali",
    values: "Valori",
    keys: "Chiavi",
  },
  en: {
    title: "JSON field guide",
    other: "[Versione italiana](FIELDS.md)",
    intro:
      "Every field the game reads from the moddable files: maps, training lessons, the map catalog and `config.json`. " +
      "For how to build a map and for examples see the [README](../README_EN.md#creating-a-new-mission); " +
      "`node tools/validate.js --all` checks the files against these same rules.",
    editorTitle: "Editor autocompletion",
    editor:
      "The JSON Schemas in `schemas/` give suggestions, descriptions and checks while typing. " +
      "VS Code maps them to the game files by itself (`.vscode/settings.json`); in any editor reading JSON Schemas (VS Code, Zed, JetBrains…) " +
      "the `\"$schema\"` field at the top of the file is enough, e.g. `\"$schema\": \"../schemas/mission.schema.json\"` in `missions/`.",
    contents: "Contents",
    field: "Field",
    type: "Type",
    desc: "Description",
    req: "**Required.**",
    internal: "Fields written by the game, accepted without warnings:",
    rootArray: "The file is an array of entries with these fields.",
    lessonNote:
      "A lesson (`missions/tutorial/*.json`) is a [map](#map) with the `tutorial` block; `tileTypes` and tile names may come from the [index](#tutorial-index).",
    tuningTitle: "`tuning` groups",
    tuningIntro:
      "Current values (after `config.json`) of the groups a map can change with `tuning`. Write only the fields to change.",
    types: {
      number: "number", int: "integer", bool: "boolean", string: "text", null: "`null`", any: "any",
      object: "object", cell: "tile", zone: "zone", array: "array of", or: " or ", key: "key",
    },
    refs: {
      tileKey: "a `tileTypes` character", unitClass: "US class", enemyClass: "VC class", anyClass: "US or VC class",
      missionType: "mission type", tunable: "balance group (see [tuning](#tuning))",
      generator: "procedural generator", color: "`#rrggbb` color", texture: "known terrain or image path",
      file: "file path from the game folder", missionImage: "file in `missions/`",
      missionFile: "file in `missions/`", tutorialFile: "file in `missions/tutorial/`",
    },
    now: "current",
    values: "Values",
    keys: "Keys",
  },
};

// Campi dei tile e delle zone (validate.js:_walkFields)
const CELL_FIELDS = ["col", "row"];
const ZONE_FIELDS = ["colMin", "colMax", "rowMin", "rowMax"];

async function loadSchema() {
  const { run } = await createGame();
  const s = run(`({
    mission: SCHEMA_MISSION, tile: SCHEMA_TILE_TYPE, translation: SCHEMA_TRANSLATION, tutorial: SCHEMA_TUTORIAL,
    weapon: SCHEMA_WEAPON, weaponPatch: SCHEMA_WEAPON_PATCH[1], unitClass: SCHEMA_UNIT_CLASS,
    enemyClass: SCHEMA_ENEMY_CLASS, config: SCHEMA_CONFIG, catalog: SCHEMA_CATALOG, tutorialIndex: SCHEMA_TUTORIAL_INDEX,
    cell: SCHEMA_CELL, zone: SCHEMA_ZONE,
  })`);
  const known = run(`({
    unitClass: Object.keys(UNIT_CLASSES), enemyClass: Object.keys(ENEMY_CLASSES),
    missionType: Object.keys(MISSION_TYPES), tunable: Object.keys(TUNABLES()),
    generator: Object.keys(MAP_GENERATORS), texture: Object.keys(TILE_DETAILS),
  })`);
  known.anyClass = [...known.unitClass, ...known.enemyClass];
  // Copia per i JSON: valori del contesto vm → oggetti semplici
  const tuning = JSON.parse(run("JSON.stringify(TUNABLES())"));
  return { s, known, tuning };
}

// ── Guida in Markdown ───────────────────────────────────────────────────
function buildGuide(lang, { s, known, tuning }) {
  const T = L[lang];
  const li = lang === "it" ? 0 : 1;
  // Sezioni: nodo → ancora; i nodi con una sezione propria non si espandono
  const sections = [
    { id: "map", node: s.mission },
    { id: "tile", node: s.tile },
    { id: "translations", node: s.translation },
    { id: "tutorial", node: s.tutorial, note: T.lessonNote },
    { id: "weapon", node: s.weapon },
    { id: "unit-class", node: s.unitClass },
    { id: "enemy-class", node: s.enemyClass },
    { id: "config", node: s.config },
    { id: "catalog", node: s.catalog.items, note: T.rootArray },
    { id: "tutorial-index", node: s.tutorialIndex },
  ];
  const anchor = new Map(sections.map((x) => [x.node, x.id]));
  anchor.set(s.weaponPatch, "weapon");
  const title = (node) => (node === s.weaponPatch ? s.weapon : node).d[li];
  const esc = (txt) => String(txt).replace(/\|/g, "\\|").replace(/\n/g, " ");
  const code = (v) => "`" + v + "`";
  const list = (vals) => vals.map(code).join(", ");

  function typeLabel(n) {
    if (Array.isArray(n)) return n.map(typeLabel).join(T.types.or);
    if (anchor.has(n)) return `[${title(n)}](#${anchor.get(n)})`;
    let base = T.types[n.type];
    if (n.allowed) base = n.allowed.map(code).join(" | ");
    if (n.min != null && n.max != null) base += ` ${n.min}–${n.max}`;
    else if (n.min != null) base += ` ≥ ${n.min}`;
    if (n.type === "cell") base += " `{ col, row }`";
    if (n.type === "zone") base += " `{ colMin, colMax, rowMin, rowMax }`";
    if (n.type === "array") base += ` ${typeLabel(n.items)}` + (n.len ? ` (${n.len})` : "");
    if (n.type === "map") base = `${T.types.object} { ${(n.key || [T.types.key])[li]} → ${typeLabel(n.values)} }`;
    return base;
  }

  function describe(n) {
    const parts = [];
    if (!Array.isArray(n) && n.req) parts.push(T.req);
    if (n.d && !anchor.has(n)) parts.push(n.d[li].replace(/([^.])$/, "$1."));
    // Riferimenti del campo, delle alternative e degli elementi di un array
    const alts = (Array.isArray(n) ? n : [n]).flatMap((x) => (x.type === "array" && !Array.isArray(x.items) ? [x, x.items] : [x]));
    const refs = [...new Set(alts.flatMap((x) => [x.ref, x.keyRef]).filter(Boolean))];
    for (const r of refs) {
      const now = known[r] ? ` (${T.now}: ${list(known[r])})` : "";
      parts.push(`→ ${T.refs[r]}${now}.`);
    }
    if (n.keyValues) parts.push(`${T.keys}: ${list(n.keyValues)}.`);
    return parts.join(" ");
  }

  // Righe della tabella: il campo, poi i suoi sottocampi con il percorso
  function rows(fields, prefix, out) {
    for (const [k, f] of Object.entries(fields)) {
      const p = prefix + k;
      out.push(`| ${code(p)} | ${esc(typeLabel(f))} | ${esc(describe(f))} |`);
      expand(f, p, out);
    }
  }
  function expand(n, p, out) {
    if (Array.isArray(n)) return n.forEach((x) => expand(x, p, out));
    if (anchor.has(n)) return;
    if (n.type === "object") rows(n.fields, p + ".", out);
    else if (n.type === "array") expand(n.items, p + "[]", out);
    else if (n.type === "map") expand(n.values, `${p}.<${(n.key || [T.types.key])[li]}>`, out);
  }

  const md = [
    `# ${T.title}`,
    "",
    `> ${GENERATED[lang]} ${T.other}`,
    "",
    T.intro,
    "",
    `## ${T.editorTitle}`,
    "",
    T.editor,
    "",
    `## ${T.contents}`,
    "",
    ...sections.map((x) => `- [${title(x.node)}](#${x.id})`),
    `- [${T.tuningTitle}](#tuning)`,
  ];
  for (const sec of sections) {
    const out = [];
    rows(sec.node.fields, "", out);
    md.push("", `<a id="${sec.id}"></a>`, "", `## ${title(sec.node)}`, "");
    if (sec.note) md.push(sec.note, "");
    md.push(`| ${T.field} | ${T.type} | ${T.desc} |`, "|---|---|---|", ...out);
    if (sec.node.internal) md.push("", `${T.internal} ${list(sec.node.internal)}.`);
  }
  md.push("", `<a id="tuning"></a>`, "", `## ${T.tuningTitle}`, "", T.tuningIntro);
  for (const [k, v] of Object.entries(tuning)) {
    md.push("", `### ${code(k)}`, "", "```json", compactJson(v), "```");
  }
  return md.join("\n") + "\n";
}

// JSON indentato con gli array di valori semplici su una riga
function compactJson(v) {
  return JSON.stringify(v, null, 2).replace(/\[\s+([^[\]{}]*?)\s+\]/g, (_, inner) => `[${inner.split(/,\s+/).join(", ")}]`);
}

// ── JSON Schema ─────────────────────────────────────────────────────────
const COLOR_PATTERN = "^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$";

function buildJsonSchema(root, title, { s, known }) {
  const named = new Map([
    [s.tile, "tileType"], [s.translation, "translation"], [s.tutorial, "tutorial"], [s.weapon, "weapon"],
    [s.weaponPatch, "weaponPatch"], [s.unitClass, "unitClass"], [s.enemyClass, "enemyClass"],
  ]);
  const defs = {};
  const describe = (n, o) => {
    if (!n.d) return o;
    return { description: `${n.d[0]}\n\n${n.d[1]}`, markdownDescription: `${n.d[0]}\n\n*${n.d[1]}*`, ...o };
  };
  const refTo = (name, build) => {
    if (!defs[name]) {
      defs[name] = {};
      defs[name] = build();
    }
    return { $ref: `#/definitions/${name}` };
  };
  const fieldsOf = (names) => Object.fromEntries(names.map((k) => [k, { type: "integer", minimum: 0 }]));
  const box = (names) => ({ type: "object", properties: fieldsOf(names), required: names, additionalProperties: false });

  function conv(n, isRoot = false) {
    if (Array.isArray(n)) return describe(n, { anyOf: n.map((x) => conv(x)) });
    if (!isRoot && named.has(n)) return refTo(named.get(n), () => conv(n, true));
    const o = {};
    switch (n.type) {
      case "number":
      case "int":
        o.type = n.type === "int" ? "integer" : "number";
        if (n.min != null) o.minimum = n.min;
        if (n.max != null) o.maximum = n.max;
        break;
      case "bool":
        o.type = "boolean";
        break;
      case "null":
        o.type = "null";
        break;
      case "string":
        o.type = "string";
        if (n.allowed) o.enum = n.allowed;
        // Tipi di missione fissi; classi, gruppi e terreni estendibili: suggeriti
        if (n.ref === "missionType") o.enum = known.missionType;
        else if (known[n.ref]) o.examples = known[n.ref];
        if (n.ref === "color") o.pattern = COLOR_PATTERN;
        break;
      case "cell":
        return describe(n, refTo("cell", () => box(CELL_FIELDS)));
      case "zone":
        return describe(n, refTo("zone", () => box(ZONE_FIELDS)));
      case "array":
        o.type = "array";
        o.items = conv(n.items);
        if (n.minItems) o.minItems = n.minItems;
        if (n.len) o.minItems = o.maxItems = n.len;
        break;
      case "object":
        o.type = "object";
        o.properties = {};
        for (const [k, f] of Object.entries(n.fields)) o.properties[k] = conv(f);
        for (const k of n.internal || []) o.properties[k] = {};
        const req = Object.entries(n.fields).filter(([, f]) => !Array.isArray(f) && f.req).map(([k]) => k);
        if (req.length) o.required = req;
        if (!n.open) o.additionalProperties = false;
        break;
      case "map": {
        o.type = "object";
        const v = conv(n.values);
        // Chiavi note come proprietà: l'editor le propone
        const keys = n.keyValues || known[n.keyRef];
        if (keys) o.properties = Object.fromEntries(keys.map((k) => [k, v]));
        o.additionalProperties = n.keyValues ? false : v;
        break;
      }
    }
    return describe(n, o);
  }

  const body = conv(root, true);
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $comment: GENERATED.it,
    title,
    ...body,
    ...(Object.keys(defs).length ? { definitions: defs } : {}),
  };
}

// Tutti i file generati: percorso → contenuto
async function buildOutputs() {
  const data = await loadSchema();
  const { s } = data;
  // Lezione: tileTypes può venire dall'indice del tutorial
  const lesson = { ...s.mission, fields: { ...s.mission.fields, tileTypes: { ...s.mission.fields.tileTypes, req: false } } };
  const json = (root, title) => JSON.stringify(buildJsonSchema(root, title, data), null, 2) + "\n";
  return {
    "docs/FIELDS.md": buildGuide("it", data),
    "docs/FIELDS_EN.md": buildGuide("en", data),
    "schemas/mission.schema.json": json(s.mission, "VIETNAM '68 — mappa / map"),
    "schemas/lesson.schema.json": json(lesson, "VIETNAM '68 — lezione / lesson"),
    "schemas/catalog.schema.json": json(s.catalog, "VIETNAM '68 — catalogo / catalog"),
    "schemas/tutorial-index.schema.json": json(s.tutorialIndex, "VIETNAM '68 — indice del tutorial / tutorial index"),
    "schemas/config.schema.json": json(s.config, "VIETNAM '68 — config.json"),
  };
}

// File generati diversi da quelli sul disco (a capo normalizzati)
async function staleOutputs() {
  const outputs = await buildOutputs();
  return Object.keys(outputs).filter((f) => {
    const file = path.join(ROOT, f);
    return !fs.existsSync(file) || fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") !== outputs[f];
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(0, 13).join("\n"));
    return;
  }
  if (args.includes("--check")) {
    const stale = await staleOutputs();
    for (const f of stale) console.log(`✖ ${f} non aggiornato`);
    if (!stale.length) console.log("✔ guida e JSON Schema aggiornati");
    process.exitCode = stale.length ? 1 : 0;
    return;
  }
  const outputs = await buildOutputs();
  for (const [f, text] of Object.entries(outputs)) {
    fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true });
    fs.writeFileSync(path.join(ROOT, f), text);
    console.log(`✔ ${f}`);
  }
}

module.exports = { staleOutputs };

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
