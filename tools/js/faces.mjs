/** Which faces of each carrier open onto nothing, outside the bounding box. */
import { analyse } from "../../site/public/forge/analyse.js";
import { loadCatalogue } from "../../tests/js/helpers.js";

loadCatalogue();
const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const out = await analyse(process.argv[2], {});
const g = out.graph;

const occupied = new Set();
for (const n of g.nodes) for (const [x, y] of n.footprint) occupied.add(`${x},${y}`);
const xs = g.nodes.map((n) => n.x), ys = g.nodes.map((n) => n.y);
const box = { l: Math.min(...xs), r: Math.max(...xs), b: Math.min(...ys), t: Math.max(...ys) };
console.log("box", box);

for (let i = 0; i < g.nodes.length; i++) {
  const n = g.nodes[i];
  if (n.role !== "conduit" && n.role !== "conveyor") continue;
  const [fx, fy] = DIRECTIONS[n.rotation % 4];
  const ahead = `${n.x + fx},${n.y + fy}`;
  // The input faces: everything but the one it outputs from.
  const openInputs = DIRECTIONS
    .map(([dx, dy], d) => ({ d, key: `${n.x + dx},${n.y + dy}`, dx, dy }))
    .filter((s) => s.key !== ahead && !occupied.has(s.key))
    .filter((s) => n.x + s.dx < box.l || n.x + s.dx > box.r
                || n.y + s.dy < box.b || n.y + s.dy > box.t);
  if (openInputs.length) {
    console.log(`  ${n.name.padEnd(16)} (${n.x},${n.y}) rot=${n.rotation} `
      + `free faces outside the box: ${openInputs.map((s) => `${s.dx},${s.dy}`).join(" ")}`
      + `  internal inputs: ${g.into[i].length}`);
  }
}
