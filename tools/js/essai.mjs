/** Analyse a schematic from the command line, using the same modules the page loads. */
import { analyse } from "../../site/public/forge/analyse.js";
import { loadCatalogue } from "../../tests/js/helpers.js";

loadCatalogue();
try {
  const out = await analyse(process.argv[2], {});
  console.log(JSON.stringify({
    name: out.name, taille: `${out.width}x${out.height}`, blocs: out.blocks,
    parMinute: out.perMinute, goulot: out.bottleneck, inutilises: out.idle,
    inconnus: out.unknown, cout: out.cost, energie: out.power, stable: out.settled,
  }, null, 2));
  const roles = {};
  for (const n of out.graph.nodes) {
    const key = `${n.name} (${n.role || "sans role"})`;
    roles[key] = (roles[key] || 0) + 1;
  }
  console.log("\nblocs :", roles);
} catch (e) {
  console.log("ERREUR:", e.message);
}
