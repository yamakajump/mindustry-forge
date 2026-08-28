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

# How a floor's numbered art is enumerated, and which kinds have none, shared with
# `build_sols.py`: see `floor_kinds.py`. `build_sols.py` must not promise the browser a
# sprite this script never packs, and one enumeration imported by both is what makes that
# a fact rather than a hope.
from floor_kinds import NOT_TEXTURE_VARIANTS, variant_names

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
    """The sprite the game itself shows for a block.

    The game does not draw a block from one image. It stacks layers: a base, a rotator, a
    top plate, a team-coloured outline, a cell. Guessing at which single layer stands for
    the whole thing produced pictures that were recognisably wrong, and the schematic
    Corentin pasted made that obvious on its bridges.

    It turns out there is nothing to guess. Mindustry's own build composites those layers
    ahead of time into `generated/block-<name>-full.png`, which is exactly what the game
    puts in front of a player. A hundred and forty-seven of the blocks that can appear in a
    schematic have one; the rest are a single layer already, and their plain sprite is the
    composite.
    """
    composed = f"block-{name}-full"
    if composed in sprites:
        return sprites[composed]
    if name in sprites:
        return sprites[name]
    # A conveyor is assembled from `<name>-<join>-<frame>` and the unjoined straight piece
    # is `0-0`; a conduit and a duct use `<name>-top-<join>` instead.
    for suffix in ("-0-0", "-top-0", "-bottom", "-base", "-top", "-large",
                   "-barrel", "-side-l"):
        if name + suffix in sprites:
            return sprites[name + suffix]
    return None


#: What a bridge needs beyond its own tile: the span it throws, and the arrow along it.
BRIDGE_PARTS = ("-bridge", "-arrow", "-end")

#: A carrier is drawn from one of five shapes, chosen by which neighbours feed it.
#:
#: The game calls this autotiling and does it in `Autotiler.buildBlending`: 0 straight,
#: 1 a curve, 2 a merge from behind and one side, 3 a merge from every side, 4 a merge from
#: both sides. Drawing only shape 0 makes every belt in a picture look straight, which is
#: wrong wherever a line turns, and a line that turns is most lines.
SHAPES = 5

#: And a belt has four frames per shape, which is the whole of what a running belt looks
#: like. `Conveyor.draw` picks one with `(Time.time * speed * 8 * efficiency) % 4`, so a
#: titanium belt scrolls half again as fast as a copper one and a stalled belt stands still.
FRAMES = 4

#: The layers a block is drawn from on top of its own plate, and what each one is for.
#:
#: The composite `-full` sprite the preview uses has these baked into it at rest. A picture
#: that **moves** needs them apart: a drill's rotator turns at its warmup, a crafter's top
#: fades in with its warmup, a pump's liquid region is tinted with what it is holding. Baked
#: together they can only ever be drawn standing still.
LAYERS = ("-bottom", "-rotator", "-spinner", "-liquid", "-top", "-glow", "-heat", "-team")


