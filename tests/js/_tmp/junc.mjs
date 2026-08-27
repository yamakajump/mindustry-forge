import { buildGraph } from "../../../site/public/forge/analyse.js";
import { fromBase64 } from "../../../site/public/forge/schematic.js";
import { World } from "../../../site/public/forge/engine/core.js";
import { behaviourOf } from "../../../site/public/forge/engine/carriers.js";
import { loadCatalogue, paste } from "../helpers.js";
loadCatalogue();
const run = async (tiles, label) => {
  const graph = buildGraph((await fromBase64(paste(tiles))).tiles);
  const world = new World(graph, behaviourOf);
  for (let i = 0; i < 300; i++) world.step();
  console.log(label, world.builds.map((b, i) =>
    `${graph.nodes[i].name}=${(b.liquids ? b.liquids.total?.() ?? Object.values(b.liquids.amounts ?? {}).reduce((a,c)=>a+c,0) : 0).toFixed(3)}`).join(" "));
};
await run([[0,0,"liquid-source",0],[1,0,"liquid-junction",0],[2,0,"conduit",0],[3,0,"liquid-router",0]], "avec jonction :");
await run([[0,0,"liquid-source",0],[1,0,"conduit",0],[2,0,"conduit",0],[3,0,"liquid-router",0]], "sans jonction :");
