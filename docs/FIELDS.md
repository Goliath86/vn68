# Guida ai campi dei JSON

> Generata da `js/schema.js` con `node tools/schema-docs.js`: non modificarla a mano. [English version](FIELDS_EN.md)

Tutti i campi letti dal gioco nei file moddabili: mappe, lezioni dell'addestramento, catalogo delle mappe, `config.json`, mod e campagne. Per come si crea una mappa e per gli esempi vedi il [README](../README.md#creare-una-nuova-missione); `node tools/validate.js --all` controlla i file con queste stesse regole.

## Autocompletamento nell'editor

I JSON Schema in `schemas/` danno suggerimenti, descrizioni e controlli mentre si scrive. VS Code li associa da solo ai file del gioco (`.vscode/settings.json`); in qualunque editor che legge i JSON Schema (VS Code, Zed, JetBrains…) basta il campo `"$schema"` in cima al file, es. `"$schema": "../schemas/mission.schema.json"` in `missions/`.

## Indice

- [Mappa (`missions/<nome>.json`)](#map)
- [Tipo di tile](#tile)
- [Testi di una lingua](#translations)
- [Lezione dell'addestramento](#tutorial)
- [Arma](#weapon)
- [Classe della squadra US](#unit-class)
- [Classe VC](#enemy-class)
- [Configurazione globale (`config.json`)](#config)
- [Voce del menu delle mappe](#catalog)
- [Indice dell'addestramento (`missions/tutorial/index.json`)](#tutorial-index)
- [Mod (`mods/<cartella>/mod.json`)](#mod)
- [Elenco delle mod (`mods/index.json`)](#mod-index)
- [Perk](#perk)
- [Campagna (`missions/campaigns/<nome>.json`)](#campaign)
- [Operazione: una missione (`map` o `generator` + `missionType`) oppure `choices`](#campaign-op)
- [Missione di un'operazione](#campaign-choice)
- [Regole della campagna](#campaign-rules)
- [Elenco delle campagne (`missions/campaigns/index.json`)](#campaign-index)
- [Gruppi di `tuning`](#tuning)

<a id="map"></a>

## Mappa (`missions/<nome>.json`)

| Campo | Tipo | Descrizione |
|---|---|---|
| `$schema` | testo | Percorso del JSON Schema per l'editor (es. `../schemas/mission.schema.json`); ignorato dal gioco. |
| `name` | testo o oggetto { lingua → testo } | Nome della mappa: testo o `{ "it", "en" }` (di solito in `translations`). |
| `description` | testo o oggetto { lingua → testo } | Descrizione: testo o `{ "it", "en" }` (di solito in `translations`). |
| `cols` | intero ≥ 1 | **Obbligatorio.** Colonne della griglia. |
| `rows` | intero ≥ 1 | **Obbligatorio.** Righe della griglia. |
| `width` | numero | (informativo) larghezza dell'immagine. |
| `height` | numero | (informativo) altezza dell'immagine. |
| `tileSize` | numero | (informativo) lato del tile in pixel. |
| `image` | testo | Immagine di sfondo in `missions/`, o nella cartella della mod (sostituisce il disegno dei tile). → file in `missions/`. |
| `ambient` | testo | Musica d'ambiente in loop durante la partita. → percorso di un file dalla cartella del gioco (in una mod e nelle sue mappe: dalla cartella della mod). |
| `sounds` | oggetto { effetto → testo } | Effetti sonori della mappa (prevalgono su `config.json`). Chiavi: `move`, `stance`, `hit`, `death`, `miss`, `ambush`, `demolition`, `disarm`, `melee`, `reload`, `heal`, `overwatch`, `spawn`, `turn_end`, `victory`, `defeat`, `click`, `jet`, `napalm`. |
| `tileTypes` | oggetto { carattere → [Tipo di tile](#tile) } | **Obbligatorio.** Tipi di tile per carattere della griglia. |
| `grid` | array di testo o array di testo | **Obbligatorio.** Righe della mappa: stringhe (`"JJCCT…"`) o array di caratteri di `tileTypes`. |
| `playerStart` | array di tile `{ col, row }` | Posizioni di partenza della squadra. |
| `vcSpawnZones` | array di zona `{ colMin, colMax, rowMin, rowMax }` | Zone dello schieramento VC iniziale. |
| `vcCount` | intero ≥ 0 | VC iniziali; default 6. |
| `reinforcementTurn` | intero ≥ 1 | Rinforzi VC ogni N turni; senza, nessun rinforzo. |
| `reinforcementCount` | intero ≥ 0 | VC per ondata di rinforzi; default 2. |
| `vcAmbushTurn` | intero ≥ 1 | Turno dell'imboscata (una sola, non annunciata); serve `vcAmbushZones`. |
| `vcAmbushCount` | intero ≥ 0 | VC dell'imboscata; default 2. |
| `vcAmbushZones` | array di zona `{ colMin, colMax, rowMin, rowMax }` | Zone in cui compare l'imboscata. |
| `ambushChance` | numero 0–1 | Probabilità per turno che un VC in vista spari a sorpresa; default 0. |
| `trapCount` | intero ≥ 0 | Trappole casuali (punji o mina) a inizio missione; default 0. |
| `trapZones` | array di zona `{ colMin, colMax, rowMin, rowMax }` | Zone delle trappole casuali; senza, ovunque ad almeno 4 tile dalla partenza. |
| `traps` | array di oggetto | Trappole fisse. |
| `traps[].col` | intero ≥ 0 | **Obbligatorio.** Colonna (da 0). |
| `traps[].row` | intero ≥ 0 | **Obbligatorio.** Riga (da 0). |
| `traps[].type` | `punji` \| `mine` | `punji` (2 HP) o `mine` (4 HP). |
| `traps[].dmg` | intero ≥ 0 | Danno (sostituisce quello del tipo). |
| `tunnels` | array di tile `{ col, row }` | Ingressi dei tunnel VC in posizione fissa (sostituiscono quelli casuali). |
| `tunnelCount` | intero ≥ 0 | Ingressi casuali dei tunnel, su tile che nascondono, lontano dalla partenza; default 3. |
| `vcTrapPlantMax` | intero ≥ 0 | Trappole che i VC in pattuglia possono piazzare; default 3. |
| `night` | booleano | Missione sempre notturna (l'opzione del briefing è bloccata). |
| `vcNoise` | booleano | `false` = gli spari dei VC non allertano gli altri VC; default attivo. |
| `nightVisionPenalty` | intero ≥ 0 | Riduzione notturna del raggio visivo dei soldati; default 1. |
| `vcNightPenalty` | intero ≥ 0 | Riduzione notturna della distanza d'allerta e della vista dei VC (base 5, minimo 2); default 2. |
| `bleedStopChance` | numero 0–1 | Probabilità che un'emorragia si fermi da sola a inizio turno; default 1/3, 0 = solo il medico la ferma. |
| `rain` | booleano o oggetto | Solo grafica. `true` = piove tutta la missione; un oggetto = acquazzoni casuali, che cominciano a inizio turno giocatore se non piove già. |
| `rain.chance` | numero 0–1 | Probabilità per turno che cominci un acquazzone; default 0.2. |
| `rain.minTurns` | intero ≥ 1 | Durata minima in turni; default 2. |
| `rain.maxTurns` | intero ≥ 1 | Durata massima in turni; default 4. |
| `rain.fromStart` | booleano | Il primo acquazzone è già in corso a inizio missione. |
| `mist` | booleano o oggetto | Solo grafica. Banchi di nebbiolina: `true` = sui tile palude, un oggetto per scegliere tile e spessore. |
| `mist.tiles` | array di testo | `id` dei tile con la nebbiolina; default `["swamp"]`. |
| `mist.density` | numero ≥ 0 | Spessore: 0.5 rada, 1 normale, 2 fitta. |
| `temperature` | oggetto | Solo informativo. Temperature in °C del pannello meteo; la pioggia toglie 3°, il cielo coperto 1°. |
| `temperature.day` | array di numero (2) | [min, max] di giorno; default [27, 34]. |
| `temperature.night` | array di numero (2) | [min, max] di notte; default [21, 26]. |
| `cloudy` | numero 0–1 | Solo informativo. Probabilità di cielo coperto a inizio missione; default 0.35 (poi cambia col 20% a turno). |
| `squad` | array di oggetto | Squadra fissa al posto della scelta nel briefing. |
| `squad[].cls` | testo | **Obbligatorio.** Classe US. → classe US (attuali: `assault`, `sniper`, `engineer`, `medic`). |
| `squad[].col` | intero ≥ 0 | **Obbligatorio.** Colonna (da 0). |
| `squad[].row` | intero ≥ 0 | **Obbligatorio.** Riga (da 0). |
| `squad[].facing` | intero 0–3 | Orientamento: 0 nord, 1 est, 2 sud, 3 ovest. |
| `squad[].hp` | intero ≥ 1 | Punti ferita iniziali. |
| `squad[].bleeding` | booleano | Parte con un'emorragia. |
| `squad[].stance` | `stand` \| `crouch` \| `prone` | Postura iniziale. |
| `enemies` | array di oggetto | VC in posizione fissa al posto dello schieramento casuale. |
| `enemies[].cls` | testo | Classe VC. → classe VC (attuali: `grunt`, `sniper_vc`, `commander`). |
| `enemies[].col` | intero ≥ 0 | **Obbligatorio.** Colonna (da 0). |
| `enemies[].row` | intero ≥ 0 | **Obbligatorio.** Riga (da 0). |
| `enemies[].facing` | intero 0–3 | Orientamento: 0 nord, 1 est, 2 sud, 3 ovest. |
| `enemies[].alerted` | booleano | Parte in allerta. |
| `enemies[].hold` | booleano | Sentinella: non pattuglia finché non è allertata. |
| `enemies[].hp` | intero ≥ 1 | Punti ferita iniziali. |
| `supportedMissions` | array di testo | Tipi di missione giocabili sulla mappa. → tipo di missione (attuali: `recon`, `search_destroy`, `rescue_pilot`, `capture_objective`). |
| `objectives` | oggetto | Obiettivi per tipo di missione; servono quelli dei tipi in `supportedMissions`. |
| `objectives.recon` | array di oggetto | Ricognizione: zone da raggiungere. |
| `objectives.recon[].col` | intero ≥ 0 | **Obbligatorio.** Colonna (da 0). |
| `objectives.recon[].row` | intero ≥ 0 | **Obbligatorio.** Riga (da 0). |
| `objectives.recon[].label` | testo | Nome della zona. |
| `objectives.search_destroy` | oggetto | Cerca e distruggi. |
| `objectives.search_destroy.eliminateAll` | booleano | Vanno eliminati tutti i VC. |
| `objectives.search_destroy.minKills` | intero ≥ 1 | VC da eliminare; default 4. |
| `objectives.search_destroy.tileAnimations` | array di oggetto | Animazioni visibili solo in questa modalità. |
| `objectives.search_destroy.tileAnimations[].col` | intero ≥ 0 | **Obbligatorio.** Colonna (da 0). |
| `objectives.search_destroy.tileAnimations[].row` | intero ≥ 0 | **Obbligatorio.** Riga (da 0). |
| `objectives.search_destroy.tileAnimations[].type` | `smoke` \| `fire` \| `fog` | **Obbligatorio.** Fumo, fiamme o nebbia. |
| `objectives.rescue_pilot` | oggetto | Recupero pilota. |
| `objectives.rescue_pilot.pilotCol` | intero ≥ 0 | **Obbligatorio.** Colonna del pilota (nascosto nella FOW). |
| `objectives.rescue_pilot.pilotRow` | intero ≥ 0 | **Obbligatorio.** Riga del pilota. |
| `objectives.rescue_pilot.extractCol` | intero ≥ 0 | **Obbligatorio.** Colonna del punto d'estrazione. |
| `objectives.rescue_pilot.extractRow` | intero ≥ 0 | **Obbligatorio.** Riga del punto d'estrazione. |
| `objectives.rescue_pilot.tileAnimations` | array di oggetto | Animazioni visibili solo in questa modalità (es. fumo sul relitto). |
| `objectives.rescue_pilot.tileAnimations[].col` | intero ≥ 0 | **Obbligatorio.** Colonna (da 0). |
| `objectives.rescue_pilot.tileAnimations[].row` | intero ≥ 0 | **Obbligatorio.** Riga (da 0). |
| `objectives.rescue_pilot.tileAnimations[].type` | `smoke` \| `fire` \| `fog` | **Obbligatorio.** Fumo, fiamme o nebbia. |
| `objectives.capture_objective` | array di oggetto | Conquista: posizioni da occupare. |
| `objectives.capture_objective[].col` | intero ≥ 0 | **Obbligatorio.** Colonna (da 0). |
| `objectives.capture_objective[].row` | intero ≥ 0 | **Obbligatorio.** Riga (da 0). |
| `objectives.capture_objective[].label` | testo | Nome della posizione. |
| `objectives.capture_objective[].holdTurns` | intero ≥ 1 | Turni consecutivi da tenerla; default 2. |
| `tileAnimations` | array di oggetto | Animazioni ambientali sempre visibili; il fumo si vede anche attraverso la FOW. |
| `tileAnimations[].col` | intero ≥ 0 | **Obbligatorio.** Colonna (da 0). |
| `tileAnimations[].row` | intero ≥ 0 | **Obbligatorio.** Riga (da 0). |
| `tileAnimations[].type` | `smoke` \| `fire` \| `fog` | **Obbligatorio.** Fumo, fiamme o nebbia. |
| `weapons` | oggetto { classe → array di [Arma](#weapon) o oggetto { id arma → `null` o [Arma](#weapon) } } | Armi per classe, solo per questa missione. Un array sostituisce il loadout; un oggetto modifica le armi per `id` (campi uniti all'arma, `null` la toglie, un `id` nuovo la aggiunge in fondo). → classe US o VC (attuali: `assault`, `sniper`, `engineer`, `medic`, `grunt`, `sniper_vc`, `commander`). |
| `vcMix` | oggetto { classe VC → numero ≥ 0 } | Composizione dello schieramento iniziale e, senza `ambushMix`, dell'imboscata; pesi per classe VC. Default `{ "grunt": 3, "sniper_vc": 1, "commander": 1 }`. → classe VC (attuali: `grunt`, `sniper_vc`, `commander`). |
| `ambushMix` | oggetto { classe VC → numero ≥ 0 } | Composizione dell'imboscata; default `{ "grunt": 2, "sniper_vc": 1, "commander": 1 }`. → classe VC (attuali: `grunt`, `sniper_vc`, `commander`). |
| `reinforcementMix` | oggetto { classe VC → numero ≥ 0 } | Composizione dei rinforzi; default `{ "grunt": 1 }`. → classe VC (attuali: `grunt`, `sniper_vc`, `commander`). |
| `tuning` | oggetto { gruppo → qualsiasi } | Parametri di bilanciamento per questa missione, uniti in profondità ai valori del gioco (numeri e array sostituiti, oggetti uniti), es. `{ "VC_TACTICS": { "holdChance": 0.8 } }`. → gruppo di bilanciamento (vedi [tuning](#tuning)) (attuali: `VC_TACTICS`, `STANCES`, `MELEE`, `ARTILLERY`, `NAPALM`, `ENEMY_CLASSES`, `VC_MIX`). |
| `translations` | oggetto { lingua → [Testi di una lingua](#translations) } | Testi per lingua (`it`, `en`). |
| `tutorial` | [Lezione dell'addestramento](#tutorial) |  |

Campi scritti dal gioco, accettati senza avvisi: `procedural`, `seed`, `size`, `layout`, `startEdge`.

<a id="tile"></a>

## Tipo di tile

| Campo | Tipo | Descrizione |
|---|---|---|
| `id` | testo | **Obbligatorio.** Identificatore (usato in `tileLabels`, `mist` e per l'aspetto). |
| `label` | testo | Nome di default, se manca la traduzione. |
| `moveCost` | numero ≥ 0 | AP per attraversarlo (0 = gratis, 3 = palude). |
| `coverBonus` | numero ≥ 0 | Bonus difesa a chi lo occupa. |
| `color` | testo | Colore del disegno procedurale (#rrggbb). → colore `#rrggbb`. |
| `texture` | testo | Solo mappe senza `image`. Aspetto del tile: il nome di un terreno già disegnato dal gioco (`jungle`, `swamp`, `clearing`, `river`, `building`…) disegna l'`id` come quel terreno con tutti i suoi effetti (chiome, onde, erba al vento, nebbia, ombre), con la tinta di `color`; oppure il percorso di un'immagine (PNG/JPG/WebP/GIF) disegnata sopra `color`. Solo grafica. → terreno noto o percorso di un'immagine (attuali: `scorched`, `wall`, `obstacle`, `wall_breach`, `building`, `temple`, `garden`, `clearing`, `jungle`, `swamp`, `river`, `bridge`, `ford`, `street`, `urban`, `plaza`, `objective`, `debris`, `trail`, `village`, `bunker`). |
| `sound` | testo | Passi su questo terreno (es. guado, palude, strada): a ogni movimento suona quello del terreno attraversato di più; senza, il suono `move` della mappa o di `config.json`. → percorso di un file dalla cartella del gioco (in una mod e nelle sue mappe: dalla cartella della mod). |
| `impassable` | booleano | Blocca il movimento (muri, fiumi). |
| `losBlock` | `full` \| `partial` | `full` = blocca la vista, `partial` = −1 al raggio visivo per ogni tile attraversato. |
| `burnable` | booleano | Il geniere può incendiarlo (fuoco per 2 turni). |
| `demolishable` | booleano | Il geniere può demolirlo con dado ≥ 4. |
| `demolishResult` | testo | Carattere della griglia del tile dopo la demolizione. → carattere di `tileTypes`. |
| `blastResult` | testo o booleano | Carattere del tile che lo sostituisce quando ci cade un colpo d'artiglieria; `false` = indistruttibile. Default: `burnable` → terra bruciata in fiamme, muri/edifici/templi/bunker → macerie, altri `demolishable` → `demolishResult`. → carattere di `tileTypes`. |

<a id="translations"></a>

## Testi di una lingua

| Campo | Tipo | Descrizione |
|---|---|---|
| `name` | testo | Nome della mappa. |
| `description` | testo | Descrizione nel briefing. |
| `tileLabels` | oggetto { id del tile → testo } | Nomi dei tile per `id`. |
| `objectives` | oggetto | Nomi degli obiettivi. |
| `objectives.recon` | array di oggetto |  |
| `objectives.recon[].label` | testo | Nome mostrato, nello stesso ordine di `objectives`. |
| `objectives.capture_objective` | array di oggetto |  |
| `objectives.capture_objective[].label` | testo | Nome mostrato, nello stesso ordine di `objectives`. |
| `tutorial` | oggetto { id del passo → testo } | Testi dei passi del tutorial per `id`. |

<a id="tutorial"></a>

## Lezione dell'addestramento

Una lezione (`missions/tutorial/*.json`) è una [mappa](#map) con il blocco `tutorial`; `tileTypes` e i nomi dei tile possono venire dall'[indice](#tutorial-index).

| Campo | Tipo | Descrizione |
|---|---|---|
| `missionType` | testo | **Obbligatorio.** Tipo di missione della lezione. → tipo di missione (attuali: `recon`, `search_destroy`, `rescue_pilot`, `capture_objective`). |
| `steps` | array di oggetto | **Obbligatorio.** Passi della lezione, in ordine. |
| `steps[].id` | testo | **Obbligatorio.** Identificatore; il testo sta in `translations.<lingua>.tutorial`. |
| `steps[].until` | `next` o oggetto | Quando il passo è completato: `"next"` = bottone Avanti, oppure un evento. |
| `steps[].until.event` | `select` \| `move` \| `rotate` \| `stance` \| `attack` \| `kill` \| `aoe` \| `reload` \| `firstaid` \| `special` \| `trapFound` \| `tunnelFound` \| `endTurn` \| `turnStart` | **Obbligatorio.** Azione del giocatore che chiude il passo. |
| `steps[].until.at` | tile `{ col, row }` | Tile in cui deve avvenire. |
| `steps[].until.within` | intero ≥ 0 | Distanza massima da `at`; default 0. |
| `steps[].highlight` | tile `{ col, row }` | Tile evidenziato sulla mappa. |
| `steps[].ui` | array di testo | Id dei controlli dell'interfaccia che lampeggiano. |
| `steps[].fresh` | booleano | Conta solo le azioni fatte dopo l'inizio del passo. |

Campi scritti dal gioco, accettati senza avvisi: `lessonId`.

<a id="weapon"></a>

## Arma

| Campo | Tipo | Descrizione |
|---|---|---|
| `id` | testo | **Obbligatorio.** Identificatore interno. |
| `label` | testo | Nome mostrato in italiano. |
| `labelEn` | testo | Nome mostrato in inglese; senza, anche in inglese si usa `label`. |
| `atk` | numero ≥ 0 | ATK dell'arma (sostituisce quello della classe). |
| `range` | intero ≥ 0 | Gittata massima in tile. |
| `ammo` | intero ≥ 0 o `null` | Usi totali (granate, fumogeni, radio); `null` = illimitati. |
| `mag` | intero ≥ 1 | Solo US. Colpi per caricatore: ogni attacco (e ogni overwatch o raffica di soppressione) ne consuma 1; a caricatore vuoto serve ricaricare. |
| `mags` | intero ≥ 0 o `null` | Con `mag`: caricatori di riserva, uno per ricarica; assente o `null` = illimitati. |
| `reloadAp` | intero ≥ 0 | Con `mag`: AP per ricaricare; default 1. |
| `shotsPerTurn` | intero ≥ 1 | Attacchi massimi per turno con quest'arma (il cecchino: 1). |
| `aoe` | intero ≥ 0 | Raggio dell'area d'effetto (distanza Manhattan): attacco risolto senza dado manuale, colpisce US e VC nel raggio. |
| `minRange` | intero ≥ 0 | Solo armi AoE. Gittata minima in tile; default `aoe + 1`, così chi lancia non è mai nel raggio. |
| `maxCarriers` | intero ≥ 0 | Unità per missione che possono portare quest'arma (contatori separati per squadra US e VC). |
| `rangePenalty` | booleano | Solo US. Penalità di gittata (−1 ATK ogni 2 tile), anche in overwatch; se assente vale solo per le classi `marksman`. |
| `noise` | numero ≥ 0 | Raggio del rumore in tile: i VC entro questa distanza si allertano. Armi US: dal tiratore per le armi dirette, dal punto d'impatto per le AoE; armi VC: sempre dal tiratore. Default 4 (diretta) / 6 (AoE). |
| `melee` | booleano | Solo US. Arma bianca: fendente al posto dei traccianti, esclusa da overwatch e soppressione; un colpo a segno uccide e l'unità avanza nel tile del bersaglio. |
| `rounds` | intero 1–5 | Solo grafica. Traccianti per attacco; default 1 per i tiratori scelti, 3 per le altre armi. |
| `smoke` | intero ≥ 1 | Solo armi AoE. Fumogeno: nessun danno, fumo nel raggio `aoe` per N turni. |
| `artillery` | booleano | Solo armi AoE. Richiesta d'artiglieria: la salva cade all'inizio del turno successivo, colpisce anche i VC nascosti e distrugge i tile colpiti. |
| `thrown` | booleano | Solo armi AoE US. Lancio a mano: animazione ad arco con rimbalzi prima dell'esplosione. |
| `scatter` | intero ≥ 0 | Solo armi AoE US. Raggio del quadrato in cui l'arma può cadere al posto del tile scelto (1 = 3×3); mai fuori mappa né su tile con `losBlock: "full"`. Con `artillery` è il quadrato di ogni colpo (default 2 = 5×5, più probabile al centro). |
| `scatterChance` | numero 0–1 | Con `scatter`: probabilità di deviare su un altro tile del quadrato; default 0.5. |
| `napalm` | booleano | Attacco aereo al napalm: si sceglie una linea di tile (inizio e fine, anche in diagonale); cade all'inizio del turno successivo, incendia i tile e colpisce chi ci si trova senza copertura del terreno. |
| `length` | intero ≥ 1 | Con `napalm`: lunghezza massima della linea in tile; default 5. |
| `shells` | intero ≥ 1 o array di intero ≥ 1 (2) | Con `artillery`: colpi della salva, numero o [min, max]; default [5, 6]. `atk` e `aoe` valgono per il singolo colpo. |
| `sound` | testo | Suono dello sparo (sostituisce quello sintetizzato). → percorso di un file dalla cartella del gioco (in una mod e nelle sue mappe: dalla cartella della mod). |

<a id="unit-class"></a>

## Classe della squadra US

| Campo | Tipo | Descrizione |
|---|---|---|
| `labels` | oggetto { lingua → oggetto } | Testi per lingua; senza la lingua corrente si usa l'italiano. Le classi base prendono i testi dalle traduzioni. |
| `labels.<lingua>.name` | testo | Nome della classe. |
| `labels.<lingua>.desc` | testo | Descrizione breve nel briefing. |
| `labels.<lingua>.special` | testo | Etichetta dell'abilità (default: quella di `special`). |
| `symbol` | testo | Lettera del distintivo. |
| `color` | testo | Colore del distintivo. → colore `#rrggbb`. |
| `hp` | intero ≥ 1 | Punti ferita. |
| `move` | intero ≥ 0 | Movimento (AP di terreno per turno). |
| `attack` | numero ≥ 0 | ATK senza armi. |
| `defense` | numero ≥ 0 | DEF. |
| `range` | intero ≥ 0 | Gittata senza armi. |
| `vision` | intero ≥ 0 | Raggio visivo in tile. |
| `special` | `suppression` \| `overwatch` \| `demolition` \| `heal` o `null` | Abilità: `suppression` (fuoco soppressivo), `overwatch`, `demolition` (demolizione, incendio, disinnesco, sigillo dei tunnel), `heal` (cura); `null` = nessuna. |
| `marksman` | booleano | Tiratore scelto: penalità di gittata per le armi senza `rangePenalty`, tracciante singolo. |
| `trapSense` | booleano | Individua le trappole a 1 tile e gli ingressi dei tunnel a 2. |
| `sprite` | `assault` \| `sniper` \| `engineer` \| `medic` | Classe US di cui usare il soldato disegnato se `unitImages` non ha un'immagine. |

Campi scritti dal gioco, accettati senza avvisi: `name`, `desc`, `specialLabel`.

<a id="enemy-class"></a>

## Classe VC

| Campo | Tipo | Descrizione |
|---|---|---|
| `name` | intero ≥ 0 o oggetto { lingua → testo } | Indice nei nomi VC tradotti (0 Guerrigliero, 1 Cecchino VC, 3 Comandante VC) oppure `{ "it", "en" }`. |
| `role` | `rifleman` \| `sniper` \| `commander` | Comportamento: `rifleman` (pattuglia, piazza trappole, aggira), `sniper` (mimetizzato, salta un turno dopo lo sparo, resta a distanza), `commander` (sempre in agguato, la sua morte fa ripiegare i VC vicini). |
| `hp` | intero ≥ 1 | Punti ferita. |
| `ap` | intero ≥ 0 | AP per turno. |
| `attack` | numero ≥ 0 | ATK senza armi. |
| `range` | intero ≥ 0 | Gittata senza armi. |
| `defense` | numero ≥ 0 | DEF. |
| `move` | intero ≥ 0 | Movimento. |
| `sprite` | `grunt` \| `sniper_vc` \| `commander` \| `nva` | Aspetto del soldato disegnato se `unitImages` non ha un'immagine: quello di una classe VC o `nva` (regolare nordvietnamita: elmetto di sughero, AK, zaino). |

<a id="config"></a>

## Configurazione globale (`config.json`)

| Campo | Tipo | Descrizione |
|---|---|---|
| `$schema` | testo | Percorso del JSON Schema per l'editor (es. `../schemas/mission.schema.json`); ignorato dal gioco. |
| `menuMusic` | testo | Musica del menu. → percorso di un file dalla cartella del gioco (in una mod e nelle sue mappe: dalla cartella della mod). |
| `menuImage` | testo | Immagine a destra nel menu desktop (sfumata in basso e a sinistra per il titolo); default `assets/menu_hero.jpg`. → percorso di un file dalla cartella del gioco (in una mod e nelle sue mappe: dalla cartella della mod). |
| `unitImages` | oggetto { classe → testo o oggetto } | Immagine della pedina per classe (US o VC): il soldato visto dall'alto **rivolto a nord**, sfondo trasparente, ruotata dal gioco verso dove guarda l'unità; senza, soldato disegnato (vedi `sprite` delle classi). → classe US o VC (attuali: `assault`, `sniper`, `engineer`, `medic`, `grunt`, `sniper_vc`, `commander`). |
| `unitImages.<classe>.stand` | testo | In piedi (anche per le posture non indicate). → percorso di un file dalla cartella del gioco (in una mod e nelle sue mappe: dalla cartella della mod). |
| `unitImages.<classe>.crouch` | testo | Accovacciato. → percorso di un file dalla cartella del gioco (in una mod e nelle sue mappe: dalla cartella della mod). |
| `unitImages.<classe>.prone` | testo | Sdraiato. → percorso di un file dalla cartella del gioco (in una mod e nelle sue mappe: dalla cartella della mod). |
| `sounds` | oggetto { effetto → testo } | Effetti sonori; senza, suoni sintetizzati. Chiavi: `move`, `stance`, `hit`, `death`, `miss`, `ambush`, `demolition`, `disarm`, `melee`, `reload`, `heal`, `overwatch`, `spawn`, `turn_end`, `victory`, `defeat`, `click`, `jet`, `napalm`. |
| `weapons` | oggetto { classe → array di [Arma](#weapon) } | Loadout per classe (US o VC); senza, ATK e gittata della classe. → classe US o VC (attuali: `assault`, `sniper`, `engineer`, `medic`, `grunt`, `sniper_vc`, `commander`). |
| `unitClasses` | oggetto { classe → [Classe della squadra US](#unit-class) } | Classi US: i campi scritti cambiano una classe esistente; un nome nuovo aggiunge una classe, che parte dalle statistiche dell'assalto e compare nel briefing (armi in `weapons`, immagine in `unitImages`). |
| `enemyClasses` | oggetto { classe → [Classe VC](#enemy-class) } | Classi VC: i campi scritti cambiano una classe esistente; un nome nuovo aggiunge una classe, che parte dai valori del guerrigliero e compare in partita solo se inserita in una composizione (`vcMix`). |
| `vcMix` | oggetto | Composizioni VC di default per tutte le mappe. |
| `vcMix.spawn` | oggetto { classe VC → numero ≥ 0 } | Schieramento iniziale. → classe VC (attuali: `grunt`, `sniper_vc`, `commander`). |
| `vcMix.ambush` | oggetto { classe VC → numero ≥ 0 } | Imboscata. → classe VC (attuali: `grunt`, `sniper_vc`, `commander`). |
| `vcMix.reinforcement` | oggetto { classe VC → numero ≥ 0 } | Rinforzi. → classe VC (attuali: `grunt`, `sniper_vc`, `commander`). |
| `perks` | oggetto { perk → [Perk](#perk) o `null` } | Perk dei soldati della campagna: i campi scritti cambiano un perk esistente (`steady`, `tough`, `quiet`, `pointman`, `fieldMedic`), un nome nuovo ne aggiunge uno, `null` lo toglie. |
| `soldierNames` | oggetto | Nomi dei soldati del plotone in campagna; senza, quelli del gioco. |
| `soldierNames.first` | array di testo | Nomi. |
| `soldierNames.last` | array di testo | Cognomi. |

<a id="catalog"></a>

## Voce del menu delle mappe

Il file è un array di voci con questi campi.

| Campo | Tipo | Descrizione |
|---|---|---|
| `file` | testo | JSON della mappa in `missions/`. → file in `missions/` (in una mod: nella sua cartella). |
| `generator` | testo | Mappa procedurale (al posto di `file`). → generatore procedurale (attuali: `jungle`, `urban`). |
| `tutorial` | booleano | Scheda dell'addestramento (lezioni da `missions/tutorial/index.json`). |
| `campaign` | booleano | Scheda della campagna (campagne da `missions/campaigns/index.json` e dalle mod). |
| `icon` | testo | Icona (emoji). |
| `color` | testo | Colore della scheda. → colore `#rrggbb`. |
| `theaterColor` | testo | Colore dell'etichetta del teatro. → colore `#rrggbb`. |
| `labels` | oggetto { lingua → oggetto } | Testi della scheda per lingua. |
| `labels.<lingua>.label` | testo | Nome. |
| `labels.<lingua>.subtitle` | testo | Sottotitolo (luogo · anno). |
| `labels.<lingua>.theater` | testo | Teatro. |

<a id="tutorial-index"></a>

## Indice dell'addestramento (`missions/tutorial/index.json`)

| Campo | Tipo | Descrizione |
|---|---|---|
| `$schema` | testo | Percorso del JSON Schema per l'editor (es. `../schemas/mission.schema.json`); ignorato dal gioco. |
| `tileTypes` | oggetto { carattere → [Tipo di tile](#tile) } | Tipi di tile condivisi dalle lezioni (una lezione può sovrascriverli). |
| `tileLabels` | oggetto { lingua → oggetto { id del tile → testo } } | Nomi dei tile condivisi, per lingua. |
| `lessons` | array di oggetto | **Obbligatorio.** Lezioni, in ordine. |
| `lessons[].id` | testo | **Obbligatorio.** Identificatore (lezioni superate). |
| `lessons[].file` | testo | **Obbligatorio.** JSON della lezione in `missions/tutorial/`. → file in `missions/tutorial/`. |
| `lessons[].icon` | testo | Icona (emoji). |
| `lessons[].classes` | array di testo | Classi mostrate nella scheda. → classe US (attuali: `assault`, `sniper`, `engineer`, `medic`). |
| `lessons[].labels` | oggetto { lingua → oggetto } | Testi della scheda per lingua. |
| `lessons[].labels.<lingua>.title` | testo | Titolo. |
| `lessons[].labels.<lingua>.desc` | testo | Descrizione. |

<a id="mod"></a>

## Mod (`mods/<cartella>/mod.json`)

Una mod è una cartella `mods/<cartella>/` con questo `mod.json`, elencata in [`mods/index.json`](#mod-index); si attiva dal menu (🧩 Mod). Le sue mappe sono [mappe](#map) normali, nella stessa cartella. Vedi il [README](../README.md#mod).

| Campo | Tipo | Descrizione |
|---|---|---|
| `$schema` | testo | Percorso del JSON Schema per l'editor (es. `../schemas/mission.schema.json`); ignorato dal gioco. |
| `labels` | oggetto { lingua → oggetto } | Testi per lingua. |
| `labels.<lingua>.name` | testo | Nome della mod. |
| `labels.<lingua>.desc` | testo | Descrizione nel menu delle mod. |
| `author` | testo | Autore. |
| `version` | testo | Versione. |
| `config` | oggetto | Aggiunte a `config.json`, con gli stessi campi: classi e composizioni unite, immagini e suoni sostituiti per chiave. I percorsi dei file partono dalla cartella della mod; `../../` risale alla cartella del gioco (es. `../../assets/footsteps_jungle.mp3`). |
| `config.menuMusic` | testo | Musica del menu. → percorso di un file dalla cartella del gioco (in una mod e nelle sue mappe: dalla cartella della mod). |
| `config.menuImage` | testo | Immagine a destra nel menu desktop (sfumata in basso e a sinistra per il titolo); default `assets/menu_hero.jpg`. → percorso di un file dalla cartella del gioco (in una mod e nelle sue mappe: dalla cartella della mod). |
| `config.unitImages` | oggetto { classe → testo o oggetto } | Immagine della pedina per classe (US o VC): il soldato visto dall'alto **rivolto a nord**, sfondo trasparente, ruotata dal gioco verso dove guarda l'unità; senza, soldato disegnato (vedi `sprite` delle classi). → classe US o VC (attuali: `assault`, `sniper`, `engineer`, `medic`, `grunt`, `sniper_vc`, `commander`). |
| `config.unitImages.<classe>.stand` | testo | In piedi (anche per le posture non indicate). → percorso di un file dalla cartella del gioco (in una mod e nelle sue mappe: dalla cartella della mod). |
| `config.unitImages.<classe>.crouch` | testo | Accovacciato. → percorso di un file dalla cartella del gioco (in una mod e nelle sue mappe: dalla cartella della mod). |
| `config.unitImages.<classe>.prone` | testo | Sdraiato. → percorso di un file dalla cartella del gioco (in una mod e nelle sue mappe: dalla cartella della mod). |
| `config.sounds` | oggetto { effetto → testo } | Effetti sonori; senza, suoni sintetizzati. Chiavi: `move`, `stance`, `hit`, `death`, `miss`, `ambush`, `demolition`, `disarm`, `melee`, `reload`, `heal`, `overwatch`, `spawn`, `turn_end`, `victory`, `defeat`, `click`, `jet`, `napalm`. |
| `config.weapons` | oggetto { classe → array di [Arma](#weapon) o oggetto { id arma → `null` o [Arma](#weapon) } } | Armi per classe (US o VC): un array sostituisce il loadout, un oggetto modifica le armi per `id` (`null` la toglie, un `id` nuovo la aggiunge). → classe US o VC (attuali: `assault`, `sniper`, `engineer`, `medic`, `grunt`, `sniper_vc`, `commander`). |
| `config.unitClasses` | oggetto { classe → [Classe della squadra US](#unit-class) } | Classi US: i campi scritti cambiano una classe esistente; un nome nuovo aggiunge una classe, che parte dalle statistiche dell'assalto e compare nel briefing (armi in `weapons`, immagine in `unitImages`). |
| `config.enemyClasses` | oggetto { classe → [Classe VC](#enemy-class) } | Classi VC: i campi scritti cambiano una classe esistente; un nome nuovo aggiunge una classe, che parte dai valori del guerrigliero e compare in partita solo se inserita in una composizione (`vcMix`). |
| `config.vcMix` | oggetto | Composizioni VC di default per tutte le mappe. |
| `config.vcMix.spawn` | oggetto { classe VC → numero ≥ 0 } | Schieramento iniziale. → classe VC (attuali: `grunt`, `sniper_vc`, `commander`). |
| `config.vcMix.ambush` | oggetto { classe VC → numero ≥ 0 } | Imboscata. → classe VC (attuali: `grunt`, `sniper_vc`, `commander`). |
| `config.vcMix.reinforcement` | oggetto { classe VC → numero ≥ 0 } | Rinforzi. → classe VC (attuali: `grunt`, `sniper_vc`, `commander`). |
| `config.perks` | oggetto { perk → [Perk](#perk) o `null` } | Perk dei soldati della campagna: i campi scritti cambiano un perk esistente (`steady`, `tough`, `quiet`, `pointman`, `fieldMedic`), un nome nuovo ne aggiunge uno, `null` lo toglie. |
| `config.soldierNames` | oggetto | Nomi dei soldati del plotone in campagna; senza, quelli del gioco. |
| `config.soldierNames.first` | array di testo | Nomi. |
| `config.soldierNames.last` | array di testo | Cognomi. |
| `maps` | array di [Voce del menu delle mappe](#catalog) | Mappe aggiunte al menu, come le voci di `missions/catalog.json`; `file` è il JSON della mappa nella cartella della mod, e anche i percorsi dentro la mappa (immagine, suoni, texture) partono da lì. |
| `campaigns` | array di testo | Campagne aggiunte all'elenco: JSON nella cartella della mod; il loro `map` parte da lì (`../../missions/hue_city.json` = mappa del gioco). → file in `missions/campaigns/` (in una mod: nella sua cartella). |

<a id="mod-index"></a>

## Elenco delle mod (`mods/index.json`)

| Campo | Tipo | Descrizione |
|---|---|---|
| `$schema` | testo | Percorso del JSON Schema per l'editor (es. `../schemas/mission.schema.json`); ignorato dal gioco. |
| `mods` | array di testo | **Obbligatorio.** Cartelle delle mod in `mods/`, nell'ordine in cui si applicano. → cartella in `mods/` con un `mod.json`. |

<a id="perk"></a>

## Perk

| Campo | Tipo | Descrizione |
|---|---|---|
| `labels` | oggetto { lingua → oggetto } | Testi per lingua; i perk del gioco li prendono dalle traduzioni. |
| `labels.<lingua>.name` | testo | Nome del perk. |
| `labels.<lingua>.desc` | testo | Effetto, nel suggerimento. |
| `icon` | testo | Icona (emoji). |
| `hp` | intero | Punti ferita in più. |
| `overwatchAtk` | intero | ATK in più in overwatch. |
| `noise` | intero | Rumore degli spari (negativo = più silenzioso; esplosivi esclusi). |
| `heal` | intero | HP in più curati dall'abilità di cura. |
| `vision` | intero | Raggio visivo in più. |
| `trapSense` | booleano | Individua trappole e tunnel come il geniere. |
| `requires` | oggetto | Campi che la classe del soldato deve avere per riceverlo. |
| `requires.special` | `suppression` \| `overwatch` \| `demolition` \| `heal` o `null` | Abilità della classe. |
| `requires.marksman` | booleano | Solo tiratori scelti (o solo gli altri, con `false`). |
| `requires.trapSense` | booleano | Solo classi con `trapSense` (o senza, con `false`). |

<a id="campaign"></a>

## Campagna (`missions/campaigns/<nome>.json`)

Una campagna (`missions/campaigns/<nome>.json`, elencata in [`missions/campaigns/index.json`](#campaign-index) o nel campo `campaigns` di una mod) è una serie di [operazioni](#campaign-op) giocate da un plotone persistente. Vedi il [README](../README.md#campagna).

| Campo | Tipo | Descrizione |
|---|---|---|
| `$schema` | testo | Percorso del JSON Schema per l'editor (es. `../schemas/mission.schema.json`); ignorato dal gioco. |
| `name` | testo o oggetto { lingua → testo } |  |
| `description` | testo o oggetto { lingua → testo } |  |
| `icon` | testo | Icona (emoji). |
| `startRoster` | array di testo | Classi del plotone iniziale; default 2 per classe base. → classe US (attuali: `assault`, `sniper`, `engineer`, `medic`). |
| `rules` | [Regole della campagna](#campaign-rules) |  |
| `operations` | array di [Operazione: una missione (`map` o `generator` + `missionType`) oppure `choices`](#campaign-op) | Operazioni in ordine (campagna fissa). |
| `procedural` | oggetto | Campagna procedurale: operazioni generate dal seed al posto di `operations`. |
| `procedural.operations` | intero ≥ 1 | Numero di operazioni; default 5. |
| `procedural.choices` | intero ≥ 1 | Missioni a scelta per operazione (facile, normale, difficile); default 3. |
| `procedural.generators` | array di testo | Generatori usati; default tutti. → generatore procedurale (attuali: `jungle`, `urban`). |
| `procedural.sizes` | array di `small` \| `medium` \| `large` | Dimensioni; default `small` e `medium`. |
| `procedural.missionTypes` | array di testo | Tipi di missione; default tutti. → tipo di missione (attuali: `recon`, `search_destroy`, `rescue_pilot`, `capture_objective`). |
| `procedural.nightChance` | numero 0–1 | Probabilità di una missione notturna; default 0.25. |
| `difficulty` | oggetto | Curva di difficoltà, applicata prima degli `overrides` di ogni operazione. |
| `difficulty.vcCount` | array di numero (2) | VC iniziali [prima, ultima operazione], interpolati. |
| `difficulty.reinforcementTurn` | array di numero (2) | Turni tra i rinforzi [prima, ultima]. |
| `difficulty.vcMix` | array di oggetto { classe VC → numero ≥ 0 } (2) | Composizione VC [prima, ultima]: pesi interpolati. → classe VC (attuali: `grunt`, `sniper_vc`, `commander`). |
| `translations` | oggetto { lingua → oggetto } | Testi per lingua (`it`, `en`). |
| `translations.<lingua>.name` | testo | Nome della campagna. |
| `translations.<lingua>.description` | testo | Descrizione nell'elenco. |
| `translations.<lingua>.victory` | testo | Testo della vittoria finale. |
| `translations.<lingua>.defeat` | testo | Testo della sconfitta. |
| `translations.<lingua>.ops` | oggetto { id → oggetto } | Testi delle operazioni e delle scelte per `id`. |
| `translations.<lingua>.ops.<id>.name` | testo | Nome dell'operazione (o della scelta). |
| `translations.<lingua>.ops.<id>.briefing` | testo | Briefing all'HQ. |

<a id="campaign-op"></a>

## Operazione: una missione (`map` o `generator` + `missionType`) oppure `choices`

| Campo | Tipo | Descrizione |
|---|---|---|
| `id` | testo | Identificatore: i testi stanno in `translations.<lingua>.ops.<id>`; default `op<n>` (`op<n>_<m>` per le scelte). |
| `map` | testo | JSON della mappa in `missions/` (in una mod: dalla sua cartella). → file in `missions/` (in una mod: nella sua cartella). |
| `generator` | testo | Mappa procedurale (al posto di `map`). → generatore procedurale (attuali: `jungle`, `urban`). |
| `size` | `small` \| `medium` \| `large` | Dimensione della mappa procedurale; default `small`. |
| `seed` | intero ≥ 0 | Seed della mappa procedurale; default dal seed della campagna. |
| `missionType` | testo | Tipo di missione (tra i `supportedMissions` della mappa). → tipo di missione (attuali: `recon`, `search_destroy`, `rescue_pilot`, `capture_objective`). |
| `night` | booleano | Missione notturna. |
| `tier` | testo | Livello della scelta (chiave di `rules.tiers`: `easy`, `normal`, `hard`): VC in più o in meno, ricompensa e pressione VC. |
| `reward` | intero ≥ 0 | PR per la vittoria; default quella del livello o `rules.requisition.win`. |
| `overrides` | [Mappa (`missions/<nome>.json`)](#map) |  |
| `choices` | array di [Missione di un'operazione](#campaign-choice) | Missioni tra cui scegliere all'HQ (al posto dei campi della missione). |

<a id="campaign-choice"></a>

## Missione di un'operazione

| Campo | Tipo | Descrizione |
|---|---|---|
| `id` | testo | Identificatore: i testi stanno in `translations.<lingua>.ops.<id>`; default `op<n>` (`op<n>_<m>` per le scelte). |
| `map` | testo | JSON della mappa in `missions/` (in una mod: dalla sua cartella). → file in `missions/` (in una mod: nella sua cartella). |
| `generator` | testo | Mappa procedurale (al posto di `map`). → generatore procedurale (attuali: `jungle`, `urban`). |
| `size` | `small` \| `medium` \| `large` | Dimensione della mappa procedurale; default `small`. |
| `seed` | intero ≥ 0 | Seed della mappa procedurale; default dal seed della campagna. |
| `missionType` | testo | **Obbligatorio.** Tipo di missione (tra i `supportedMissions` della mappa). → tipo di missione (attuali: `recon`, `search_destroy`, `rescue_pilot`, `capture_objective`). |
| `night` | booleano | Missione notturna. |
| `tier` | testo | Livello della scelta (chiave di `rules.tiers`: `easy`, `normal`, `hard`): VC in più o in meno, ricompensa e pressione VC. |
| `reward` | intero ≥ 0 | PR per la vittoria; default quella del livello o `rules.requisition.win`. |
| `overrides` | [Mappa (`missions/<nome>.json`)](#map) |  |

<a id="campaign-rules"></a>

## Regole della campagna

| Campo | Tipo | Descrizione |
|---|---|---|
| `rosterSize` | intero ≥ 1 | Soldati nel plotone; default 8. |
| `deploySize` | intero 1–4 | Soldati schierati per missione (posizioni di partenza delle mappe: 4); default 4. |
| `startRequisition` | intero ≥ 0 | PR iniziali; default 2. |
| `xp` | oggetto | Esperienza per missione (niente in ritirata). |
| `xp.survive` | intero ≥ 0 | Per chi sopravvive; default 1. |
| `xp.kill` | intero ≥ 0 | Per ogni VC ucciso; default 1. |
| `xp.win` | intero ≥ 0 | Per la vittoria; default 1. |
| `xp.heal` | intero ≥ 0 | Per ogni cura del medico; default 1. |
| `ranks` | array di oggetto | Gradi in ordine di XP; default Pvt 0, PFC 3 (+1 HP), Cpl 7 (perk), Sgt 12 (perk, +1 HP). |
| `ranks[].id` | testo | **Obbligatorio.** Identificatore; testi da translations `campaign.ranks.<id>` o da `labels`. |
| `ranks[].xp` | intero ≥ 0 | **Obbligatorio.** XP necessari. |
| `ranks[].hp` | intero ≥ 0 | Punti ferita in più (si sommano ai gradi precedenti). |
| `ranks[].perk` | booleano | Al grado si sceglie un perk. |
| `ranks[].labels` | oggetto { lingua → oggetto } | Testi per lingua. |
| `ranks[].labels.<lingua>.name` | testo | Nome. |
| `ranks[].labels.<lingua>.short` | testo | Abbreviazione davanti al cognome. |
| `perkChoices` | intero ≥ 1 | Perk offerti a ogni scelta; default 2. |
| `recovery` | oggetto | Convalescenza in operazioni. |
| `recovery.light` | intero ≥ 0 | Operazioni fuori per un ferito (HP ≤ 60%); default 1. |
| `recovery.severe` | intero ≥ 0 | Per un ferito grave (HP < 30% o emorragia); default 2. |
| `recovery.medevac` | intero ≥ 0 | Per un evacuato; default 3. |
| `medevacChance` | numero 0–1 | Probabilità che un caduto in una missione vinta sia evacuato ferito invece che morto; default 1/3, 0 = morte definitiva. |
| `requisition` | oggetto | Punti requisizione (PR) a fine missione. |
| `requisition.win` | intero | PR per la vittoria; default 3. |
| `requisition.clean` | intero | In più se nessuno è ferito o caduto; default 1. |
| `requisition.kia` | intero | Per ogni caduto; default −1. |
| `costs` | oggetto | Costi in PR all'HQ. |
| `costs.replacement` | intero ≥ 0 | Rimpiazzo (nuovo soldato); default 2. |
| `costs.fastHeal` | intero ≥ 0 | Cura accelerata (ferito subito disponibile); default 1. |
| `supplies` | oggetto { dotazione → oggetto } | Dotazioni per una sola operazione; default `ammo` (1 PR), `artillery` (2 PR), `napalm` (3 PR). Testi da translations `campaign.supplies.<id>`. |
| `supplies.<dotazione>.cost` | intero ≥ 0 | **Obbligatorio.** Costo in PR. |
| `supplies.<dotazione>.field` | testo | Solo le armi con questo campo (es. `artillery`); senza, tutte. |
| `supplies.<dotazione>.exclude` | array di testo | Escluse le armi con uno di questi campi. |
| `supplies.<dotazione>.ammo` | intero ≥ 0 | Usi in più alle armi con `ammo`. |
| `supplies.<dotazione>.mags` | intero ≥ 0 | Caricatori di riserva in più alle armi con `mags`. |
| `tiers` | oggetto { livello → oggetto } | Livelli delle scelte; default `easy` (−2 VC, 2 PR, pressione +1), `normal` (3 PR), `hard` (+2 VC, 5 PR, pressione −1). |
| `tiers.<livello>.vcCount` | intero | VC in più (o in meno). |
| `tiers.<livello>.reward` | intero ≥ 0 | PR per la vittoria. |
| `tiers.<livello>.pressure` | intero | Variazione della pressione VC dopo la vittoria. |
| `pressureVc` | intero ≥ 0 | VC in più per punto di pressione; default 1. |
| `maxPressure` | intero ≥ 0 | Pressione massima; default 4. |

<a id="campaign-index"></a>

## Elenco delle campagne (`missions/campaigns/index.json`)

| Campo | Tipo | Descrizione |
|---|---|---|
| `$schema` | testo | Percorso del JSON Schema per l'editor (es. `../schemas/mission.schema.json`); ignorato dal gioco. |
| `campaigns` | array di testo | **Obbligatorio.** Campagne in `missions/campaigns/`, in ordine. → file in `missions/campaigns/` (in una mod: nella sua cartella). |

<a id="tuning"></a>

## Gruppi di `tuning`

Valori attuali (dopo `config.json`) dei gruppi modificabili con `tuning` nella mappa. Si scrivono solo i campi da cambiare.

### `VC_TACTICS`

```json
{
  "attackWeight": 10,
  "killWeight": 20,
  "aoeSingleFactor": 0.5,
  "coverWeight": 3,
  "concealWeight": 1,
  "threatPenalty": 2.5,
  "overwatchPenalty": 6,
  "suppressionPenalty": 4,
  "clusterPenalty": 1.5,
  "costWeight": 0.3,
  "approachWeight": 1.2,
  "farApproachFactor": 3,
  "holdRange": 4,
  "holdChance": 0.5,
  "scootMinGain": 2,
  "flankMinGroup": 3,
  "flankShare": 0.34,
  "flankMinStartDist": 4,
  "flankMaxStartDist": 10,
  "flankRallyMin": 3,
  "flankRallyMax": 5,
  "flankRearBonus": 6,
  "flankSideBonus": 3,
  "flankExposure": 3,
  "flankPathWeight": 0.4,
  "flankApproachWeight": 1.5,
  "flankRallyKeep": 3,
  "flankPincerPenalty": 4,
  "flankMaxTurns": 6,
  "flankGoldenShot": 20
}
```

### `STANCES`

```json
{
  "stand": {
    "atk": 0,
    "def": 0,
    "aoeDef": 0,
    "vision": 0,
    "spotRange": 0,
    "spotChance": 1,
    "moveExtra": 0
  },
  "crouch": {
    "atk": 1,
    "def": 1,
    "aoeDef": 0,
    "vision": 1,
    "spotRange": 1,
    "spotChance": 0.5,
    "moveExtra": 1
  },
  "prone": {
    "atk": 1,
    "def": 2,
    "aoeDef": 1,
    "vision": 2,
    "spotRange": 2,
    "spotChance": 0.3,
    "moveExtra": 1,
    "crawl": true
  }
}
```

### `MELEE`

```json
{
  "guard": {
    "front": 5,
    "side": 3,
    "rear": 0
  },
  "woundMult": 2,
  "struggleMargin": -1,
  "struggleVcDmg": 1,
  "struggleSelfChance": 0.5,
  "counterDmg": 1,
  "heavyCounterMargin": -4,
  "heavyCounterDmg": 2
}
```

### `ARTILLERY`

```json
{
  "shells": [5, 6],
  "scatter": 2,
  "intervalMs": [380, 650],
  "fireTurns": 2
}
```

### `NAPALM`

```json
{
  "length": 5,
  "fireTurns": 2
}
```

### `ENEMY_CLASSES`

```json
{
  "grunt": {
    "name": 0,
    "role": "rifleman",
    "hp": 5,
    "ap": 2,
    "attack": 2,
    "range": 2,
    "defense": 0,
    "move": 3
  },
  "sniper_vc": {
    "name": 1,
    "role": "sniper",
    "hp": 6,
    "ap": 2,
    "attack": 3,
    "range": 4,
    "defense": 0,
    "move": 2
  },
  "commander": {
    "name": 3,
    "role": "commander",
    "hp": 8,
    "ap": 2,
    "attack": 3,
    "range": 2,
    "defense": 1,
    "move": 3
  }
}
```

### `VC_MIX`

```json
{
  "spawn": {
    "grunt": 3,
    "sniper_vc": 1,
    "commander": 1
  },
  "ambush": {
    "grunt": 2,
    "sniper_vc": 1,
    "commander": 1
  },
  "reinforcement": {
    "grunt": 1
  }
}
```
