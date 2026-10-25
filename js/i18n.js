let LANG = "it";
let T = {};

// Lingue con un file in translations/; la scelta del giocatore resta in
// localStorage, altrimenti si usa la lingua del browser e, se non prevista,
// l'inglese
const SUPPORTED_LANGS = ["it", "en"];
const LANG_KEY = "vn68_lang";
const DEFAULT_LANG = "en";

function initialLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (SUPPORTED_LANGS.includes(saved)) return saved;
  } catch (e) {}
  const prefs = Array.isArray(navigator.languages) ? navigator.languages : [navigator.language];
  for (const p of prefs) {
    const code = typeof p === "string" ? p.toLowerCase().split("-")[0] : null;
    if (SUPPORTED_LANGS.includes(code)) return code;
  }
  return DEFAULT_LANG;
}

function markLangButtons(lang) {
  document
    .querySelectorAll(".lang-btn")
    .forEach((b) => b.classList.toggle("active", b.dataset.lang === lang));
  document.documentElement.lang = lang;
}

async function loadLang(lang) {
  try {
    const resp = await fetch(`translations/${lang}.json`);
    T = await resp.json();
    LANG = lang;
  } catch (e) {
    console.warn("[i18n] Could not load:", lang, e);
  }
}

function t(key, vars = {}) {
  const parts = key.split(".");
  let val = T;
  for (const p of parts) val = val?.[p];
  if (typeof val !== "string") return key;
  return val.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

// Traduzione specifica della missione corrente
function mt(subkey) {
  const tr = G.mapData?.translations?.[LANG];
  if (!tr) return null;
  const parts = subkey.split(".");
  let val = tr;
  for (const p of parts) val = val?.[p];
  return typeof val === "string" ? val : null;
}

// Traduzione label di un obiettivo missione (per indice)
function missionObjLabel(type, index) {
  const arr = G.mapData?.translations?.[LANG]?.objectives?.[type];
  return arr?.[index]?.label ?? null;
}

function applyTranslationsToData() {
  // Classi US: nome e descrizione dalle traduzioni o, per le classi di
  // config.json, dal loro "labels"; etichetta dell'abilità dal suo tipo
  for (const [k, def] of Object.entries(UNIT_CLASSES)) {
    const d = T.units?.classes?.[k];
    const l = def.labels?.[LANG] || def.labels?.it;
    def.name = l?.name ?? d?.name ?? def.name;
    def.desc = l?.desc ?? d?.desc ?? def.desc;
    def.specialLabel =
      l?.special ?? (def.special ? T.units?.specials?.[def.special] ?? def.specialLabel : "—");
  }

  for (const [k, d] of Object.entries(T.missions || {})) {
    if (MISSION_TYPES[k]) {
      MISSION_TYPES[k].label = d.label;
      MISSION_TYPES[k].desc = d.desc;
    }
  }

  // US soldiers names
  const sn = T.units?.soldier_names;
  if (sn) SOLDIER_NAMES.splice(0, SOLDIER_NAMES.length, ...sn);

  // VC soldiers names
  const vn = T.units?.vc_names;
  if (vn) VC_NAMES.splice(0, VC_NAMES.length, ...vn);
}

function applyTranslationsToDOM() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const val = t(key);
    if (val !== key) el.textContent = val;
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    const val = t(key);
    if (val !== key) el.title = val;
  });
  updateWindButton();
  updateHeaderTexts();

  // Placeholder dinamici quando il gioco non è ancora avviato
  if (!G.missionType) {
    const noUnit = t("units.no_unit_selected");
    const noMission = t("objective_panel.no_mission");
    const noDice = t("ui.no_dice");
    document.getElementById("sel-info").innerHTML =
      `<div style="font-size:11px;color:var(--paper-dark);padding:4px 0">${noUnit}</div>`;
    document.getElementById("obj-panel").innerHTML =
      `<div style="font-size:11px;color:var(--paper-dark);padding:4px 0">${noMission}</div>`;
    const mobOp = document.getElementById("mob-obj-panel");
    if (mobOp)
      mobOp.innerHTML = `<div style="font-size:11px;color:var(--paper-dark)">${noMission}</div>`;
    /*["dice-display", "mob-dice-display"].forEach((id) => {
      const el = document.getElementById(id);
      if (el)
        el.innerHTML = `<span style="font-size:11px;color:var(--paper-dark)">${noDice}</span>`;
        });*/
  }
}

// "NOME MAPPA — TIPO MISSIONE" nell'header
function missionSubtitle() {
  const name = (mt("name") ?? G.mapData?.name ?? "?").toUpperCase();
  return name + " — " + (MISSION_TYPES[G.missionType]?.label ?? "").toUpperCase();
}

// Testi dell'header scritti dal codice (non data-i18n): ridisegnati al
// cambio lingua
function updateHeaderTexts() {
  document.getElementById("btn-fow").title = t(G.fowEnabled ? "buttons.fow_on" : "buttons.fow_off");
  document.getElementById("mission-subtitle").textContent =
    G.missionType && G.mapData ? missionSubtitle() : t("header.mission_initial");
  if (G.missionType && (G.phase === "player" || G.phase === "enemy"))
    document.getElementById("phase-label").textContent = t(`phases.${G.phase}`);
}

// Cambio lingua dal menu iniziale: le schede delle mappe e il banner di
// ripresa sono generati da initModal, quindi si ridisegna il primo passo
function refreshMenuTexts() {
  const menuOpen = document.getElementById("modal-overlay").style.display !== "none";
  const onMapStep = document.getElementById("modal-step-map").style.display !== "none";
  const tutorialOpen = !document.getElementById("tutorial-overlay").classList.contains("hidden");
  if (menuOpen && onMapStep && !tutorialOpen) initModal();
  // Finestra della campagna: ridisegnata con i testi nuovi
  if (campaignOverlayOpen()) renderCampaignView();
}

function setLang(lang) {
  markLangButtons(lang);
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch (e) {}

  loadLang(lang).then(() => {
    rebuildMapsFromCatalog();
    applyTranslationsToData();
    applyTranslationsToDOM();
    refreshMenuTexts();
    if (G.missionType) {
      updateUI();
      // Testi dell'istruttore nella nuova lingua (lezioni del tutorial)
      renderTutorialPanel();
    }
  });
}
