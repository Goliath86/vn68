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
  if (w?.mag) w.loaded = Math.max(0, (w.loaded ?? w.mag) - 1);
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
    (unit?.cls === "sniper" || unit?.cls === "assault") &&
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
  return unit.weapons?.find((w) => !w.aoe && !w.melee) ?? null;
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
 * fallback sulla classe cecchino se l'arma non lo specifica
 * @param {object} unit
 * @param {object|null} weapon
 * @param {number} range distanza dal bersaglio
 * @returns {number}
 */
function weaponRangePenalty(unit, weapon, range) {
  const applies = weapon?.rangePenalty ?? unit.cls === "sniper";
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
