# CLAUDE.md — Contesto tecnico per VIETNAM '68 (vn68)

Questo file è pensato per essere messo nella root del repo (`Goliath86/vn68`) così che una futura sessione Claude Code possa orientarsi subito senza dover rileggere tutto il codice da zero.

## Cos'è il progetto

Wargame tattico a turni ambientato nella Guerra del Vietnam (1968), giocabile interamente nel browser (HTML5 Canvas + vanilla JS, **nessun framework, nessun build step**). Multi-mappa, multi-missione, bilingue IT/EN, salvataggio automatico su `localStorage`.

Il file `README.md` (italiano) e `README_EN.md` (inglese) contengono la documentazione **utente** completa di regole/meccaniche — è la fonte di verità per le regole di gioco e va tenuta sincronizzata quando si cambia una meccanica. Questo file invece è la mappa del codice per chi deve modificarlo.

## Come si avvia

Richiede un server HTTP locale (fetch di JSON, niente `file://`):
```
npx serve .
# oppure
python -m http.server 8080
```

## Struttura del progetto

```
index.html          markup + ordine di caricamento script (vedi sotto)
style.css            tutto lo stile, responsive desktop/mobile
config.json           config globale: musica menu, sprite unità, SFX, loadout armi (vedi "Sistema config-driven")
TODO                  note libere / bugfix tracciati manualmente (non uno issue tracker)
js/                   ~5100 righe totali, tutto in globale (no moduli ES, no bundler)
missions/             una mappa = un JSON + asset opzionali (immagine, musica, sfx)
missions/catalog.json registro delle mappe disponibili nel menu
translations/it.json, translations/en.json   stringhe UI (chiavi usate da js/i18n.js)
assets/               sprite PNG unità, SFX MP3, musica menu
```

### Nessun modulo ES / nessun bundler
Tutti i file in `js/` sono script classici concatenati via `<script>` tag in `index.html`, e condividono lo **stato globale unico `G`** definito in `js/constants.js`. **L'ordine degli script in `index.html` è significativo** (dipendenze implicite tramite funzioni globali) — se aggiungi un nuovo file js, inseriscilo nella posizione coerente con cosa usa/definisce. Ordine attuale:

```
config.js → constants.js → canvas.js → sounds.js → fowLos.js → utils.js →
maps.js → i18n.js → alea.js → weapons.js → actions.js → specialActions.js →
plchldSprites.js → overwatch.js → render.js → saveGame.js → combat.js →
initModal.js → tabs.js → backModal.js → pathfind.js → camera.js →
animations.js → ai.js → game.js → suppression.js → log.js → tooltip.js →
ui.js → selectedUnit.js → init.js → unitList.js → unitMovement.js
```

## Lo stato globale `G` (js/constants.js)

Tutto il gioco ruota attorno all'oggetto `G`: `units` (squadra US), `enemies` (VC), `selectedUnit`, `phase` (`player`/`enemy`/`gameover`), `turn`, `missionType`, `missionState` (stato specifico della missione corrente: es. `vcCarrierCounts`, posizione pilota, ecc.), `actionMode` (`move`/`attack`/`weapon_select`/`aoe_confirm`/`special`), `reachable`/`attackable` (celle evidenziate), `overwatchList`/`suppressList`, `activeFires`, `visibleTiles` (Fog of War), stato canvas/camera (`camX`, `camY`, `scale`...).

Altre costanti in `constants.js`: `TILE=64`, `AP_PER_TURN=3`, `SAVE_KEY`, `UNIT_CLASSES` (le 4 classi giocabili con stat base), `MISSION_TYPES` (le 4 tipologie di missione), `SOLDIER_NAMES`/`VC_NAMES`.

## Mappa dei moduli JS (chi fa cosa)

