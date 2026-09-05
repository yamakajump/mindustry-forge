/** Run a schematic tick by tick and watch what comes out of it. */
import { analyse, buildGraph, useCatalogue } from "../../site/public/forge/bilan.js";
import { simulate } from "../../site/public/forge/simulate.js";
import { fromBase64 } from "../../site/public/forge/schematic.js";
import { loadCatalogue } from "../../tests/js/helpers.js";

loadCatalogue();
const parsed = await fromBase64(process.argv[2]);
const graph = buildGraph(parsed.tiles);

const supply = {};
for (const pair of process.argv.slice(3)) {
  const [where, rest] = pair.split(":");
  const [item, rate] = rest.split("=");
  const [x, y] = where.split(",").map(Number);
  const index = graph.nodes.findIndex((n) => n.x === x && n.y === y);
  if (index < 0) { console.log("no block at", where); process.exit(1); }
  supply[index] = { ...(supply[index] || {}), [item]: Number(rate) };
}

const started = Date.now();
const out = simulate(graph, supply, { seconds: 20, warmup: 10 });
console.log(`simulated 30 s in ${Date.now() - started} ms\n`);
console.log("leaves the schematic:",
  Object.entries(out.left).map(([k, v]) => `${k} ${(v * 60).toFixed(1)}/min`).join(", ") || "nothing");
console.log("consumed on the spot:",
  Object.entries(out.consumed).map(([k, v]) => `${k} ${(v * 60).toFixed(1)}/min`).join(", ") || "nothing");
console.log(`power               : ${out.power.made.toFixed(0)} made, ${out.power.spent.toFixed(0)} spent, net ${out.power.net.toFixed(0)}`);

const running = out.fed
  .map((v, i) => ({ v, name: graph.nodes[i].name }))
  .filter((r) => r.v !== undefined);
const byName = {};
for (const r of running) (byName[r.name] = byName[r.name] || []).push(r.v);
console.log("\nmachines:");
for (const [name, values] of Object.entries(byName)) {
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  console.log(`  ${name.padEnd(18)} ${values.length} x, running at ${(avg * 100).toFixed(0)}%`);
}
