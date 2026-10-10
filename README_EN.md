# VIETNAM '68 — Vietnam Wargame

A browser-based turn-based tactical wargame set in the Vietnam War. No installation required.

---

## The Game

You command a squad of American soldiers on special operations in Vietnam, 1968. Each mission takes place on a grid map with varied terrain, specific objectives, and Viet Cong (VC) enemy forces that react to your moves.

Choose a map, choose a mission type, and complete it before your squad is wiped out. Progress is **saved automatically** every turn — you can close the browser and pick up exactly where you left off.

---

## How to Run

The game requires a local HTTP server to load JSON files (maps, translations, config). **It does not work by opening `index.html` directly as `file://`.**

Quick options:

```bash
# Node.js
npx serve .

# Python 3
python -m http.server 8080

# VS Code
# "Live Server" extension → right-click index.html → Open with Live Server
```

Then open your browser at `http://localhost:8080` (or the port shown by your server).

---

## Rules

### Turn Structure

Each round is divided into two phases:

1. **Player Phase** — move and act with each unit in your squad
2. **Enemy Phase** — VC move and attack automatically

The current turn number and remaining VC count are always visible in the header.

---

### Action Points (AP)

Each unit has **3 AP per turn**. Actions cost AP:

| Action | Cost |
|---|---|
| Move (1 step) | variable (see terrain) |
| Attack | 1 AP |
| Special ability | 1 AP (once per turn) |

Press **End Turn** to hand over to the enemy phase when you're done.

---

### Terrain and Movement

Movement cost depends on the terrain type:

| Terrain | AP Cost | Cover |
|---|---|---|
| Jungle | 2 | +2 |
| Swamp | 3 | +1 |
| Clearing / Path / Village | 1 | 0–1 |
| Ford | 2 | 0 |
| VC Bunker | 1 | +3 |
| River / Obstacle | — | Impassable |
| Burning tile | — | Impassable (2 turns) |

**Cover** increases the defense of any unit occupying that tile, making it harder to hit.

---

### Combat

When you select an enemy in a range of a weapon, the game calculate the attack roll automatically. The enemy always rolls automatically.

**Resolution formula (single attack):**

```
Attack roll  = 2d6 + attacker ATK
Defense roll = defender DEF + terrain cover + 1d6
Damage       = max(0, attack roll − defense roll)
```

Damage is subtracted from the defender's HP. If HP reaches 0, the unit is eliminated.

Attacks are only possible within the unit's **range** and when the unit itself has **line of sight** to the target (a teammate spotting it is not enough). Enemies out of range cannot be targeted.

The **Sniper** suffers a growing ATK penalty based on distance to the target:

| Distance | ATK Penalty |
|---|---|
| 1–2 tiles | none |
| 3–4 tiles | −1 |
| 5–6 tiles | −2 |

The minimum ATK value is always 1, even with the maximum penalty. The penalty appears in the combat log only when applied.

### Weapon Selection and AoE Attacks

Some units carry **multiple weapons**. Pressing "Attack" opens a picker showing available weapons and remaining ammo.

**Area-of-effect (AoE) weapons:** grenades, RPGs and similar hit all targets within a radius around the impact point. The flow is different:

1. Choose the AoE weapon from the picker
2. All tiles within range highlight in orange
3. Click the target tile → preview of the blast radius
4. **Confirm** or **Cancel** the attack

AoE weapons resolve with a single automatic dice roll applied to all targets in the area. The explosion hits both VC and US soldiers within its radius.

**Ammo:** weapons with limited ammo show the remaining count (e.g. `×2`). When ammo is depleted, the weapon no longer appears in the picker.

---

### Squad Composition

Before starting a mission you can choose your squad's composition. In the briefing screen, below the mission type list, **4 slots** appear — one for each soldier. Click a slot to change its class: each click cycles through Assault, Sniper, Engineer, and Medic.

The default composition is one of each class, but you can bring two Assaults and no Medic, or two Snipers, depending on your preferred tactics.

### Available Classes

| Class | HP | Move | ATK | DEF | Range | Special Ability |
|---|---|---|---|---|---|---|
| **Assault** | 10 | 4 | 3 | 1 | 3 | Suppressive Fire · **Grenades ×2** (AoE, ATK5, range 3) |
| **Sniper** | 7 | 3 | 4 | 0 | 6 | Overwatch (fires at moving enemies) — **1 shot per turn** |
| **Engineer** | 9 | 3 | 2 | 1 | 3 | Demolition (bunkers/obstacles, roll ≥4) · Fire (vegetation, immediate) · Trap disarming |
| **Medic** | 8 | 3 | 1 | 1 | 1 | First Aid (heals an adjacent ally) — **restores morale** |