| File | Responsabilità |
|---|---|
| `config.js` | `buildWeapons()` — merge tra armi di default della classe e override da `config.json`/missione |
| `constants.js` | stato globale `G`, costanti, definizioni classi e tipi missione |
| `canvas.js` | setup canvas, resize, gestione click sulla mappa (`onCanvasClick`) |
| `sounds.js` | tutto l'audio: musica ambientale/menu, SFX sintetizzati via Web Audio API come fallback, caricamento SFX custom da config/missione, mute |
| `fowLos.js` | Fog of War e Line of Sight: `recomputeVisibility()`, `isTileVisibleFromUnit()`, costo movimento/copertura per tile |
| `utils.js` | helper generici: `rnd`, `clamp`, `dist` (Manhattan), `pick`, `sleep`, `isMobile` |
| `maps.js` | costruisce l'elenco mappe a runtime da `catalog.json` |
| `i18n.js` | `t()`/`mt()` lookup traduzioni, `applyTranslationsToData()`, `setLang()` |
| `alea.js` | dadi: `rollD6`, `rollDice(n)`, `diceSum` |
| `weapons.js` | `unitWeapon(unit)` — arma correntemente equipaggiata/selezionata |
| `actions.js` | `setActionMode()` — entra/esce da modalità muovi/attacca/speciale |
| `specialActions.js` | logica delle 4 abilità speciali (soppressione, overwatch, demolizione/incendio, cura) e `confirmAoeAttack()` |
| `overwatch.js` | `checkOverwatch(enemy)` — trigger overwatch durante la fase nemica |
| `suppression.js` | `checkSuppression(enemy)` — trigger fuoco soppressivo durante la fase nemica |
| `render.js` | rendering principale: `render()`, `renderMap()`, `renderOverlay()` (evidenziazioni move/attack/AoE), `renderUnitsOnMap()`, `renderMissionMarkers()` |
| `saveGame.js` | `saveGame()`/`loadSave()`/`clearSave()` — persistenza `localStorage`, chiave `SAVE_KEY` |
| `combat.js` | `resolveCombat()` (attacco singolo, formula 2d6+ATK vs DEF+copertura+1d6), `resolveAoeCombat()` (granate/RPG, dado automatico) |
| `initModal.js` | modale iniziale: scelta mappa, tipo missione, composizione squadra (4 slot classe) |
| `tabs.js` | UI mobile a tab (bottom sheet): `switchTab`, `collapseSheet`/`expandSheet`, `updateActionButtons` |
| `backModal.js` | conferma "torna al menu" (bottone ⌂ / tasto indietro Android) |
| `pathfind.js` | `getReachable()` (BFS/Dijkstra pesato su costo terreno), `getPath()`, `isOccupied()` |
| `camera.js` | pan/zoom mappa: mouse drag, wheel, touch (pinch/drag) |
| `animations.js` | effetti visivi: `addFX()`, animazioni tile ambientali (`smoke`/`fire`/`fog`), loop di rendering effetti |
| `ai.js` | **IA Vietcong**: `runEnemyTurn()`, `enemyActivation()` (decide muovi/attacca per singolo VC), pattugliamento per tipo missione, `propagateAlert()` (allerta a raggio 3), `spawnReinforcements()`, `spawnAmbush()` |
| `game.js` | ciclo principale: `loadMission()`, `startGame()`, `initMissionState()`, `checkVictory()`/`checkGameOver()`, `endPlayerTurn()` |
| `log.js` | `log(msg, type)` — pannello log di combattimento |
| `tooltip.js` | tooltip al hover su tile (rispetta FOW) |
| `ui.js` | `updateUI()`, pannello obiettivo (`objPanelHTML`) |
| `selectedUnit.js` | pannello dettaglio unità selezionata |
| `init.js` | bootstrap iniziale della pagina |
| `unitList.js` | render delle card unità nel pannello squadra |
| `unitMovement.js` | esecuzione movimento (consumo AP, animazione, aggiornamento visibilità) |
| `plchldSprites.js` | sprite disegnati proceduralmente su canvas, usati come fallback se `config.json.unitImages` non fornisce un'immagine |

