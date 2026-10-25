# JSON field guide

> Generated from `js/schema.js` by `node tools/schema-docs.js`: do not edit by hand. [Versione italiana](FIELDS.md)

Every field the game reads from the moddable files: maps, training lessons, the map catalog, `config.json`, mods and campaigns. For how to build a map and for examples see the [README](../README_EN.md#creating-a-new-mission); `node tools/validate.js --all` checks the files against these same rules.

## Editor autocompletion

The JSON Schemas in `schemas/` give suggestions, descriptions and checks while typing. VS Code maps them to the game files by itself (`.vscode/settings.json`); in any editor reading JSON Schemas (VS Code, Zed, JetBrains…) the `"$schema"` field at the top of the file is enough, e.g. `"$schema": "../schemas/mission.schema.json"` in `missions/`.

## Contents

- [Map (`missions/<name>.json`)](#map)
- [Tile type](#tile)
- [Texts of one language](#translations)
- [Training lesson](#tutorial)
- [Weapon](#weapon)
- [US squad class](#unit-class)
- [VC class](#enemy-class)
- [Global configuration (`config.json`)](#config)
- [Map menu entry](#catalog)
- [Training index (`missions/tutorial/index.json`)](#tutorial-index)
- [Mod (`mods/<folder>/mod.json`)](#mod)
- [Mod list (`mods/index.json`)](#mod-index)
- [Perk](#perk)
- [Campaign (`missions/campaigns/<name>.json`)](#campaign)
- [Operation: one mission (`map` or `generator` + `missionType`) or `choices`](#campaign-op)
- [Operation mission](#campaign-choice)
- [Campaign rules](#campaign-rules)
- [Campaign list (`missions/campaigns/index.json`)](#campaign-index)
- [`tuning` groups](#tuning)

<a id="map"></a>

## Map (`missions/<name>.json`)

| Field | Type | Description |
|---|---|---|
| `$schema` | text | Path of the JSON Schema for the editor (e.g. `../schemas/mission.schema.json`); ignored by the game. |
| `name` | text or object { language → text } | Map name: text or `{ "it", "en" }` (usually in `translations`). |
| `description` | text or object { language → text } | Description: text or `{ "it", "en" }` (usually in `translations`). |
| `cols` | integer ≥ 1 | **Required.** Grid columns. |
| `rows` | integer ≥ 1 | **Required.** Grid rows. |
| `width` | number | (informative) image width. |
| `height` | number | (informative) image height. |
| `tileSize` | number | (informative) tile side in pixels. |
| `image` | text | Background image in `missions/`, or in the mod folder (replaces the drawn tiles). → file in `missions/`. |
| `ambient` | text | Ambient music looping during the game. → file path from the game folder (in a mod and its maps: from the mod folder). |
| `sounds` | object { effect → text } | Map sound effects (override `config.json`). Keys: `move`, `stance`, `hit`, `death`, `miss`, `ambush`, `demolition`, `disarm`, `melee`, `reload`, `heal`, `overwatch`, `spawn`, `turn_end`, `victory`, `defeat`, `click`, `jet`, `napalm`. |
| `tileTypes` | object { character → [Tile type](#tile) } | **Required.** Tile types by grid character. |
| `grid` | array of text or array of text | **Required.** Map rows: strings (`"JJCCT…"`) or arrays of `tileTypes` characters. |
| `playerStart` | array of tile `{ col, row }` | Squad start positions. |
| `vcSpawnZones` | array of zone `{ colMin, colMax, rowMin, rowMax }` | Initial VC deployment zones. |
| `vcCount` | integer ≥ 0 | Initial VC; default 6. |
| `reinforcementTurn` | integer ≥ 1 | VC reinforcements every N turns; without it, none. |
| `reinforcementCount` | integer ≥ 0 | VC per reinforcement wave; default 2. |
| `vcAmbushTurn` | integer ≥ 1 | Ambush turn (one, unannounced); needs `vcAmbushZones`. |
| `vcAmbushCount` | integer ≥ 0 | Ambush VC; default 2. |
| `vcAmbushZones` | array of zone `{ colMin, colMax, rowMin, rowMax }` | Zones where the ambush appears. |
| `ambushChance` | number 0–1 | Chance per turn that a VC in sight fires by surprise; default 0. |
| `trapCount` | integer ≥ 0 | Random traps (punji or mine) at mission start; default 0. |
| `trapZones` | array of zone `{ colMin, colMax, rowMin, rowMax }` | Random trap zones; without them, anywhere at least 4 tiles from the start. |
| `traps` | array of object | Fixed traps. |
| `traps[].col` | integer ≥ 0 | **Required.** Column (from 0). |
| `traps[].row` | integer ≥ 0 | **Required.** Row (from 0). |
| `traps[].type` | `punji` \| `mine` | `punji` (2 HP) or `mine` (4 HP). |
| `traps[].dmg` | integer ≥ 0 | Damage (replaces the type's). |
| `tunnels` | array of tile `{ col, row }` | Fixed VC tunnel entrances (replace the random ones). |
| `tunnelCount` | integer ≥ 0 | Random tunnel entrances, on concealing tiles, away from the start; default 3. |
| `vcTrapPlantMax` | integer ≥ 0 | Traps patrolling VC can plant; default 3. |
| `night` | boolean | Always a night mission (the briefing option is locked). |
| `vcNoise` | boolean | `false` = VC gunfire doesn't alert other VC; on by default. |
| `nightVisionPenalty` | integer ≥ 0 | Night reduction of the soldiers' vision; default 1. |
| `vcNightPenalty` | integer ≥ 0 | Night reduction of VC alert distance and sight (base 5, minimum 2); default 2. |
| `bleedStopChance` | number 0–1 | Chance a bleed stops by itself at turn start; default 1/3, 0 = only the Medic stops it. |
| `rain` | boolean or object | Visual only. `true` = it rains all mission long; an object = random showers, starting at the beginning of a player turn when it isn't raining. |
| `rain.chance` | number 0–1 | Chance per turn that a shower starts; default 0.2. |
| `rain.minTurns` | integer ≥ 1 | Minimum length in turns; default 2. |
| `rain.maxTurns` | integer ≥ 1 | Maximum length in turns; default 4. |
| `rain.fromStart` | boolean | The first shower is already under way at mission start. |
| `mist` | boolean or object | Visual only. Mist banks: `true` = on swamp tiles, an object to choose tiles and thickness. |
| `mist.tiles` | array of text | `id` of the misty tiles; default `["swamp"]`. |
| `mist.density` | number ≥ 0 | Thickness: 0.5 thin, 1 normal, 2 thick. |
| `temperature` | object | Informative only. Weather panel temperatures in °C; rain takes 3° off, overcast sky 1°. |
| `temperature.day` | array of number (2) | Day [min, max]; default [27, 34]. |
| `temperature.night` | array of number (2) | Night [min, max]; default [21, 26]. |
| `cloudy` | number 0–1 | Informative only. Chance of overcast sky at mission start; default 0.35 (then 20% per turn to change). |
| `squad` | array of object | Fixed squad instead of the briefing choice. |
| `squad[].cls` | text | **Required.** US class. → US class (current: `assault`, `sniper`, `engineer`, `medic`). |
| `squad[].col` | integer ≥ 0 | **Required.** Column (from 0). |
| `squad[].row` | integer ≥ 0 | **Required.** Row (from 0). |
| `squad[].facing` | integer 0–3 | Facing: 0 north, 1 east, 2 south, 3 west. |
| `squad[].hp` | integer ≥ 1 | Starting hit points. |
| `squad[].bleeding` | boolean | Starts bleeding. |
| `squad[].stance` | `stand` \| `crouch` \| `prone` | Starting stance. |
| `enemies` | array of object | VC at fixed positions instead of random deployment. |
| `enemies[].cls` | text | VC class. → VC class (current: `grunt`, `sniper_vc`, `commander`). |
| `enemies[].col` | integer ≥ 0 | **Required.** Column (from 0). |
| `enemies[].row` | integer ≥ 0 | **Required.** Row (from 0). |
| `enemies[].facing` | integer 0–3 | Facing: 0 north, 1 east, 2 south, 3 west. |
| `enemies[].alerted` | boolean | Starts alerted. |
| `enemies[].hold` | boolean | Sentry: doesn't patrol until alerted. |
| `enemies[].hp` | integer ≥ 1 | Starting hit points. |
| `supportedMissions` | array of text | Mission types playable on the map. → mission type (current: `recon`, `search_destroy`, `rescue_pilot`, `capture_objective`). |
| `objectives` | object | Objectives per mission type; those of the `supportedMissions` types are needed. |
| `objectives.recon` | array of object | Recon: zones to reach. |
| `objectives.recon[].col` | integer ≥ 0 | **Required.** Column (from 0). |
| `objectives.recon[].row` | integer ≥ 0 | **Required.** Row (from 0). |
| `objectives.recon[].label` | text | Zone name. |
| `objectives.search_destroy` | object | Search and destroy. |
| `objectives.search_destroy.eliminateAll` | boolean | All VC must be killed. |
| `objectives.search_destroy.minKills` | integer ≥ 1 | VC to kill; default 4. |
| `objectives.search_destroy.tileAnimations` | array of object | Animations shown only in this mode. |
| `objectives.search_destroy.tileAnimations[].col` | integer ≥ 0 | **Required.** Column (from 0). |
| `objectives.search_destroy.tileAnimations[].row` | integer ≥ 0 | **Required.** Row (from 0). |
| `objectives.search_destroy.tileAnimations[].type` | `smoke` \| `fire` \| `fog` | **Required.** Smoke, fire or fog. |
| `objectives.rescue_pilot` | object | Pilot rescue. |
| `objectives.rescue_pilot.pilotCol` | integer ≥ 0 | **Required.** Pilot column (hidden in the FOW). |
| `objectives.rescue_pilot.pilotRow` | integer ≥ 0 | **Required.** Pilot row. |
| `objectives.rescue_pilot.extractCol` | integer ≥ 0 | **Required.** Extraction point column. |
| `objectives.rescue_pilot.extractRow` | integer ≥ 0 | **Required.** Extraction point row. |
| `objectives.rescue_pilot.tileAnimations` | array of object | Animations shown only in this mode (e.g. smoke on the wreck). |
| `objectives.rescue_pilot.tileAnimations[].col` | integer ≥ 0 | **Required.** Column (from 0). |
| `objectives.rescue_pilot.tileAnimations[].row` | integer ≥ 0 | **Required.** Row (from 0). |
| `objectives.rescue_pilot.tileAnimations[].type` | `smoke` \| `fire` \| `fog` | **Required.** Smoke, fire or fog. |
| `objectives.capture_objective` | array of object | Capture: positions to hold. |
| `objectives.capture_objective[].col` | integer ≥ 0 | **Required.** Column (from 0). |
| `objectives.capture_objective[].row` | integer ≥ 0 | **Required.** Row (from 0). |
| `objectives.capture_objective[].label` | text | Position name. |
| `objectives.capture_objective[].holdTurns` | integer ≥ 1 | Consecutive turns to hold it; default 2. |
| `tileAnimations` | array of object | Ambient animations always shown; smoke shows through the FOW too. |
| `tileAnimations[].col` | integer ≥ 0 | **Required.** Column (from 0). |
| `tileAnimations[].row` | integer ≥ 0 | **Required.** Row (from 0). |
| `tileAnimations[].type` | `smoke` \| `fire` \| `fog` | **Required.** Smoke, fire or fog. |
| `weapons` | object { class → array of [Weapon](#weapon) or object { weapon id → `null` or [Weapon](#weapon) } } | Weapons per class, for this mission only. An array replaces the loadout; an object changes weapons by `id` (fields merged into the weapon, `null` removes it, a new `id` adds it at the end). → US or VC class (current: `assault`, `sniper`, `engineer`, `medic`, `grunt`, `sniper_vc`, `commander`). |
| `vcMix` | object { VC class → number ≥ 0 } | Composition of the initial deployment and, without `ambushMix`, of the ambush; weights per VC class. Default `{ "grunt": 3, "sniper_vc": 1, "commander": 1 }`. → VC class (current: `grunt`, `sniper_vc`, `commander`). |
| `ambushMix` | object { VC class → number ≥ 0 } | Ambush composition; default `{ "grunt": 2, "sniper_vc": 1, "commander": 1 }`. → VC class (current: `grunt`, `sniper_vc`, `commander`). |
| `reinforcementMix` | object { VC class → number ≥ 0 } | Reinforcement composition; default `{ "grunt": 1 }`. → VC class (current: `grunt`, `sniper_vc`, `commander`). |
| `tuning` | object { group → any } | Balance parameters for this mission, deep-merged into the game values (numbers and arrays replaced, objects merged), e.g. `{ "VC_TACTICS": { "holdChance": 0.8 } }`. → balance group (see [tuning](#tuning)) (current: `VC_TACTICS`, `STANCES`, `MELEE`, `ARTILLERY`, `NAPALM`, `ENEMY_CLASSES`, `VC_MIX`). |
| `translations` | object { language → [Texts of one language](#translations) } | Texts per language (`it`, `en`). |
| `tutorial` | [Training lesson](#tutorial) |  |

Fields written by the game, accepted without warnings: `procedural`, `seed`, `size`, `layout`, `startEdge`.

<a id="tile"></a>

## Tile type

| Field | Type | Description |
|---|---|---|
| `id` | text | **Required.** Identifier (used in `tileLabels`, `mist` and for the look). |
| `label` | text | Default name, when the translation is missing. |
| `moveCost` | number ≥ 0 | AP to cross it (0 = free, 3 = swamp). |
| `coverBonus` | number ≥ 0 | Defense bonus to its occupant. |
| `color` | text | Procedural drawing color (#rrggbb). → `#rrggbb` color. |
| `texture` | text | Maps without `image` only. Tile look: the name of a terrain the game already draws (`jungle`, `swamp`, `clearing`, `river`, `building`…) draws the `id` like that terrain with all its effects (canopy, waves, wind-blown grass, mist, shadows), tinted by `color`; or the path of an image (PNG/JPG/WebP/GIF) drawn over `color`. Visual only. → known terrain or image path (current: `scorched`, `wall`, `obstacle`, `wall_breach`, `building`, `temple`, `garden`, `clearing`, `jungle`, `swamp`, `river`, `bridge`, `ford`, `street`, `urban`, `plaza`, `objective`, `debris`, `trail`, `village`, `bunker`). |
| `sound` | text | Footsteps on this terrain (e.g. ford, swamp, street): each move plays the one of the terrain crossed most; without it, the map's or `config.json`'s `move` sound. → file path from the game folder (in a mod and its maps: from the mod folder). |
| `impassable` | boolean | Blocks movement (walls, rivers). |
| `losBlock` | `full` \| `partial` | `full` = blocks sight, `partial` = −1 to vision range per tile crossed. |
| `burnable` | boolean | The Engineer can set it on fire (burns for 2 turns). |
| `demolishable` | boolean | The Engineer can demolish it with a roll ≥ 4. |
| `demolishResult` | text | Grid character of the tile after demolition. → a `tileTypes` character. |
| `blastResult` | text or boolean | Character of the tile replacing it when an artillery round lands on it; `false` = indestructible. Default: `burnable` → burning scorched earth, walls/buildings/temples/bunkers → rubble, other `demolishable` → `demolishResult`. → a `tileTypes` character. |

<a id="translations"></a>

## Texts of one language

| Field | Type | Description |
|---|---|---|
| `name` | text | Map name. |
| `description` | text | Briefing description. |
| `tileLabels` | object { tile id → text } | Tile names by `id`. |
| `objectives` | object | Objective names. |
| `objectives.recon` | array of object |  |
| `objectives.recon[].label` | text | Displayed name, in the same order as `objectives`. |
| `objectives.capture_objective` | array of object |  |
| `objectives.capture_objective[].label` | text | Displayed name, in the same order as `objectives`. |
| `tutorial` | object { step id → text } | Tutorial step texts by `id`. |

<a id="tutorial"></a>

## Training lesson

A lesson (`missions/tutorial/*.json`) is a [map](#map) with the `tutorial` block; `tileTypes` and tile names may come from the [index](#tutorial-index).

| Field | Type | Description |
|---|---|---|
| `missionType` | text | **Required.** Mission type of the lesson. → mission type (current: `recon`, `search_destroy`, `rescue_pilot`, `capture_objective`). |
| `steps` | array of object | **Required.** Lesson steps, in order. |
| `steps[].id` | text | **Required.** Identifier; the text is in `translations.<language>.tutorial`. |
| `steps[].until` | `next` or object | When the step is complete: `"next"` = Next button, or an event. |
| `steps[].until.event` | `select` \| `move` \| `rotate` \| `stance` \| `attack` \| `kill` \| `aoe` \| `reload` \| `firstaid` \| `special` \| `trapFound` \| `tunnelFound` \| `endTurn` \| `turnStart` | **Required.** Player action that completes the step. |
| `steps[].until.at` | tile `{ col, row }` | Tile where it must happen. |
| `steps[].until.within` | integer ≥ 0 | Maximum distance from `at`; default 0. |
| `steps[].highlight` | tile `{ col, row }` | Tile highlighted on the map. |
| `steps[].ui` | array of text | Ids of the interface controls that pulse. |
| `steps[].fresh` | boolean | Count only actions done after the step starts. |

Fields written by the game, accepted without warnings: `lessonId`.

<a id="weapon"></a>

## Weapon

| Field | Type | Description |
|---|---|---|
| `id` | text | **Required.** Internal identifier. |
| `label` | text | Displayed name in Italian. |
| `labelEn` | text | Displayed name in English; without it, `label` is shown in English too. |
| `atk` | number ≥ 0 | Weapon ATK (replaces the class one). |
| `range` | integer ≥ 0 | Maximum range in tiles. |
| `ammo` | integer ≥ 0 or `null` | Total uses (grenades, smoke, radio); `null` = unlimited. |
| `mag` | integer ≥ 1 | US only. Rounds per magazine: every attack (and every overwatch shot or suppression burst) uses 1; an empty magazine must be reloaded. |
| `mags` | integer ≥ 0 or `null` | With `mag`: spare magazines, one per reload; absent or `null` = unlimited. |
| `reloadAp` | integer ≥ 0 | With `mag`: AP to reload; default 1. |
| `shotsPerTurn` | integer ≥ 1 | Maximum attacks per turn with this weapon (sniper: 1). |
| `aoe` | integer ≥ 0 | Area of effect radius (Manhattan distance): resolved without a manual roll, hits US and VC in range. |
| `minRange` | integer ≥ 0 | AoE weapons only. Minimum range in tiles; default `aoe + 1`, so the thrower is never inside the blast. |
| `maxCarriers` | integer ≥ 0 | Units per mission that can carry this weapon (separate counters for the US squad and the VC). |
| `rangePenalty` | boolean | US only. Range penalty (−1 ATK every 2 tiles), overwatch included; when absent it applies only to `marksman` classes. |
| `noise` | number ≥ 0 | Noise radius in tiles: VC within this distance become alerted. US weapons: from the shooter for direct weapons, from the impact point for AoE; VC weapons: always from the shooter. Default 4 (direct) / 6 (AoE). |
| `melee` | boolean | US only. Melee weapon: a slash instead of tracers, excluded from overwatch and suppression; a hit kills and the unit advances into the target's tile. |
| `rounds` | integer 1–5 | Visual only. Tracers per attack; default 1 for marksmen, 3 for other weapons. |
| `smoke` | integer ≥ 1 | AoE weapons only. Smoke grenade: no damage, smoke within `aoe` for N turns. |
| `artillery` | boolean | AoE weapons only. Artillery call: the salvo lands at the start of the next turn, also hits hidden VC and destroys the tiles it hits. |
| `thrown` | boolean | US AoE weapons only. Hand thrown: arc animation with bounces before the explosion. |
| `scatter` | integer ≥ 0 | US AoE weapons only. Radius of the square where the weapon may land instead of the chosen tile (1 = 3×3); never off the map or on tiles with `losBlock: "full"`. With `artillery` it is each round's square (default 2 = 5×5, likelier near the centre). |
| `scatterChance` | number 0–1 | With `scatter`: chance to deviate to another tile of the square; default 0.5. |
| `napalm` | boolean | Napalm air strike: you pick a line of tiles (start and end, diagonals allowed); it lands at the start of the next turn, sets the tiles on fire and hits anyone on them with no terrain cover. |
| `length` | integer ≥ 1 | With `napalm`: maximum line length in tiles; default 5. |
| `shells` | integer ≥ 1 or array of integer ≥ 1 (2) | With `artillery`: rounds in the salvo, a number or [min, max]; default [5, 6]. `atk` and `aoe` apply to each round. |
| `sound` | text | Firing sound (replaces the synthesized one). → file path from the game folder (in a mod and its maps: from the mod folder). |

<a id="unit-class"></a>

## US squad class

| Field | Type | Description |
|---|---|---|
| `labels` | object { language → object } | Texts per language; without the current language Italian is used. Base classes take their texts from the translations. |
| `labels.<language>.name` | text | Class name. |
| `labels.<language>.desc` | text | Short description in the briefing. |
| `labels.<language>.special` | text | Ability label (default: the `special` one). |
| `symbol` | text | Badge letter. |
| `color` | text | Badge color. → `#rrggbb` color. |
| `hp` | integer ≥ 1 | Hit points. |
| `move` | integer ≥ 0 | Movement (terrain AP per turn). |
| `attack` | number ≥ 0 | ATK without weapons. |
| `defense` | number ≥ 0 | DEF. |
| `range` | integer ≥ 0 | Range without weapons. |
| `vision` | integer ≥ 0 | Vision radius in tiles. |
| `special` | `suppression` \| `overwatch` \| `demolition` \| `heal` or `null` | Ability: `suppression` (suppressive fire), `overwatch`, `demolition` (demolition, burning, disarming, sealing tunnels), `heal`; `null` = none. |
| `marksman` | boolean | Marksman: range penalty for weapons without `rangePenalty`, single tracer. |
| `trapSense` | boolean | Spots traps 1 tile away and tunnel entrances 2 tiles away. |
| `sprite` | `assault` \| `sniper` \| `engineer` \| `medic` | US class whose drawn soldier is used when `unitImages` has no picture. |

Fields written by the game, accepted without warnings: `name`, `desc`, `specialLabel`.

<a id="enemy-class"></a>

## VC class

| Field | Type | Description |
|---|---|---|
| `name` | integer ≥ 0 or object { language → text } | Index into the translated VC names (0 Guerrilla, 1 VC Sniper, 3 VC Commander) or `{ "it", "en" }`. |
| `role` | `rifleman` \| `sniper` \| `commander` | Behaviour: `rifleman` (patrols, plants traps, flanks), `sniper` (camouflaged, skips a turn after firing, keeps its distance), `commander` (always holds in ambush, its death makes nearby VC fall back). |
| `hp` | integer ≥ 1 | Hit points. |
| `ap` | integer ≥ 0 | AP per turn. |
| `attack` | number ≥ 0 | ATK without weapons. |
| `range` | integer ≥ 0 | Range without weapons. |
| `defense` | number ≥ 0 | DEF. |
| `move` | integer ≥ 0 | Movement. |
| `sprite` | `grunt` \| `sniper_vc` \| `commander` \| `nva` | Look of the drawn soldier when `unitImages` has no picture: that of a VC class or `nva` (North Vietnamese regular: pith helmet, AK, pack). |

<a id="config"></a>

## Global configuration (`config.json`)

| Field | Type | Description |
|---|---|---|
| `$schema` | text | Path of the JSON Schema for the editor (e.g. `../schemas/mission.schema.json`); ignored by the game. |
| `menuMusic` | text | Menu music. → file path from the game folder (in a mod and its maps: from the mod folder). |
| `unitImages` | object { class → text or object } | Piece picture per class (US or VC): the soldier seen from above **facing north**, transparent background, rotated by the game toward where the unit faces; without it, a drawn soldier (see the classes' `sprite`). → US or VC class (current: `assault`, `sniper`, `engineer`, `medic`, `grunt`, `sniper_vc`, `commander`). |
| `unitImages.<class>.stand` | text | Standing (also for the stances not given). → file path from the game folder (in a mod and its maps: from the mod folder). |
| `unitImages.<class>.crouch` | text | Crouching. → file path from the game folder (in a mod and its maps: from the mod folder). |
| `unitImages.<class>.prone` | text | Prone. → file path from the game folder (in a mod and its maps: from the mod folder). |
| `sounds` | object { effect → text } | Sound effects; without them, synthesized sounds. Keys: `move`, `stance`, `hit`, `death`, `miss`, `ambush`, `demolition`, `disarm`, `melee`, `reload`, `heal`, `overwatch`, `spawn`, `turn_end`, `victory`, `defeat`, `click`, `jet`, `napalm`. |
| `weapons` | object { class → array of [Weapon](#weapon) } | Loadout per class (US or VC); without it, the class ATK and range. → US or VC class (current: `assault`, `sniper`, `engineer`, `medic`, `grunt`, `sniper_vc`, `commander`). |
| `unitClasses` | object { class → [US squad class](#unit-class) } | US classes: the fields written change an existing class; a new name adds a class, starting from the Assault's stats and shown in the briefing (weapons in `weapons`, picture in `unitImages`). |
| `enemyClasses` | object { class → [VC class](#enemy-class) } | VC classes: the fields written change an existing class; a new name adds a class, starting from the guerrilla's values and appearing in game only when put in a composition (`vcMix`). |
| `vcMix` | object | Default VC compositions for every map. |
| `vcMix.spawn` | object { VC class → number ≥ 0 } | Initial deployment. → VC class (current: `grunt`, `sniper_vc`, `commander`). |
| `vcMix.ambush` | object { VC class → number ≥ 0 } | Ambush. → VC class (current: `grunt`, `sniper_vc`, `commander`). |
| `vcMix.reinforcement` | object { VC class → number ≥ 0 } | Reinforcements. → VC class (current: `grunt`, `sniper_vc`, `commander`). |
| `perks` | object { perk → [Perk](#perk) or `null` } | Campaign soldier perks: the fields written change an existing perk (`steady`, `tough`, `quiet`, `pointman`, `fieldMedic`), a new name adds one, `null` removes it. |
| `soldierNames` | object | Names of the campaign platoon soldiers; without them, the game's. |
| `soldierNames.first` | array of text | First names. |
| `soldierNames.last` | array of text | Last names. |

<a id="catalog"></a>

## Map menu entry

The file is an array of entries with these fields.

| Field | Type | Description |
|---|---|---|
| `file` | text | Map JSON in `missions/`. → file in `missions/` (in a mod: in its folder). |
| `generator` | text | Procedural map (instead of `file`). → procedural generator (current: `jungle`, `urban`). |
| `tutorial` | boolean | Training card (lessons from `missions/tutorial/index.json`). |
| `campaign` | boolean | Campaign card (campaigns from `missions/campaigns/index.json` and the mods). |
| `icon` | text | Icon (emoji). |
| `color` | text | Card color. → `#rrggbb` color. |
| `theaterColor` | text | Theater badge color. → `#rrggbb` color. |
| `labels` | object { language → object } | Card texts per language. |
| `labels.<language>.label` | text | Name. |
| `labels.<language>.subtitle` | text | Subtitle (place · year). |
| `labels.<language>.theater` | text | Theater. |

<a id="tutorial-index"></a>

## Training index (`missions/tutorial/index.json`)

| Field | Type | Description |
|---|---|---|
| `$schema` | text | Path of the JSON Schema for the editor (e.g. `../schemas/mission.schema.json`); ignored by the game. |
| `tileTypes` | object { character → [Tile type](#tile) } | Tile types shared by the lessons (a lesson may override them). |
| `tileLabels` | object { language → object { tile id → text } } | Shared tile names, per language. |
| `lessons` | array of object | **Required.** Lessons, in order. |
| `lessons[].id` | text | **Required.** Identifier (passed lessons). |
| `lessons[].file` | text | **Required.** Lesson JSON in `missions/tutorial/`. → file in `missions/tutorial/`. |
| `lessons[].icon` | text | Icon (emoji). |
| `lessons[].classes` | array of text | Classes shown on the card. → US class (current: `assault`, `sniper`, `engineer`, `medic`). |
| `lessons[].labels` | object { language → object } | Card texts per language. |
| `lessons[].labels.<language>.title` | text | Title. |
| `lessons[].labels.<language>.desc` | text | Description. |

<a id="mod"></a>

## Mod (`mods/<folder>/mod.json`)

A mod is a `mods/<folder>/` folder with this `mod.json`, listed in [`mods/index.json`](#mod-index); it is turned on from the menu (🧩 Mods). Its maps are ordinary [maps](#map), in the same folder. See the [README](../README_EN.md#mods).

| Field | Type | Description |
|---|---|---|
| `$schema` | text | Path of the JSON Schema for the editor (e.g. `../schemas/mission.schema.json`); ignored by the game. |
| `labels` | object { language → object } | Texts per language. |
| `labels.<language>.name` | text | Mod name. |
| `labels.<language>.desc` | text | Description in the mod menu. |
| `author` | text | Author. |
| `version` | text | Version. |
| `config` | object | Additions to `config.json`, with the same fields: classes and compositions merged, pictures and sounds replaced by key. File paths start from the mod folder; `../../` goes up to the game folder (e.g. `../../assets/footsteps_jungle.mp3`). |
| `config.menuMusic` | text | Menu music. → file path from the game folder (in a mod and its maps: from the mod folder). |
| `config.unitImages` | object { class → text or object } | Piece picture per class (US or VC): the soldier seen from above **facing north**, transparent background, rotated by the game toward where the unit faces; without it, a drawn soldier (see the classes' `sprite`). → US or VC class (current: `assault`, `sniper`, `engineer`, `medic`, `grunt`, `sniper_vc`, `commander`). |
| `config.unitImages.<class>.stand` | text | Standing (also for the stances not given). → file path from the game folder (in a mod and its maps: from the mod folder). |
| `config.unitImages.<class>.crouch` | text | Crouching. → file path from the game folder (in a mod and its maps: from the mod folder). |
| `config.unitImages.<class>.prone` | text | Prone. → file path from the game folder (in a mod and its maps: from the mod folder). |
| `config.sounds` | object { effect → text } | Sound effects; without them, synthesized sounds. Keys: `move`, `stance`, `hit`, `death`, `miss`, `ambush`, `demolition`, `disarm`, `melee`, `reload`, `heal`, `overwatch`, `spawn`, `turn_end`, `victory`, `defeat`, `click`, `jet`, `napalm`. |
| `config.weapons` | object { class → array of [Weapon](#weapon) or object { weapon id → `null` or [Weapon](#weapon) } } | Weapons per class (US or VC): an array replaces the loadout, an object changes weapons by `id` (`null` removes it, a new `id` adds it). → US or VC class (current: `assault`, `sniper`, `engineer`, `medic`, `grunt`, `sniper_vc`, `commander`). |
| `config.unitClasses` | object { class → [US squad class](#unit-class) } | US classes: the fields written change an existing class; a new name adds a class, starting from the Assault's stats and shown in the briefing (weapons in `weapons`, picture in `unitImages`). |
| `config.enemyClasses` | object { class → [VC class](#enemy-class) } | VC classes: the fields written change an existing class; a new name adds a class, starting from the guerrilla's values and appearing in game only when put in a composition (`vcMix`). |
| `config.vcMix` | object | Default VC compositions for every map. |
| `config.vcMix.spawn` | object { VC class → number ≥ 0 } | Initial deployment. → VC class (current: `grunt`, `sniper_vc`, `commander`). |
| `config.vcMix.ambush` | object { VC class → number ≥ 0 } | Ambush. → VC class (current: `grunt`, `sniper_vc`, `commander`). |
| `config.vcMix.reinforcement` | object { VC class → number ≥ 0 } | Reinforcements. → VC class (current: `grunt`, `sniper_vc`, `commander`). |
| `config.perks` | object { perk → [Perk](#perk) or `null` } | Campaign soldier perks: the fields written change an existing perk (`steady`, `tough`, `quiet`, `pointman`, `fieldMedic`), a new name adds one, `null` removes it. |
| `config.soldierNames` | object | Names of the campaign platoon soldiers; without them, the game's. |
| `config.soldierNames.first` | array of text | First names. |
| `config.soldierNames.last` | array of text | Last names. |
| `maps` | array of [Map menu entry](#catalog) | Maps added to the menu, like the `missions/catalog.json` entries; `file` is the map JSON in the mod folder, and paths inside the map (image, sounds, textures) start from there too. |
| `campaigns` | array of text | Campaigns added to the list: JSON in the mod folder; their `map` starts from there (`../../missions/hue_city.json` = game map). → file in `missions/campaigns/` (in a mod: in its folder). |

<a id="mod-index"></a>

## Mod list (`mods/index.json`)

| Field | Type | Description |
|---|---|---|
| `$schema` | text | Path of the JSON Schema for the editor (e.g. `../schemas/mission.schema.json`); ignored by the game. |
| `mods` | array of text | **Required.** Mod folders in `mods/`, in the order they are applied. → folder in `mods/` with a `mod.json`. |

<a id="perk"></a>

## Perk

| Field | Type | Description |
|---|---|---|
| `labels` | object { language → object } | Texts per language; the game's perks take them from the translations. |
| `labels.<language>.name` | text | Perk name. |
| `labels.<language>.desc` | text | Effect, in the tooltip. |
| `icon` | text | Icon (emoji). |
| `hp` | integer | Extra hit points. |
| `overwatchAtk` | integer | Extra ATK on overwatch. |
| `noise` | integer | Gunfire noise (negative = quieter; explosives excluded). |
| `heal` | integer | Extra HP restored by the heal ability. |
| `vision` | integer | Extra vision radius. |
| `trapSense` | boolean | Spots traps and tunnels like the Engineer. |
| `requires` | object | Fields the soldier's class must have to get it. |
| `requires.special` | `suppression` \| `overwatch` \| `demolition` \| `heal` or `null` | Class ability. |
| `requires.marksman` | boolean | Marksmen only (or only the others, with `false`). |
| `requires.trapSense` | boolean | Classes with `trapSense` only (or without, with `false`). |

<a id="campaign"></a>

## Campaign (`missions/campaigns/<name>.json`)

A campaign (`missions/campaigns/<name>.json`, listed in [`missions/campaigns/index.json`](#campaign-index) or in a mod's `campaigns` field) is a series of [operations](#campaign-op) played by a persistent platoon. See the [README](../README_EN.md#campaign).

| Field | Type | Description |
|---|---|---|
| `$schema` | text | Path of the JSON Schema for the editor (e.g. `../schemas/mission.schema.json`); ignored by the game. |
| `name` | text or object { language → text } |  |
| `description` | text or object { language → text } |  |
| `icon` | text | Icon (emoji). |
| `startRoster` | array of text | Starting platoon classes; default 2 per base class. → US class (current: `assault`, `sniper`, `engineer`, `medic`). |
| `rules` | [Campaign rules](#campaign-rules) |  |
| `operations` | array of [Operation: one mission (`map` or `generator` + `missionType`) or `choices`](#campaign-op) | Operations in order (fixed campaign). |
| `procedural` | object | Procedural campaign: operations generated from the seed instead of `operations`. |
| `procedural.operations` | integer ≥ 1 | Number of operations; default 5. |
| `procedural.choices` | integer ≥ 1 | Missions to choose from per operation (easy, normal, hard); default 3. |
| `procedural.generators` | array of text | Generators used; default all. → procedural generator (current: `jungle`, `urban`). |
| `procedural.sizes` | array of `small` \| `medium` \| `large` | Sizes; default `small` and `medium`. |
| `procedural.missionTypes` | array of text | Mission types; default all. → mission type (current: `recon`, `search_destroy`, `rescue_pilot`, `capture_objective`). |
| `procedural.nightChance` | number 0–1 | Chance of a night mission; default 0.25. |
| `difficulty` | object | Difficulty curve, applied before each operation's `overrides`. |
| `difficulty.vcCount` | array of number (2) | Initial VC [first, last operation], interpolated. |
| `difficulty.reinforcementTurn` | array of number (2) | Turns between reinforcements [first, last]. |
| `difficulty.vcMix` | array of object { VC class → number ≥ 0 } (2) | VC composition [first, last]: weights interpolated. → VC class (current: `grunt`, `sniper_vc`, `commander`). |
| `translations` | object { language → object } | Texts per language (`it`, `en`). |
| `translations.<language>.name` | text | Campaign name. |
| `translations.<language>.description` | text | Description in the list. |
| `translations.<language>.victory` | text | Final victory text. |
| `translations.<language>.defeat` | text | Defeat text. |
| `translations.<language>.ops` | object { id → object } | Operation and choice texts by `id`. |
| `translations.<language>.ops.<id>.name` | text | Operation (or choice) name. |
| `translations.<language>.ops.<id>.briefing` | text | HQ briefing. |

<a id="campaign-op"></a>

## Operation: one mission (`map` or `generator` + `missionType`) or `choices`

| Field | Type | Description |
|---|---|---|
| `id` | text | Identifier: texts are in `translations.<language>.ops.<id>`; default `op<n>` (`op<n>_<m>` for choices). |
| `map` | text | Map JSON in `missions/` (in a mod: from its folder). → file in `missions/` (in a mod: in its folder). |
| `generator` | text | Procedural map (instead of `map`). → procedural generator (current: `jungle`, `urban`). |
| `size` | `small` \| `medium` \| `large` | Procedural map size; default `small`. |
| `seed` | integer ≥ 0 | Procedural map seed; default from the campaign seed. |
| `missionType` | text | Mission type (among the map's `supportedMissions`). → mission type (current: `recon`, `search_destroy`, `rescue_pilot`, `capture_objective`). |
| `night` | boolean | Night mission. |
| `tier` | text | Choice level (`rules.tiers` key: `easy`, `normal`, `hard`): more or fewer VC, reward and VC pressure. |
| `reward` | integer ≥ 0 | RP for winning; default the level's or `rules.requisition.win`. |
| `overrides` | [Map (`missions/<name>.json`)](#map) |  |
| `choices` | array of [Operation mission](#campaign-choice) | Missions to choose from at HQ (instead of the mission fields). |

<a id="campaign-choice"></a>

## Operation mission

| Field | Type | Description |
|---|---|---|
| `id` | text | Identifier: texts are in `translations.<language>.ops.<id>`; default `op<n>` (`op<n>_<m>` for choices). |
| `map` | text | Map JSON in `missions/` (in a mod: from its folder). → file in `missions/` (in a mod: in its folder). |
| `generator` | text | Procedural map (instead of `map`). → procedural generator (current: `jungle`, `urban`). |
| `size` | `small` \| `medium` \| `large` | Procedural map size; default `small`. |
| `seed` | integer ≥ 0 | Procedural map seed; default from the campaign seed. |
| `missionType` | text | **Required.** Mission type (among the map's `supportedMissions`). → mission type (current: `recon`, `search_destroy`, `rescue_pilot`, `capture_objective`). |
| `night` | boolean | Night mission. |
| `tier` | text | Choice level (`rules.tiers` key: `easy`, `normal`, `hard`): more or fewer VC, reward and VC pressure. |
| `reward` | integer ≥ 0 | RP for winning; default the level's or `rules.requisition.win`. |
| `overrides` | [Map (`missions/<name>.json`)](#map) |  |

<a id="campaign-rules"></a>

## Campaign rules

| Field | Type | Description |
|---|---|---|
| `rosterSize` | integer ≥ 1 | Soldiers in the platoon; default 8. |
| `deploySize` | integer 1–4 | Soldiers deployed per mission (maps have 4 start positions); default 4. |
| `startRequisition` | integer ≥ 0 | Starting RP; default 2. |
| `xp` | object | Experience per mission (none on retreat). |
| `xp.survive` | integer ≥ 0 | For surviving; default 1. |
| `xp.kill` | integer ≥ 0 | Per VC killed; default 1. |
| `xp.win` | integer ≥ 0 | For winning; default 1. |
| `xp.heal` | integer ≥ 0 | Per Medic heal; default 1. |
| `ranks` | array of object | Ranks by XP; default Pvt 0, PFC 3 (+1 HP), Cpl 7 (perk), Sgt 12 (perk, +1 HP). |
| `ranks[].id` | text | **Required.** Identifier; texts from translations `campaign.ranks.<id>` or from `labels`. |
| `ranks[].xp` | integer ≥ 0 | **Required.** XP needed. |
| `ranks[].hp` | integer ≥ 0 | Extra hit points (adding to the previous ranks). |
| `ranks[].perk` | boolean | A perk is chosen at this rank. |
| `ranks[].labels` | object { language → object } | Texts per language. |
| `ranks[].labels.<language>.name` | text | Name. |
| `ranks[].labels.<language>.short` | text | Abbreviation before the surname. |
| `perkChoices` | integer ≥ 1 | Perks offered at each choice; default 2. |
| `recovery` | object | Recovery in operations. |
| `recovery.light` | integer ≥ 0 | Operations out for a wounded soldier (HP ≤ 60%); default 1. |
| `recovery.severe` | integer ≥ 0 | For a badly wounded one (HP < 30% or bleeding); default 2. |
| `recovery.medevac` | integer ≥ 0 | For an evacuated one; default 3. |
| `medevacChance` | number 0–1 | Chance a soldier fallen in a won mission is evacuated wounded instead of dead; default 1/3, 0 = permadeath. |
| `requisition` | object | Requisition points (RP) at mission end. |
| `requisition.win` | integer | RP for winning; default 3. |
| `requisition.clean` | integer | Extra when nobody is wounded or fallen; default 1. |
| `requisition.kia` | integer | Per fallen soldier; default −1. |
| `costs` | object | HQ costs in RP. |
| `costs.replacement` | integer ≥ 0 | Replacement (new soldier); default 2. |
| `costs.fastHeal` | integer ≥ 0 | Fast healing (wounded available at once); default 1. |
| `supplies` | object { supply → object } | Supplies for one operation; default `ammo` (1 RP), `artillery` (2 RP), `napalm` (3 RP). Texts from translations `campaign.supplies.<id>`. |
| `supplies.<supply>.cost` | integer ≥ 0 | **Required.** Cost in RP. |
| `supplies.<supply>.field` | text | Only weapons with this field (e.g. `artillery`); without it, all. |
| `supplies.<supply>.exclude` | array of text | Weapons with one of these fields are excluded. |
| `supplies.<supply>.ammo` | integer ≥ 0 | Extra uses for weapons with `ammo`. |
| `supplies.<supply>.mags` | integer ≥ 0 | Extra spare magazines for weapons with `mags`. |
| `tiers` | object { level → object } | Choice levels; default `easy` (−2 VC, 2 RP, pressure +1), `normal` (3 RP), `hard` (+2 VC, 5 RP, pressure −1). |
| `tiers.<level>.vcCount` | integer | More (or fewer) VC. |
| `tiers.<level>.reward` | integer ≥ 0 | RP for winning. |
| `tiers.<level>.pressure` | integer | VC pressure change after winning. |
| `pressureVc` | integer ≥ 0 | Extra VC per pressure point; default 1. |
| `maxPressure` | integer ≥ 0 | Maximum pressure; default 4. |

<a id="campaign-index"></a>

## Campaign list (`missions/campaigns/index.json`)

| Field | Type | Description |
|---|---|---|
| `$schema` | text | Path of the JSON Schema for the editor (e.g. `../schemas/mission.schema.json`); ignored by the game. |
| `campaigns` | array of text | **Required.** Campaigns in `missions/campaigns/`, in order. → file in `missions/campaigns/` (in a mod: in its folder). |

<a id="tuning"></a>

## `tuning` groups

Current values (after `config.json`) of the groups a map can change with `tuning`. Write only the fields to change.

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
