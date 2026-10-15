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
"use strict";
const fs = require("fs");
const { createGame } = require("./env");

function parseArgs(argv) {
  const o = { map: "jungle", size: "small", mission: "random", games: 30, seed: 1,
    squad: "assault,sniper,engineer,medic", night: false, maxTurns: 40, set: "",
    variants: [], json: null, log: null };
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
    else if (a === "--help" || a === "-h") {
      console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 21).join("\n"));
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

  // Partita non più vincibile: pilota trovato ma chi lo portava è morto
  const stuck = () =>
    run(`G.missionType === "rescue_pilot" && G.missionState.pilotFound &&
         !G.units.some((u) => u.alive && u.carriesPilot)`);
  let blocked = false;
  while (run("G.phase") !== "gameover" && run("G.turn") <= opts.maxTurns) {
    if (stuck()) {
      blocked = true;
      break;
    }
    await run("simPlayerTurn()");
    if (run("G.phase") === "gameover") break;
    run("endPlayerTurn()");
    await g.drainTimers();
  }
  const summary = sim.summary ?? run("missionSummary(false)");
  const result = sim.result ?? (blocked ? "stuck" : "timeout");
  if (sim.logs) console.log(`\n── log partita ${index} (${variant.name}) ──\n` + sim.logs.join("\n"));
  return { ...JSON.parse(JSON.stringify(summary)), result, variant: variant.name, seed, mission };
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
  for (const v of variants) {
    for (let i = 0; i < opts.games; i++) {
      try {
        all.push(await playGame(opts, v, i));
      } catch (err) {
        console.error(`partita ${i} (${v.name}) fallita:`, err.stack || err);
      }
      process.stderr.write(`\r${v.name}: ${i + 1}/${opts.games}   `);
    }
  }
  process.stderr.write("\n");
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
