# Suoni di NAM '68 — asset presenti e mancanti

Censimento aggiornato al 2026-10-25. Come funziona l'audio (`js/sounds.js`):

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
| `stance` | cambio di postura (in piedi / accovacciato / sdraiato) | ❌ sintetizzato (fruscio) |
| `turn_end` | fine turno giocatore | ✅ end_turn.mp3 |
| `melee` | coltello | ✅ knife.mp3 |
| `reload` | ricarica | ✅ reload.mp3 |
| `demolition` | demolizione, incendio, sigillo tunnel | ✅ demolition.mp3 |
| `disarm` | disinnesco trappola | ✅ cracking_wood.mp3 |
| `spawn` | rinforzi VC | ✅ spawn.mp3 |
| `jet` | passaggio del jet | ✅ fighter_jet.mp3 |
| `napalm` | fiammata del napalm | ✅ napalm.mp3 |
| `victory` | missione vinta | ✅ victory.mp3 |
| `defeat` | missione persa | ❌ sintetizzato |
| `overwatch` | attivazione di overwatch / fuoco soppressivo | ❌ sintetizzato |
| `click` | click dell'interfaccia, chiamata radio di artiglieria e napalm, scelte nel menu e nella campagna | ❌ sintetizzato |
| `shoot` | arma US senza suono proprio: oggi nessuna | — solo fallback |
| `shoot_vc` | arma VC senza suono proprio: oggi nessuna | — solo fallback |

**Copertura: 15 chiavi su 19 utili hanno un asset** (dal censimento del
2026-10-18 si sono aggiunti fumogeno, `melee`, `demolition`, `disarm`, `spawn`,
`jet`, `napalm`, `victory`, i passi urbani e la musica urbana).

## 3. Cosa manca

Per non sentire più nessun suono sintetizzato in gioco servono **4 file**:

1. `defeat` — jingle di missione fallita
2. `overwatch` — attivazione di overwatch/soppressione (es. otturatore armato)
3. `click` — click dell'interfaccia / radio
4. `stance` — cambio di postura (fruscio della divisa, equipaggiamento che si
   assesta); fino al 2026-10-25 usava il suono dei passi

`shoot` e `shoot_vc` non servono: restano come rete di sicurezza per armi
future senza suono.

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
