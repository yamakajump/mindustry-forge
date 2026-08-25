"""Pull the game's own art for the blocks the catalogue actually holds.

    python tools/sprites.py

Coloured squares are a debugging aid. A player deciding whether to paste a design wants to
see the design, and Mindustry's sprites are what a design looks like. So the site draws
with the game's art.

Only what the catalogue uses is written, and it is written into `docs/` and committed. The
full sheet is about four thousand files, which is a fine thing to regenerate on a machine
that runs the game and a poor thing to serve from a static site. Rerun this after adding a
schematic that introduces a block nobody had used before; it says when it does.

The asset jar is the release artifact of the same pinned engine version as everything else
here, downloaded once and cached. Mindustry is GPL-3.0 and its art ships in the same
repository under the same licence, so this redistributes a couple of dozen files of it.

The idea, and the folder layout it walks, are lifted from `tools/extract_sprites.py` in
mindustry-ai, which did this first for its replay viewer.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from forge import catalogue, schematic
from forge.server_setup import MINDUSTRY_VERSION

ASSETS_URL = "https://github.com/Anuken/Mindustry/releases/download/{version}/assets.jar"

#: The jar is tens of megabytes. Anything much smaller is an error page under a jar's name.
MIN_JAR_BYTES = 5_000_000

#: Drawn in this order, over each other, when a block has them. `-rotator` is the part
#: that spins on a drill and `-top` the housing above it; a drill without either reads as
#: a blank plate.
LAYERS = ("", "-rotator", "-top")

#: Carriers whose sprite is a strip of connection and animation frames rather than one
#: image. Frame `0-0` is the straight, unanimated segment, which is what a still picture
#: of a belt should be.
STRIP_FRAME = "-0-0"
STRIPPED = ("conveyor", "titanium-conveyor", "plastanium-conveyor", "armored-conveyor",
            "duct", "duct-router")


def fetch_assets(cache: Path, version: str = MINDUSTRY_VERSION) -> Path:
    """Download the pinned asset jar, or hand back the one already here."""
    cache.mkdir(parents=True, exist_ok=True)
    jar = cache / f"assets-{version}.jar"
    if jar.exists() and jar.stat().st_size >= MIN_JAR_BYTES:
        return jar

    partial = jar.with_suffix(".part")
    print(f"fetching {ASSETS_URL.format(version=version)}")
    urllib.request.urlretrieve(ASSETS_URL.format(version=version), partial)

    size = partial.stat().st_size
    if size < MIN_JAR_BYTES:
        partial.unlink()
        raise SystemExit(f"downloaded jar is only {size} bytes, expected a real one")

    partial.replace(jar)
    return jar


def blocks_in(entries: list[catalogue.Entry]) -> set[str]:
    """Every block name any entry in the catalogue puts on the ground."""
    found: set[str] = set()
    for entry in entries:
        if not entry.schematic:
            continue
        for _, _, block, _ in schematic.from_base64(entry.schematic)["tiles"]:
            found.add(block)
    return found


def wanted_files(block: str) -> list[str]:
    if block in STRIPPED:
        return [f"{block}{STRIP_FRAME}.png"]
    return [f"{block}{layer}.png" for layer in LAYERS]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--catalogue", type=Path, default=Path("docs") / "catalogue.json")
    parser.add_argument("--out", type=Path, default=Path("docs") / "sprites")
    parser.add_argument("--cache", type=Path, default=Path("mindustry-forge"))
    args = parser.parse_args()

    blocks = blocks_in(catalogue.load(args.catalogue))
    if not blocks:
        print("the catalogue holds no blocks, so there is nothing to fetch")
        return 0

    jar = fetch_assets(args.cache)
    args.out.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(jar) as archive:
        # Matched on the file name rather than the folder: the art is filed by role
        # (drills, distribution, production, power) and a lookup that hard-coded those
        # would break on the first block filed somewhere new.
        by_name: dict[str, str] = {}
        for member in archive.namelist():
            if member.startswith("assets-raw/sprites/blocks/") and member.endswith(".png"):
                by_name.setdefault(member.rsplit("/", 1)[-1], member)

        index: dict[str, list[str]] = {}
        written = 0
        for block in sorted(blocks):
            layers = []
            for name in wanted_files(block):
                member = by_name.get(name)
                if member is None:
                    continue
                (args.out / name).write_bytes(archive.read(member))
                layers.append(name)
                written += 1

            if not layers:
                print(f"  no art found for {block}, the site will draw a plain tile")
                continue
            index[block] = layers

    (args.out / "index.json").write_text(
        json.dumps({"engine": MINDUSTRY_VERSION, "blocks": index}, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"{written} sprite(s) for {len(index)} block(s) -> {args.out}")
    for block, layers in sorted(index.items()):
        print(f"  {block:24} {' + '.join(layers)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