> ATK and Range are those of the primary weapon defined in `config.json` (M16, M14, M1911); if `config.json` defines no weapons for the class, the class base values are used.
> The Assault always carries the M16 as primary weapon (unlimited) plus 2 grenades. Pressing "Attack" shows the weapon picker.
> The medic can't heal himself.

---

### Morale and Panic

When a US soldier drops **below 30% HP** due to an enemy attack, they enter a **panic** state (SHAKEN):

- **−1 AP per turn** (from 3 to 2)
- **Special ability locked**
- Pulsing red border around the unit on the map
- Red **SHK** tag in the squad list

The soldier stays shaken until the **Medic** heals them back above the 30% HP threshold — at which point morale is restored and all penalties disappear.

> Keeping the Medic alive is not just about surviving: it's the only way to bring a panicked soldier back to full effectiveness.

---

### Viet Cong Enemies

VC move and attack automatically during the enemy phase. Their movement is animated with a smooth transition, making the enemy turn easy to follow at a glance. There are three variants:

| Type | Profile |
|---|---|
| Guerrilla | Base unit, ATK 2 (AK-47), range 2 — one per mission also carries RPG-7 (ATK 4, range 4, AoE, 1 shot) |
| VC Sniper | Dangerous at range, ATK 3 (Mosin), range 4. Skips a turn to reload after every shot; once alerted it won't come closer than 3 tiles, holding near max range and seeking cover |
| VC Commander | More durable and mobile, ATK 3 (TT-33), DEF 1 |

**VC special weapons:** only one guerrilla per mission can carry an RPG-7 (1 shot). Once in range, they use it when the squad is clustered or when the target is beyond the AK-47's reach.

**Patrol behavior:** until they spot a US soldier (within radius 5), VC actively patrol based on the current mission type:

| Mission | VC Patrol |
|---|---|
| **Search & Destroy** | Wander randomly in the vicinity |
| **Pilot Rescue** | Converge on the downed pilot; if already found, move toward the extraction point to intercept |
| **Recon** | Explore the entire map toward random positions |
| **Capture Objective** | Guard the nearest objective |

**Alert propagation:** when a VC spots the squad, they automatically alert all comrades within radius 3. Alerted VC wake up but **do not act on the turn they are alerted** — the player has one turn to reposition or take cover before the enemy response is in full swing. Only the VC who directly spotted the squad attacks immediately.

**Tactical use of cover:** once alerted, VC do not advance in a straight line — they choose paths that favor jungle, bunkers, and covered terrain over clearings and exposed roads. Staying in cover isn't enough: the enemy will actively do the same.

Starting from a configured turn, **VC reinforcements** can arrive periodically — always guerrillas, always from the same side.

In addition, each map has a **surprise ambush**: at a precise turn (and only once), a group of VC emerges from an unexpected direction — flank or rear relative to the objective — with elite units already in an alerted state. The exact turn is not communicated to the player in advance.

---

### Mission Types

For each map you can choose from the available mission types:

| Mission | Objective |
|---|---|
| **Recon** | Reach all marked zones with at least one soldier |
| **Search & Destroy** | Eliminate the required number of VC (or all of them) |
| **Pilot Rescue** | Explore the map to locate the downed pilot and escort him to the extraction point |
| **Capture Objective** | Occupy and hold a position for N consecutive turns |

The game ends in **victory** when the objective is completed, or **defeat** if the entire squad is eliminated.

#### Pilot Rescue — Hidden Position

In this mode the pilot's position **is not known at the start**. The ✈ marker on the map only appears when a squad unit enters the line-of-sight range of the tile where the pilot is located. The extraction point (EXTR) is always visible.

The objective panel reflects the current state:
- **Position unknown** — the tile has not been spotted yet
- **To locate** — the tile is in sight range, reach the pilot
- **Found — bring to LZ** — a soldier is escorting him
- **EXTRACTED** — mission complete

If Fog of War is **disabled**, the pilot's position is visible from the start (classic behavior).

---

### Special Abilities — Details

