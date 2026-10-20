// ── VALIDAZIONE DEI DATI ───────────────────────────────────────────────
// Controlla i JSON moddabili contro lo schema (js/schema.js) e con i controlli
// incrociati che lo schema da solo non esprime: griglia, coordinate dentro la
// mappa, raggiungibilità degli obiettivi, riferimenti a tile/classi/armi.
// Ogni problema: { level: "error" | "warning", path: "tileTypes.J.moveCost",
// key, vars }; il testo viene da translations validation.<key> (issueText).
// Usato al caricamento delle mappe (game.js:loadMission, tutorial.js), del
// catalogo e di config.json (init.js), e da tools/validate.js, che passa
// opts.fileExists per controllare anche i file citati.

class MapDataError extends Error {
  constructor(file, issues) {
    const first = issues.find((i) => i.level === "error") || issues[0];
    super(first ? formatIssue(first) : file);
    this.file = file;
    this.issues = issues;
  }
}

function issueText(i) {
  const vars = { ...i.vars };
  if (vars.kind) vars.kind = t(`validation.kinds.${vars.kind}`);
  return t(`validation.${i.key}`, vars);
}

function formatIssue(i) {
  return i.path ? `${i.path}: ${issueText(i)}` : issueText(i);
}

const _issueErrors = (issues) => issues.filter((i) => i.level === "error");

// Problemi in console: errori come errori, avvisi come avvisi
function reportIssues(label, issues) {
  for (const i of issues) {
    const line = `[${label}] ${formatIssue(i)}`;
    if (i.level === "error") console.error(line);
    else console.warn(line);
  }
}

// Testo per il giocatore: intestazione + i primi errori
const ISSUES_SHOWN = 8;
function issuesSummary(err) {
  const errors = _issueErrors(err.issues || []);
  const lines = errors.slice(0, ISSUES_SHOWN).map((i) => "• " + formatIssue(i));
  if (errors.length > ISSUES_SHOWN) lines.push(t("validation.more", { count: errors.length - ISSUES_SHOWN }));
  return [t("errors.map_invalid", { file: err.file, count: errors.length }), ...lines].join("\n");
}

// JSON.parse con riga e colonna dell'errore (dalla posizione nel messaggio)
function parseJsonText(text, file) {
  try {
    return JSON.parse(text);
  } catch (e) {
    let line = null;
    let col = null;
    const lc = /line (\d+) column (\d+)/.exec(e.message);
    const pos = /position (\d+)/.exec(e.message);
    if (lc) {
      line = +lc[1];
      col = +lc[2];
    } else if (pos) {
      const before = text.slice(0, +pos[1]);
      line = before.split("\n").length;
      col = before.length - before.lastIndexOf("\n");
    }
    const key = line ? "json_syntax" : "json_syntax_noloc";
    throw new MapDataError(file, [{ level: "error", path: "", key, vars: { line, col, message: e.message } }]);
  }
}

// Scarica e interpreta un JSON; un file mancante è un errore con il suo nome
async function fetchJsonData(path) {
  const resp = await fetch(path);
  if (!resp.ok) {
    throw new MapDataError(path, [{ level: "error", path: "", key: "file_missing", vars: { file: path } }]);
  }
  return parseJsonText(await resp.text(), path);
}

