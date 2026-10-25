#!/usr/bin/env node
// Simulatore di partite headless. Esempi:
//   node tools/sim/run.js --map jungle --size large --games 50
//   node tools/sim/run.js --map urban --mission search_destroy --variant "noflank:VC_TACTICS.flankMinGroup=99"
//   node tools/sim/run.js --map rung_sat --games 20 --log 0
// Opzioni:
//   --map jungle|urban|<file in missions/ senza .json>   (default jungle)
//   --size small|medium|large      mappe procedurali (default small)
//   --mission <tipo>|random        default random tra quelle supportate dalla mappa
//   --games N  --seed S            partite e primo seed (default 30, 1)
//   --squad a,b,c,d                classi (default assault,sniper,engineer,medic)
//   --night                        missione notturna
//   --max-turns N                  oltre: partita "timeout" (default 40)
//   --set "EXPR;EXPR"              assegnazioni JS applicate a tutte le partite
//                                  (es. "VC_TACTICS.flankShare=0.5;SIM_BOT.minShotPHit=0.4")
//   --variant "nome:EXPR;EXPR"     ripetibile: confronta varianti sugli stessi seed
//                                  (la variante "base" senza modifiche c'è sempre)
//   --json file                    salva i riepiloghi di ogni partita
//   --log N                        stampa il log completo della partita N (indice)
//   --campaign <id>|<file>         gioca campagne intere (missions/campaigns/<id>.json
//                                  o un percorso): --games = campagne; scelte del bot
//                                  all'HQ in bot.js:simCampaignHQ
//   --choice normal|first|hard|random  missione scelta nelle operazioni a scelta
"use strict";
const fs = require("fs");
const { createGame } = require("./env");

function parseArgs(argv) {
  const o = { map: "jungle", size: "small", mission: "random", games: 30, seed: 1,
    squad: "assault,sniper,engineer,medic", night: false, maxTurns: 40, set: "",
    variants: [], json: null, log: null, campaign: null, choice: "normal" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--map") o.map = next();
    else if (a === "--size") o.size = next();
    else if (a === "--mission") o.mission = next();
    else if (a === "--games") o.games = +next();
    else if (a === "--seed") o.seed = +next();
    else if (a === "--squad") o.squad = next();
    else if (a === "--night") o.night = true;
    else if (a === "--max-turns") o.maxTurns = +next();
    else if (a === "--set") o.set = next();
    else if (a === "--variant") {
      const v = next();
      const idx = v.indexOf(":");
      o.variants.push({ name: v.slice(0, idx), code: v.slice(idx + 1) });
    } else if (a === "--json") o.json = next();
    else if (a === "--log") o.log = +next();
    else if (a === "--campaign") o.campaign = next();
    else if (a === "--choice") o.choice = next();
    else if (a === "--help" || a === "-h") {
      console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 25).join("\n"));
      process.exit(0);
    } else throw new Error(`opzione sconosciuta: ${a}`);
  }
  return o;
}

async function playGame(opts, variant, index) {
  const seed = opts.seed + index;
  const g = await createGame({ seed: seed * 7919 + 13, logs: opts.log === index });
  const { ctx, sim, run } = g;
  ctx.__opts = { ...opts, mapSeed: seed };
  if (opts.map === "jungle" || opts.map === "urban")
    run(`useMission(generateProceduralMap(__opts.map, __opts.mapSeed, __opts.size))`);
  else await run(`loadMission("missions/" + __opts.map + ".json")`);

  const supported = run("G.mapData.supportedMissions") || ["search_destroy"];
  const mission =
    opts.mission === "random" ? supported[index % supported.length] : opts.mission;
  run(opts.set);
  run(variant.code);
  run(`SIM_BOT.maxTurns = ${opts.maxTurns}`);
  ctx.__squad = opts.squad.split(",");
  ctx.__mission = mission;
  run(`simReset(); startGame(__mission, __squad, { night: ${opts.night} })`);
  const result = await playTurns(g, opts);
  const summary = sim.summary ?? run("missionSummary(false)");
  if (sim.logs) console.log(`\n── log partita ${index} (${variant.name}) ──\n` + sim.logs.join("\n"));
  return { ...JSON.parse(JSON.stringify(summary)), result, variant: variant.name, seed, mission };
}