## Sistema config-driven (il pattern chiave da capire)

Il gioco è pensato per essere estendibile **senza toccare il codice JS**, tramite due livelli di JSON:

1. **`config.json`** (globale) — musica menu, sprite unità per classe (`unitImages`), SFX di sistema (`sounds`, priorità: missione > config.json > sintetizzato), **loadout armi per classe** (`weapons`, vedi `config.js:buildWeapons()`).
2. **JSON di missione** (`missions/<nome>.json`) — griglia, `tileTypes` (costo movimento, copertura, LOS, `burnable`/`demolishable`), `playerStart`, `vcSpawnZones`/`vcCount`, `reinforcementTurn/Count`, `vcAmbushTurn/Count/Zones`, `objectives` per tipo missione, `tileAnimations`, override `sounds`, `image` di sfondo opzionale, blocco `translations.it`/`.en`.

**Per aggiungere una nuova mappa**: bastano una entry in `missions/catalog.json` + il nuovo file `missions/<nome>.json` — zero modifiche JS (vedi sezione "Creare una nuova missione" in `README.md` per lo schema campo-per-campo completo).

Mappe esistenti oggi: `rung_sat.json`, `hue_city.json`.

## Meccaniche di gioco — riferimento rapido

- **Turno**: fase Giocatore → fase Nemica (`ai.js:runEnemyTurn`). 3 AP/unità, azioni: muovere (costo variabile da terreno), attaccare (1 AP), speciale (1 AP, una volta a turno).
- **Combattimento singolo**: `2d6 + ATK attaccante` vs `DEF difensore + copertura terreno + 1d6`; danno = max(0, diff). Il giocatore lancia fisicamente il dado (`G.diceQueue`), il nemico lancia automaticamente.
- **Cecchino**: penalità ATK crescente con la distanza (`combat.js`, floor((range-1)/2)), min ATK sempre 1.
- **Armi AoE** (granate/RPG): nessun dado manuale, risolte automaticamente in `resolveAoeCombat()`, colpiscono tutti (US + VC) nel raggio.
- **Morale/Panico**: sotto 30% HP → "SCOSSO" (−1 AP, speciale bloccato) finché il medico non lo cura sopra soglia.
- **IA VC**: pattugliamento diverso per tipo missione, allerta propagata a raggio 3 (chi è allertato per propagazione non agisce nel turno in cui si sveglia), uso tattico della copertura una volta allertati, rinforzi periodici da `reinforcementTurn`, imboscata a turno singolo non comunicato (`vcAmbushTurn`).
- **Fog of War**: toggle da header, raggio visione per classe, LOS bloccata/ridotta da terreno (`fowLos.js`).
- **Salvataggio**: automatico a inizio turno giocatore su `localStorage[SAVE_KEY]`, cancellato a fine partita (vittoria/sconfitta).

## Cose a cui fare attenzione modificando il codice

- **Stato globale condiviso**: non esistono moduli/import — ogni funzione legge/scrive `G` direttamente. Attenzione a effetti collaterali cross-file quando si tocca `G`.
- **Bilinguismo**: ogni stringa visibile all'utente deve passare da `t()`/`mt()` e avere entry in `translations/it.json` + `translations/en.json` (e nel blocco `translations` del JSON missione, se specifica del contesto di gioco).
- **Fallback ovunque**: il gioco è progettato per non rompersi se asset opzionali mancano (immagine mappa, sprite unità, SFX custom, `config.json` assente) — quando aggiungi un nuovo campo opzionale, segui questo pattern (default sensato + nessun errore bloccante).
- **`TODO`** è un log libero di bugfix già risolti (non backlog attivo) — non è uno issue tracker formale, utile solo come cronologia di micro-fix passati sullo sniper e sulla card "Resume".
- Non c'è test suite, linter o build step configurati nel repo: le modifiche si verificano avviando un server locale e giocando manualmente le missioni esistenti.
