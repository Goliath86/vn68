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

**Hand grenades:** throws aren't precise. Half the time the grenade lands on one of the 8 tiles around the chosen one (dashed 3×3 square in the preview): branches, short or long throws, rolling. It never lands off the map or against walls, buildings or bunkers. You see the grenade fly in an arc and bounce to where it lands, then it explodes. Beware of friendly fire: with the target 2 tiles away the grenade may end up next to the thrower.

**Ammo:** weapons with limited ammo show the remaining count (e.g. `×2`). When ammo is depleted, the weapon no longer appears in the picker.

---

### Squad Composition

Before starting a mission you can choose your squad's composition. In the briefing screen, below the mission type list, **4 slots** appear — one for each soldier. Click a slot to change its class: each click cycles through Assault, Sniper, Engineer, and Medic.

The default composition is one of each class, but you can bring two Assaults and no Medic, or two Snipers, depending on your preferred tactics.

### Available Classes

| Class | HP | Move | ATK | DEF | Range | Special Ability |
|---|---|---|---|---|---|---|
| **Assault** | 10 | 4 | 3 | 1 | 3 | Suppressive Fire · **Grenades ×2** (AoE, ATK5, range 3) |
| **Sniper** | 7 | 3 | 4 | 0 | 6 | Overwatch (fires at moving enemies) — **1 shot per turn**, 1-round magazine |
| **Engineer** | 9 | 3 | 2 | 1 | 3 | Demolition (bunkers/obstacles, roll ≥4) · Fire (vegetation, immediate) · Trap disarming · Tunnel sealing |
| **Medic** | 8 | 3 | 1 | 1 | 1 | Heal (+3 HP to an adjacent ally) — **restores morale and stops bleeding** |

> ATK and Range are those of the primary weapon defined in `config.json` (M16, M14, M1911); if `config.json` defines no weapons for the class, the class base values are used.
> The Assault carries the M16 as primary weapon (3-round magazine, 4 spare) plus 2 grenades, a smoke grenade and the knife. The **Attack** button uses the main weapon (the rifle, or the knife if the rifle is empty); below it the selected unit's **weapon cards** show every weapon with ammo and stats: a click (or keys **1-9**) attacks with that weapon. Below the special ability a row of **icons** groups the secondary actions (⟳ turn, stance, 🩹 first aid, ↶ undo), shown only when available; on desktop each button's corner shows its hotkey. On mobile with the sheet collapsed the quick bar shows the every-turn actions (Move, Attack, Special, Turn, End) and a **⋯** button that opens the others (stance, reload, first aid, undo), shown only when available; "Attack" in the quick bar still opens the weapon picker. In the selected unit panel the status (special ability, stance, concealment, overwatch, ammo, wounds, panic, bleeding, pilot) appears as coloured **chips** with a short label; hovering a chip shows the full explanation.
> The medic can't heal themselves with the special ability (only with the once-per-mission first aid).

---

### Morale and Panic

When a US soldier drops **below 30% HP** due to an enemy attack, they enter a **panic** state (SHAKEN):

- **−1 AP per turn** (from 3 to 2)
- **Special ability locked**
- Pulsing red border around the unit on the map
- Red **SHK** tag in the squad list

The soldier stays shaken until the **Medic** heals them back above the 30% HP threshold — at which point morale is restored and all penalties disappear.

> Keeping the Medic alive is not just about surviving: it's the only way to bring a panicked soldier back to full effectiveness.

### Wounds and bleeding

| HP | State | ATK | Movement |
|---|---|---|---|
| above 60% | healthy | — | normal |
| ≤ 60% | 🤕 **wounded** | −1 | +1 AP per move |
| below 30% | 🤕 **badly wounded** (and shaken) | −2 | +1 AP per move (plus the −1 AP from panic) |

The ATK penalty applies to attacks and overwatch (ATK never drops below 1); the movement surcharge stacks with the stance one.