// Turni fino alla fine della missione: "win", "loss", "stuck" (pilota non
// più recuperabile) o "timeout"
async function playTurns(g, opts) {
  const { sim, run } = g;
  sim.result = null;
  sim.summary = null;
  // Partita non più vincibile: pilota trovato ma chi lo portava è morto
  const stuck = () =>
    run(`G.missionType === "rescue_pilot" && G.missionState.pilotFound &&
         !G.units.some((u) => u.alive && u.carriesPilot)`);
  const retreat = () =>
    opts.campaign &&
    run(`SIM_BOT.campaignRetreatAt > 0 && G.units.some((u) => !u.alive) &&
         G.units.filter((u) => u.alive).length <= SIM_BOT.campaignRetreatAt`);
  while (run("G.phase") !== "gameover" && run("G.turn") <= opts.maxTurns) {
    if (stuck()) return "stuck";
    if (retreat()) return "retreat";
    await run("simPlayerTurn()");
    if (run("G.phase") === "gameover") break;
    run("endPlayerTurn()");
    await g.drainTimers();
  }
  return sim.result ?? "timeout";
}

// Una campagna intera col bot: all'HQ decide simCampaignHQ, ogni missione
// si gioca come playGame; timeout e partite bloccate contano come sconfitte
async function playCampaign(opts, variant, index) {
  const seed = opts.seed + index;
  const g = await createGame({ seed: seed * 7919 + 13, logs: opts.log === index });
  const { ctx, sim, run } = g;
  const file = /[\\/]|\.json$/.test(opts.campaign) ? opts.campaign.replace(/\\/g, "/") : `missions/campaigns/${opts.campaign}.json`;
  ctx.__file = file;
  ctx.__seed = seed;
  if (file.startsWith("mods/")) {
    ctx.__mods = [file.split("/")[1]];
    run("setEnabledModIds(__mods)");
    await run("loadMods()");
  }
  ctx.__def = await run("loadCampaignDef(__file)");
  run(opts.set);
  run(variant.code);
  run(`SIM_BOT.maxTurns = ${opts.maxTurns}; SIM_BOT.campaignChoice = ${JSON.stringify(opts.choice)}`);
  run("CAMPAIGN = newCampaignState(__def, __file, __seed)");
  const missions = [];
  let rests = 0;
  for (let guard = 0; guard < 60 && !run("CAMPAIGN.result"); guard++) {
    const plan = run("simCampaignHQ(CAMPAIGN)");
    if (plan.rest) {
      run("campaignRest(CAMPAIGN)");
      rests++;
      continue;
    }
    ctx.__plan = plan;
    const op = run("CAMPAIGN.opIndex");
    const c = run("CAMPAIGN.ops[CAMPAIGN.opIndex].choices[__plan.choice]");
    ctx.__md = await run("campaignMissionData(CAMPAIGN, CAMPAIGN.opIndex, __plan.choice)");
    run("useMission(__md)");
    ctx.__roster = run("campaignLaunch(CAMPAIGN, __plan.choice, __plan.ids)");
    ctx.__c = c;
    run(`simReset(); startGame(__c.missionType, undefined, { night: __c.night, roster: __roster, campaign: { opIndex: ${op} } });
         applyCampaignSupplies(CAMPAIGN, CAMPAIGN.inProgress.supplies)`);
    const result = await playTurns(g, opts);
    // Ritirata: soldati come sono ora (nel gioco: come all'ultimo salvataggio)
    const deb = run(`campaignResolve(CAMPAIGN, G.units, ${result === "win"}, { retreat: ${result === "retreat"} })`);
    missions.push({ op, choice: c.id, tier: c.tier, mission: c.missionType, result, kia: deb.soldiers.filter((s) => s.outcome === "kia").length, turns: run("G.turn") });
  }
  const st = JSON.parse(JSON.stringify(run("CAMPAIGN")));
  const all = [...st.roster, ...st.fallen];
  if (sim.logs) console.log(`\n── log campagna ${index} (${variant.name}) ──\n` + sim.logs.join("\n"));
  return {
    variant: variant.name,
    seed,
    result: st.result || "unfinished",
    ops: st.ops.length,
    opsDone: st.opIndex,
    missions: missions.length,
    losses: missions.filter((m) => m.result !== "win").length,
    retreats: missions.filter((m) => m.result === "retreat").length,
    rests,
    kia: st.fallen.length,
    roster: st.roster.length,
    recruits: st.nextId - 1 - (st.def.startRoster?.length || 8),
    pr: st.requisition,
    avgRank: st.roster.length ? st.roster.reduce((a, s) => a + s.rank, 0) / st.roster.length : 0,
    maxRank: Math.max(0, ...all.map((s) => s.rank)),
    kills: all.reduce((a, s) => a + s.kills, 0),
    pressure: st.pressure,
    detail: missions,
  };
}

