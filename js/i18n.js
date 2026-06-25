let LANG = "it";
let T = {};

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
  for (const [k, d] of Object.entries(T.units?.classes || {})) {
    if (UNIT_CLASSES[k]) {
      UNIT_CLASSES[k].name = d.name;
      UNIT_CLASSES[k].desc = d.desc;
      UNIT_CLASSES[k].specialLabel = d.special_label;
    }
  }

  for (const [k, d] of Object.entries(T.missions || {})) {
    if (MISSION_TYPES[k]) {
      MISSION_TYPES[k].label = d.label;
      MISSION_TYPES[k].desc = d.desc;
    }
  }

  const sn = T.units?.soldier_names;
  if (sn) SOLDIER_NAMES.splice(0, SOLDIER_NAMES.length, ...sn);
  const vn = T.units?.vc_names;
  if (vn) VC_NAMES.splice(0, VC_NAMES.length, ...vn);
}

function applyTranslationsToDOM() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const val = t(key);
    if (val !== key) el.textContent = val;
  });
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
    ["dice-display", "mob-dice-display"].forEach((id) => {
      const el = document.getElementById(id);
      if (el)
        el.innerHTML = `<span style="font-size:11px;color:var(--paper-dark)">${noDice}</span>`;
    });
  }
}

function setLang(lang) {
  document
    .querySelectorAll(".lang-btn")
    .forEach((b) => b.classList.toggle("active", b.dataset.lang === lang));
  loadLang(lang).then(() => {
    rebuildMapsFromCatalog();
    applyTranslationsToData();
    applyTranslationsToDOM();
    if (G.missionType) updateUI();
  });
}
