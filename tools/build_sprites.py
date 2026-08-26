"""Pack the game's own sprites into one atlas the browser can draw a schematic with.

    python tools/build_sprites.py

A list of block names and throughput figures does not tell a player what a schematic is.
A picture does, in a second, which is why every schematic site shows one. Drawing that
picture with anything other than the game's own art means the player has to translate
between two visual languages, so the sprites come out of `assets-v159.7.jar`, the same
build everything else here is pinned to.

One PNG and one JSON, because two hundred and fifty separate image requests would be two
hundred and fifty round trips before anything appears on screen.

Conveyors, ducts and conduits are the awkward case and worth stating: they have no plain
sprite at all. The game draws them from directional variants named `<block>-<join>-<frame>`,
where the join encodes which neighbours connect. A straight, unjoined piece is variant `0-0`
and that is what a preview needs, since a preview is not animating.
"""

from __future__ import annotations

import io
import json
import math
import zipfile
from pathlib import Path

from PIL import Image

JAR = Path("mindustry-forge/assets-v159.7.jar")
CATALOGUE = Path("site/public/forge/blocks.json")
ATLAS = Path("site/public/forge/atlas.png")
INDEX = Path("site/public/forge/atlas.json")

#: Sprites are 32 pixels per tile in the game's own art. Kept, rather than downscaled here,
#: so the canvas can decide how big a tile is and a zoomed-in view still looks sharp.
TILE = 32


def sprite_names(archive: zipfile.ZipFile) -> dict[str, str]:
    """Every sprite in the jar, by its bare file name."""
    found: dict[str, str] = {}
    for name in archive.namelist():
        if name.startswith("assets-raw/sprites/") and name.endswith(".png"):
            found.setdefault(name.rsplit("/", 1)[1][:-4], name)
    return found


def pick(name: str, sprites: dict[str, str]) -> str | None:
    """The sprite that best stands for a block in a still picture.

    A conveyor has no plain sprite: the game assembles it from directional variants, so the
    unjoined straight piece is the one a preview wants. Everything else is drawn from its
    own name, and a handful of blocks put their recognisable half in a `-top` overlay.
    """
    if name in sprites:
        return sprites[name]
    # Order matters. A conveyor is assembled from `<name>-<join>-<frame>` and the unjoined
    # straight piece is `0-0`; a conduit and a duct use `<name>-top-<join>` instead, with
    # `-0` the unjoined one. Trying `-top` before `-top-0` picks up a cap or an overlay and
    # draws the wrong half of the block.
    for suffix in ("-0-0", "-top-0", "-bottom", "-base", "-full", "-top", "-large",
                   "-barrel", "-side-l"):
        if name + suffix in sprites:
            return sprites[name + suffix]
    return None


def main() -> None:
    archive = zipfile.ZipFile(JAR)
    sprites = sprite_names(archive)
    catalogue = json.loads(CATALOGUE.read_text(encoding="utf-8"))

    wanted: list[tuple[str, str]] = []
    missing: list[str] = []
    for block in catalogue["blocks"]:
        path = pick(block, sprites)
        (wanted.append((block, path)) if path else missing.append(block))

    # Item icons, for saying what a layout produces with the same pictures the game uses.
    for item in catalogue["items"]:
        path = sprites.get(f"item-{item}")
        if path:
            wanted.append((f"item/{item}", path))

    images: dict[str, Image.Image] = {}
    for key, path in wanted:
        with archive.open(path) as handle:
            images[key] = Image.open(io.BytesIO(handle.read())).convert("RGBA")

    # Shelf packing, tallest first. A plain grid was the first version and it sized every
    # cell to the largest sprite: a 288 pixel core made the atlas 4608 square, which is 85
    # megabytes of texture in memory for 761 kilobytes of file. Most of a schematic is one
    # tile blocks, so rows of similar heights waste almost nothing.
    ordered = sorted(images.items(), key=lambda kv: -kv[1].height)
    width = 2048
    placed: list[tuple[str, Image.Image, int, int]] = []
    x = y = shelf = 0
    for key, image in ordered:
        if x + image.width > width:
            x = 0
            y += shelf
            shelf = 0
        placed.append((key, image, x, y))
        x += image.width
        shelf = max(shelf, image.height)
    height = y + shelf

    atlas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    index: dict[str, dict] = {}
    for key, image, at_x, at_y in placed:
        atlas.paste(image, (at_x, at_y))
        index[key] = {"x": at_x, "y": at_y, "w": image.width, "h": image.height,
                      "tiles": round(image.width / TILE, 2)}

    ATLAS.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(ATLAS, optimize=True)
    INDEX.write_text(json.dumps({
        "game_version": catalogue["game_version"],
        "tile": TILE,
        "sprites": index,
    }, separators=(",", ":")), encoding="utf-8")

    print(f"{len(index)} sprites dans {atlas.width}x{atlas.height}, "
          f"{ATLAS.stat().st_size // 1024} ko")
    if missing:
        # Named rather than swallowed. A block drawn as a blank square is a picture that
        # lies quietly, and the renderer needs to know to draw a placeholder instead.
        print(f"{len(missing)} blocs sans sprite : {', '.join(sorted(missing))}")


if __name__ == "__main__":
    main()