// ── Riferimenti (campo "ref" / "keyRef" dello schema) ──────────────────
// Restituiscono null se il valore va bene, altrimenti [livello, chiave, vars]
const COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const _refMiss = (kind, level = "error") => (v) => [level, "ref", { value: v, kind }];
const VALIDATION_REFS = {
  tileKey: (v, cx) => (cx.md?.tileTypes?.[v] ? null : _refMiss("tileKey")(v)),
  // Le classi aggiunte dalla mod che si sta controllando contano come note
  unitClass: (v, cx) => (UNIT_CLASSES[v] || cx.classes?.unit.includes(v) ? null : _refMiss("unitClass")(v)),
  enemyClass: (v, cx) => (ENEMY_CLASSES[v] || cx.classes?.enemy.includes(v) ? null : _refMiss("enemyClass")(v)),
  anyClass: (v, cx) =>
    UNIT_CLASSES[v] || ENEMY_CLASSES[v] || cx.classes?.unit.includes(v) || cx.classes?.enemy.includes(v)
      ? null
      : _refMiss("anyClass", "warning")(v),
  missionType: (v) => (MISSION_TYPES[v] ? null : _refMiss("missionType")(v)),
  tunable: (v) => (TUNABLES()[v] ? null : _refMiss("tunable", "warning")(v)),
  generator: (v) => (MAP_GENERATORS[v] ? null : _refMiss("generator")(v)),
  color: (v) => (COLOR_RE.test(v) ? null : ["warning", "color", { value: v }]),
  texture: (v) =>
    TEXTURE_IMAGE_RE.test(v) || TILE_DETAILS[v]
      ? null
      : ["warning", "texture_unknown", { value: v, known: Object.keys(TILE_DETAILS).join(", ") }],
  // File: controllati solo se opts.fileExists (tools/validate.js); in una
  // mod (opts.base = sua cartella) i percorsi partono dalla cartella
  file: (v, cx) => _fileRef(cx, cx.base ? modPath(cx.base, v) : v, "warning"),
  missionImage: (v, cx) => _fileRef(cx, normPath("missions/" + v), "warning"),
  missionFile: (v, cx) => _fileRef(cx, cx.base ? modPath(cx.base, v) : "missions/" + v, "error"),
  tutorialFile: (v, cx) => _fileRef(cx, "missions/tutorial/" + v, "error"),
  modDir: (v, cx) => _fileRef(cx, `${MODS_DIR}${v}/mod.json`, "error"),
};

function _fileRef(cx, file, level) {
  if (!cx.fileExists || !file || cx.fileExists(file)) return null;
  return [level, "file_missing", { file }];
}

// ── Percorso dello schema ──────────────────────────────────────────────
const _isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const _IDENT = /^[A-Za-z_$][\w$]*$/;
const _join = (path, k) =>
  typeof k === "number" ? `${path}[${k}]` : _IDENT.test(k) ? (path ? `${path}.${k}` : k) : `${path}["${k}"]`;

function _valueType(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "int" : "number";
  if (typeof v === "boolean") return "bool";
  return typeof v === "string" ? "string" : "object";
}

function _nodeType(n) {
  return { map: "object", cell: "object", zone: "object", any: "any" }[n.type] || n.type;
}

function _matches(n, v) {
  switch (n.type) {
    case "any":
      return true;
    case "number":
      return typeof v === "number" && Number.isFinite(v);
    case "int":
      return Number.isInteger(v);
    case "bool":
      return typeof v === "boolean";
    case "string":
      return typeof v === "string";
    case "null":
      return v === null;
    case "array":
      return Array.isArray(v);
    default:
      return _isPlain(v);
  }
}

const _typeLabel = (type) => t(`validation.types.${type}`);

