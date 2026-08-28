"""What the browser needs to draw the ground, beside the catalogue rather than inside it.

    python tools/build_sols.py

Blending data decides how a patch of ground looks and decides no figure the analyser
reports. `site/public/forge/blocks.json` is hashed by `EngineVersion`, so a field added
there marks every stored analysis stale; a field added here marks nothing. That boundary is
written down in CLAUDE.md and this file is on the presentation side of it.
"""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

# Which floor kinds have numbered art that is not a texture variant, and why: see
# `floor_kinds.py`. A count here for one of these would promise the browser a sprite
# `build_sprites.py` never packs.
from floor_kinds import NOT_TEXTURE_VARIANTS

JAR = Path("mindustry-forge/assets-v159.7.jar")
SOURCE = Path("bench/data/blocks.json")
TARGET = Path("site/public/forge/sols.json")


def main() -> None:
    raw = json.loads(SOURCE.read_text(encoding="utf-8"))
    with zipfile.ZipFile(JAR) as archive:
        art = {name.rsplit("/", 1)[1][:-4]
               for name in archive.namelist()
               if "/environment/" in name and name.endswith(".png")}

    floors = {}
    for name, entry in raw["blocks"].items():
        if not entry.get("floor"):
            continue
        variants = 0
        if entry.get("kind") not in NOT_TEXTURE_VARIANTS:
            while f"{name}{variants + 1}" in art:
                variants += 1
        # Whose edge sheet this floor bleeds with.
        #
        # `Floor.edges()` is `blendGroup.asFloor().edges`, not the floor's own, and the
        # distinction is not cosmetic: all fourteen floors carrying a `blend_group` (every
        # crater and every vent) ship NO sheet of their own, and all fourteen of their
        # groups ship one. Reading `<name>-edge` alone records nothing for the lot, and a
        # vent then refuses to blend against anything at all.
        #
        # `None` means this floor does not blend, which is a real answer for the fifty-two
        # whose group has no sheet either.
        sheet = entry.get("blend_group", name)
        floors[name] = {
            "blend": entry.get("blend_id", 0),
            # Absent means true in the dump, which is how the game's own default reads.
            "out": entry.get("draw_edge_out", True),
            "variants": variants,
            "sheet": sheet if f"{sheet}-edge" in art else None,
        }

    TARGET.write_text(json.dumps({"floors": floors}, separators=(",", ":")),
                      encoding="utf-8")
    with_edges = sum(1 for f in floors.values() if f["sheet"])
    print(f"{len(floors)} sols, {with_edges} avec raccords, "
          f"{sum(1 for f in floors.values() if f['variants'] > 1)} avec variantes")


if __name__ == "__main__":
    main()
