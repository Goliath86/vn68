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

// File delle mappe del catalogo da scaricare all'avvio: immagine di sfondo,
// musica d'ambiente e SFX propri. Le mappe procedurali riusano gli stessi file.
async function catalogAssetPaths() {
  const files = CATALOG.filter((e) => e.file).map((e) => `missions/${e.file}`);
  const maps = await Promise.all(
    files.map((f) =>
      fetch(f)
        .then((r) => r.json())
        .catch(() => null),
    ),
  );
  return maps.filter(Boolean).flatMap((md) => [
    md.image && "missions/" + md.image,
    md.ambient,
    ...Object.values(md.sounds || {}),
  ]).filter(Boolean);
}

function rebuildMapsFromCatalog() {
  MAPS = CATALOG.map((entry) => {
    const labels = entry.labels?.[LANG] || entry.labels?.it || {};
    return {
      file: entry.file ? `missions/${entry.file}` : null,
      generator: entry.generator || null,
      // Scheda "Addestramento": apre l'elenco delle lezioni (tutorial.js)
      tutorial: !!entry.tutorial,
      label: labels.label || entry.file || entry.generator,
      subtitle: labels.subtitle || "",
      theater: labels.theater || "",
      icon: entry.icon || "🗺️",
      color: entry.color || "#444",
      theaterColor: entry.theaterColor || "#444",
    };
  });
}
