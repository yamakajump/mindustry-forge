/** Ce qu il faut installer pour alimenter une schematique. */
import { analyse } from "../../site/public/forge/analyse.js";
import { loadCatalogue } from "../../tests/js/helpers.js";

loadCatalogue();
const out = await analyse(process.argv[2], {});
console.log(`${out.name}  ${out.blocks} blocs\n`);
console.log("IL LUI FAUT :");
for (const need of out.needs) {
  const best = need.options.slice(0, 3)
    .map((o) => `${o.count} x ${o.block}`).join("  ou  ");
  console.log(`  ${need.resource.padEnd(12)} ${need.perMinute.toFixed(0).padStart(6)} / min   ${best || "(combustible quelconque)"}`);
}
console.log(`\nA PLEIN REGIME : produit ${out.potential.made.toFixed(0)} energie/s, en consomme ${out.potential.spent.toFixed(0)}`);
