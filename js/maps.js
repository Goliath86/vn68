// Populated at startup from missions/catalog.json — do NOT hardcode here.
// To add a new map: create the JSON + add one entry to catalog.json.
// Procedural maps: an entry with "generator": "<name>" instead of "file"
// (see MAP_GENERATORS in mapGen.js).
let MAPS = [];
let CATALOG = [];

async function loadCatalog() {
  try {
    const resp = await fetch("missions/catalog.json");
    CATALOG = await resp.json();
  } catch (e) {
    console.warn("[catalog] Failed to load missions/catalog.json:", e);
  }
}

function rebuildMapsFromCatalog() {
  MAPS = CATALOG.map((entry) => {
    const labels = entry.labels?.[LANG] || entry.labels?.it || {};
    return {
      file: entry.file ? `missions/${entry.file}` : null,
      generator: entry.generator || null,
      label: labels.label || entry.file || entry.generator,
      subtitle: labels.subtitle || "",
      theater: labels.theater || "",
      icon: entry.icon || "🗺️",
      color: entry.color || "#444",
      theaterColor: entry.theaterColor || "#444",
    };
  });
}
