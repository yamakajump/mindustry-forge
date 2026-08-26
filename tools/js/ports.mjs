/** Ou brancher une schematique, deduit d elle-meme. */
import { analyse } from "../../site/public/forge/analyse.js";
import { loadCatalogue } from "../../tests/js/helpers.js";

loadCatalogue();
const out = await analyse(process.argv[2], {});
console.log(`${out.name}  ${out.blocks} blocs   (branchee toute seule : ${out.fedItself})\n`);
const show = (list, key, label) => {
  console.log(`${label} : ${list.length}`);
  for (const p of list.slice(0, 10)) {
    const what = Object.entries(p[key])
      .map(([r, v]) => `${r} ${(v * 60).toFixed(0)}/min`).join(", ") || "(rien)";
    console.log(`  ${p.block.padEnd(18)} en (${p.x},${p.y})  ${p.carries.padEnd(6)} ${what}`);
  }
};
show(out.ports.inputs, "wants", "ENTREES");
console.log();
show(out.ports.outputs, "gives", "SORTIES");
console.log(`\nsortie calculee : ${JSON.stringify(out.perMinute)}`);
console.log(`energie : ${out.power.made.toFixed(0)} produits, ${out.power.spent.toFixed(0)} consommes`);
