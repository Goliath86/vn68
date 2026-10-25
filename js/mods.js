// ── MOD ────────────────────────────────────────────────────────────────
// Una mod è una cartella mods/<id>/ con un mod.json (schema.js:SCHEMA_MOD):
// il campo "config" si aggiunge a config.json (config.js:applyConfigData),
// "maps" al catalogo delle mappe. Le cartelle sono elencate in
// mods/index.json, perché un sito statico non può elencarle da solo.
// Si attivano dal menu (openModsMenu): la scelta sta in
// localStorage[vn68_mods] e vale dal caricamento successivo della pagina,
// così classi e armi non cambiano a partita aperta.
// I percorsi di una mod e delle sue mappe partono dalla sua cartella
// (rebasePaths): "../../assets/x.mp3" è un file del gioco.
const MODS_DIR = "mods/";
const MODS_KEY = "vn68_mods";
let MOD_LIST = []; // { id, file, data, issues, active } per ogni mod dell'indice
let ACTIVE_MODS = []; // id delle mod applicate in questa pagina

function enabledModIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(MODS_KEY) || "[]");
    return Array.isArray(ids) ? ids : [];
  } catch (e) {
    return [];
  }
}

function setEnabledModIds(ids) {
  try {
    localStorage.setItem(MODS_KEY, JSON.stringify(ids));
  } catch (e) {}
}

// ── Percorsi ───────────────────────────────────────────────────────────
// "a/./b/../c" → "a/c"
function normPath(p) {
  const out = [];
  for (const s of p.split("/")) {
    if (s === "" || s === ".") continue;
    if (s === "..") out.pop();
    else out.push(s);
  }
  return out.join("/");
}

// Percorso di una mod dalla sua cartella; URL e percorsi assoluti restano
function modPath(base, p) {
  return /^([a-z][a-z0-9+.-]*:|\/)/i.test(p) ? p : normPath(base + p);
}

const isModPath = (p) => typeof p === "string" && p.startsWith(MODS_DIR);
const _dirOf = (p) => p.slice(0, p.lastIndexOf("/") + 1);

// Immagine di sfondo di una mappa: "image" parte da missions/ (in una mod
// rebasePaths la fa risalire alla sua cartella)
function missionImagePath(md) {
  return md?.image ? normPath("missions/" + md.image) : null;
}

// Riscrive in place i percorsi di un JSON seguendo lo schema: i campi con
// riferimento a un file (ref file/missionFile/missionImage, texture se è
// un'immagine) partono da `base` invece che dalla cartella del gioco
function rebasePaths(node, v, base) {
  if (v == null) return v;
  if (Array.isArray(node)) {
    const m = node.find((x) => _matches(x, v));
    return m ? rebasePaths(m, v, base) : v;
  }
  if (!_matches(node, v)) return v;
  switch (node.type) {
    case "string":
      return _rebaseRef(node.ref, v, base);
    case "object":
      for (const [k, f] of Object.entries(node.fields)) if (k in v) v[k] = rebasePaths(f, v[k], base);
      break;
    case "map":
      for (const k of Object.keys(v)) v[k] = rebasePaths(node.values, v[k], base);
      break;
    case "array":
      v.forEach((x, i) => (v[i] = rebasePaths(node.items, x, base)));
      break;
  }
  return v;
}

function _rebaseRef(ref, v, base) {
  if (ref === "file" || ref === "missionFile" || ref === "campaignFile") return modPath(base, v);
  if (ref === "texture") return TEXTURE_IMAGE_RE.test(v) ? modPath(base, v) : v;
  if (ref === "missionImage") return "../" + modPath(base, v);
  return v;
}

// JSON di una mappa del catalogo; quella di una mod con i percorsi risolti
async function fetchMapFile(path) {
  const data = await fetchJsonData(path);
  if (isModPath(path)) rebasePaths(SCHEMA_MISSION, data, _dirOf(path));
  return data;
}

