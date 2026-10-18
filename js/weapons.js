/**
 * Return the weapon currently selected for a unit (or null if none configured)
 * @param {object} unit The unit object
 * @returns {object|null} The weapon currently selected for the unit, or null if none configured
 */
function unitWeapon(unit) {
  return unit.weapons && unit.weapons.length > 0
    ? unit.weapons[unit.weaponIdx ?? 0]
    : null;
}

/**
 * Nome dell'arma nella lingua corrente: "label" + lingua ("labelEn"),
 * altrimenti "label" (l'italiano)
 * @param {object} w
 * @returns {string}
 */
function weaponLabel(w) {
  if (!w) return "";
  const key = "label" + LANG.charAt(0).toUpperCase() + LANG.slice(1);
  return (LANG !== "it" && w[key]) || w.label || w.id || "";
}

// Tutti i nomi dell'arma (label, labelEn, …): per gli attacchi che si
// risolvono dopo (artiglieria, napalm) e restano traducibili
function weaponLabelFields(w) {
  return Object.fromEntries(Object.entries(w || {}).filter(([k]) => k.startsWith("label")));
}

// ── MUNIZIONI ──────────────────────────────────────────────────────────
// `ammo`: usi totali (granate, fumogeni, radio), null = illimitati.
// `mag`: colpi per caricatore (ogni attacco ne consuma 1), `loaded` quelli
// rimasti; `mags`: caricatori di riserva (null = illimitati); ricaricare
// costa `reloadAp` AP (default 1). `shotsPerTurn`: limite di attacchi per
// turno (il cecchino mira: 1), `shotsThisTurn` azzerato a inizio turno.
const DEFAULT_RELOAD_AP = 1;

/**
 * Arma utilizzabile adesso: usi rimasti, colpo in canna, limite per turno
 * @param {object} unit
 * @param {object} w
 * @returns {boolean}
 */
function weaponUsable(unit, w) {
  if (w.ammo != null && w.ammo <= 0) return false;
  if (w.mag && (w.loaded ?? w.mag) <= 0) return false;
  if (w.shotsPerTurn && (w.shotsThisTurn || 0) >= w.shotsPerTurn) return false;
  return true;
}

/**
 * L'unità ha almeno un'arma utilizzabile
 * @param {object} unit
 * @returns {boolean}
 */
function canAttack(unit) {
  return unit?.weapons?.length
    ? unit.weapons.some((w) => weaponUsable(unit, w))
    : true;
}

// Toglie un colpo dal caricatore (armi senza `mag`: nessun effetto)
function spendRound(w) {
  if (!w?.mag) return;
  w.loaded = Math.max(0, (w.loaded ?? w.mag) - 1);
  statAdd("roundsFired");
}

// Consuma un attacco: un uso, un colpo del caricatore, uno dei colpi del turno
function consumeShot(w) {
  if (!w) return;
  if (w.ammo != null) w.ammo--;
  spendRound(w);
  w.shotsThisTurn = (w.shotsThisTurn || 0) + 1;
}

// Colpo in canna per i fuochi di reazione (overwatch, soppressione)
function hasRoundLoaded(w) {
  return !w?.mag || (w.loaded ?? w.mag) > 0;
}

function weaponReloadAp(w) {
  return w?.reloadAp ?? DEFAULT_RELOAD_AP;
}

// Arma che si può ricaricare: caricatore non pieno e riserva disponibile
function weaponNeedsReload(w) {
  return !!w?.mag && (w.loaded ?? w.mag) < w.mag && (w.mags == null || w.mags > 0);
}

// Arma usata dal bottone Attacca (e dal tasto A): la prima arma a fuoco
// diretto utilizzabile nell'ordine del loadout (fucile, poi coltello),
// altrimenti la prima utilizzabile (es. granata). Le altre si scelgono
// dalle schede armi.
function defaultAttackWeapon(u) {
  const usable = (u?.weapons || []).filter((w) => weaponUsable(u, w));
  return usable.find((w) => !isAreaWeapon(w)) ?? usable[0] ?? null;
}

// Arma che si punta su un tile invece che su un nemico: AoE (granate, RPG,
// artiglieria) o napalm (linea di tile, mechanics.js)
function isAreaWeapon(w) {
  return !!(w?.aoe || w?.napalm);
}

// Etichetta dell'area nelle schede armi: " · AoE1", napalm " · 🔥5"
function weaponAreaTag(w) {
  if (w?.napalm) return ` · 🔥${napalmLength(w)}`;
  return w?.aoe ? ` · AoE${w.aoe}` : "";
}

// Prima arma ricaricabile dell'unità (null se nessuna)
function reloadableWeapon(unit) {
  return unit?.weapons?.find(weaponNeedsReload) ?? null;
}

// Etichetta munizioni: "2/3 +4" (caricatore e riserva), "×2" (usi), "∞"
function weaponAmmoLabel(w) {
  if (w.mag) {
    const reserve = w.mags == null ? "" : ` +${w.mags}`;
    return `${w.loaded ?? w.mag}/${w.mag}${reserve}`;
  }
  return w.ammo == null
    ? t("weapons.ammo_inf")
    : t("weapons.ammo_tag", { n: w.ammo });
}

// Overwatch e fuoco soppressivo si attivano solo con un colpo in canna
function specialBlockedByAmmo(unit) {
  return (
    ["overwatch", "suppression"].includes(unitSpecial(unit)) &&
    !hasRoundLoaded(unitFireWeapon(unit))
  );
}

// Arma da fuoco con il caricatore vuoto (per segnalarlo nell'interfaccia)
function weaponEmpty(w) {
  return !!w?.mag && (w.loaded ?? w.mag) <= 0;
}

/**
 * Arma di fuoco diretto di un'unità (usata da overwatch e soppressione):
 * prima arma non-AoE e non da mischia del loadout, o null se non configurata
 * @param {object} unit
 * @returns {object|null}
 */
function unitFireWeapon(unit) {
  return unit.weapons?.find((w) => !isAreaWeapon(w) && !w.melee) ?? null;
}

/**
 * Gittata di fuoco diretto di un'unità, fallback sulla gittata della classe
 * @param {object} unit
 * @returns {number}
 */
function unitFireRange(unit) {
  return unitFireWeapon(unit)?.range ?? UNIT_CLASSES[unit.cls].range;
}

/**
 * Penalità gittata (-1 ATK ogni 2 tile): campo `rangePenalty` dell'arma,
 * fallback sulle classi `marksman` (cecchino) se l'arma non lo specifica
 * @param {object} unit
 * @param {object|null} weapon
 * @param {number} range distanza dal bersaglio
 * @returns {number}
 */
function weaponRangePenalty(unit, weapon, range) {
  const applies = weapon?.rangePenalty ?? !!UNIT_CLASSES[unit.cls]?.marksman;
  return applies ? Math.floor((range - 1) / 2) : 0;
}

/**
 * Gittata minima di un'arma: per le armi AoE, se non specificata, è aoe + 1
 * così chi lancia non può mai trovarsi nel raggio dell'esplosione
 * @param {object|null} weapon
 * @returns {number}
 */
function weaponMinRange(weapon) {
  if (weapon?.minRange != null) return weapon.minRange;
  return weapon?.aoe ? weapon.aoe + 1 : 0;
}