- **Suppressive Fire (Assault):** the Assault enters suppressive fire mode (costs 1 AP). During the enemy phase, any VC that is in or moves into the range of the primary weapon (3 tiles with the M16), **in front of or beside** the Assault and in line of sight, is pinned: AP zeroed, cannot attack. The suppression zone is visible on the overlay as a dashed orange outline.
- **Overwatch (Sniper):** enters surveillance mode (costs 1 AP). If during the enemy phase a VC enters the range of the sniper's primary weapon (6 tiles with the M14) **and** the sniper's front cone (in line of sight), the sniper fires automatically with 2d6 + ATK **+1** (aim already set). The sniper can make **one attack per enemy turn** — hitting the first valid target in activation order. The **range penalty** applies in overwatch too. Enemies behind walls, bunkers, or dense jungle are not intercepted even if in range. After firing, the sniper need to wait for the next enemy turn to fire again.
- **Demolition / Fire (Engineer):** on an adjacent tile with a bunker or obstacle, demolishes it (roll ≥4). On a tile with vegetation (jungle, village, garden), sets it on fire immediately. Fire blocks movement for **2 turns** — for both the squad and VC — and shows the flame animation on the map.
- **First Aid (Medic):** restores HP to an adjacent ally but not to the medic itself.

---

### Fog of War (optional)

The **👁** button in the header toggles fog of war on or off. It is **enabled** by default.

When **ON**:

- Tiles outside the squad's vision are obscured
- Invisible enemies do not appear on the map and cannot be targeted
- Tooltips reveal no information about tiles in the fog

Each class has its own maximum vision range:

| Class | Vision |
|---|---|
| Assault | 4 tiles |
| Sniper | 6 tiles |
| Engineer | 4 tiles |
| Medic | 3 tiles |

Keep the squad together to cover more of the map; use the Sniper as a scout to see farther ahead.

---

### Line of Sight (LOS)

Vision range is not only about distance: terrain can block or reduce the line of sight. The game traces a ray between the unit and each tile, checking intermediate obstacles.

| Intermediate terrain | LOS effect |
|---|---|
| Jungle, Swamp, Village | −1 vision per tile traversed |
| Rubble, Palace/Temple | −1 vision per tile traversed |
| Bunker, Obstacle, Wall, Building | Completely blocks the ray |
| Clearing, Path, River, Road, Bridge | No effect |

The target tile itself is always visible if the ray reaches it — blocks only apply to **intermediate** tiles.

Practical examples:
- A Sniper (vision 6) looking through 3 jungle tiles has 3 remaining vision beyond the jungle.
- An Assault (vision 4) cannot see an enemy hiding behind a bunker, even if adjacent.
- Demolishing a wall turns a full block into a partial one (rubble), opening both a physical corridor and a visual gap.

### Tactical Mechanics

- **Facing:** every unit, US and VC, faces one of 4 directions (small arrow on the edge of the counter). Relative to its facing, an attacker is in **front** (90° cone), **behind** (opposite cone) or on the **side** (the rest):
  - from the side, the target's cover is **halved** (rounded down);
  - from behind, cover is **zero** and the attacker gets **+1 ATK**.

  It applies to every direct attack, overwatch and ambushes included, for both sides (not to grenades, RPGs or artillery). A unit turns toward its direction of travel when moving; a shooter turns toward its target, and the target, if it survives, turns toward its attacker. Once per turn each soldier can **turn for free** (even with no AP): **⟳ Turn** button, then click one of the 4 adjacent tiles. Undoing a move also undoes a turn made after it. Patrolling VC notice the squad at full distance in front, −1 on the sides and only within 2 tiles from behind: approaching from the rear lets you catch them by surprise. Tooltip, log and hit chance account for the attack side.
