"""Trim the game's block registry down to what the browser needs.

    python tools/build_catalogue.py

`bench/data/blocks.json` is everything the game knows, 128 kilobytes of it, and most of it
is blocks that carry nothing. The page loads the trimmed copy, 29 kilobytes, which is small
enough that nobody waits for it.

Generated rather than edited. A hand-maintained second copy of the block data would drift
from the first, which is the failure this whole repository is arranged to avoid.
"""

from __future__ import annotations

import json
from pathlib import Path

SOURCE = Path("bench/data/blocks.json")
TARGET = Path("site/public/forge/blocks.json")

#: What the analysis reads. Everything else the game knows about a block is weight.
KEEP = ("size", "role", "items_per_second", "craft_time", "input", "output",
        "input_liquid", "output_liquid", "power", "power_out",
        "tier", "drill_time", "hardness_multiplier", "cost", "item_capacity",
        "range", "carries", "output_per_second")


def main() -> None:
    raw = json.loads(SOURCE.read_text(encoding="utf-8"))

    blocks = {}
    for name, entry in raw["blocks"].items():
        # A block with neither a role nor a build cost cannot appear in a schematic and
        # cannot affect one. Air, spawn markers, the wall-removal tool.
        if not entry.get("role") and not entry.get("cost"):
            continue
        blocks[name] = {k: v for k, v in entry.items()
                        if k in KEEP and v not in (0, {}, "", None)}

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(json.dumps({
        "game_version": raw["game_version"],
        "build": raw["build"],
        "blocks": blocks,
        "items": raw["items"],
    }, separators=(",", ":")), encoding="utf-8")

    print(f"{len(blocks)} blocs sur {len(raw['blocks'])}, "
          f"{TARGET.stat().st_size // 1024} ko dans {TARGET}")


if __name__ == "__main__":
    main()
