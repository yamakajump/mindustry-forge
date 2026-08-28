/** What each bridge says its link is, to check the reading against the game's limits. */
import { fromBase64 } from "../../site/public/forge/schematic.js";

const parsed = await fromBase64(process.argv[2]);
for (const t of parsed.tiles) {
  if (!t.config || t.config.type !== 7) continue;
  console.log(`${t.block.padEnd(18)} at (${t.x},${t.y})  link dx=${t.config.dx} dy=${t.config.dy}`);
}
