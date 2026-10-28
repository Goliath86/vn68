# Changelog

## 1.1.5 — 2026-10-28

### New
- **Contextual click on desktop**: without picking an action, clicking a reachable tile moves the soldier and clicking a VC in range fires, with a path and cost preview. Right-click cancels the action and turns the soldier toward the spot.
- **Field of view**: outline of what the selected soldier actually sees, a veil on tiles seen only by squadmates, "who sees whom" lines when hovering soldiers and VC. Colored labels on map outlines.
- **Animations**: soldier walking with smooth turning and adjustable movement speed, recoil when firing and flinch when hit, animated stance changes, gestures for throwing, radio, bandaging and engineer work.
- **Terrain that reacts to footsteps**: splashes in water, rustling foliage in the jungle, dust elsewhere.

### Audio
- Different footsteps for each terrain type (ford, swamp and more), overwatch and suppressive fire sound, bird flocks.
## 1.1.0 — 2026-10-25

### New
- **Campaign / platoon**: a persistent platoon of 8 soldiers (4 deployed per operation), wounds that keep soldiers out of action, permanent deaths and a memorial wall. Experience and ranks (Pvt → Sgt) with hit points and perks, requisition points for replacements, treatment and equipment. Easy/normal/hard operations with rising VC pressure. Two campaigns: *Delta '68* (fixed) and a procedural one generated from a seed.
- **New pieces**: top-down soldiers drawn by the game replace the portraits, with per-class look, stance, facing, shadow and a fall on death.
- **Soldier animations**: breathing, looking around, scanning, checking the weapon and reloading (can be turned off in Options).
- **Redesigned desktop menu**: accordion entries on the left, picture with title and version on the right, briefing in a tab. Mobile keeps the step-by-step menu.

### Audio
- New effects: reload, stance change, smoke grenade, demolitions, trap disarming, melee, VC reinforcements, napalm jet and flames, victory and defeat.
- Urban ambience and street footsteps for Hue City and Uncharted City.

### Modding
- Campaigns in mods (example in *nva_regulars*), `perks` and `soldierNames` in `config.json`.
- `unitImages` accepts one top-down picture or one per stance (`stand`/`crouch`/`prone`); terrain `sound` field for different footsteps per terrain; `menuImage` for the menu picture.

### Other
- Rung Sat no longer has a background picture: it now uses the terrain drawn by the game.
