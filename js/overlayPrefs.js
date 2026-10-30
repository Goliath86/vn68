// ── AREE EVIDENZIATE SULLA MAPPA ───────────────────────────────────────
// Quali contorni/aree disegna render.js:renderOverlay e se scriverne
// l'etichetta (labelOutline). Ogni area si spegne da sola o solo nella sua
// scritta; scelte in localStorage[vn68_overlay], default tutto acceso.
// Menu: Opzioni → Aree sulla mappa (mainMenu.js) o bottone ▦ nell'header
const OVERLAY_PREF_KEY = "vn68_overlay";

// id = chiave di translations overlay.areas.*; label: false = area senza scritta
const OVERLAY_AREAS = [
  { id: "move" },
  { id: "targets" },
  { id: "vision" },
  { id: "cone" },
  { id: "range" },
  { id: "noise" },
  { id: "overwatch" },
  { id: "suppression" },
  { id: "scatter" },
  { id: "artillery" },
  { id: "spot", label: false },
];

// Etichette di labelOutline che appartengono a un'area con altro nome
const OVERLAY_LABEL_AREA = { salvo: "scatter" };

let OVERLAY_PREFS = loadOverlayPrefs();

function loadOverlayPrefs() {
  const prefs = { area: {}, label: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(OVERLAY_PREF_KEY) || "{}");
    for (const k of ["area", "label"])
      if (saved[k] && typeof saved[k] === "object")
        for (const [id, v] of Object.entries(saved[k])) prefs[k][id] = v !== false;
  } catch (e) {}
  return prefs;
}

function saveOverlayPrefs() {
  try {
    localStorage.setItem(OVERLAY_PREF_KEY, JSON.stringify(OVERLAY_PREFS));
  } catch (e) {}
}

// L'area va disegnata?
function overlayOn(id) {
  return OVERLAY_PREFS.area[id] !== false;
}

// La scritta del contorno `key` (chiave di translations outline.*) va scritta?
function overlayLabelOn(key) {
  const id = OVERLAY_LABEL_AREA[key] || key;
  return overlayOn(id) && OVERLAY_PREFS.label[id] !== false;
}

function setOverlayPref(kind, id, on) {
  OVERLAY_PREFS[kind][id] = on;
  saveOverlayPrefs();
  if (G.mapData) render();
}

// ── Modale ─────────────────────────────────────────────────────────────
const overlayPrefsOverlay = document.getElementById("overlay-prefs-overlay");

function openOverlayPrefs() {
  const list = document.getElementById("overlay-prefs-list");
  list.innerHTML = `
    <div class="ovp-row ovp-head">
      <span></span><span>${t("overlay.area")}</span><span>${t("overlay.label")}</span>
    </div>`;
  for (const a of OVERLAY_AREAS) {
    const row = document.createElement("div");
    row.className = "ovp-row";
    row.innerHTML = `
      <span class="ovp-text">
        <span class="mod-name">${t(`overlay.areas.${a.id}.name`)}</span>
        <span class="mod-desc">${t(`overlay.areas.${a.id}.desc`)}</span>
      </span>
      <span><input type="checkbox" data-kind="area" ${overlayOn(a.id) ? "checked" : ""} /></span>
      <span>${
        a.label === false
          ? ""
          : `<input type="checkbox" data-kind="label" ${OVERLAY_PREFS.label[a.id] !== false ? "checked" : ""} />`
      }</span>`;
    const labelBox = row.querySelector('[data-kind="label"]');
    const sync = () => {
      if (labelBox) labelBox.disabled = !overlayOn(a.id);
    };
    row.querySelectorAll("input").forEach((box) =>
      box.addEventListener("change", () => {
        setOverlayPref(box.dataset.kind, a.id, box.checked);
        sync();
      }),
    );
    sync();
    list.appendChild(row);
  }
  overlayPrefsOverlay.classList.remove("hidden");
}

function closeOverlayPrefs() {
  overlayPrefsOverlay.classList.add("hidden");
}

document.getElementById("btn-overlay-prefs").addEventListener("click", () => {
  sfx("click");
  openOverlayPrefs();
});
document.getElementById("overlay-prefs-reset").addEventListener("click", () => {
  sfx("click");
  OVERLAY_PREFS = { area: {}, label: {} };
  saveOverlayPrefs();
  if (G.mapData) render();
  openOverlayPrefs();
});
document.getElementById("overlay-prefs-close").addEventListener("click", closeOverlayPrefs);
overlayPrefsOverlay.addEventListener("click", (e) => {
  if (e.target === overlayPrefsOverlay) closeOverlayPrefs();
});
// Modale aperto: Esc/Invio lo chiudono, gli altri tasti non arrivano al gioco
document.addEventListener("keydown", (e) => {
  if (overlayPrefsOverlay.classList.contains("hidden")) return;
  e.stopImmediatePropagation();
  if (e.key === "Escape" || e.key === "Enter") {
    e.preventDefault();
    closeOverlayPrefs();
  }
}, true);
