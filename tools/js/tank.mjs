/** What each liquid carrier holds, to check the one-liquid rule. */
import { analyse } from "../../site/public/forge/analyse.js";
import { loadCatalogue } from "../../tests/js/helpers.js";

loadCatalogue();
const out = await analyse(process.argv[2], {});
for (const tile of out.detail) {
  if (tile.role !== "conduit" && tile.role !== "junction") continue;
  const carried = Object.entries(tile.through || {}).filter(([, v]) => v > 0.001);
  if (carried.length > 1) {
    console.log(`  MIXED ${tile.name} (${tile.x},${tile.y}):`,
      carried.map(([k, v]) => `${k} ${(v * 60).toFixed(0)}/min`).join(", "));
  }
}
const tank = out.detail.find((t) => t.name === "liquid-tank");
if (tank) {
  console.log(`\nliquid-tank (${tank.x},${tank.y}) holds:`,
    Object.entries(tank.through || {}).filter(([, v]) => v > 0.001)
      .map(([k, v]) => `${k} ${(v * 60).toFixed(1)}/min`).join(", ") || "nothing");
}