// Nome più vicino tra i candidati (refusi: "moveCots" → "moveCost")
function _closest(word, candidates) {
  let best = null;
  let bestD = Math.max(2, Math.floor(word.length / 4)) + 1;
  for (const c of candidates) {
    const d = _editDistance(word.toLowerCase(), c.toLowerCase());
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

function _editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

function _unknown(cx, path, key, candidates) {
  const hint = _closest(key, candidates);
  cx.add("warning", _join(path, key), hint ? "unknown_hint" : "unknown", { hint });
}

function _ref(cx, name, v, path) {
  const res = VALIDATION_REFS[name](v, cx);
  if (res) cx.add(res[0], path, res[1], res[2]);
}

function _walk(n, v, path, cx) {
  if (v === undefined) {
    if (!Array.isArray(n) && n.req) cx.add("error", path, "required");
    return;
  }
  if (Array.isArray(n)) {
    const m = n.find((x) => _matches(x, v));
    if (m) return _walk(m, v, path, cx);
    const expected = [...new Set(n.map(_nodeType))].map(_typeLabel).join(" / ");
    return cx.add("error", path, "type", { expected, found: _typeLabel(_valueType(v)) });
  }
  if (!_matches(n, v)) {
    return cx.add("error", path, "type", { expected: _typeLabel(_nodeType(n)), found: _typeLabel(_valueType(v)) });
  }
  if (n.min != null && v < n.min) cx.add("error", path, "min", { value: v, min: n.min });
  if (n.max != null && v > n.max) cx.add("error", path, "max", { value: v, max: n.max });
  if (n.allowed && !n.allowed.includes(v)) {
    cx.add("error", path, "enum", { value: v, allowed: n.allowed.join(", ") });
  }
  if (n.ref) _ref(cx, n.ref, v, path);

  switch (n.type) {
    case "object": {
      for (const [k, f] of Object.entries(n.fields)) _walk(f, v[k], _join(path, k), cx);
      // Oggetti posizionati (obiettivi, trappole, squadra…): dentro la mappa
      if (n.fields.col && n.fields.row) cx.cell(v, path);
      if (n.open) break;
      const known = Object.keys(n.fields);
      for (const k of Object.keys(v)) {
        if (!n.fields[k] && !n.internal?.includes(k)) _unknown(cx, path, k, known);
      }
      break;
    }
    case "map":
      for (const [k, x] of Object.entries(v)) {
        if (n.keyValues && !n.keyValues.includes(k)) _unknown(cx, path, k, n.keyValues);
        else if (n.keyRef) _ref(cx, n.keyRef, k, _join(path, k));
        _walk(n.values, x, _join(path, k), cx);
      }
      break;
    case "array":
      if (n.minItems && v.length < n.minItems) cx.add("error", path, "min_items", { min: n.minItems });
      if (n.len && v.length !== n.len) cx.add("error", path, "length", { len: n.len, found: v.length });
      v.forEach((x, i) => _walk(n.items, x, _join(path, i), cx));
      break;
    case "cell":
      _walkFields(v, path, cx, ["col", "row"]);
      cx.cell(v, path);
      break;
    case "zone":
      _walkFields(v, path, cx, ["colMin", "colMax", "rowMin", "rowMax"]);
      cx.zone(v, path);
      break;
  }
}

// Campi interi obbligatori ≥ 0 di cell/zone
function _walkFields(v, path, cx, names) {
  for (const k of names) _walk({ type: "int", req: true, min: 0 }, v[k], _join(path, k), cx);
  for (const k of Object.keys(v)) if (!names.includes(k)) _unknown(cx, path, k, names);
}

// Contesto di una validazione: raccoglie i problemi, conosce la mappa
function _validationContext(opts, md = null) {
  const issues = [];
  const cx = {
    md,
    issues,
    fileExists: opts.fileExists || null,
    base: opts.base || null,
    classes: opts.classes || null,
    add: (level, path, key, vars = {}) => issues.push({ level, path, key, vars }),
    _inMap: (c, r) => !md || !Number.isInteger(md.cols) || (c < md.cols && r < md.rows),
    cell: (v, path) => {
      if (!Number.isInteger(v.col) || !Number.isInteger(v.row) || cx._inMap(v.col, v.row)) return;
      cx.add("error", path, "out_of_bounds", { col: v.col, row: v.row, cols: md.cols, rows: md.rows });
    },
    zone: (z, path) => {
      if (z.colMin > z.colMax || z.rowMin > z.rowMax) cx.add("error", path, "zone_order");
      else if (!cx._inMap(z.colMax, z.rowMax)) {
        cx.add("error", path, "out_of_bounds", { col: z.colMax, row: z.rowMax, cols: md.cols, rows: md.rows });
      }
    },
  };
  return cx;
}

// ── Mappe ──────────────────────────────────────────────────────────────
// opts.tutorial: lezione del tutorial (supportedMissions dal suo blocco)
function validateMission(md, opts = {}) {
  const cx = _validationContext(opts, md);
  if (!_isPlain(md)) {
    cx.add("error", "", "type", { expected: _typeLabel("object"), found: _typeLabel(_valueType(md)) });
    return cx.issues;
  }
  _walk(SCHEMA_MISSION, md, "", cx);
  const grid = _checkGrid(md, cx);
  _checkTileTypes(md, cx);
  _checkMissions(md, cx);
  _checkMixes(md, cx);
  _checkMissionWeapons(md, cx);
  _checkTuning(md, cx);
  _checkTranslations(md, cx);
  if (grid) _checkPlacement(md, grid, cx);
  return cx.issues;
}

// Griglia normalizzata (righe di testo → caratteri), null se non utilizzabile
function _checkGrid(md, cx) {
  if (!Array.isArray(md.grid) || !Number.isInteger(md.cols) || !Number.isInteger(md.rows)) return null;
  if (!_isPlain(md.tileTypes)) return null;
  const grid = md.grid.map((r) => (typeof r === "string" ? r.split("") : Array.isArray(r) ? r : []));
  let ok = true;
  if (grid.length !== md.rows) {
    cx.add("error", "grid", "grid_rows", { found: grid.length, rows: md.rows });
    ok = false;
  }
  grid.forEach((r, i) => {
    if (r.length !== md.cols) {
      cx.add("error", `grid[${i}]`, "grid_cols", { found: r.length, cols: md.cols });
      ok = false;
    }
  });
  const missing = new Map(); // chiave → prima posizione
  grid.forEach((r, row) =>
    r.forEach((k, col) => {
      if (!md.tileTypes[k] && !missing.has(k)) missing.set(k, { col, row });
    }),
  );
  for (const [k, p] of missing) {
    cx.add("error", `grid[${p.row}]`, "grid_key", { key: k, col: p.col, row: p.row });
    ok = false;
  }
  return ok ? grid : null;
}

function _checkTileTypes(md, cx) {
  for (const [k, def] of Object.entries(_isPlain(md.tileTypes) ? md.tileTypes : {})) {
    if (!_isPlain(def) || !def.demolishable || def.demolishResult) continue;
    // specialActions.js: senza demolishResult il tile demolito diventa "J"
    cx.add(md.tileTypes.J ? "warning" : "error", `tileTypes.${k}`, "demolish_no_result");
  }
}

// Missioni giocabili e loro obiettivi
const OBJECTIVE_FILLED = {
  recon: (o) => Array.isArray(o) && o.length > 0,
  search_destroy: () => true,
  rescue_pilot: (o) => _isPlain(o),
  capture_objective: (o) => Array.isArray(o) && o.length > 0,
};

function _playableMissions(md) {
  if (md.tutorial?.missionType) return [md.tutorial.missionType];
  return Array.isArray(md.supportedMissions) ? md.supportedMissions : [];
}

function _checkMissions(md, cx) {
  const types = _playableMissions(md);
  if (!md.tutorial && !types.length) cx.add("error", "supportedMissions", "no_missions");
  for (const type of types) {
    const filled = OBJECTIVE_FILLED[type];
    if (filled && !filled(md.objectives?.[type])) {
      cx.add("error", `objectives.${type}`, "no_objectives", { type });
    }
  }
  if (!md.enemies && (md.vcCount ?? 6) > 0 && !md.vcSpawnZones?.length) {
    cx.add("error", "vcSpawnZones", "no_spawn_zones", { count: md.vcCount ?? 6 });
  }
  if (md.vcAmbushTurn && !md.vcAmbushZones?.length) cx.add("warning", "vcAmbushZones", "no_ambush_zones");
  const rp = md.objectives?.rescue_pilot;
  if (_isPlain(rp) && rp.pilotCol === rp.extractCol && rp.pilotRow === rp.extractRow) {
    cx.add("warning", "objectives.rescue_pilot", "pilot_on_extract");
  }
  if (md.tutorial) {
    const seen = new Set();
    (md.tutorial.steps || []).forEach((s, i) => {
      if (!s?.id) return;
      if (seen.has(s.id)) cx.add("error", `tutorial.steps[${i}].id`, "step_duplicate", { id: s.id });
      seen.add(s.id);
      for (const lang of ["it", "en"]) {
        if (typeof md.translations?.[lang]?.tutorial?.[s.id] !== "string") {
          cx.add("warning", `translations.${lang}.tutorial`, "step_text_missing", { id: s.id, lang });
        }
      }
    });
  }
}

function _checkMixes(md, cx) {
  for (const k of ["vcMix", "ambushMix", "reinforcementMix"]) {
    const mix = md[k];
    if (_isPlain(mix) && !Object.values(mix).some((w) => w > 0)) cx.add("error", k, "mix_empty");
  }
}

// Armi nuove aggiunte per id senza i numeri che servono per sparare
function _checkMissionWeapons(md, cx) {
  for (const [cls, ov] of Object.entries(_isPlain(md.weapons) ? md.weapons : {})) {
    if (!_isPlain(ov)) continue;
    const base = WEAPONS_CONFIG[cls] || [];
    for (const [id, w] of Object.entries(ov)) {
      if (!_isPlain(w) || base.some((b) => b.id === id)) continue;
      if (w.atk == null || w.range == null) cx.add("warning", `weapons.${cls}.${id}`, "weapon_incomplete");
    }
  }
}

// "tuning": chiavi esistenti nelle costanti e numeri al posto dei numeri.
// Dizionari che accettano chiavi nuove: classi VC (nuova classe) e pesi di VC_MIX
const TUNING_OPEN = { ENEMY_CLASSES: 0, VC_MIX: 1 };

function _checkTuning(md, cx) {
  if (!_isPlain(md.tuning)) return;
  const base = (typeof _tuningDefaults !== "undefined" && _tuningDefaults) || TUNABLES();
  for (const [group, patch] of Object.entries(md.tuning)) {
    if (!base[group]) continue; // già segnalato dal riferimento "tunable"
    const path = `tuning.${group}`;
    if (!_isPlain(patch)) {
      cx.add("error", path, "type", { expected: _typeLabel("object"), found: _typeLabel(_valueType(patch)) });
      continue;
    }
    _tuningWalk(patch, base[group], path, TUNING_OPEN[group] ?? -1, 0, cx);
  }
}

function _tuningWalk(patch, target, path, openDepth, depth, cx) {
  for (const [k, v] of Object.entries(patch)) {
    const p = _join(path, k);
    if (!(k in target)) {
      if (depth !== openDepth) _unknown(cx, path, k, Object.keys(target));
      continue;
    }
    const cur = target[k];
    if (_isPlain(cur)) {
      if (_isPlain(v)) _tuningWalk(v, cur, p, openDepth, depth + 1, cx);
      else cx.add("error", p, "type", { expected: _typeLabel("object"), found: _typeLabel(_valueType(v)) });
    } else if (typeof cur === "number" && typeof v !== "number") {
      cx.add("error", p, "type", { expected: _typeLabel("number"), found: _typeLabel(_valueType(v)) });
    }
  }
}

function _checkTranslations(md, cx) {
  const tr = _isPlain(md.translations) ? md.translations : {};
  // Nome e descrizione: per lingua nel testo stesso oppure in translations
  const own = _isPlain(md.name);
  for (const lang of ["it", "en"]) {
    if (!own && !tr[lang]?.name) cx.add("warning", `translations.${lang}.name`, "translation_missing", { lang });
  }
  const ids = new Set(Object.values(_isPlain(md.tileTypes) ? md.tileTypes : {}).map((d) => d?.id));
  for (const [lang, block] of Object.entries(tr)) {
    for (const id of Object.keys(block?.tileLabels || {})) {
      if (!ids.has(id)) cx.add("warning", `translations.${lang}.tileLabels.${id}`, "label_unknown_tile", { value: id });
    }
  }
}

// Posizioni: partenza, raggiungibilità di obiettivi ed estrazione, zone
function _checkPlacement(md, grid, cx) {
  const def = (c, r) => md.tileTypes[grid[r]?.[c]];
  const inMap = (c, r) => Number.isInteger(c) && Number.isInteger(r) && c >= 0 && r >= 0 && c < md.cols && r < md.rows;
  const passable = (c, r) => inMap(c, r) && !def(c, r)?.impassable;
  const openable = (c, r) => inMap(c, r) && (!def(c, r)?.impassable || !!def(c, r)?.demolishable);

  // Partenza: squadra fissa oppure playerStart (4 posti, uno per classe scelta)
  const starts = Array.isArray(md.squad) ? md.squad : md.playerStart;
  const startPath = Array.isArray(md.squad) ? "squad" : "playerStart";
  if (!Array.isArray(md.squad)) {
    if (!Array.isArray(md.playerStart)) return cx.add("error", "playerStart", "required");
    if (md.playerStart.length < 4) cx.add("error", "playerStart", "start_count", { count: md.playerStart.length });
  }
  const seen = new Set();
  (starts || []).forEach((p, i) => {
    if (!inMap(p?.col, p?.row)) return;
    const path = `${startPath}[${i}]`;
    if (!passable(p.col, p.row)) cx.add("error", path, "on_impassable");
    if (seen.has(`${p.col},${p.row}`)) cx.add("error", path, "start_duplicate");
    seen.add(`${p.col},${p.row}`);
  });
  const origins = (starts || []).filter((p) => passable(p?.col, p?.row));
  if (!origins.length) return;

  const walk = _reach(origins, md, passable);
  const walkOpen = _reach(origins, md, openable);
  const types = _playableMissions(md);
  const target = (path, c, r, radius = 0) => {
    if (!inMap(c, r)) return;
    const near = (set) => {
      for (let dr = -radius; dr <= radius; dr++)
        for (let dc = -radius; dc <= radius; dc++)
          if (Math.abs(dc) + Math.abs(dr) <= radius && set.has(`${c + dc},${r + dr}`)) return true;
      return false;
    };
    if (near(walk)) return;
    cx.add(near(walkOpen) ? "warning" : "error", path, near(walkOpen) ? "needs_demolition" : "unreachable");
  };
  const obj = md.objectives || {};
  // Ricognizione: basta arrivare a 1 tile (unitMovement.js:moveUnit)
  if (types.includes("recon")) {
    (obj.recon || []).forEach((p, i) => target(`objectives.recon[${i}]`, p?.col, p?.row, 1));
  }
  if (types.includes("rescue_pilot") && _isPlain(obj.rescue_pilot)) {
    const rp = obj.rescue_pilot;
    target("objectives.rescue_pilot.pilotCol", rp.pilotCol, rp.pilotRow);
    target("objectives.rescue_pilot.extractCol", rp.extractCol, rp.extractRow);
    for (const [k, c, r] of [["pilotCol", rp.pilotCol, rp.pilotRow], ["extractCol", rp.extractCol, rp.extractRow]]) {
      if (Number.isInteger(c) && Number.isInteger(r) && !inMap(c, r)) {
        cx.add("error", `objectives.rescue_pilot.${k}`, "out_of_bounds", { col: c, row: r, cols: md.cols, rows: md.rows });
      }
    }
  }
  if (types.includes("capture_objective")) {
    (obj.capture_objective || []).forEach((p, i) => target(`objectives.capture_objective[${i}]`, p?.col, p?.row));
  }

  // VC fissi su tile percorribili; trappole e tunnel avvisano soltanto
  (md.enemies || []).forEach((e, i) => {
    if (inMap(e?.col, e?.row) && !passable(e.col, e.row)) cx.add("error", `enemies[${i}]`, "on_impassable");
  });
  for (const k of ["traps", "tunnels"]) {
    (md[k] || []).forEach((p, i) => {
      if (inMap(p?.col, p?.row) && !passable(p.col, p.row)) cx.add("warning", `${k}[${i}]`, "on_impassable");
    });
  }
  for (const k of ["vcSpawnZones", "vcAmbushZones", "trapZones"]) {
    (md[k] || []).forEach((z, i) => {
      if (!_isPlain(z) || !inMap(z.colMin, z.rowMin) || !inMap(z.colMax, z.rowMax)) return;
      if (z.colMin > z.colMax || z.rowMin > z.rowMax) return; // già segnalata
      for (let r = z.rowMin; r <= z.rowMax; r++) for (let c = z.colMin; c <= z.colMax; c++) if (passable(c, r)) return;
      cx.add("warning", `${k}[${i}]`, "zone_blocked");
    });
  }
}

// Tile raggiungibili (chiavi "col,row") da più partenze
function _reach(origins, md, ok) {
  const seen = new Set(origins.map((p) => `${p.col},${p.row}`));
  const queue = origins.map((p) => [p.col, p.row]);
  while (queue.length) {
    const [c, r] = queue.shift();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${c + dc},${r + dr}`;
      if (seen.has(k) || !ok(c + dc, r + dr)) continue;
      seen.add(k);
      queue.push([c + dc, r + dr]);
    }
  }
  return seen;
}

// ── Catalogo, indice del tutorial, config.json ─────────────────────────
function validateCatalog(list, opts = {}) {
  const cx = _validationContext(opts);
  _walk(SCHEMA_CATALOG, list, "", cx);
  (Array.isArray(list) ? list : []).forEach((e, i) => {
    if (!_isPlain(e)) return;
    const kinds = ["file", "generator", "tutorial"].filter((k) => e[k]);
    if (kinds.length !== 1) cx.add("error", `[${i}]`, "catalog_kind");
    for (const lang of ["it", "en"]) {
      if (!e.labels?.[lang]) cx.add("warning", `[${i}].labels`, "translation_missing", { lang });
    }
  });
  return cx.issues;
}

function validateTutorialIndex(index, opts = {}) {
  // demolishResult dei tile condivisi punta agli altri tile dell'indice
  const cx = _validationContext(opts, { tileTypes: index?.tileTypes });
  _walk(SCHEMA_TUTORIAL_INDEX, index, "", cx);
  const seen = new Set();
  (index?.lessons || []).forEach((l, i) => {
    if (!l?.id) return;
    if (seen.has(l.id)) cx.add("error", `lessons[${i}].id`, "step_duplicate", { id: l.id });
    seen.add(l.id);
  });
  return cx.issues;
}

// config.json già unito alle costanti (config.js:loadConfig): le classi nuove
// sono note quando si controllano i riferimenti
function validateConfig(cfg, opts = {}) {
  const cx = _validationContext(opts);
  _walk(SCHEMA_CONFIG, cfg, "", cx);
  _checkConfigMixes(cfg, "vcMix", cx);
  return cx.issues;
}

function _checkConfigMixes(cfg, path, cx) {
  for (const [k, mix] of Object.entries(cfg?.vcMix || {})) {
    if (_isPlain(mix) && !Object.values(mix).some((w) => w > 0)) cx.add("error", `${path}.${k}`, "mix_empty");
  }
}

// ── Mod (mods.js) ──────────────────────────────────────────────────────
// mod.json prima di essere applicato: le classi che aggiunge contano come
// note; opts.base = cartella della mod, da cui partono i percorsi
function validateMod(mod, opts = {}) {
  const cfg = _isPlain(mod?.config) ? mod.config : {};
  const names = (m) => (_isPlain(m) ? Object.keys(m) : []);
  const classes = { unit: names(cfg.unitClasses), enemy: names(cfg.enemyClasses) };
  const cx = _validationContext({ ...opts, classes });
  _walk(SCHEMA_MOD, mod, "", cx);
  _checkConfigMixes(cfg, "config.vcMix", cx);
  (Array.isArray(mod?.maps) ? mod.maps : []).forEach((e, i) => {
    if (!_isPlain(e)) return;
    if (!e.file === !e.generator) cx.add("error", `maps[${i}]`, "mod_map_kind");
  });
  for (const lang of ["it", "en"]) {
    if (_isPlain(mod) && !mod.labels?.[lang]) cx.add("warning", "labels", "translation_missing", { lang });
  }
  return cx.issues;
}

function validateModIndex(index, opts = {}) {
  const cx = _validationContext(opts);
  _walk(SCHEMA_MOD_INDEX, index, "", cx);
  return cx.issues;
}

// Errori di sintassi di config.json e del catalogo (config.js:loadConfig,
// maps.js:loadCatalog), riportati con il resto da reportStartupIssues quando
// le traduzioni sono caricate
const LOAD_ISSUES = [];

function reportStartupIssues() {
  for (const e of LOAD_ISSUES) reportIssues(e.file, e.issues);
  reportIssues("config.json", validateConfig(CONFIG_FILE || {}));
  reportIssues("missions/catalog.json", validateCatalog(CATALOG.filter((e) => !e.mod)));
  for (const m of MOD_LIST) reportIssues(m.file, m.issues);
}

// Lancia MapDataError se ci sono errori; gli avvisi vanno in console
function assertValid(file, issues) {
  reportIssues(file, issues.filter((i) => i.level !== "error"));
  if (_issueErrors(issues).length) throw new MapDataError(file, issues);
}
