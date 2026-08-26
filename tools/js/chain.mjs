/** Suivre une ressource de sa source a la machine qui la mange. */
import { buildGraph } from "../../site/public/forge/analyse.js";
import { fromBase64 } from "../../site/public/forge/schematic.js";
import { loadCatalogue } from "../../tests/js/helpers.js";

loadCatalogue();
const parsed = await fromBase64(process.argv[2]);
const g = buildGraph(parsed.tiles);

const named = (i) => `${g.nodes[i].name}(${g.nodes[i].x},${g.nodes[i].y})`;

for (let i = 0; i < g.nodes.length; i++) {
  const n = g.nodes[i];
  if (n.name !== "cultivator" && n.name !== "spore-press") continue;
  console.log(`${named(i).padEnd(24)} sorties -> ${g.out[i].map(named).join(", ") || "AUCUNE"}`);
  if (n.name === "spore-press") {
    console.log(`  ${" ".repeat(22)} entrees <- ${g.into[i].map(named).join(", ") || "AUCUNE"}`);
  }
}