- **Vision cone:** each soldier sees at full distance in front, **−1 on the sides** and at most **2 tiles behind** (never more than on the sides); adjacent tiles are always visible. The night penalty applies before the cone. Since you can only shoot what you see, **a target behind you beyond 2 tiles requires turning first**. With a unit selected, the light-blue outline shows its vision area; in turn mode, hovering over the arrows previews that direction.
- **Directional overwatch and suppressive fire:** the sniper's overwatch covers only the **front cone** (up to weapon range) but fires with **+1 ATK**; the assault's suppressive fire covers **front and sides**, not the rear, and only within line of sight. The covered areas are dashed on the map: turn the soldier after activating them.
- **VC traps (punji and mines):** hidden on the map. A soldier walking over one stops there and takes damage (punji 2 HP, mine 4 HP). The **Engineer** automatically spots traps at distance 1; a spotted trap is marked on the map, movement routes around it and the Engineer can **disarm** it with the special ability (1 AP). VC are immune.
- **Smoke grenades:** the Assault carries one smoke grenade (×1) creating a radius-1 screen for 2 turns. Smoke blocks line of sight: anyone inside sees and is seen only from distance 1. This applies to VC as well, who cannot fire through smoke.
- **Artillery support:** the Engineer carries the radio (one per squad, 1 use). The strike is called like an area weapon (range 10) but **lands at the start of the next turn**, after the VC move, on anyone in the area — US soldiers included, and VC hidden in the fog too. The incoming impact area is marked in red on the map.
- **Night missions:** enabled from the briefing (or forced by the map with `"night": true`). Each soldier's vision drops by 2 (minimum 1) and VC notice the squad from 3 tiles instead of 5. Since firing requires line of sight, at night even the Sniper can only hit within its reduced vision.
- **VC morale:** a VC below 30% HP (once per unit) and every VC within 4 tiles of a fallen commander become **routed** for 2 activations: they fall back away from the squad looking for cover and do not attack (white flag ⚐ on the map).

---

## Auto-Save

The game **auto-saves** at the start of every player turn using the browser's localStorage. No player action is required.

When the game is reopened with a session in progress, a green banner appears on the map selection screen with the last session's info (map, mission type, turn, date and time). Press **▶ RESUME** to return exactly to the state you left.

The save is automatically cleared when the game ends (victory or defeat).

---

## Procedural Map

The **🎲 Uncharted Zone** (jungle) and **🎲 Uncharted City** (urban) theaters use no JSON file: the map is generated on the spot (16×12).

**Uncharted Zone** — delta jungle:

- a north–south river with **two fords**, and trails linking the start, the fords and the objectives;
- clearings, swamps, a village, bunkers and demolishable obstacles;
- the squad starting on the west edge, VC beyond the river, ambushes along the north/south edges;
- objectives for all 4 mission types (LZ with the pilot, village and bunker to scout, radio post to hold).

**Uncharted City** — a city district during the Tet Offensive:

- a grid of avenues and streets; each block has its own character (dense buildings, park, ruins), and an artillery strike has turned a cluster of buildings to rubble;
- a west–east river that can be crossed **only on the two bridges**;
- north of the river, a **walled citadel** with one gate and 1–3 **breachable walls** (engineer breach), pagodas and gardens around the **NVA Command**;
- the squad starting on the south edge, VC on both banks and inside the citadel, ambushes on the flanks;
- objectives for all 4 mission types (pilot at the wreck outside the walls, bridge/market/command to scout, command to hold).

The generator guarantees that every passable tile can be reached from the start (the citadel always has a gate: an engineer is not required). The number in the name (**Sector 48213**, **District 48213**) is the seed: the same seed always produces the same map. In the briefing, the **🎲 Regenerate map** button creates a new one before you start.

The generated map is saved in full with the game: **▶ RESUME** brings it back identical (demolitions included). A new game generates a new map.

---

## Tile Animations

Maps can define ambient animations on specific tiles, configured via JSON with no code changes. Animations are **always visible**, even through Fog of War — smoke from a wreck or flames from a burning building can be seen from a distance, guiding the squad toward the objective.

Available types:

| Type | Description |
|---|---|
| `smoke` | Grey smoke rising slowly — ideal for wrecks, suppressed fires |
| `fire` | Orange and red flames — for burning buildings, ongoing explosions |
| `fog` | Pulsing misty veil — for wetlands, swamps, cover areas |

To add animations to a map, insert this in the mission JSON:

```json
"tileAnimations": [
  {"col": 5, "row": 3, "type": "smoke"},
  {"col": 2, "row": 7, "type": "fire"}
]
```

---

## Custom Map Image

Each mission can have its own background image that replaces procedural tile rendering. Just add the `"image"` field to the mission JSON:

```json
{
  "name": "Rung Sat",
  "image": "rung_sat_map.jpg",
  ...
}
```

- The image file goes in the `missions/` folder (supported formats: jpg, png, webp, svg)
- When an image is present, tile colors and textures are not drawn — the image replaces them entirely
- A thin grid overlay remains for navigation
- Unit sprites, objective markers, Fog of War, and effects all continue to work normally
- If the file is missing or fails to load, the game falls back to procedural rendering automatically

---

## Customization — config.json