**Bleeding (🩸):** every hit that wounds a soldier may cause bleeding, with a chance that grows with damage (1 damage 35%, 2 → 50%, 3 → 65%, 4+ → 80%); punji traps always cause it. A bleeding soldier loses **1 HP at the start of every turn** and can bleed to death. A pulsing blood drop appears on the counter. At the start of each turn the bleeding has a **1 in 3 chance of stopping on its own** (no HP lost that turn); to be sure you need the **Medic**, who stops it by healing an adjacent teammate (they can't stop their own).

**First aid (🩹, key H):** once per mission every soldier, medic included, can patch themselves up: **+2 HP** (also lifting panic if back above 30%), but it **doesn't stop the bleeding** and uses **all remaining AP** (at least 1 AP needed): the soldier can't do anything else that turn.

---

### Viet Cong Enemies

VC move and attack automatically during the enemy phase. Their movement is animated with a smooth transition, making the enemy turn easy to follow at a glance. There are three variants:

| Type | Profile |
|---|---|
| Guerrilla | Base unit, ATK 2 (AK-47), range 2 — one per mission also carries RPG-7 (ATK 4, range 4, AoE, 1 shot) |
| VC Sniper | Dangerous at range, ATK 3 (Mosin), range 4. Skips a turn to reload after every shot; once alerted it won't come closer than 3 tiles, holding near max range and seeking cover |
| VC Commander | More durable and mobile, ATK 3 (TT-33), DEF 1 |

**VC special weapons:** only one guerrilla per mission can carry an RPG-7 (1 shot, never below distance 2). They use it when the blast would hit several soldiers, or when it pays off more than the AK-47 (e.g. the target is beyond the AK's reach); they avoid catching other VC in it.

**Patrol behavior:** until they spot a US soldier (within radius 5), VC actively patrol based on the current mission type:

| Mission | VC Patrol |
|---|---|
| **Search & Destroy** | Wander randomly in the vicinity |
| **Pilot Rescue** | Converge on the downed pilot; if already found, move toward the extraction point to intercept |
| **Recon** | Explore the entire map toward random positions |
| **Capture Objective** | Guard the nearest objective |

**Alert propagation:** when a VC spots the squad, they automatically alert all comrades within radius 3. Alerted VC wake up but **do not act on the turn they are alerted** — the player has one turn to reposition or take cover before the enemy response is in full swing. Only the VC who directly spotted the squad attacks immediately.

**Tactical AI:** once alerted, guerrillas and commanders evaluate every tile they can reach this turn:
- **Where to shoot from and at whom:** they pick the combination of position, target and weapon with the best expected damage and kill chance. In practice they **flank** to hit from the side (half cover) or from behind (no cover, +1 ATK), prefer exposed or wounded soldiers, and account for stance.
- **Where to stand:** all else equal they prefer covered or concealing tiles, seen by few soldiers, outside overwatch cones and suppressive-fire areas, and not bunched with other VC (grenades). After firing, with AP left, they **fall back into cover** when the gain is clear.
- **Advance and ambush:** if they can't fire they advance cover to cover toward the squad. If they are already well covered and the squad is close they may **hold in ambush** (the commander always does, guerrillas half the time). Unspent AP become an **ambush**: on your turn the VC fires once at the first soldier who ends a move in front of or beside it, in range, in sight and spotted. A visible VC in ambush shows an **orange crosshair** on its counter (and a note in the tooltip): go around it, get behind it or out of its sight, or let a first move "spring" the ambush.
- **Multi-turn flanking:** with at least 3 alerted guerrillas, part of the group tries to flank the squad. That is about a third: one on small maps, at most two on medium maps and three on large ones. Each picks a spot on the flank or behind a soldier, relative to where that soldier is facing, and reaches it over several turns along the route least seen by the squad. While moving it doesn't fire, except for a very good opportunity, and it waits in ambush. When it arrives, or as soon as it can hit its target from the side or behind, it goes back to fighting normally. It gives up if the soldier falls, if it gets hit, or after 6 turns. If it is in sight, the log reports it ("moves to the flank"). Snipers and commanders don't flank.

Staying in cover isn't enough: the enemy will go for your back and flanks.

**VC guerrilla tactics:**
- **Tunnels (🕳):** every map has a few hidden entrances (3 by default, in vegetation or rubble, away from the start). A wounded VC (half HP or less) or a routed one that can reach an entrance **vanishes underground**; on its next turn it **pops out of a free entrance**, preferably out of sight and a few tiles from the squad, with +2 HP, restored morale and **in ambush**. Half of the reinforcements can arrive through the tunnels. A soldier adjacent to an entrance notices it (the Engineer from 2 tiles), as does anyone who sees a VC go in or come out. The **Engineer** can **seal** a spotted entrance with the special ability (1 AP, explosion noise); once every entrance is sealed, the VC still inside are trapped.
- **Planted traps:** a patrolling guerrilla now and then (15% per turn) hides a punji or a mine on the tile it leaves, up to 3 per mission. If you see it planting, the trap is marked on the map.
- **Camouflaged snipers:** a VC sniper in vegetation or rubble is **invisible beyond 2 tiles** until it fires: the shot reveals it until the next VC turn. Overwatch and suppressive fire can't see it from afar either. The VC sniper actively seeks these positions.

Starting from a configured turn, **VC reinforcements** can arrive periodically — guerrillas by default (the map can change them with `reinforcementMix`), always from the same side.

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

If the soldier escorting the pilot is killed, the pilot **stays on the ground** on that tile (the panel goes back to "To locate"): another soldier can reach him and resume the escort.

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
- **Noise:** every noisy squad action alerts the VC within a radius (in tiles, through any terrain), who turn toward the source; the targeted VC is always alerted. Radii: M1911 **2**, M16 **5**, M14 **7**, grenade **6**, smoke **1**, artillery **8**, demolition **6**, fire **2**; direct weapons, overwatch and suppressive fire from the shooter, explosions from the impact point. In attack mode the dotted grey outline shows the chosen weapon's radius (🔊 in the weapon cards). The log reports only alerted VC in sight. **VC gunfire alerts other VC** too, within their weapon's radius (AK-47 **5**, RPG-7 **7**, Mosin **6**, TT-33 **3**), who turn toward the targeted soldier: a firefight draws nearby VC. The (reddish) sound wave is shown only if the shooter is visible. A mission can disable it with `"vcNoise": false`.
- **Knife (melee):** every soldier carries a knife (ATK 2, range 1, noise **0**), picked from its weapon card like the others. It works on orthogonally adjacent tiles with the normal roll (2d6 + ATK against DEF + 1d6), but **a strike that lands always kills**. Instead of terrain cover the VC gets a **guard** depending on how well they see the attacker: **front +5 DEF**, **flank +3**, **behind none** (and +1 ATK). **Wounds** count double (−2 ATK wounded, −4 badly wounded). Against a regular VC, unwounded: from behind ~98%, from the flank ~74%, from the front ~50%. If the strike fails there's a **struggle**: on a near miss (margin 0 or −1) the VC is wounded (−1 HP) and half the time the soldier too (−1 HP); otherwise the VC parries and strikes back (−1 HP, −2 if the strike failed by 4 or more). From behind it lets you take a VC out without alerting anyone but the target. If the blow **kills** the enemy the soldier **advances into their tile** for free (0 AP, cannot be undone; it stops on a trap like a normal move): handy for seizing a covered position. The knife does not count as the Sniper's shot and stays usable after the shot or while the rifle is reloading; it is never used for overwatch or suppressive fire.
- **Stance (🧍 standing / 🧎 crouched / 🐍 prone):** stance icon in the secondary actions row (key **C**). The first change each turn is free, further ones cost 1 AP; undoing a move also undoes a stance change made after it.

  | | Standing | Crouched | Prone |
  |---|---|---|---|
  | Direct-fire ATK (overwatch too, not the knife) | — | +1 | +1 |
  | DEF vs direct fire | — | +1 | +2 (only +1 at distance 1) |
  | DEF vs explosions | — | — | +1 |
  | Vision | — | −1 | −2 |
  | Distance at which VC notice you | — | −1 | −2 |
  | Movement | normal | +1 AP per move | crawl 1 tile only, +1 AP |
  | Chance of being noticed while concealed | — | 50% | 30% |

  **Concealment (🌿):** a crouched or prone soldier on concealing terrain (vegetation/rubble with partial LOS, or cover ≥2) is concealed. A VC beyond distance 1 notices them only if within its alert distance **and** it passes a spotting roll (one roll per VC per turn): otherwise it doesn't get alerted and doesn't shoot at them, at most it moves toward the squad. At distance 1 you are always noticed. When a VC spots you, or when you fire / throw a noisy weapon, your position is **revealed** (👁) to all VC until the end of the enemy turn; the knife (noise 0) doesn't reveal you.
- **Ammo and reloading:** firearms have a magazine; every attack uses a round, and so does every overwatch shot and every suppressive-fire burst (which only trigger with a round chambered). When the magazine is empty the weapon card turns red and shows **🔄 Reload**: a click (or key **L**, 1 AP) refills the magazine using one of the spare magazines; once those run out, the knife is all that's left. Weapon cards show ammo as `rounds/magazine +spare`. On mobile with the sheet collapsed, reload is in the quick bar's **⋯** menu (flagged by a dot); if no weapon can fire anymore, the "Attack" button turns straight into "Reload".

  | Weapon | Magazine | Spare | Notes |
  |---|---|---|---|
  | M16 (Assault) | 3 | 4 | |
  | M16 (Engineer) | 3 | 3 | |
  | M14 (Sniper) | 1 | 10 | at most 1 shot per turn |
  | M1911 (Medic) | 2 | 3 | |

  The **Sniper** fires a single shot per turn and must reload after every shot: shooting + reloading takes 2 AP, or you shoot and reload next turn (also before setting overwatch, which needs a round chambered). The knife is always available. Grenades, smoke and the radio keep their limited uses without a magazine. VC have no magazines (the VC sniper still skips a turn after each shot).
- **Line of fire:** you can't shoot through a standing or crouched teammate on the line between shooter and target (you'd risk hitting them); a **prone** teammate doesn't block, you fire over them. It applies to direct attacks, overwatch and suppressive fire, not to grenades, RPGs and artillery. On desktop, in attack mode, an **aim ray** follows the mouse from the selected unit: green if the line of fire is clear, red if a teammate blocks it, orange if terrain or smoke block the view, grey if the point is outside the field of view or out of range; an ✕ marks what blocks it and the reason appears below the tile. On mobile there is no ray: only the attackable targets are highlighted.
- **VC traps (punji and mines):** hidden on the map. A soldier walking over one stops there and takes damage (punji 2 HP, mine 4 HP). The **Engineer** automatically spots traps at distance 1; a spotted trap is marked on the map, movement routes around it and the Engineer can **disarm** it with the special ability (1 AP). VC are immune.
- **Smoke grenades:** the Assault carries one smoke grenade (×1) creating a radius-1 screen for 2 turns. Smoke blocks line of sight: anyone inside sees and is seen only from distance 1. This applies to VC as well, who cannot fire through smoke.
- **VC line of sight:** VC follow the same sight rules as soldiers. Their sight is their alert distance (5, 3 at night); every intermediate tile of vegetation or rubble reduces it by 1, walls, bunkers and buildings block it, and so does smoke. A patrolling VC gets alerted only if it sees a soldier; an alerted VC fires only at someone in range **and** in sight, otherwise it advances to get a line of fire (it still knows where non-concealed soldiers are). This also applies to the VC sniper, who looks for positions with a view of the target, and to the random ambush. At distance 1 there is always line of sight.
- **Artillery support:** the Engineer carries the radio (one per squad, 1 use). The strike is called like an area weapon (range 10) but **lands at the start of the next turn**, after the VC move, on anyone in the area — US soldiers included, and VC hidden in the fog too. It isn't a precision strike: a **salvo of 5–6 rounds** comes in one after another, each on a random tile of the 5×5 square around the requested point (more likely near the centre), each with its own blast (radius 1, crater, shaken trees). The tile hit directly is destroyed: jungle, villages and gardens become **scorched earth** and burn for 2 turns, walls, buildings, temples and bunkers collapse into **rubble**, obstacles are blown away. The incoming salvo area is marked in red on the map (darker where rounds land); the preview shows, for each target, the chance of being hit by at least one round.
- **Napalm air strike:** the Engineer also carries a second radio (one per squad, 1 use). You pick a **line** of tiles: first click on the start tile (range 3–12), second click on the end tile, horizontal, vertical or diagonal, at most 5 tiles. Once confirmed, at the start of the next turn the shadow of a plane crosses the whole map in the chosen direction, edge to edge, dropping on the line's tiles one after another: a flash of flame and black smoke, then the tile stays **on fire for 2 turns** (jungle, villages and gardens become scorched earth; water and walls don't burn). Anyone on the line, US soldiers and hidden VC included, takes an ATK4 attack **with no terrain cover**. The incoming line stays marked on the map with an arrow showing the flight direction.
- **Night missions:** enabled from the briefing (or forced by the map with `"night": true`). Each soldier's vision drops by 1 (minimum 1), while the VC, who know the terrain, notice the squad from 3 tiles instead of 5. Since firing requires line of sight, at night even the Sniper can only hit within its reduced vision.
- **VC morale:** a VC below 30% HP (once per unit) and every VC within 4 tiles of a fallen commander become **routed** for 2 activations: they fall back away from the squad looking for cover and do not attack (white flag ⚐ on the map).

