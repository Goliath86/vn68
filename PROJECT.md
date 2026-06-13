# PROJECT.md — Struttura del Progetto

## Panoramica

**NAM '68** è un wargame single-page interamente self-contained: nessun framework, nessun bundler, nessuna dipendenza esterna a runtime. Tutto il codice (HTML, CSS, JS) vive in un singolo file HTML. L'unica risorsa esterna è Google Fonts, caricata via `@import`.

---

## Struttura dei File

```
ghosts/
├── index.html          # Prima versione (prototype)
├── index2.html         # Versione intermedia
├── index3.html         # Versione corrente e attiva
├── package.json        # Metadati progetto (no dipendenze runtime)
├── missions/
│   └── rung_sat.json   # Definizione della mappa "Rung Sat Special Zone"
└── .zed/
    └── tasks.json      # Task di lancio per l'editor Zed
```

> `index3.html` è il file canonico. Le versioni precedenti (`index.html`, `index2.html`) sono iterazioni superate.

---

## Architettura di index3.html

Il file è organizzato in tre blocchi sequenziali:

### 1. CSS (righe ~1–616)

Variabili CSS custom nella `:root` per l'intera palette cromatica e i font. Layout con flexbox a tre colonne (pannello sinistro, canvas centrale, log destro). Responsive breakpoint a 700px che nasconde i pannelli laterali e mostra un bottom sheet con tab.

Font usati:
- `Share Tech Mono` — testo UI principale
- `Oswald` — etichette e titoli
- `Special Elite` — titolo principale stile "timbro militare"

---

### 2. HTML (righe ~617–766)

Struttura statica della UI:

```
#header              — titolo, sottotitolo missione, info turno
#app
  #left-panel        — lista unità, info unità selezionata, azioni, dadi, obiettivo
  #center            — due canvas sovrapposti (#map-canvas, #overlay-canvas) + tooltip
  #right-panel       — radio log (SITREP)
  #bottom-sheet      — solo mobile: tab bar con SQUADRA / AZIONI / DADO / OBJ / LOG
#modal-overlay       — schermata di selezione missione al caricamento
#gameover-overlay    — schermata fine partita
```

---

### 3. JavaScript (righe ~767–fine)

Tutto il codice di gioco in un unico `<script>` inline, senza moduli. Le sezioni sono delimitate da commenti `// ── NOME ──`.

#### Costanti e dati statici

| Costante | Contenuto |
|---|---|
| `TILE` | Dimensione in pixel di una cella (64px) |
| `AP_PER_TURN` | Action points per unità per turno (3) |
| `UNIT_CLASSES` | Statistiche delle 4 classi giocante |
| `MISSION_TYPES` | Descrizioni dei 4 tipi di missione |
| `SOLDIER_NAMES` | Pool di nomi casuali per i soldati |
| `VC_NAMES` | Pool di nomi per i nemici |

#### Stato globale `G`

Oggetto singleton che contiene tutto lo stato della partita: unità, nemici, fase, turno, tipo missione, stato canvas, camera, effetti grafici attivi, dado pendente, modalità azione corrente.

#### Sezioni logiche principali

| Sezione | Responsabilità |
|---|---|
| `CANVAS SETUP` | Setup dei due canvas, event listener per mouse/touch/wheel, pan e pinch zoom |
| `RENDERING` | `render()` — disegna mappa, unità, overlay (celle raggiungibili/attaccabili), effetti |
| `MAP LOADING` | Carica `missions/*.json` via `fetch`, popola la griglia e spawna le unità |
| `PATHFINDING` | BFS per celle raggiungibili (`getReachable`), A* per il percorso (`getPath`) |
| `COMBAT` | `resolveCombat()` — risoluzione attacchi con dado manuale (Promise) o automatico |
| `DADO MANUALE` | `waitForDice()` — Promise che si risolve al click del giocatore sul pulsante dado |
| `ACTION MODE` | `setActionMode()` — calcola celle evidenziate per muovi/attacca/speciale |
| `PLAYER ACTIONS` | Handler dei pulsanti e click su canvas per le azioni del turno giocatore |
| `ENEMY AI` | `doEnemyTurn()` — VC si muovono verso i giocatori e attaccano se in gittata |
| `OVERWATCH` | `checkOverwatch()` — il Cecchino spara ai VC che si muovono nel suo raggio |
| `MISSION CHECK` | `checkMissionEnd()` — controlla vittoria/sconfitta dopo ogni azione |
| `EFFETTI GRAFICI` | `addFX()` — coda di animazioni (sparo, colpo, mancato, morte) sul canvas overlay |
| `MOBILE UI` | Bottom sheet, tab bar, drag handle per ridimensionamento, wrapper `log()` mobile-aware |

---

## Formato delle Mappe (`missions/*.json`)

Ogni mappa è un file JSON con questa struttura:

```jsonc
{
  "name": "...",
  "description": "...",
  "width": 960, "height": 704,
  "tileSize": 64, "cols": 15, "rows": 11,

  "tileTypes": {
    "J": { "id": "jungle", "moveCost": 2, "coverBonus": 2, "color": "..." },
    // ... altri tipi
  },

  "grid": [
    ["J","J","R","..."],   // rows × cols, carattere = chiave di tileTypes
    // ...
  ],

  "playerStart": [{ "col": 0, "row": 4 }, ...],   // posizioni iniziali squadra
  "vcSpawnZones": [{ "colMin": 8, "colMax": 14, "rowMin": 0, "rowMax": 4 }],
  "vcCount": 6,

  "objectives": {
    "recon":             [{ "col": 9, "row": 2, "label": "LZ Alpha" }],
    "search_destroy":    { "eliminateAll": true, "minKills": 4 },
    "rescue_pilot":      { "pilotCol": 11, "pilotRow": 3, "extractCol": 0, "extractRow": 5 },
    "capture_objective": [{ "col": 9, "row": 5, "label": "...", "holdTurns": 2 }]
  },

  "supportedMissions": ["recon", "search_destroy", "rescue_pilot", "capture_objective"],

  "ambushChance": 0.15,
  "reinforcementTurn": 5,
  "reinforcementCount": 2
}
```

Per aggiungere una nuova mappa basta creare un nuovo file `.json` nella cartella `missions/` e aggiornare la lista delle mappe disponibili nel codice di caricamento in `index3.html`.

---

## Come Eseguire

Apri `index3.html` direttamente nel browser oppure servila con un server locale (necessario per il `fetch` delle mappe su alcuni browser):

```bash
# con Python
python -m http.server 8080

# con Node (npx serve)
npx serve .
```

Poi vai su `http://localhost:8080/index3.html`.

---

## Aggiungere Contenuto

| Cosa aggiungere | Dove intervenire |
|---|---|
| Nuova mappa | Crea `missions/nome.json`, aggiungi la entry nell'array mappe in `index3.html` |
| Nuova classe unità | Aggiungi entry a `UNIT_CLASSES`, implementa la logica speciale nella sezione `ACTION MODE` |
| Nuovo tipo missione | Aggiungi entry a `MISSION_TYPES`, aggiungi il controllo in `checkMissionEnd()` |
| Nuovi tipi di terreno | Aggiungi entry a `tileTypes` nella mappa JSON e il rendering in `drawTile()` |