The `config.json` file in the root folder lets you customize the game without touching the code.

### Menu Music

To add background music to the main menu, set the audio file path in the `menuMusic` field:

```json
{
  "menuMusic": "assets/menu.ogg"
}
```

- Supported formats: **ogg, mp3, wav**
- Music starts looping as soon as the menu is shown
- When "Start Mission" is pressed, the music fades out over **800 ms** before the game begins
- Set to empty string `""` or omit the field for no menu music

### Unit Images

To replace the drawn sprites with custom images, set the file path for each class:

```json
{
  "unitImages": {
    "assault":   "assets/assault.webp",
    "sniper":    "assets/sniper.webp",
    "engineer":  "assets/engineer.webp",
    "medic":     "assets/medic.webp",
    "grunt":     "assets/grunt.webp",
    "sniper_vc": "assets/sniper_vc.webp",
    "commander": "assets/commander.webp"
  }
}
```

- Supported formats: **webp, png, jpg, svg**
- Set to empty string `""` to use the default canvas sprite
- Paths are relative to the game's root folder
- You can replace only some classes and leave others with the default sprite
- If `config.json` is missing or invalid, the game works normally without errors

### Custom Weapon Sounds

Each weapon can have its own firing sound, defined with the `sound` field directly in the weapon object in `config.json`:

```json
{
  "weapons": {
    "assault": [
      { "id": "rifle", "label": "M16", "atk": 3, "range": 3, "sound": "assets/m16.mp3" },
      { "id": "grenade", "label": "Grenade", "atk": 5, "range": 3, "ammo": 2, "aoe": 1 }
    ],
    "grunt": [
      { "id": "ak47", "label": "AK-47", "atk": 2, "range": 2, "sound": "assets/ak47.mp3" }
    ]
  }
}
```

- Supported formats: **ogg, mp3, wav**
- The `sound` field is optional: if absent or if the file fails to load, the default synthesized sound is used
- Identical audio files across multiple weapons are preloaded only once (cached by path)
- The sound is used in all contexts: direct attack, overwatch, suppressive fire

### Custom Sound Effects

Game sounds (victory, death, movement, etc.) can also be replaced with custom audio files via the `sounds` key in `config.json`:

```json
{
  "sounds": {
    "move":       "assets/footstep.mp3",
    "hit":        "assets/hit.mp3",
    "death":      "assets/death.mp3",
    "miss":       "",
    "ambush":     "assets/ambush.mp3",
    "demolition": "assets/explosion.mp3",
    "heal":       "",
    "overwatch":  "",
    "spawn":      "",
    "turn_end":   "",
    "victory":    "assets/victory.mp3",
    "defeat":     "assets/defeat.mp3",
    "click":      ""
  }
}
```

- Set to empty string `""` to keep the synthesized sound
- Shooting sounds (`shoot`, `shoot_vc`) **do not go here** — they are defined in the `sound` field of each weapon
- If a file fails to load, the game falls back to the synthesized sound automatically

### Mission-Specific Sound Effects

Each mission can override one or more SFX from `config.json` by adding the same `sounds` key directly to the mission JSON:

```json
{
  "name": "Hue City",
  "sounds": {
    "move": "missions/hue_city_footstep.mp3"
  }
}
```

This allows, for example, footsteps on asphalt in a city and footsteps on foliage in the jungle, with the generic sounds as fallback.

**Resolution priority for each SFX:**
1. Sound defined in the current mission JSON
2. Sound defined in `config.json → sounds`
3. Synthesized sound via Web Audio API (default)

The mission sound cache is flushed and reloaded automatically on every mission change (including save resume). The same keys valid in `config.json → sounds` can be used here (excluding `shoot`/`shoot_vc`, which are configured per weapon).

### Weapons and Loadout

Each class can have a weapon arsenal defined in `config.json` under the `weapons` key. If the section is absent, each unit uses the default ATK/range values for its class.

