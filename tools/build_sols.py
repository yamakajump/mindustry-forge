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

# How a floor's numbered art is enumerated, and which kinds have none, shared with
# `build_sprites.py`: see `floor_kinds.py`. A count here that the packer does not agree with
# promises the browser a sprite nobody ever packs.
from floor_kinds import NOT_TEXTURE_VARIANTS, variant_names

JAR = Path("mindustry-forge/assets-v159.7.jar")
SOURCE = Path("bench/data/blocks.json")
TARGET = Path("site/public/forge/sols.json")

#: What `Floor.overlayAlpha` is worth, and for whom it is not the default.
#:
#: `Floor.drawBase`'s fourth statement redraws a liquid floor over its own overlay at
#: `1 - overlayAlpha`, which is what makes ore under water read as lying beneath the surface
#: rather than floating on it. The alpha is per floor, not one number for all eleven liquids,
#: and reading it off one of them would have been wrong for one of them.
#:
#: Decompiled from `server-release.jar` at v159.7 rather than guessed: `Floor`'s constructor
#: sets `overlayAlpha = 0.65f`, and exactly two classes in the whole jar carry the field's
#: name in their constant pool, `Floor` itself and `mindustry.content.Blocks$10`. That second
#: one is the anonymous `Floor` the content class instantiates as
#: `new Blocks$10("pooled-cryofluid")`, and its constructor writes `0.35f` over the default.
#: So ten liquids veil their overlay at 0.35 alpha and pooled cryofluid at 0.65.
#:
#: `DumpBlocks.java` does not carry this field, so it is not in `bench/data/blocks.json`, and
#: putting it there means re-running the game to re-dump. That is where it belongs, and the
#: lookup below prefers the dump the day it arrives: this table is only consulted for a floor
#: the dump says nothing about. `main` refuses a name here that the dump does not call a
#: liquid floor, so a version bump that renames or delists one fails the build rather than
#: quietly veiling nothing.
OVERLAY_ALPHA_DEFAULT = 0.65
OVERLAY_ALPHA = {"pooled-cryofluid": 0.35}


def alpha_of(name: str, entry: dict) -> float:
    """This floor's `Floor.overlayAlpha`, from the dump when it carries it."""
    return entry.get("overlay_alpha", OVERLAY_ALPHA.get(name, OVERLAY_ALPHA_DEFAULT))


def main() -> None:
    raw = json.loads(SOURCE.read_text(encoding="utf-8"))
    with zipfile.ZipFile(JAR) as archive:
        art = {name.rsplit("/", 1)[1][:-4]
               for name in archive.namelist()
               if "/environment/" in name and name.endswith(".png")}

    named = {name for name, entry in raw["blocks"].items() if entry.get("floor")}

    floors = {}
    for name, entry in raw["blocks"].items():
        if not entry.get("floor"):
            continue
        variants = 0
        if entry.get("kind") not in NOT_TEXTURE_VARIANTS:
            variants = sum(1 for _ in variant_names(name, art, named))
        # Whose edge sheet this floor bleeds with.
        #
        # `Floor.edges()` is `blendGroup.asFloor().edges`, not the floor's own, and the
        # distinction is not cosmetic: all fourteen floors carrying a `blend_group` (every
        # crater and every vent) ship NO sheet of their own, and all fourteen of their
        # groups ship one. Reading `<name>-edge` alone records nothing for the lot, and a
        # vent then refuses to blend against anything at all.
        #
        # `None` means this floor does not blend, which is a real answer for the 38 whose
        # group has no sheet either. Counted: of 107 floors, 55 ship a sheet of their own and
        # 14 borrow their group's, so 69 blend and 38 do not. Fifty-two was 107 - 55, the
        # arithmetic from before the blend groups were understood.
        sheet = entry.get("blend_group", name)
        floors[name] = {
            # The block id, which is what the game sorts blenders by. Not the blend id: a
            # blend group hands one blend id to several floors that keep their own ids, so
            # sorting on it leaves ties the game itself breaks.
            "id": entry["id"],
            "blend": entry.get("blend_id", 0),
            # Absent means true in the dump, which is how the game's own default reads.
            # `in` is whether anything bleeds onto this floor, `out` whether it bleeds
            # outwards, and the two sets are not the same set: `empty` and `space` refuse to
            # bleed out and still receive edges.
            "in": entry.get("draw_edge_in", True),
            "out": entry.get("draw_edge_out", True),
            # Which pass the game draws this floor in. `drawEdges` skips a neighbour on
            # another layer, which is what keeps water from blending into land.
            "layer": entry.get("cache_layer", "normal"),
            "variants": variants,
            "sheet": sheet if f"{sheet}-edge" in art else None,
            # The alpha the floor is redrawn at over its own overlay, `1 - overlayAlpha`, or
            # `None` when the fourth statement of `drawBase` never fires here. Its gate is
            # `isLiquid`, which the dump already carries as `floor_liquid` for the eleven
            # floors that set it, so no new field had to come out of the game for the gate.
            # Rounded because `1 - 0.65` in binary floating point is 0.35000000000000004, and
            # that would reach the browser spelled out in full.
            "veil": round(1 - alpha_of(name, entry), 2) if entry.get("floor_liquid") else None,
        }

    strangers = sorted(name for name in OVERLAY_ALPHA
                       if not raw["blocks"].get(name, {}).get("floor_liquid"))
    if strangers:
        raise SystemExit(
            f"OVERLAY_ALPHA names {', '.join(strangers)}, which the dump does not call a "
            "liquid floor: re-read Floor.overlayAlpha out of the pinned jar")

    TARGET.write_text(json.dumps({"floors": floors}, separators=(",", ":")),
                      encoding="utf-8")
    blending = sum(1 for f in floors.values() if f["sheet"])
    varied = sum(1 for f in floors.values() if f["variants"] > 1)
    veiled = sum(1 for f in floors.values() if f["veil"])
    print(f"{len(floors)} floors, {blending} that blend, {varied} with several sprites, "
          f"{veiled} that veil an overlay")


if __name__ == "__main__":
    main()
