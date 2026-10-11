// ── STATISTICHE DI MISSIONE ────────────────────────────────────────────
// Contatori raccolti durante la partita in G.missionState.stats (finiscono
// nel salvataggio), riepilogo a fine missione nel pannello di game over e
// storico delle ultime missioni in localStorage, per bilanciare i numeri
// con dati reali. Il riepilogo si può copiare come testo.
const STATS_HISTORY_KEY = "vn68_stats_history";
const STATS_HISTORY_MAX = 50;

function newMissionStats() {
  return {
    // Fuoco US (attacchi diretti; usExpHits = somma delle probabilità di colpire)
    usShots: 0, usHits: 0, usExpHits: 0, usDmg: 0, usFlank: 0, usRear: 0,
    meleeKills: 0, owShots: 0, owHits: 0, suppressions: 0, aoeUs: 0,
    artillery: 0, friendlyFire: 0,
    // Fuoco VC
    vcShots: 0, vcHits: 0, vcExpHits: 0, vcDmg: 0, vcFlank: 0, vcRear: 0,
    vcAmbushFire: 0, aoeVc: 0,
    // Logistica
    roundsFired: 0, reloads: 0,
    // Ferite e cure
    bleedStarts: 0, bleedDmg: 0, bledOut: 0, firstAid: 0, medicHeal: 0,
    bleedStopped: 0, traps: 0, trapDmg: 0,
    // Furtività
    noiseAlerts: 0, vcNoiseAlerts: 0, spotted: 0, unnoticed: 0,
    // Guerriglia VC (guerrilla.js)
    tunnelDives: 0, tunnelEmerges: 0, tunnelsSealed: 0, trapsPlanted: 0,
  };
}

function missionStats() {
  const ms = G.missionState;
  if (!ms) return null;
  ms.stats = ms.stats || newMissionStats();
  return ms.stats;
}

function statAdd(key, n = 1) {
  const s = missionStats();
  if (s && n) s[key] = (s[key] || 0) + n;
}

// Un attacco diretto risolto (resolveCombat / overwatch): pHit dalla stessa
// formula dei dadi, così si confronta la precisione reale con quella attesa
function statAttack(isUs, pHit, dmg, sector) {
  const p = isUs ? "us" : "vc";
  statAdd(p + "Shots");
  statAdd(p + "ExpHits", pHit);
  if (dmg > 0) {
    statAdd(p + "Hits");
    statAdd(p + "Dmg", dmg);
  }
  if (sector === "side") statAdd(p + "Flank");
  if (sector === "rear") statAdd(p + "Rear");
}

// Munizioni rimaste alla squadra: caricatori di riserva e usi delle armi limitate
function remainingAmmo() {
  let mags = 0,
    emptyGuns = 0,
    uses = 0;
  for (const u of G.units) {
    if (!u.alive) continue;
    for (const w of u.weapons || []) {
      if (w.mag && w.mags != null) mags += w.mags;
      if (weaponEmpty(w) && !weaponNeedsReload(w)) emptyGuns++;
      if (w.ammo != null) uses += w.ammo;
    }
  }
  return { mags, emptyGuns, uses };
}

const _pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);

function missionSummary(win) {
  const s = { ...newMissionStats(), ...missionStats() };
  const alive = G.units.filter((u) => u.alive);
  const ammo = remainingAmmo();
  return {
    date: new Date().toISOString().slice(0, 16).replace("T", " "),
    map: (mt("name") ?? G.mapData?.name ?? "?").toString(),
    mission: G.missionType,
    night: !!G.missionState?.night,
    win,
    turns: G.turn,
    squad: G.units.map((u) => u.cls),
    survivors: alive.length,
    kia: G.units.length - alive.length,
    vcKilled: G.enemies.filter((e) => !e.alive).length,
    vcTotal: G.enemies.length,
    hpLeftPct: _pct(
      alive.reduce((a, u) => a + u.hp, 0),
      alive.reduce((a, u) => a + u.maxHp, 0),
    ),
    spareMags: ammo.mags,
    emptyGuns: ammo.emptyGuns,
    usesLeft: ammo.uses,
    ...s,
  };
}

function loadStatsHistory() {
  try {
    const h = JSON.parse(localStorage.getItem(STATS_HISTORY_KEY) || "[]");
    return Array.isArray(h) ? h : [];
  } catch (e) {
    return [];
  }
}

function saveStatsHistory(summary) {
  const h = loadStatsHistory();
  h.push(summary);
  try {
    localStorage.setItem(
      STATS_HISTORY_KEY,
      JSON.stringify(h.slice(-STATS_HISTORY_MAX)),
    );
  } catch (e) {
    // localStorage pieno o bloccato: lo storico è solo un aiuto
  }
  return h.slice(-STATS_HISTORY_MAX);
}

// Medie sullo storico (la missione appena finita compresa)
function historyAggregate(h) {
  const n = h.length;
  if (!n) return null;
  const sum = (k) => h.reduce((a, x) => a + (x[k] || 0), 0);
  return {
    n,
    wins: h.filter((x) => x.win).length,
    turns: (sum("turns") / n).toFixed(1),
    kia: (sum("kia") / n).toFixed(1),
    usAcc: _pct(sum("usHits"), sum("usShots")),
    usExp: _pct(sum("usExpHits"), sum("usShots")),
    vcAcc: _pct(sum("vcHits"), sum("vcShots")),
    vcExp: _pct(sum("vcExpHits"), sum("vcShots")),
    ambush: (sum("vcAmbushFire") / n).toFixed(1),
    bledOut: sum("bledOut"),
  };
}