```json
{
  "weapons": {
    "assault": [
      { "id": "rifle",   "label": "M16",     "labelEn": "M16",     "atk": 3, "range": 3 },
      { "id": "grenade", "label": "Granata",  "labelEn": "Grenade", "atk": 5, "range": 3, "ammo": 2, "aoe": 1 }
    ],
    "sniper":    [{ "id": "rifle",  "label": "M14",   "labelEn": "M14",   "atk": 4, "range": 6 }],
    "engineer":  [{ "id": "rifle",  "label": "M16",   "labelEn": "M16",   "atk": 2, "range": 3 }],
    "medic":     [{ "id": "pistol", "label": "M1911", "labelEn": "M1911", "atk": 1, "range": 1 }],
    "grunt": [
      { "id": "ak47", "label": "AK-47", "labelEn": "AK-47", "atk": 2, "range": 2 },
      { "id": "rpg",  "label": "RPG-7", "labelEn": "RPG-7", "atk": 4, "range": 4, "ammo": 1, "aoe": 1, "maxCarriers": 1 }
    ],
    "sniper_vc": [{ "id": "rifle",  "label": "Mosin", "labelEn": "Mosin", "atk": 3, "range": 4 }],
    "commander": [{ "id": "pistol", "label": "TT-33", "labelEn": "TT-33", "atk": 3, "range": 2 }]
  }
}
```

**Weapon fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string | Internal identifier |
| `label` / `labelEn` | string | Display name in Italian / English |
| `atk` | number | Weapon ATK value (overrides class default) |
| `range` | number | Maximum range in tiles |
| `ammo` | number or null | Available ammo; `null` = unlimited |
| `aoe` | number | (optional) Area-of-effect radius in Manhattan distance |
| `minRange` | number | (optional, AoE weapons only) Minimum range in tiles; defaults to `aoe + 1` so the thrower is never inside the blast |
| `maxCarriers` | number | (optional) Max units per mission that can carry this weapon (separate counters for the US squad and the VC) |
| `rangePenalty` | boolean | (optional, US only) Applies the range penalty (−1 ATK every 2 tiles), overwatch included; when absent it is `true` only for the sniper |
| `rounds` | number | (optional, visual only) Tracers shown per attack (1–5); when absent 1 for snipers, 3 for other weapons |
| `smoke` | number | (optional, AoE weapons only) Smoke grenade: no damage, creates smoke within `aoe` for N turns |
| `artillery` | boolean | (optional, AoE weapons only) Artillery call: the strike lands at the start of the next turn and also hits hidden VC |

**Behavior:**

- If a unit has **one weapon** (or only one usable), it attacks directly without a picker
- If it has **multiple usable weapons**, a picker appears in the action area before the attack
- **AoE weapons** (`aoe > 0`) first show an orange overlay with the targetable tiles (between minimum and maximum range: you cannot throw too close to yourself), then on tile click show a blast radius preview with confirm/cancel; combat resolves automatically without a manual roll
- Ammo is tracked on the unit object and saved with `saveGame()` — it persists across turns and resumes
- `maxCarriers` limits how many VC units per mission can receive that weapon (initial spawn + reinforcements + ambush all share the counter in `G.missionState.vcCarrierCounts`)

**Default loadout (current config.json):**

| Class | Primary weapon | Secondary weapon |
|---|---|---|
| Assault | M16 (ATK3, RNG3, ∞) | Grenade (ATK5, RNG3, AoE1, ×2) · Smoke (RNG3, AoE1, ×1, 2 turns) |
| Sniper | M14 (ATK4, RNG6, ∞) | — |
| Engineer | M16 (ATK2, RNG3, ∞) | Radio: artillery (ATK6, RNG10, AoE1, ×1, max 1 per squad) |
| Medic | M1911 (ATK1, RNG1, ∞) | — |
| VC Guerrilla | AK-47 (ATK2, RNG2, ∞) | RPG-7 (ATK4, RNG4, AoE1, ×1, max 1 carrier) |
| VC Sniper | Mosin (ATK3, RNG4, ∞) | — |
| VC Commander | TT-33 (ATK3, RNG2, ∞) | — |

---

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Select unit | Click the unit or the card in the panel | Tap the card in the SQUAD tab |
| Move | Click "Move" or press `M` | ACTIONS tab → Move → tap cell |
| Attack | Click "Attack" or press `A` | ACTIONS tab → Attack → tap enemy |
| Special ability | Click "Special" or press `S` | ACTIONS tab → Special |
| End turn | "End Turn" button or `Enter` (asks for confirmation if some unit still has AP) | ACTIONS tab → End Turn |
| Cancel action | `Esc` | — |
| Undo last move | "↶ Undo move" button or `U` / `Ctrl+Z` | ACTIONS tab → Undo move |
| Next unit with AP | `Tab` (`Shift+Tab` for previous) | — |
| Pan map | Click + drag | 1 finger + drag |
| Zoom | Mouse wheel | 2-finger pinch |
| Roll dice | "ROLL DICE" button | DICE tab |
| Return to menu | **⌂** button in header | **⌂** button in header |

