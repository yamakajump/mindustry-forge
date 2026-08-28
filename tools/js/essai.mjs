/** Analyse a schematic from the command line, using the same modules the page loads. */
import { analyse } from "../../site/public/forge/analyse.js";
import { loadCatalogue } from "../../tests/js/helpers.js";

loadCatalogue();
const supply = {};
for (const pair of process.argv.slice(3)) {
  const [k, v] = pair.split("=");
  supply[k] = Number(v);
}
try {
  const out = await analyse(process.argv[2], supply);
  console.log(JSON.stringify({
    name: out.name, size: `${out.width}x${out.height}`, blocks: out.blocks,
    perMinute: out.perMinute, bottleneck: out.bottleneck, idle: out.idle,
    unknown: out.unknown, cost: out.cost, power: out.power,
    internal: out.internal, settled: out.settled,
  }, null, 2));
  const roles = {};
  for (const n of out.graph.nodes) {
    const key = `${n.name} (${n.role || "no role"})`;
    roles[key] = (roles[key] || 0) + 1;
  }
  console.log("\nblocks:", roles);
} catch (e) {
  console.log("ERROR:", e.message);
}