def main() -> None:
    archive = zipfile.ZipFile(JAR)
    sprites = sprite_names(archive)
    catalogue = json.loads(CATALOGUE.read_text(encoding="utf-8"))

    wanted: list[tuple[str, str]] = []
    missing: list[str] = []
    for block in catalogue["blocks"]:
        path = pick(block, sprites)
        (wanted.append((block, path)) if path else missing.append(block))

    # Every shape a carrier can take, so a corner is drawn as a corner.
    for block, entry in catalogue["blocks"].items():
        if entry.get("role") not in ("conveyor", "conduit"):
            continue
        for shape in range(SHAPES):
            for pattern in (f"{block}-{shape}-0", f"{block}-top-{shape}"):
                if pattern in sprites:
                    wanted.append((f"{block}#{shape}", sprites[pattern]))
                    break

    # And the frames it runs through, plus the plate underneath.
    #
    # A belt is drawn from `<name>-<shape>-<frame>`; a duct and a conduit have no frames at
    # all and are drawn from a `-bottom-<join>` plate with a `-top-<join>` over it, with the
    # item or the liquid in between. Packed apart, because in between is where the moving
    # part goes and a single flattened sprite has no in between.
    for block, entry in catalogue["blocks"].items():
        role = entry.get("role")
        if role in ("conveyor", "stack-conveyor"):
            for shape in range(SHAPES):
                for frame in range(FRAMES):
                    path = sprites.get(f"{block}-{shape}-{frame}")
                    if path:
                        wanted.append((f"{block}#{shape}-{frame}", path))
        elif role in ("duct", "conduit", "duct-router", "liquid-span"):
            for shape in range(SHAPES):
                for half in ("bottom", "top"):
                    path = sprites.get(f"{block}-{half}-{shape}")
                    if path:
                        wanted.append((f"{block}#{half}-{shape}", path))

    # The layers a running block is drawn from, one key each.
    for block in catalogue["blocks"]:
        for layer in LAYERS:
            path = sprites.get(block + layer)
            if path:
                wanted.append((f"{block}#{layer[1:]}", path))

        # Whatever the block's own drawing chain names, whatever it is called.
        #
        # `-vents`, `-heat-top`, `-glow`, `-heat`: the suffixes are the game's and there is
        # no pattern to guess at, which is exactly why the dump carries them. Read off the
        # catalogue, a block that gains a layer in a later version gains its sprite here
        # without anybody noticing it had to.
        for layer in {one.get("suffix") for one in catalogue["blocks"][block].get("drawers", [])}:
            if layer and block + layer in sprites:
                wanted.append((f"{block}#{layer[1:]}", sprites[block + layer]))

        # And the plate under a turning part, which the composite does not leave room for.
        #
        # `block-<name>-full` is base, rotator and top flattened into one image with the
        # rotator at rest. Turning a copy of the rotator over that leaves the baked one
        # showing through underneath, so a drill that spins needs its plate on its own.
        turning = any(one["kind"] == "rotator"
                      for one in catalogue["blocks"][block].get("drawers", []))
        if (turning or block + "-rotator" in sprites or block + "-spinner" in sprites)                 and block in sprites:
            wanted.append((f"{block}#base", sprites[block]))

    # The ground. Every variant the game ships, not just the first: `grass1`, `grass2` and
    # `grass3` exist, the game picks one per tile, and packing only `grass1` made a painted
    # patch line its diagonal pattern up from tile to tile into stripes.
    #
    # The bare `floor/<name>` key stays, and stays first: it is what a caller with no
    # position to hash asks for, and what a floor with a single sprite has.
    named = {name for name, entry in catalogue["blocks"].items() if entry.get("floor")}
    for name, entry in catalogue["blocks"].items():
        if not entry.get("floor"):
            continue
        path = sprites.get(name) or sprites.get(f"{name}1")
        if path:
            wanted.append((f"floor/{name}", path))
        if entry.get("kind") in NOT_TEXTURE_VARIANTS:
            continue
        for n, variant in enumerate(variant_names(name, sprites, named), 1):
            wanted.append((f"floor/{name}#{n}", sprites[variant]))

        # The 96 by 96 sheet the game blends a boundary with: nine 32 pixel cells, which
        # `Floor.edge(x, y, i, j)` reads as `edges[i][2 - j]`. 55 of the 107 floors ship one.
        # Fourteen of the rest blend all the same, through their group's sheet, which is the
        # whole point of `blendGroup` and is recorded in `sols.json` rather than here: the
        # sheet a floor borrows is packed under its owner's name. That leaves 38 that do not
        # blend at all, and a hard edge decided in code beats a guess.
        if f"{name}-edge" in sprites:
            wanted.append((f"floor/{name}#edge", sprites[f"{name}-edge"]))

    # The frame of a block that gets configured, without the composite's contents.
    #
    # The game fills the whole tile with the colour of what a sorter passes or a source
    # pours, then draws the frame over it. The composite is that frame with the unset
    # cross already baked in, so painting under it showed nothing at all: twelve sources
    # side by side, twelve identical dark squares.
    for block, entry in catalogue["blocks"].items():
        if entry.get("role") not in ("source", "sorter", "unloader"):
            continue
        if block in sprites:
            wanted.append((f"{block}#plain", sprites[block]))

    # The span a bridge throws, without which two ends of one line read as two dead ends.
    for block, entry in catalogue["blocks"].items():
        if entry.get("role") != "bridge":
            continue
        for part in BRIDGE_PARTS:
            path = sprites.get(block + part)
            if path:
                wanted.append((block + part, path))

    # Item and liquid icons, for saying what a layout makes and drinks in the same pictures
    # the game uses. Liquids were left out at first and it showed immediately: a report
    # naming oil beside an icon of coal and an icon of spore pods reads as an oversight,
    # because it is one.
    for item in catalogue["items"]:
        path = sprites.get(f"item-{item}")
        if path:
            wanted.append((f"item/{item}", path))

    liquids = set()
    for entry in catalogue["blocks"].values():
        liquids |= set(entry.get("input_liquid") or {})
        liquids |= set(entry.get("output_liquid") or {})
    for liquid in sorted(liquids):
        path = sprites.get(f"liquid-{liquid}")
        if path:
            wanted.append((f"item/{liquid}", path))

    # And the blocks a player is told to build, so "2 impulse-pump" shows the pump.
    for name, entry in catalogue["blocks"].items():
        if entry.get("role") in ("pump", "drill"):
            path = pick(name, sprites)
            if path:
                wanted.append((name, path))

    # The units, for the two blocks whose rate is a flight rather than a recipe. An
    # assembler advances by the fraction of its drones that are in position and a cargo
    # loader's whole output is one unit going back and forth, so a picture without them is
    # a picture of the two blocks whose behaviour is least obvious doing nothing.
    #
    # Only the two the blocks name, not all sixty-nine: a reconstructor's output is a
    # two-hundred pixel sprite that is never drawn here, and packing the lot cost four
    # hundred kilobytes of atlas for nothing anyone would see.
    flown = {entry.get("drone_type") for entry in catalogue["blocks"].values()}
    flown |= {entry.get("unit_type") for entry in catalogue["blocks"].values()}
    for unit in sorted(flown - {None}):
        path = sprites.get(unit)
        if path:
            wanted.append((f"unit/{unit}", path))

    # The hatched backing the game shows behind a schematic, rather than one drawn by hand
    # to look like it.
    backing = "assets/sprites/schematic-background.png"
    if backing in archive.namelist():
        wanted.append(("ui/schematic-background", backing))

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
