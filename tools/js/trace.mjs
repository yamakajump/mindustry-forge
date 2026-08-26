/** Trace who feeds whom, for diagnosing a layout that reports nothing. */
import { analyse } from "../../site/public/forge/analyse.js";
import { loadCatalogue } from "../../tests/js/helpers.js";

loadCatalogue();
const supply = {};
for (const pair of process.argv.slice(3)) {
  const [k, v] = pair.split("=");
  supply[k] = Number(v);
}
const out = await analyse(process.argv[2], supply);
const g = out.graph;
console.log(`${g.nodes.length} blocs, ${g.edges.length} liaisons`);

const entrances = [];
for (let i = 0; i < g.nodes.length; i++) {
  if (!g.into[i].length && g.out[i].length && g.nodes[i].role !== "drill") entrances.push(i);
}
console.log(`entrees (recoivent l'exterieur) : ${entrances.length}`);
for (const i of entrances.slice(0, 8)) {
  const n = g.nodes[i];
  console.log(`  #${i} ${n.name} (${n.role}) en (${n.x},${n.y}) -> ${g.out[i].length} sorties`);
}

const byRole = {};
for (let i = 0; i < g.nodes.length; i++) {
  const n = g.nodes[i];
  const k = `${n.name}`;
  byRole[k] = byRole[k] || { n: 0, in: 0, out: 0 };
  byRole[k].n++;
  byRole[k].in += g.into[i].length;
  byRole[k].out += g.out[i].length;
}
console.log("\nbloc                  n   liaisons entrantes  sortantes");
for (const [k, v] of Object.entries(byRole)) {
  console.log(`  ${k.padEnd(20)} ${String(v.n).padStart(2)}   ${String(v.in).padStart(4)}   ${String(v.out).padStart(4)}`);
}