function campaignReport(name, list) {
  const n = list.length;
  return {
    variante: name,
    campagne: n,
    vinte: pct(list.filter((c) => c.result === "victory").length, n),
    perse: pct(list.filter((c) => c.result === "defeat").length, n),
    "op. compiute": `${avg(list, "opsDone").toFixed(1)}/${avg(list, "ops").toFixed(0)}`,
    missioni: avg(list, "missions").toFixed(1),
    fallite: avg(list, "losses").toFixed(1),
    ritirate: avg(list, "retreats").toFixed(1),
    caduti: avg(list, "kia").toFixed(1),
    rimpiazzi: avg(list, "recruits").toFixed(1),
    "PR fine": avg(list, "pr").toFixed(1),
    "grado medio": avg(list, "avgRank").toFixed(2),
    "uccisioni": avg(list, "kills").toFixed(1),
    pressione: avg(list, "pressure").toFixed(1),
  };
}

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : "—");
const avg = (list, k) => list.reduce((s, x) => s + (x[k] || 0), 0) / (list.length || 1);

function report(name, games) {
  const sum = (k) => games.reduce((s, x) => s + (x[k] || 0), 0);
  const n = games.length;
  return {
    variante: name,
    partite: n,
    vittorie: pct(games.filter((g) => g.result === "win").length, n),
    timeout: pct(games.filter((g) => g.result === "timeout").length, n),
    bloccate: pct(games.filter((g) => g.result === "stuck").length, n),
    turni: avg(games, "turns").toFixed(1),
    caduti: avg(games, "kia").toFixed(2),
    "HP rim.": `${Math.round(avg(games.filter((g) => g.hpLeftPct != null), "hpLeftPct"))}%`,
    "VC uccisi": `${sum("vcKilled")}/${sum("vcTotal")}`,
    "colpi VC": (sum("vcShots") / n).toFixed(1),
    "prec. VC": pct(sum("vcHits"), sum("vcShots")),
    "danno VC": (sum("vcDmg") / n).toFixed(1),
    "fianco": pct(sum("vcFlank"), sum("vcShots")),
    "retro": pct(sum("vcRear"), sum("vcShots")),
    "aggir./arr.": `${(sum("vcFlankers") / n).toFixed(1)}/${(sum("vcFlankArrived") / n).toFixed(1)}`,
    "agguati": (sum("vcAmbushFire") / n).toFixed(1),
    "danno US": (sum("usDmg") / n).toFixed(1),
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const variants = [{ name: "base", code: "" }, ...opts.variants];
  const all = [];
  const t0 = Date.now();
  const play = opts.campaign ? playCampaign : playGame;
  for (const v of variants) {
    for (let i = 0; i < opts.games; i++) {
      try {
        all.push(await play(opts, v, i));
      } catch (err) {
        console.error(`partita ${i} (${v.name}) fallita:`, err.stack || err);
      }
      process.stderr.write(`\r${v.name}: ${i + 1}/${opts.games}   `);
    }
  }
  process.stderr.write("\n");
  if (opts.campaign) {
    console.log(`\nCampagna ${opts.campaign} · scelta ${opts.choice} · ${opts.games} campagne/variante · seed ${opts.seed}… · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.table(variants.map((v) => campaignReport(v.name, all.filter((c) => c.variant === v.name))));
    const ms = all.flatMap((c) => c.detail.map((m) => ({ ...m, variant: c.variant })));
    const rows = [];
    for (const v of variants)
      for (const op of [...new Set(ms.map((m) => m.op))].sort((a, b) => a - b)) {
        const l = ms.filter((m) => m.variant === v.name && m.op === op);
        rows.push({ variante: v.name, operazione: op + 1, giocate: l.length, vinte: pct(l.filter((m) => m.result === "win").length, l.length), caduti: avg(l, "kia").toFixed(2), turni: avg(l, "turns").toFixed(1) });
      }
    console.log("Per operazione:");
    console.table(rows);
    if (opts.json) fs.writeFileSync(opts.json, JSON.stringify(all, null, 1));
    return;
  }
  const sizeTag = ["jungle", "urban"].includes(opts.map) ? ` ${opts.size}` : "";
  console.log(`\nMappa ${opts.map}${sizeTag} · missione ${opts.mission} · ${opts.games} partite/variante · seed ${opts.seed}… · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.table(variants.map((v) => report(v.name, all.filter((g) => g.variant === v.name))));
  if (opts.mission === "random") {
    const rows = [];
    for (const v of variants)
      for (const m of [...new Set(all.map((g) => g.mission))])
        rows.push({ ...report(v.name, all.filter((g) => g.variant === v.name && g.mission === m)), missione: m });
    console.log("Per tipo di missione:");
    console.table(rows.map(({ variante, missione, partite, vittorie, timeout, bloccate, turni, caduti, fianco, retro }) =>
      ({ variante, missione, partite, vittorie, timeout, bloccate, turni, caduti, fianco, retro })));
  }
  if (opts.json) fs.writeFileSync(opts.json, JSON.stringify(all, null, 1));
}

main().catch((err) => {
  console.error(err.stack || err);
  process.exit(1);
});
