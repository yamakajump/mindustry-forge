/** Where to plug a schematic in, worked out from the schematic itself. */
import { analyse } from "../../site/public/forge/bilan.js";
import { loadCatalogue } from "../../tests/js/helpers.js";

loadCatalogue();
const out = await analyse(process.argv[2], {});
console.log(`${out.name}  ${out.blocks} blocks   (feeds itself: ${out.fedItself})\n`);
const show = (list, key, label) => {
  console.log(`${label}: ${list.length}`);
  for (const p of list.slice(0, 10)) {
    const what = Object.entries(p[key])
      .map(([r, v]) => `${r} ${(v * 60).toFixed(0)}/min`).join(", ") || "(nothing)";
    console.log(`  ${p.block.padEnd(18)} at (${p.x},${p.y})  ${p.carries.padEnd(6)} ${what}`);
  }
};
show(out.ports.inputs, "wants", "INPUTS");
console.log();
show(out.ports.outputs, "gives", "OUTPUTS");
console.log(`\ncomputed output: ${JSON.stringify(out.perMinute)}`);
console.log(`power: ${out.power.made.toFixed(0)} made, ${out.power.spent.toFixed(0)} spent`);