---

## Campaign

The **🎖 Campaign** card in the menu leads to a series of operations played by a **platoon of 8 named soldiers**, 4 of whom deploy at a time. What happens in a mission sticks:

| Soldier's state at mission end | Consequence |
|---|---|
| Unhurt (HP above 60%) | ready for the next operation |
| Wounded (HP ≤ 60%) | out for 1 operation |
| Badly wounded (HP < 30% or still bleeding) | out for 2 operations |
| Fallen | dead for good (wall of the fallen); in a **won** mission there is a 1-in-3 chance he is medevaced instead, out for 3 operations |

Soldiers left at HQ recover one operation of convalescence each time the platoon plays one.

**Headquarters (HQ).** Between missions you see the briefing, the platoon and the requisitions. Pick the soldiers to deploy (every ready one, up to 4) and, if the operation offers more than one, the mission. If nobody is ready, **Rest** lets an operation go by for the wounded.

**Experience and ranks.** At mission end each soldier earns XP: +1 for surviving, +1 per VC killed (explosives, overwatch, artillery, napalm and sealed tunnels included), +1 if the mission is won, +1 to the Medic per heal.

| Rank | XP | Bonus |
|---|---|---|
| Private (Pvt.) | 0 | — |
| Private First Class (PFC) | 3 | +1 HP |
| Corporal (Cpl.) | 7 | choice of one perk out of 2 |
| Sergeant (Sgt.) | 12 | second perk, +1 HP |