// Righe del riepilogo: [sezione, [[etichetta, valore], ...]]
function summaryRows(s, agg) {
  const acc = (h, n, e) =>
    n ? `${h}/${n} (${_pct(h, n)}% · ${t("stats.expected")} ${_pct(e, n)}%)` : "—";
  const rows = [
    [t("stats.sec_mission"), [
      [t("stats.turns"), s.turns],
      [t("stats.survivors"), `${s.survivors}/${s.squad.length}`],
      [t("stats.vc_killed"), `${s.vcKilled}/${s.vcTotal}`],
      [t("stats.hp_left"), s.hpLeftPct == null ? "—" : `${s.hpLeftPct}%`],
    ]],
    [t("stats.sec_us_fire"), [
      [t("stats.hits"), acc(s.usHits, s.usShots, s.usExpHits)],
      [t("stats.dmg_dealt"), s.usDmg],
      [t("stats.flank_rear"), `${s.usFlank} / ${s.usRear}`],
      [t("stats.melee_kills"), s.meleeKills],
      [t("stats.overwatch"), `${s.owHits}/${s.owShots}`],
      [t("stats.suppressions"), s.suppressions],
      [t("stats.explosives"), `${s.aoeUs} · ${t("stats.artillery")} ${s.artillery}`],
      [t("stats.friendly_fire"), s.friendlyFire],
    ]],
    [t("stats.sec_vc_fire"), [
      [t("stats.hits"), acc(s.vcHits, s.vcShots, s.vcExpHits)],
      [t("stats.dmg_taken"), s.vcDmg],
      [t("stats.flank_rear"), `${s.vcFlank} / ${s.vcRear}`],
      [t("stats.vc_ambush"), s.vcAmbushFire],
      [t("stats.vc_rpg"), s.aoeVc],
    ]],
    [t("stats.sec_logistics"), [
      [t("stats.rounds_fired"), s.roundsFired],
      [t("stats.reloads"), s.reloads],
      [t("stats.spare_mags"), s.spareMags],
      [t("stats.uses_left"), s.usesLeft],
    ]],
    [t("stats.sec_wounds"), [
      [t("stats.bleeding"), `${s.bleedStarts} · −${s.bleedDmg} HP · ${t("stats.bled_out")} ${s.bledOut}`],
      [t("stats.first_aid"), s.firstAid],
      [t("stats.medic"), `+${s.medicHeal} HP · ${t("stats.bleed_stopped")} ${s.bleedStopped}`],
      [t("stats.traps"), `${s.traps} · −${s.trapDmg} HP`],
    ]],
    [t("stats.sec_stealth"), [
      [t("stats.noise_alerts"), `${s.noiseAlerts} · ${t("stats.vc_noise")} ${s.vcNoiseAlerts}`],
      [t("stats.spotting"), `${s.spotted} / ${s.unnoticed}`],
    ]],
    [t("stats.sec_guerrilla"), [
      [t("stats.tunnel_use"), `${s.tunnelDives} / ${s.tunnelEmerges}`],
      [t("stats.tunnels_sealed"), s.tunnelsSealed],
      [t("stats.traps_planted"), s.trapsPlanted],
    ]],
  ];
  if (agg)
    rows.push([t("stats.sec_history", { n: agg.n }), [
      [t("stats.wins"), `${agg.wins}/${agg.n}`],
      [t("stats.avg_turns_kia"), `${agg.turns} · ${agg.kia}`],
      [t("stats.avg_us_acc"), agg.usAcc == null ? "—" : `${agg.usAcc}% (${t("stats.expected")} ${agg.usExp}%)`],
      [t("stats.avg_vc_acc"), agg.vcAcc == null ? "—" : `${agg.vcAcc}% (${t("stats.expected")} ${agg.vcExp}%)`],
      [t("stats.avg_ambush"), agg.ambush],
    ]]);
  return rows;
}

function summaryHTML(rows) {
  return rows
    .map(
      ([title, items]) =>
        `<div class="go-sec"><div class="go-sec-title">${title}</div>${items
          .map(([k, v]) => `<div class="go-row"><span>${k}</span><span>${v}</span></div>`)
          .join("")}</div>`,
    )
    .join("");
}

// Testo da copiare: riepilogo leggibile + dati grezzi della missione
function summaryText(rows, summary) {
  const lines = [
    `VIETNAM '68 — ${summary.map} · ${summary.mission}${summary.night ? " · night" : ""} · ${summary.win ? "WIN" : "LOSS"} · ${summary.date}`,
  ];
  for (const [title, items] of rows) {
    lines.push(`\n[${title}]`);
    for (const [k, v] of items) lines.push(`${k}: ${v}`);
  }
  lines.push("\nraw: " + JSON.stringify(summary));
  return lines.join("\n");
}

function copyText(text) {
  if (navigator.clipboard?.writeText)
    return navigator.clipboard.writeText(text).then(() => true, () => copyTextFallback(text));
  return Promise.resolve(copyTextFallback(text));
}

function copyTextFallback(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (e) {}
  ta.remove();
  return ok;
}

// Chiamato da showGameOver: riempie il pannello e aggiorna lo storico
function renderMissionStats(win) {
  const el = document.getElementById("go-stats");
  if (!el) return;
  const summary = missionSummary(win);
  const history = saveStatsHistory(summary);
  const rows = summaryRows(summary, historyAggregate(history));
  el.innerHTML = summaryHTML(rows);
  const btn = document.getElementById("btn-copy-stats");
  if (btn) {
    btn.textContent = t("stats.copy");
    btn.onclick = () =>
      copyText(summaryText(rows, summary)).then((ok) => {
        btn.textContent = ok ? t("stats.copied") : t("stats.copy_failed");
      });
  }
}
