# Suoni di NAM '68 — asset presenti e mancanti

Censimento aggiornato al 2026-10-26. Come funziona l'audio (`js/sounds.js`):

- **Suoni di sistema** `sfx(chiave)`: priorità *missione* (`"sounds"` nel JSON
  della mappa) > *config.json* (`"sounds"`) > **sintetizzato** con Web Audio.
  Una chiave vuota (`""`) in config.json = sintetizzato.
- **Suoni delle armi** `sfxShoot(classe, arma)`: campo `"sound"` dell'arma in
  config.json. Senza: arma bianca → `melee`, altrimenti `shoot` (US) /
  `shoot_vc` (VC), entrambi sintetizzati.
- **Musiche**: `menuMusic` in config.json, `ambient` nel JSON di missione.

## 1. Asset audio presenti

### Armi (campo `sound` in config.json → `weapons`)

| File | Usato per |
|---|---|
| `assets/m16.mp3` | M16 di assaltatore e geniere (attacco, overwatch, soppressione) |
| `assets/sniper_us.mp3` | fucile del cecchino US |
| `assets/pistol.mp3` | pistola del medico **e** del comandante VC |
| `assets/grenade.mp3` | granata **e** ogni colpo della salva d'artiglieria (`radio` del geniere) |
| `assets/smoke.mp3` | fumogeno dell'assaltatore |
| `assets/ak47.mp3` | AK-47 dei VC (e dei regolari NVA della mod) |
| `assets/rocket.mp3` | RPG dei VC |
| `assets/mosin.mp3` | fucile del cecchino VC |

### Effetti di sistema (config.json → `sounds`)

