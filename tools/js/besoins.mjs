/** What has to be installed to feed a schematic. */
import { analyse } from "../../site/public/forge/analyse.js";
import { loadCatalogue } from "../../tests/js/helpers.js";

loadCatalogue();
const out = await analyse(process.argv[2], {});
console.log(`${out.name}  ${out.blocks} blocks\n`);
console.log("IT NEEDS:");
for (const need of out.needs) {
  const best = need.options.slice(0, 3)
    .map((o) => `${o.count} x ${o.block}`).join("  or  ");
  console.log(`  ${need.resource.padEnd(12)} ${need.perMinute.toFixed(0).padStart(6)} / min   ${best || "(any fuel)"}`);
}
console.log(`\nAT FULL TILT: makes ${out.potential.made.toFixed(0)} power/s, spends ${out.potential.spent.toFixed(0)}`);
