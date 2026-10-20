// Populated at startup from missions/catalog.json — do NOT hardcode here.
// To add a new map: create the JSON + add one entry to catalog.json.
// Procedural maps: an entry with "generator": "<name>" instead of "file"
// (see MAP_GENERATORS in mapGen.js).
let MAPS = [];
let CATALOG = [];

async function loadCatalog() {
  try {
    const resp = await fetch("missions/catalog.json");
    CATALOG = parseJsonText(await resp.text(), "missions/catalog.json");
  } catch (e) {
    if (e.issues) LOAD_ISSUES.push(e);
    else console.warn("[catalog] Failed to load missions/catalog.json:", e);
  }
}

// File delle mappe del catalogo: immagine di sfondo e SFX (`files`, attesi
// dalla schermata di caricamento) e musica d'ambiente (`ambient`, scaricata
// in background a menu aperto: serve solo in missione ed è il file più
// pesante). Le mappe procedurali riusano gli stessi file.
async function catalogAssetPaths() {
  const files = CATALOG.map(catalogEntryPath).filter(Boolean);
  const maps = await Promise.all(files.map((f) => fetchMapFile(f).catch(() => null)));
  const list = maps.filter(Boolean);
  return {
    files: list
      .flatMap((md) => [
        missionImagePath(md),
        ...Object.values(md.tileTypes || {}).map((d) => !md.image && _textureImagePath(d)),
        ...Object.values(md.sounds || {}),
        ...missionWeaponSounds(md),
      ])
      .filter(Boolean),
    ambient: list.map((md) => md.ambient).filter(Boolean),
  };
}

// JSON di una voce del catalogo: in missions/, o già risolto per le mappe
// delle mod (mods.js:applyMod)
function catalogEntryPath(entry) {
  if (!entry.file) return null;
  return entry.mod ? entry.file : `missions/${entry.file}`;
}

function rebuildMapsFromCatalog() {
  MAPS = CATALOG.map((entry) => {
    const labels = entry.labels?.[LANG] || entry.labels?.it || {};
    return {
      file: catalogEntryPath(entry),
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