### Desktop Hotkeys

Keyboard shortcuts are active only during the **player phase** and when no dice roll is in progress.

| Key | Action |
|---|---|
| `M` | Move mode |
| `A` | Attack mode |
| `S` | Special ability mode |
| `R` | Turn (free, once per turn) |
| `Enter` | End turn (in the confirmation dialog: confirm) |
| `Esc` | Cancel current mode (in the confirmation dialog: cancel) |
| `U` / `Ctrl+Z` | Undo last move |
| `Tab` / `Shift+Tab` | Select next / previous unit with AP |

**Undo move:** only the last move can be undone, and only if it revealed no new enemies and did not change the mission state (pilot picked up, zone scouted). Any other action (attack, special ability, end turn) makes it final.

**Hit chance:** in attack mode, the hit percentage is shown above each target (same formula as combat: 2d6+ATK vs DEF+cover+1d6, range penalty included). On desktop the target tooltip also shows the average damage.

### ⌂ Button and Back Button

The **⌂** button is only visible during an active game. Clicking it — and pressing the **Android or browser back button** — asks for confirmation before abandoning the mission; the music fades out before returning to the menu.

---

## Creating a New Mission

Adding a map requires only two files. Zero JS code changes.

### 1. Register the map in `missions/catalog.json`

```json
{
  "file": "my_map.json",
  "icon": "🗺️",
  "color": "#334455",
  "theaterColor": "#334455",
  "labels": {
    "it": { "label": "Nome Mappa", "subtitle": "Luogo · Anno", "theater": "TEATRO" },
    "en": { "label": "Map Name",   "subtitle": "Place · Year",  "theater": "THEATER" }
  }
}
```

For a procedural map use `"generator": "jungle"` (or `"urban"`) instead of `"file"` (no JSON to create; the available generators are in `js/mapGen.js`, `MAP_GENERATORS`).

### 2. Create `missions/my_map.json`

Full structure with all fields:

```json
{
  "name": "Internal name",
  "description": "Short description",
  "cols": 15,
  "rows": 12,
  "image": "my_map.jpg",
  "ambient": "missions/my_map_ambient.ogg",
  "sounds": {
    "move": "missions/my_map_footstep.mp3"
  },

  "tileTypes": {
    "C": { "id": "clearing", "label": "Clearing", "moveCost": 1, "coverBonus": 0, "color": "#8aaa55" },
    "J": { "id": "jungle",   "label": "Jungle",   "moveCost": 2, "coverBonus": 2, "color": "#2d5a1b",
           "losBlock": "partial", "burnable": true },
    "R": { "id": "river",    "label": "River",    "moveCost": 1, "coverBonus": 0, "color": "#336699",
           "impassable": true },
    "B": { "id": "bunker",   "label": "Bunker",   "moveCost": 1, "coverBonus": 3, "color": "#5a5040",
           "losBlock": "full", "demolishable": true, "demolishResult": "J" },
    "O": { "id": "objective","label": "Objective","moveCost": 1, "coverBonus": 0, "color": "#cc9900" }
  },

  "grid": [
    ["J","J","C","C","C","J","J","C","C","C","J","J","C","C","C"],
    ["C","C","C","J","C","C","C","J","C","C","C","J","C","C","C"]
  ],

  "playerStart": [
    {"col": 0, "row": 6},
    {"col": 1, "row": 6},
    {"col": 0, "row": 7},
    {"col": 1, "row": 7}
  ],

  "vcSpawnZones":  [{"colMin": 10, "colMax": 14, "rowMin": 0, "rowMax": 11}],
  "vcCount": 6,

  "reinforcementTurn": 5,
  "reinforcementCount": 2,

  "vcAmbushTurn": 4,
  "vcAmbushCount": 2,
  "vcAmbushZones": [{"colMin": 0, "colMax": 3, "rowMin": 0, "rowMax": 3}],

  "trapCount": 3,
  "trapZones": [{"colMin": 4, "colMax": 12, "rowMin": 0, "rowMax": 11}],
  "traps": [{"col": 6, "row": 5, "type": "mine"}],
  "night": false,
  "nightVisionPenalty": 2,

  "supportedMissions": ["recon", "search_destroy", "rescue_pilot", "capture_objective"],

  "objectives": {
    "recon": [
      {"col": 7, "row": 3, "label": "Zone A"},
      {"col": 12, "row": 9, "label": "Zone B"}
    ],
    "search_destroy": {"eliminateAll": false, "minKills": 4},
    "rescue_pilot": {
      "pilotCol": 11, "pilotRow": 3,
      "extractCol": 0, "extractRow": 11,
      "tileAnimations": [{"col": 11, "row": 3, "type": "smoke"}]
    },
    "capture_objective": [
      {"col": 10, "row": 5, "label": "Alpha Position", "holdTurns": 3}
    ]
  },

  "tileAnimations": [
    {"col": 5, "row": 3, "type": "fog"}
  ],

  "translations": {
    "it": {
      "name": "Nome IT",
      "description": "Descrizione IT",
      "tileLabels": {
        "clearing": "Radura", "jungle": "Giungla", "river": "Fiume",
        "bunker": "Bunker VC", "objective": "Obiettivo"
      },
      "objectives": {
        "recon": [{"label": "Zona A"}, {"label": "Zona B"}],
        "capture_objective": [{"label": "Posizione Alpha"}]
      }
    },
    "en": {
      "name": "Map Name EN",
      "description": "Description EN",
      "tileLabels": {
        "clearing": "Clearing", "jungle": "Jungle", "river": "River",
        "bunker": "VC Bunker", "objective": "Objective"
      },
      "objectives": {
        "recon": [{"label": "Zone A"}, {"label": "Zone B"}],
        "capture_objective": [{"label": "Alpha Position"}]
      }
    }
  }
}
```