// ── Caricamento ────────────────────────────────────────────────────────
// Dopo config.json e il catalogo (init.js): legge tutte le mod dell'indice
// (il menu le elenca anche spente) e applica, nell'ordine dell'indice, quelle
// attive e senza errori. I problemi vanno in console con reportStartupIssues.
async function loadMods() {
  let index;
  try {
    index = await fetchJsonData(MODS_DIR + "index.json");
  } catch (e) {
    // Nessuna cartella mods/: niente da fare
    if (e.issues && e.issues[0]?.key !== "file_missing") LOAD_ISSUES.push(e);
    return;
  }
  const indexIssues = validateModIndex(index);
  if (indexIssues.length) LOAD_ISSUES.push({ file: MODS_DIR + "index.json", issues: indexIssues });
  const ids = [...new Set((index?.mods || []).filter((id) => typeof id === "string"))];
  MOD_LIST = await Promise.all(ids.map(_readMod));
  const enabled = enabledModIds();
  for (const m of MOD_LIST) {
    if (enabled.includes(m.id) && m.data && !_issueErrors(m.issues).length) applyMod(m);
  }
}

async function _readMod(id) {
  const file = `${MODS_DIR}${id}/mod.json`;
  const m = { id, file, data: null, issues: [], active: false };
  try {
    m.data = await fetchJsonData(file);
    m.issues = validateMod(m.data);
  } catch (e) {
    m.issues = e.issues || [{ level: "error", path: "", key: "file_missing", vars: { file } }];
  }
  return m;
}

function applyMod(m) {
  const mod = rebasePaths(SCHEMA_MOD, JSON.parse(JSON.stringify(m.data)), `${MODS_DIR}${m.id}/`);
  applyConfigData(mod.config);
  for (const e of mod.maps || []) CATALOG.push({ ...e, mod: m.id });
  // Campagne della mod (campaign.js): percorsi già dalla sua cartella
  CAMPAIGN_FILES.push(...(mod.campaigns || []));
  m.active = true;
  ACTIVE_MODS.push(m.id);
}

// Testi di una mod nella lingua corrente (italiano se manca)
function modLabels(m) {
  const l = m.data?.labels || {};
  return { name: m.id, desc: "", ...(l.it || {}), ...(l[LANG] || {}) };
}

// Mod richieste da un salvataggio ma non attive ora
function missingSaveMods(save) {
  return (save?.mods || []).filter((id) => !ACTIVE_MODS.includes(id));
}

// ── Menu delle mod ─────────────────────────────────────────────────────
const modsOverlay = document.getElementById("mods-overlay");

function openModsMenu() {
  const chosen = new Set(enabledModIds());
  const initial = [...chosen].sort().join();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const list = document.getElementById("mods-list");
  list.innerHTML = MOD_LIST.length ? "" : `<p class="mods-empty">${t("mods.none")}</p>`;
  const applyBtn = document.getElementById("mods-apply");
  applyBtn.disabled = true;
  for (const m of MOD_LIST) {
    const l = modLabels(m);
    const err = _issueErrors(m.issues)[0];
    const meta = [m.data?.version && `v${m.data.version}`, m.data?.author].filter(Boolean).map(esc).join(" · ");
    const item = document.createElement("label");
    item.className = "mod-item" + (err ? " mod-broken" : "");
    item.innerHTML = `
      <input type="checkbox" ${chosen.has(m.id) ? "checked" : ""} ${err ? "disabled" : ""} />
      <div>
        <div class="mod-name">${esc(l.name)}${meta ? ` <span class="mod-meta">${meta}</span>` : ""}${
          m.active ? ` <span class="mod-active">${t("mods.active")}</span>` : ""
        }</div>
        ${l.desc ? `<div class="mod-desc">${esc(l.desc)}</div>` : ""}
        ${err ? `<div class="mod-error">⚠ ${esc(t("mods.invalid", { issue: formatIssue(err) }))}</div>` : ""}
      </div>`;
    item.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) chosen.add(m.id);
      else chosen.delete(m.id);
      applyBtn.disabled = [...chosen].sort().join() === initial;
    });
    list.appendChild(item);
  }
  applyBtn.onclick = () => {
    // Nell'ordine dell'indice, che è l'ordine in cui si applicano
    setEnabledModIds(MOD_LIST.map((m) => m.id).filter((id) => chosen.has(id)));
    location.reload();
  };
  modsOverlay.classList.remove("hidden");
}

function closeModsMenu() {
  modsOverlay.classList.add("hidden");
}

document.getElementById("btn-mods").addEventListener("click", () => {
  sfx("click");
  openModsMenu();
});
document.getElementById("mods-close").addEventListener("click", closeModsMenu);
modsOverlay.addEventListener("click", (e) => {
  if (e.target === modsOverlay) closeModsMenu();
});