Perks: **Steady hand** (+1 ATK on overwatch, Sniper), **Tough** (+2 HP), **Quiet** (shots −1 noise), **Point man** (spots traps and tunnels like the Engineer), **Field medic** (heals 1 more HP). Perks are `config.json` data (`perks`): they can be changed or added.

**Requisition points (RP).** You start with 2. A won mission gives 3 (or the mission's reward), +1 if nobody is wounded or fallen; each fallen soldier costs 1. At HQ they buy:

| Purchase | Cost | Effect |
|---|---|---|
| Replacement | 2 RP | new private of the chosen class (up to 8 in the platoon) |
| Fast healing | 1 RP | a wounded soldier is available at once |
| Extra ammo | 1 RP | for the next operation: +1 spare magazine and +1 grenade/smoke each |
| Artillery salvo | 2 RP | +1 radio use (needs the Engineer carrying it) |
| Napalm strike | 3 RP | +1 napalm strike (needs the Engineer) |

Supplies can be returned until the operation starts.

**Defeat and retreat.** A failed mission can be retried, but the fallen stay fallen. Leaving the mission with ⌂ is a **retreat**: it counts as a failed mission, soldiers come back as they were at the last save, with no XP or RP. The campaign is won after the last operation and lost when, counting the wounded and the replacements you can pay for, you cannot field 4 soldiers.

**Mission choices and VC pressure.** In the **Dynamic campaign** (generated from the seed, on procedural maps) each operation offers three missions: **easy** (−2 VC, 2 RP), **normal** (3 RP), **hard** (+2 VC, 5 RP). Winning an easy one raises the **VC pressure** by 1 (up to 4), a hard one lowers it: each pressure point adds a VC to the following missions. The VC grow stronger operation after operation anyway.

The running campaign stays in the browser (`localStorage`); the mission in progress has its own save, separate from free games, shown in a second **resume** banner in the menu.

### Creating a campaign

A campaign is a JSON in `missions/campaigns/`, listed in `missions/campaigns/index.json` (`{ "campaigns": ["delta68.json", "dynamic.json"] }`):

```json
{
  "startRoster": ["assault", "assault", "sniper", "sniper", "engineer", "engineer", "medic", "medic"],
  "difficulty": { "reinforcementTurn": [6, 4] },
  "operations": [
    { "id": "op1", "map": "rung_sat.json", "missionType": "recon" },
    { "id": "op2", "choices": [
      { "id": "op2_pilot", "generator": "jungle", "size": "small", "missionType": "rescue_pilot" },
      { "id": "op2_raid", "map": "rung_sat.json", "missionType": "search_destroy", "night": true, "reward": 4,
        "overrides": { "vcCount": 7 } }
    ] }
  ],
  "rules": { "medevacChance": 0 },
  "translations": {
    "en": { "name": "My campaign", "description": "…",
            "ops": { "op1": { "name": "Operation Mangrove", "briefing": "…" }, "op2": { "name": "…" },
                     "op2_pilot": { "name": "…", "briefing": "…" }, "op2_raid": { "name": "…", "briefing": "…" } } },
    "it": { "…": "…" }
  }
}
```

- An **operation** is one mission (`map` in `missions/` or `generator` + `size`, `missionType`, `night`, `reward`) or a `choices` list of missions to choose from.
- **`overrides`** changes the map fields for that operation (VC, reinforcements, composition, weapons, `tuning`…), merged like `tuning`.
- **`difficulty`** is a curve between the first and last operation (`vcCount`, `reinforcementTurn`, `vcMix`), applied before the `overrides`.
- **`procedural`** instead of `operations` generates the operations from the seed (count, choices, generators, mission types, night chance).
- **`rules`** changes the rules: platoon, XP, ranks, recovery, medevac, RP, costs, supplies, levels and pressure. `"medevacChance": 0` = death is always permanent.

Every field is in the [field guide](docs/FIELDS_EN.md#campaign); `node tools/validate.js --all` checks campaigns too (existing maps, mission types playable on the map, `overrides` fields). The simulator plays whole campaigns with the bot: `node tools/sim/run.js --campaign delta68 --games 20` (with `--variant` to compare rules, e.g. `"CAMPAIGN_RULES.medevacChance=0.5"`).

---

## Auto-Save

The game **auto-saves** at the start of every player turn using the browser's localStorage. No player action is required.

When the game is reopened with a session in progress, a green banner appears on the map selection screen with the last session's info (map, mission type, turn, date and time). Press **▶ RESUME** to return exactly to the state you left.

The save is automatically cleared when the game ends (victory or defeat).

---

## Procedural Map

The **🎲 Uncharted Zone** (jungle) and **🎲 Uncharted City** (urban) theaters use no JSON file: the map is generated on the spot, in the size chosen in the briefing:

| Size | Tiles | Starting VC (jungle / city) |
|---|---|---|
| Small | 16×12 | 6–8 / 7–9 |
| Medium | 22×16 | 9–11 / 10–12 |
| Large | 28×20 | 12–14 / 13–15 |

On bigger maps, traps, obstacles and bunkers also grow in proportion. Reinforcements grow too (3 VC instead of 2), and so do ambushes, which trigger later and bring more VC. The jungle gets a third ford and the city a third bridge. Search & Destroy needs more kills (+2 per size step). The chosen size is remembered for the next games.

**Uncharted Zone** — delta jungle:

- one of five **layouts**, named in the briefing description:
  - a **river to cross**, perpendicular to the advance;
  - a **bend**: the river turns at an angle and closes off a pocket;
  - a river **parallel** to the advance, splitting the zone into two banks;
  - a **confluence**: two waterways split the zone into sectors;
  - a **swamp**: no river, but a wide swamp belt with a few ponds;
- rivers can only be crossed at **fords**: two or three, three or four with the confluence. Trails link the start, the fords and the objectives;
- clearings, swamps, a village, bunkers and demolishable obstacles;
- the squad starting on a **random edge** (north, south, east or west), objectives and VC toward the opposite side, ambushes on the flanks of the start;
- there are always at least **two separate routes** to the village, the LZ and the radio post, so you are never stuck in a single choke point;
- objectives for all 4 mission types (LZ, village and bunker to scout, radio post to hold; the pilot has moved away from the LZ and waits about 60% of the way from the extraction point, marked by smoke).

**Uncharted City** — a city district during the Tet Offensive:

- a grid of avenues and streets. Each block has its own character: dense buildings, park, ruins, temples or slums. An artillery strike has turned a cluster of buildings to rubble;
- one of five **layouts**, named in the briefing description:
  - a winding **river**, crossable only on the bridges (2–4);
  - a straight **canal** crossed by many bridges;
  - a **side canal** running along the advance, cutting off a strip of blocks reachable by bridges;
  - a **river on the flank**, closing off one side of the district with no need to cross it;
  - **no waterway**;
- on the side opposite the start, a **walled citadel** set against the edge, in a variable position (even in a corner). It has a main gate on the south or on a flank, a **second entrance** on another side and 1–3 **breachable walls** (engineer breach). Inside, pagodas and gardens surround the **NVA Command**;
- the squad starting on a **random edge**, VC throughout the district and inside the citadel, ambushes on the flanks of the start;
- there are always at least **two separate routes** to the command, the market and the wreck;
- objectives for all 4 mission types: pilot about 60% of the way from the extraction point to the wreck (outside the walls), marked by smoke; bridge (or pagoda, if there are no bridges), market and command to scout; command to hold.

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

### Menu Image

On wide screens (at least 900×560) the main menu has two columns: on the left the **Resume**, **Training**, **Single missions**, **Campaigns** and **Options** (language, audio, wind, mods, controls) entries, which open to show their lists; on the right a picture of the game with title and version, over which the chosen map's briefing appears. On mobile the step-by-step menu stays.

The default picture is `assets/menu_hero.jpg` (a game scene); replace it with `menuImage`:

```json
{
  "menuImage": "assets/my_cover.jpg"
}
```

It is cropped to fill the area and darkened at the bottom and left so the title stays readable: a landscape picture with the subject in the middle works best.

### Unit Images

By default every piece is a soldier seen from above, drawn by the game: the look depends on the class (helmet and M16 for the assault, boonie hat and scoped rifle for the sniper, radio on the back for the engineer, red cross for the medic, conical hat for the VC, pith helmet for the commander), the figure changes with the stance (standing, crouching, prone) and turns toward where the unit faces. A new class picks its look with the `sprite` field.

To replace the drawn soldier with your own pictures, set the file path for each class, either one picture or one per stance:

```json
{
  "unitImages": {
    "assault": "assets/assault.webp",
    "sniper":  { "stand": "assets/sniper.webp", "crouch": "assets/sniper_crouch.webp", "prone": "assets/sniper_prone.webp" }
  }
}
```

- The picture shows the soldier **from above, facing north (top of the image)**, on a transparent background, square: the game rotates it toward where the unit faces
- In the per-stance object, the missing stances use the `stand` picture
- Supported formats: **webp, png, jpg, svg**
- Set to empty string `""` to use the drawn soldier
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
    "stance":     "",
    "hit":        "assets/hit.mp3",
    "death":      "assets/death.mp3",
    "miss":       "",
    "ambush":     "assets/ambush.mp3",
    "demolition": "assets/explosion.mp3",
    "disarm":     "",
    "melee":      "",
    "reload":     "",
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
- `disarm` = the Engineer disarming a trap, `melee` = knife slash, `reload` = reloading, `stance` = changing stance
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

**Weapon fields:** every field, with allowed values and defaults, is in the [field guide](docs/FIELDS_EN.md#weapon).

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
| Engineer | M16 (ATK2, RNG3, ∞) | Radio: artillery (salvo of 5–6 ATK4 AoE1 rounds scattered over 5×5, RNG10, ×1, max 1 per squad), Radio: napalm (line of up to 5 tiles, ATK4 ignoring cover, RNG3–12, ×1, max 1 per squad) |
| Medic | M1911 (ATK1, RNG1, ∞) | — |
| VC Guerrilla | AK-47 (ATK2, RNG2, ∞) | RPG-7 (ATK4, RNG4, AoE1, ×1, max 1 carrier) |
| VC Sniper | Mosin (ATK3, RNG4, ∞) | — |
| VC Commander | TT-33 (ATK3, RNG2, ∞) | — |

### Squad classes

US classes are changed with `unitClasses` in `config.json`; a new name adds a class (it starts from the Assault's stats) that shows up right away among the briefing choices. Its weapons go in `weapons` under the same name, its picture in `unitImages`.

```json
"unitClasses": {
  "medic": { "hp": 9 },
  "machinegunner": {
    "labels": { "it": { "name": "Mitragliere", "desc": "Fuoco pesante, lento" },
                "en": { "name": "Machine gunner", "desc": "Heavy fire, slow" } },
    "symbol": "MG", "color": "#6a6a6a", "hp": 11, "move": 2, "attack": 3, "defense": 1,
    "range": 3, "vision": 4, "special": "suppression", "sprite": "assault"
  }
},
"weapons": { "machinegunner": [{ "id": "m60", "label": "M60", "atk": 4, "range": 4, "mag": 2, "mags": 2, "noise": 7 }] }
```

Every class field is in the [field guide](docs/FIELDS_EN.md#unit-class).

### Enemy classes

VC stats are changed with `enemyClasses` in `config.json`; a new name adds a class (it starts from the guerrilla's values). Its weapons go in `weapons` under the same name, its picture in `unitImages`. To make it appear in game, put it in a composition: `vcMix` in `config.json` (default for every map) or `vcMix`/`ambushMix`/`reinforcementMix` in the map.

```json
"enemyClasses": {
  "commander": { "hp": 9 },
  "nva": { "name": { "it": "Regolare NVA", "en": "NVA Regular" }, "role": "rifleman",
           "hp": 7, "attack": 3, "defense": 1, "sprite": "nva" }
},
"vcMix": { "spawn": { "grunt": 3, "sniper_vc": 1, "commander": 1, "nva": 1 } },
"weapons": { "nva": [{ "id": "ak47", "label": "AK-47", "atk": 3, "range": 3, "noise": 5, "sound": "assets/ak47.mp3" }] }
```

Every class field is in the [field guide](docs/FIELDS_EN.md#enemy-class).

In `config.json`, `vcMix` holds three compositions: `spawn` (initial deployment), `ambush`, `reinforcement`.

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

### Training (tutorial)

In the map selection, the **🎓 Training** card opens the list of guided lessons. Each one is a small mission with a preset squad and enemies, and an **instructor** at the top of the map explains step by step what to do. It points to the tile to reach with a yellow arrow and flashes the button to use. You progress by performing the requested action (or with **Next ▸** on description-only steps); the panel can be collapsed with **▾**.

| # | Lesson | Classes | Topics |
|---|---|---|---|
| 1 | First steps | Assault | selection, AP and terrain cost, undo, facing and turning, attacking and dice, turns |
| 2 | Shadows in the jungle | Assault | stance, VC vision cones, rear attacks, the silent knife, noise, concealment |
| 3 | Hawk eye | Sniper | range and penalty, one shot per turn, reloading, overwatch |
| 4 | Combat engineers | Engineer | traps, disarming, radio artillery, demolition, VC tunnels |
| 5 | Blood and bandages | Medic, Assault, Sniper | wounds, bleeding, panic, healing, first aid; pilot rescue |
| 6 | Joint operation | full squad | weapon cards, line of fire, VC tactics, suppressive fire, grenades |

Completed lessons get a ✓ (stored in the browser) and at the end of a lesson the **▶ Next lesson** button takes you to the next one. Lessons are not added to the stats history.

**Creating a lesson:** it's a regular map JSON in `missions/tutorial/`, listed in `missions/tutorial/index.json` (which also holds the shared tile types). Compared to a mission it has:
- **`squad` and `enemies`:** fixed squad and VC; `"hold": true` marks a sentry that stays put until alerted.
- **`tutorial` block:** `missionType` and the steps, `{ "id", "until", "highlight", "ui", "fresh" }`.
- **`until`:** either `"next"` (Next button) or an event, with fields to match and optionally `at` / `within` on position. The events are `select`, `move`, `rotate`, `stance`, `attack`, `kill`, `aoe`, `reload`, `firstaid`, `special` (with `kind`: `overwatch`, `suppression`, `heal`, `disarm`, `demolish`, `burn`, `seal`), `trapFound`, `tunnelFound`, `endTurn`, `turnStart`.
- **Step texts:** they live in `translations.<lang>.tutorial.<id>`.

### End-of-mission stats

When a mission ends (win or loss), a **stats summary** appears below the outcome:
- **Mission:** turns, survivors, VC killed, HP left.
- **Squad and VC fire:** hits with the **actual** accuracy compared to the **expected** one (same dice formula: if actual is well below, it was bad luck), damage, flank and rear attacks, overwatch, suppressions, explosives, knife kills, friendly fire, VC ambush shots, RPGs.
- **Ammo:** rounds fired, reloads, spare magazines and grenades left.
- **Wounds and care:** bleeding, HP lost and deaths from bleeding, first aid, medic heals, traps.
- **Stealth:** VC alerted by noise (squad's and VC gunfire), times a VC spotted you or didn't notice you.
- **Last missions:** averages over the last missions played (up to 50, stored in the browser): wins, turns, KIA, accuracy.

The **📋 Copy stats** button copies everything as text, raw data included: handy for comparing games and tuning the balance numbers.

### Desktop Hotkeys

Keyboard shortcuts are active only during the **player phase** and when no dice roll is in progress.

| Key | Action |
|---|---|
| `M` | Move mode |
| `A` | Attack mode (main weapon) |
| `1`–`9` | Attack with the matching weapon card (or reload it, if empty) |
| `S` | Special ability mode |
| `R` | Turn (free, once per turn) |
| `C` | Stance |
| `L` | Reload |
| `H` | First aid (once per mission) |
| `Enter` | End turn (in the confirmation dialog: confirm) |
| `Esc` | Cancel current mode (in the confirmation dialog: cancel) |
| `U` / `Ctrl+Z` | Undo last move |
| `Tab` / `Shift+Tab` | Select next / previous unit with AP |

**Undo move:** only the last move can be undone, and only if it revealed no new enemies and did not change the mission state (pilot picked up, zone scouted). Any other action (attack, special ability, reload, first aid, end turn) makes it final; a turn or stance change made after the move is undone along with it.

**Hit chance:** in attack mode, the hit percentage is shown above each target (same formula as combat: 2d6+ATK vs DEF+cover+1d6, range penalty, stance and wounds included). The percentage is colored: green from 75%, yellow from 50%, red below. On desktop the target tooltip also shows the average damage, the kill chance and, on a second line, the ATK and DEF breakdown (weapon, range, wound, stance, rear, cover or guard). On mobile the **first tap** on an enemy aims at it and shows the same breakdown in the panel; the **second tap** (or the 🎯 Fire button) shoots. For grenades and RPGs, before confirming, each target in the blast shows its own percentage; squad soldiers are outlined in red and the panel warns about friendly fire.

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

Example with the main fields (every field, with allowed values and defaults, is in the [field guide](docs/FIELDS_EN.md#map)):

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
  "nightVisionPenalty": 1,
  "vcNightPenalty": 2,

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

### Other map fields

Traps, tunnels, night, weather, fixed squad and VC, ambushes and reinforcements: the full list is in the [field guide](docs/FIELDS_EN.md#map).

### Optional fields: weapons, enemies and balance

They apply only to this map's mission: the next mission goes back to the `config.json` and game values.

The fields are described in the [field guide](docs/FIELDS_EN.md#map); the values `tuning` can change, group by group, in the [`tuning` groups](docs/FIELDS_EN.md#tuning) section.

```json
"weapons": {
  "assault": { "grenade": { "ammo": 4 }, "smoke": null },
  "medic": [{ "id": "shotgun", "label": "Ithaca 37", "atk": 3, "range": 1, "noise": 4 }]
},
"vcMix": { "grunt": 2, "nva": 3, "commander": 1 },
"reinforcementMix": { "nva": 1 },
"tuning": {
  "VC_TACTICS": { "holdChance": 0.8 },
  "ENEMY_CLASSES": { "commander": { "hp": 10 } },
  "STANCES": { "prone": { "def": 3 } }
}
```

### Tile Type Fields

See the [field guide](docs/FIELDS_EN.md#tile).

### Objective Types

Objectives go in `objectives`, one per mission type (`recon`, `search_destroy`, `rescue_pilot`, `capture_objective`; fields in the [field guide](docs/FIELDS_EN.md#map)). You can include only the types you want to support and declare them in `supportedMissions`.

### Optional Files

| File | Description |
|---|---|
| `missions/my_map.jpg` | Background image (replaces colored tiles); declared with `"image": "my_map.jpg"` |
| `missions/my_map_ambient.ogg` | Ambient music looping during the game |
| `"sounds": { "move": "..." }` | Map-specific SFX (override `config.json`) |

### Checking a map

The game checks a map when loading it. If there are **errors** (grid not matching `cols`/`rows`, grid character missing from `tileTypes`, coordinates outside the map, objectives unreachable from the start, nonexistent classes or tiles, invalid JSON…) the map does not start and the briefing lists them with the field path (e.g. `tileTypes.J.moveCost`). **Warnings** (unknown fields, often typos, with the closest name; invalid colors or textures; missing translations) go to the browser console and the map starts anyway. `config.json` and the catalog are also checked at startup, with results in the console.

The same checks, plus the existence of the referenced files (images, sounds, music), run without opening the game (Node.js required):

```
node tools/validate.js missions/my_map.json
node tools/validate.js --all
```

`--all` checks `config.json`, the catalog and its maps, the tutorial lessons and the procedural maps over several seeds; `--lang en` gives English messages. It exits with code 1 if it finds errors.

While typing, the JSON Schemas in `schemas/` give the editor field autocompletion, field descriptions and the same type checks: VS Code uses them by itself, other editors (Zed, JetBrains…) with `"$schema": "../schemas/mission.schema.json"` at the top of the map. The [field guide](docs/FIELDS_EN.md) and the schemas are generated from `js/schema.js` by `node tools/schema-docs.js`.

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

---

## Mods

A mod keeps classes, weapons, enemies and maps in a folder of its own, without touching `config.json`, the catalog or the game files. Mods are turned on from the start menu with the **🧩 Mods** button, shown when there is at least one: choices apply from the next page load (the **Apply and reload** button does it right away) and are remembered by the browser. A game saved with mods can only be resumed with those mods on.

```
mods/
  index.json              mod list: { "mods": ["nva_regulars"] }
  nva_regulars/
    mod.json              description, additions to config.json, maps, campaigns
    avamposto.json        a map of the mod
    campaign.json         a campaign of the mod
```

The list in `mods/index.json` is needed because the game, as a static site, cannot read a folder's contents; its order is the order mods are applied in (when two change the same thing, the last one wins).

```json
{
  "labels": {
    "it": { "name": "Regolari NVA", "desc": "Regolari nordvietnamiti nei rinforzi, più una mappa" },
    "en": { "name": "NVA Regulars", "desc": "North Vietnamese regulars in the reinforcements, plus a map" }
  },
  "author": "Me",
  "version": "1.0",
  "config": {
    "enemyClasses": { "nva": { "name": { "it": "Regolare NVA", "en": "NVA Regular" }, "role": "rifleman", "hp": 7, "attack": 3, "sprite": "nva" } },
    "weapons": { "nva": [{ "id": "ak47", "label": "AK-47", "atk": 3, "range": 3, "sound": "../../assets/ak47.mp3" }] },
    "vcMix": { "reinforcement": { "nva": 1 } }
  },
  "maps": [
    { "file": "avamposto.json", "icon": "⭐", "labels": { "en": { "label": "NVA Outpost", "subtitle": "Highlands · 1968" } } }
  ]
}
```

- **`config`** has the same fields as `config.json` and is added to it: classes and compositions are merged, pictures and sounds replaced by key, weapons follow the rules of the maps' `weapons` field (an array replaces the class loadout, an object changes weapons by `id`).
- **`maps`** has the same entries as `missions/catalog.json`; `file` is the map JSON in the mod folder. Mod maps are ordinary maps and can use the mod's classes.
- **`campaigns`** lists the mod's [campaigns](#campaign), JSON files in its folder (`"campaigns": ["campaign.json"]`); their `map` starts from there, so a game map is referenced as `"../../missions/hue_city.json"`.
- **Paths** in `mod.json` and in its maps (pictures, sounds, music, textures, `image`) start from the mod folder; `../../` goes up to the game folder, to reuse its files (`"../../assets/ak47.mp3"`).

The example mod `mods/nva_regulars/` shows every part. A mod with errors (wrong fields, nonexistent classes, missing files) is not applied: the mod menu shows the first error and the browser console the full list. `node tools/validate.js --all` checks mods and their maps too; every `mod.json` field is in the [field guide](docs/FIELDS_EN.md#mod).