| File | Chiave | Quando suona |
|---|---|---|
| `assets/hit.mp3` | `hit` | colpo a segno |
| `assets/death.mp3` | `death` | morte di un'unità (combattimento, emorragia, trappola) |
| `assets/bullet_ricochet.mp3` | `miss` | colpo mancato |
| `assets/ambush.mp3` | `ambush` | imboscata VC (comparsa e fuoco d'agguato) |
| `assets/demolition.mp3` | `demolition` | demolizione, incendio del geniere, sigillo di un tunnel |
| `assets/cracking_wood.mp3` | `disarm` | disinnesco di una trappola |
| `assets/knife.mp3` | `melee` | coltello (tutte le classi, US e VC) |
| `assets/bandaging.mp3` | `heal` | cura del medico e primo soccorso |
| `assets/reload.mp3` | `reload` | ricarica dell'arma |
| `assets/overwatch.mp3` | `overwatch` | attivazione di overwatch **e** di fuoco soppressivo |
| `assets/spawn.mp3` | `spawn` | arrivo dei rinforzi VC |
| `assets/fighter_jet.mp3` | `jet` | passaggio del jet del napalm |
| `assets/napalm.mp3` | `napalm` | fiammata del napalm (una volta per ogni tile della linea) |
| `assets/end_turn.mp3` | `turn_end` | fine del turno del giocatore |
| `assets/victory.mp3` | `victory` | missione compiuta (anche lezioni e operazioni di campagna) |

### Passi (per mappa, `sounds.move` nel JSON della missione)

| File | Mappe |
|---|---|
| `assets/footsteps_jungle.mp3` | Rung Sat, "Zona Ignota" (mapGen.js), tutte le lezioni del tutorial, Avamposto NVA (mod) |
| `assets/run_street.mp3` | Hue City, "Città Ignota" (mapGen.js) |

### Passi per tipo di terreno (campo `sound` del tileType)

Ogni tipo di tile può avere un suono di passi suo (`"sound": "assets/…"` nei
`tileTypes` della mappa). A ogni movimento suona, tra i terreni attraversati
che hanno un suono proprio, quello su cui si cammina di più (a parità, quello
più vicino all'arrivo). Ora che quasi tutti i terreni hanno un suono, un tile
isolato (un guado, un ponte) si sente solo se il percorso ne attraversa
almeno quanti di ogni altro terreno. Se
nessun terreno del percorso ha un suono si usa `sounds.move` della mappa (i
passi qui sopra), poi quello di config.json, poi il sintetizzato.

| File | Terreno | Mappe |
|---|---|---|
| `assets/guado.mp3` | guado (`ford`) | Rung Sat, "Zona Ignota" (mapGen.js), lezioni del tutorial (tile condivisi in `missions/tutorial/index.json`) |
| `assets/mud.mp3` | palude (`swamp`) | Rung Sat, "Zona Ignota" (mapGen.js), lezioni del tutorial, Avamposto NVA (mod) |
| `assets/footsteps_jungle.mp3` | giungla (`jungle`) | Rung Sat, "Zona Ignota" (mapGen.js), lezioni del tutorial, Avamposto NVA (mod) |
| `assets/run_street.mp3` | strada (`street`), piazza (`plaza`) | Hue City, "Città Ignota" (mapGen.js) |
| `assets/dirt.mp3` | sentiero (`trail`), villaggio/accampamento (`village`), bunker (`bunker`) | Rung Sat, "Zona Ignota" (mapGen.js), lezioni del tutorial, Avamposto NVA (mod) |
| `assets/grass.mp3` | radura (`clearing`) | Rung Sat, "Zona Ignota" (mapGen.js), lezioni del tutorial, Avamposto NVA (mod) |
| `assets/grass.mp3` | giardino (`garden`) | Hue City, "Città Ignota" (mapGen.js) |
| `assets/bridge.mp3` | ponte (`bridge`) | Hue City, "Città Ignota" (mapGen.js) |
| `assets/rubble.mp3` | macerie (`debris`) | Hue City, "Città Ignota" (mapGen.js); macerie create dalle esplosioni su qualsiasi mappa (`mechanics.js:BLAST_TILE_TYPES`) |
| `assets/ash.mp3` | terra bruciata (`scorched`) | creata in partita su qualsiasi mappa da artiglieria, napalm, incendio (`mechanics.js:BLAST_TILE_TYPES`) |
| `assets/indoor.mp3` | edificio (`building`), palazzo/tempio/pagoda (`temple`) | Hue City, "Città Ignota" (mapGen.js) |

#### Copertura di tutti i tipi di tile

Tutti i tipi di tile esistenti oggi (mappe JSON, generatori di `js/mapGen.js`,
tile condivisi del tutorial, mod `nva_regulars`, e i tile creati in partita
da `mechanics.js:BLAST_TILE_TYPES` quando artiglieria/incendio distruggono un tile):

| Terreno (`id`) | Dove compare | Percorribile | Suono oggi | Suono proposto (file) |
|---|---|---|---|---|
| `jungle` | Rung Sat, Zona Ignota, tutorial, Avamposto NVA | sì (costo 2) | ✅ `footsteps_jungle.mp3` | — |
| `swamp` | Rung Sat, Zona Ignota, tutorial, Avamposto NVA | sì (costo 3) | ✅ `mud.mp3` | — |
| `ford` | Rung Sat, Zona Ignota, tutorial | sì (costo 2) | ✅ `guado.mp3` | — |
| `trail` | Rung Sat, Zona Ignota, tutorial, Avamposto NVA | sì | ✅ `dirt.mp3` | — |
| `clearing` | Rung Sat, Zona Ignota, tutorial, Avamposto NVA | sì | ✅ `grass.mp3` | — |
| `village` | Rung Sat, Zona Ignota, tutorial, Avamposto NVA ("Accampamento") | sì | ✅ `dirt.mp3` | — |
| `bunker` | Rung Sat, Zona Ignota, tutorial, Avamposto NVA | sì | ✅ `dirt.mp3` | facoltativo: un `sandbags.mp3` proprio (sacchi di sabbia, assi) |
| `street` | Hue City, Città Ignota | sì | ✅ `run_street.mp3` | — |
| `plaza` | Hue City, Città Ignota | sì | ✅ `run_street.mp3` | — |
| `garden` | Hue City, Città Ignota | sì | ✅ `grass.mp3` | — |
| `bridge` | Hue City, Città Ignota | sì (costo 2) | ✅ `bridge.mp3` | — |
| `building` | Hue City, Città Ignota | sì | ✅ `indoor.mp3` | — |
| `temple` | Hue City, Città Ignota | sì | ✅ `indoor.mp3` | — |
| `debris` | Hue City, Città Ignota; creato da artiglieria/demolizione su edifici, muri, bunker anche nelle mappe giungla | sì (costo 2) | ✅ `rubble.mp3` | — |
| `scorched` | creato in partita su tile `burnable` (giungla, villaggio, giardino) da artiglieria, napalm, incendio | sì | ✅ `ash.mp3` | — |
| `objective` | Rung Sat, Hue City, Città Ignota, tutorial, Avamposto NVA | sì | default mappa | nessuno: eredita il terreno del percorso |
| `pilot` | Rung Sat, tutorial | sì | default mappa | nessuno: eredita il terreno del percorso |
| `river` | tutte tranne Avamposto NVA | no | — | non serve |
| `obstacle` | giungla, tutorial, Avamposto NVA ("Sacchetti di sabbia") | no | — | non serve |
| `wall`, `wall_breach` | Hue City, Città Ignota | no | — | non serve |

**Perché `jungle`, `street` e `plaza` hanno un `sound` esplicito** (aggiunto il
2026-10-26). Il suono del percorso è quello del terreno *con suono proprio* più
attraversato: i tile senza `sound` non contano. Senza il campo, appena `trail`
o `clearing` avranno un suono, un percorso di 4 tile di giungla e 1 di sentiero
suonerebbe come il sentiero. Con il loro file il conteggio è giusto; il
`sounds.move` della mappa resta solo come rete di sicurezza. Ogni terreno
percorribile nuovo deve quindi avere il suo `sound`.

**Dove aggiungere il campo `sound`** (i tileType non si ereditano tra file):

- `missions/rung_sat.json`, `missions/hue_city.json`
- `missions/tutorial/index.json` (tile condivisi delle lezioni)
- `js/mapGen.js` → `JUNGLE_TILE_TYPES` e la tabella dei tile urbani (Zona
  Ignota / Città Ignota)
- `js/mechanics.js` → `BLAST_TILE_TYPES` (`scorched` e `debris` creati in
  partita; `debris` viene usato solo se la mappa non ha già un tile `debris`
  suo). Il suono di un tile aggiunto in partita viene caricato da
  `blastTileKey` con `sounds.js:loadTileSound`.
- `mods/nva_regulars/avamposto.json` (percorsi relativi alla cartella della mod:
  `../../assets/…`)

### Musiche

| File | Uso |
|---|---|
| `assets/fumo_su_saigon.mp3` | menu (`menuMusic`) |
| `missions/rung_sat_ambient.mp3` | ambiente giungla: Rung Sat, "Zona Ignota", lezioni del tutorial, Avamposto NVA (mod) |
| `assets/city_battle.mp3` | ambiente urbano: Hue City, "Città Ignota" (7,3 MB, scaricata in background) |

## 2. Copertura delle chiavi di sistema

| Chiave | Quando suona | Asset? |
|---|---|---|
| `hit` | colpo a segno | ✅ hit.mp3 |
| `death` | morte di un'unità | ✅ death.mp3 |
| `miss` | colpo mancato | ✅ bullet_ricochet.mp3 |
| `ambush` | imboscata VC | ✅ ambush.mp3 |
| `heal` | cura / primo soccorso | ✅ bandaging.mp3 |
| `move` | movimento di un'unità | ✅ per mappa (giungla / strada); default in config.json vuoto |
| `stance` | cambio di postura (in piedi / accovacciato / sdraiato) | ✅ stance.mp3 |
| `turn_end` | fine turno giocatore | ✅ end_turn.mp3 |
| `melee` | coltello | ✅ knife.mp3 |
| `reload` | ricarica | ✅ reload.mp3 |
| `demolition` | demolizione, incendio, sigillo tunnel | ✅ demolition.mp3 |
| `disarm` | disinnesco trappola | ✅ cracking_wood.mp3 |
| `spawn` | rinforzi VC | ✅ spawn.mp3 |
| `jet` | passaggio del jet | ✅ fighter_jet.mp3 |
| `napalm` | fiammata del napalm | ✅ napalm.mp3 |
| `victory` | missione vinta | ✅ victory.mp3 |
| `defeat` | missione persa | ✅ defeat.mp3 |
| `overwatch` | attivazione di overwatch / fuoco soppressivo | ✅ overwatch.mp3 |
| `click` | click dell'interfaccia, chiamata radio di artiglieria e napalm, scelte nel menu e nella campagna | ❌ sintetizzato |
| `shoot` | arma US senza suono proprio: oggi nessuna | — solo fallback |
| `shoot_vc` | arma VC senza suono proprio: oggi nessuna | — solo fallback |

**Copertura: 18 chiavi su 19 utili hanno un asset** (dal censimento del
2026-10-18 si sono aggiunti fumogeno, `melee`, `demolition`, `disarm`, `spawn`,
`jet`, `napalm`, `victory`, `overwatch`, i passi urbani e la musica urbana).

## 3. Cosa manca

Per non sentire più nessun suono sintetizzato in gioco serve **1 file**:

1. `click` — click dell'interfaccia / radio

`shoot` e `shoot_vc` non servono: restano come rete di sicurezza per armi
future senza suono.

### Passi per terreno

Tutti i terreni percorribili hanno il loro passo (`dirt.mp3`, `grass.mp3`,
`bridge.mp3`, `indoor.mp3`, `rubble.mp3` e `ash.mp3` aggiunti il 2026-10-26).
Il bunker usa `dirt.mp3`; *(facoltativo)* un `assets/sandbags.mp3` proprio.
`ash.mp3` è oggi una copia identica di `rubble.mp3`: si può sostituire con un
suono di cenere/legni carbonizzati.

### Facoltativi, per varietà

- **Artiglieria** con un suono proprio invece di `grenade.mp3` (campo `sound`
  dell'arma `radio` del geniere).
- **Pistola del comandante VC** distinta da quella del medico.
- **Incendio del geniere** e **sigillo dei tunnel** oggi usano `demolition`:
  servirebbe una chiave nuova nel codice per distinguerli.
- **VC che escono dai tunnel**: oggi nessun suono (si potrebbe riusare
  `spawn` o aggiungerne uno).
- **Default di `move`** in config.json (oggi vuoto): conta solo per mappe
  nuove o delle mod che non indicano i propri passi.
- **Napalm**: `napalm.mp3` suona una volta per ogni tile della linea; se
  risulta troppo fitto si può far suonare una sola volta per attacco.

### Campagna

La campagna (HQ, debriefing) non ha suoni propri oltre a `click` e alla musica
del menu: eventuali jingle di promozione o di fine campagna richiederebbero
chiavi nuove.
