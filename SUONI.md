# Suoni di NAM '68 — asset presenti e mancanti

Censimento del 2026-10-18. Come funziona l'audio (`js/sounds.js`):

- **Suoni di sistema** `sfx(chiave)`: priorità *missione* (`"sounds"` nel JSON
  della mappa) > *config.json* (`"sounds"`) > **sintetizzato** con Web Audio.
  Una chiave vuota (`""`) in config.json = sintetizzato. Qualsiasi chiave
  dell'elenco sotto si può sovrascrivere da config.json, anche quelle che oggi
  non compaiono lì (es. `"jet"`, `"napalm"`, `"reload"`, `"melee"`).
- **Suoni delle armi** `sfxShoot(classe, arma)`: campo `"sound"` dell'arma in
  config.json. Senza: arma bianca → `melee`, altrimenti `shoot` (US) /
  `shoot_vc` (VC), entrambi sintetizzati.
- **Musiche**: `menuMusic` in config.json, `ambient` nel JSON di missione.

## 1. Asset audio presenti

| File | Usato per | Dove è collegato |
|---|---|---|
| `assets/m16.mp3` | M16 (assaltatore e geniere): attacco, overwatch, soppressione | config.json → weapons.assault/engineer `rifle` |
| `assets/sniper_us.mp3` | M14 del cecchino US | config.json → weapons.sniper `rifle` |
| `assets/pistol.mp3` | M1911 del medico **e** TT-33 del comandante VC | config.json → weapons.medic / commander `pistol` |
| `assets/grenade.mp3` | Granata (esplosione) **e** ogni colpo della salva d'artiglieria | config.json → weapons.assault `grenade`, engineer `radio` |
| `assets/ak47.mp3` | AK-47 dei VC | config.json → weapons.grunt `ak47` |
| `assets/rocket.mp3` | RPG-7 dei VC | config.json → weapons.grunt `rpg` |
| `assets/mosin.mp3` | Mosin del cecchino VC | config.json → weapons.sniper_vc `rifle` |
| `assets/hit.mp3` | Colpo a segno (unità ferita) | config.json → sounds.`hit` |
| `assets/death.mp3` | Morte di un'unità (combattimento, emorragia, trappola) | config.json → sounds.`death` |
| `assets/bullet_ricochet.mp3` | Colpo mancato | config.json → sounds.`miss` |
| `assets/ambush.mp3` | Imboscata VC (spawn e fuoco d'agguato) | config.json → sounds.`ambush` |
| `assets/bandaging.mp3` | Cura del medico e primo soccorso | config.json → sounds.`heal` |
| `assets/footsteps_jungle.mp3` | Passi (movimento) — **solo** mappe di giungla | sounds.`move` in rung_sat.json, mappa procedurale "Zona Ignota" (mapGen.js), lezioni del tutorial |
| `assets/fumo_su_saigon.mp3` | Musica del menu | config.json → `menuMusic` |
| `missions/rung_sat_ambient.mp3` | Musica d'ambiente giungla | rung_sat.json, "Zona Ignota", lezioni del tutorial |
| `assets/end_turn.mp3` | **Nessuno** — presente ma non collegato | (andrebbe in config.json → sounds.`turn_end`) |

## 2. Suoni sintetizzati (20 chiavi) e copertura

| Chiave | Quando suona | Asset? |
|---|---|---|
| `hit` | colpo a segno | ✅ hit.mp3 |
| `death` | morte di un'unità | ✅ death.mp3 |
| `miss` | colpo mancato | ✅ bullet_ricochet.mp3 |
| `ambush` | imboscata VC | ✅ ambush.mp3 |
| `heal` | cura / primo soccorso | ✅ bandaging.mp3 |
| `move` | movimento di un'unità | ⚠️ solo mappe giungla; Hue City e "Città Ignota" sintetizzato |
| `turn_end` | fine turno giocatore | ⚠️ file end_turn.mp3 c'è ma non è collegato |
| `shoot` | arma US senza suono proprio: oggi solo il **fumogeno** | ❌ (fallback) |
| `shoot_vc` | arma VC senza suono proprio: oggi nessuna | — (solo fallback) |
| `melee` | coltello (assaltatore, cecchino, geniere, medico) | ❌ |
| `reload` | ricarica dell'arma | ❌ |
| `demolition` | demolizione, incendio del geniere, sigillo di un tunnel | ❌ |
| `disarm` | disinnesco trappola | ❌ |
| `overwatch` | attivazione overwatch / soppressione | ❌ |
| `spawn` | arrivo dei rinforzi VC | ❌ |
| `jet` | passaggio del jet del napalm | ❌ |
| `napalm` | fiammata del napalm su ogni tile | ❌ |
| `click` | click dell'interfaccia, chiamata radio artiglieria/napalm | ❌ |
| `victory` | fine missione vinta | ❌ |
| `defeat` | fine missione persa | ❌ |

**Copertura: 5 chiavi su 20 hanno un asset**, `move` è coperta solo in parte.

## 3. Cosa manca

Per non sentire più nessun suono sintetizzato in gioco servono **14 suoni**:

1. `turn_end` — **già presente** (assets/end_turn.mp3): basta scriverlo in config.json
2. `move` — passi per mappe urbane/non giungla (es. `footsteps_urban.mp3`, da mettere in config.json come default; la giungla resta sovrascritta dalla missione)
3. `melee` — coltello
4. `reload` — ricarica
5. `demolition` — esplosione della carica / incendio
6. `disarm` — disinnesco
7. `overwatch` — attivazione overwatch/soppressione (es. otturatore armato)
8. `spawn` — rinforzi VC
9. `jet` — passaggio dell'aereo
10. `napalm` — vampata
11. `click` — interfaccia/radio
12. `victory` — jingle di vittoria
13. `defeat` — jingle di sconfitta
14. Fumogeno — campo `"sound"` dell'arma `smoke` (oggi suona come uno sparo)

→ **13 file da procurare** + 1 da collegare. `shoot` e `shoot_vc` non servono:
restano come rete di sicurezza per armi future senza suono.

Facoltativi, per varietà (oggi condividono un file):
- artiglieria con un suono proprio invece di `grenade.mp3` (arma engineer `radio`);
- TT-33 del comandante distinto dalla M1911 del medico.

### Musica mancante

- `missions/hue_city_ambient.ogg` è indicata da `hue_city.json` e dalla mappa
  procedurale "Città Ignota" (mapGen.js), ma **il file non esiste**: oggi
  quelle mappe sono senza musica d'ambiente (nessun errore, solo silenzio).