### Optional fields: traps and night

| Field | Type | Description |
|---|---|---|
| `trapCount` | number | Random traps (punji or mine) placed at mission start; default 0 |
| `trapZones` | array | Zones `{colMin, colMax, rowMin, rowMax}` for random traps; if absent, anywhere at least 4 tiles from the start |
| `traps` | array | Fixed traps `{col, row, type, dmg?}`; `type` = `"punji"` (2 HP) or `"mine"` (4 HP) |
| `night` | boolean | Mission is always at night (the briefing option is locked) |
| `nightVisionPenalty` | number | Vision reduction at night; default 2 |

### Tile Type Fields

| Field | Type | Description |
|---|---|---|
| `id` | string | Internal identifier (used in `tileLabels`) |
| `label` | string | Default name (used if translation is absent) |
| `moveCost` | number | AP to cross the tile (0 = free, 3 = swamp) |
| `coverBonus` | number | Defense bonus for units occupying the tile |
| `color` | string | Hex color for procedural rendering |
| `impassable` | bool | If `true`, blocks movement (walls, rivers) |
| `losBlock` | string | `"full"` = blocks vision entirely, `"partial"` = −1 to range per tile traversed |
| `burnable` | bool | The Engineer can set it on fire (burns for 2 turns) |
| `demolishable` | bool | The Engineer can demolish it with a roll ≥ 4 |
| `demolishResult` | string | Grid key of the tile that replaces the demolished one |

### Objective Types

| Type | Structure in `objectives` |
|---|---|
| `recon` | Array of `{"col", "row", "label"}` — zones to reach |
| `search_destroy` | `{"eliminateAll": bool, "minKills": N}` |
| `rescue_pilot` | `{"pilotCol", "pilotRow", "extractCol", "extractRow"}` — pilot position is hidden in FOW |
| `capture_objective` | Array of `{"col", "row", "label", "holdTurns"}` — hold for N consecutive turns |

You can include only the types you want to support and declare them in `supportedMissions`.

### Optional Files

| File | Description |
|---|---|
| `missions/my_map.jpg` | Background image (replaces colored tiles); declared with `"image": "my_map.jpg"` |
| `missions/my_map_ambient.ogg` | Ambient music looping during the game |
| `"sounds": { "move": "..." }` | Map-specific SFX (override `config.json`) |

### Tile Animations

Add ambient animations without touching the code:

```json
"tileAnimations": [
  {"col": 5, "row": 3, "type": "smoke"},
  {"col": 2, "row": 7, "type": "fire"},
  {"col": 9, "row": 1, "type": "fog"}
]
```

Global animations (`tileAnimations` at the root) are always visible. Those inside `objectives.<type>.tileAnimations` appear only in the corresponding mission mode. Smoke is visible even through Fog of War — useful as a visual indicator for the pilot's location in `rescue_pilot`.
