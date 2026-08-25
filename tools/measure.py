"""Measure one design on the bench, instead of searching for one.

    python tools/measure.py copper-line
    python tools/measure.py copper-line --drills 3
    python tools/measure.py copper-line --schematic bXNjaAF4nA... --origin -4 -7

Two jobs, and they are the same job.

The first is the question that has to be answered before any of this is worth building:
**is the forge any good?** A search that delivers 28 copper is a triumph or an
embarrassment depending entirely on what a person would have built in the same square, so
this builds the obvious thing a competent player builds, drills on the thickest ore and a
belt to the base, and measures it on the identical bench.

The second is what turns a catalogue into a leaderboard. A submission from a stranger
cannot be trusted and does not need to be: it is stamped into the same world, given the
same seconds, and the engine says what it delivered. Searching costs a thousand candidates
and stays on one machine. Verifying costs one, and can run anywhere.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

# See tools/optimise.py: the script's own directory is what lands on the import path.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from forge import catalogue
from forge import schematic
from forge import session
from forge import spec as specs
from forge.bench import Area
from forge.layout import Design, Line, Machine

#: A mechanical drill covers this many tiles on a side. Its output scales with how much
#: ore sits under it, which is the whole of why placement is a skill.
DRILL_SIZE = 2


def drill_sites(plane: np.ndarray, area: Area, wanted: int) -> list[tuple[int, int]]:
    """Where a person would put drills: on the thickest ore, nearest the base.

    Scored by how much ore the drill actually covers rather than by whether its own tile
    happens to be ore, because a drill sitting on one tile of a four tile patch runs at a
    quarter speed and looks, from the outside, exactly like a drill that works.
    """
    sites: list[tuple[int, int, tuple[int, int]]] = []
    for y in range(area.height - DRILL_SIZE + 1):
        for x in range(area.width - DRILL_SIZE + 1):
            tiles = [(area.x + x + dx, area.y + y + dy)
                     for dy in range(DRILL_SIZE) for dx in range(DRILL_SIZE)]
            if any(tile in area.spared for tile in tiles):
                continue
            covered = sum(1 for tx, ty in tiles if plane[ty, tx] > 0)
            if covered:
                distance = abs(area.x + x - area.core[0]) + abs(area.y + y - area.core[1])
                sites.append((-covered, distance, (x, y)))

    chosen: list[tuple[int, int]] = []
    for _, _, site in sorted(sites):
        # Drills may not overlap, and two that do would have the second one refused, which
        # reads in the result as a design that placed fewer blocks than it asked for.
        if all(abs(site[0] - kx) >= DRILL_SIZE or abs(site[1] - ky) >= DRILL_SIZE
               for kx, ky in chosen):
            chosen.append(site)
        if len(chosen) == wanted:
            break
    return chosen


def by_hand(plane: np.ndarray, area: Area, spec: specs.Spec, drills: int) -> Design:
    """The obvious design: a drill on ore, a belt to the base, repeated.

    The belt is aimed at the middle of the core rather than at its edge. Tiles that land
    on the core are refused when the design is stamped, so the last one that stands is the
    one beside it, still carrying the direction it was travelling, which is into the core.
    Aiming at the edge instead means guessing the core's size, and guessing it wrong by one
    is a line that delivers nothing.
    """
    core = (area.core[0] - area.x, area.core[1] - area.y)

    machines, lines = [], []
    for x, y in drill_sites(plane, area, drills):
        machines.append(Machine(x, y, "mechanical-drill"))
        # Travel along the longer axis first: the elbow then sits away from the base,
        # where there is room, rather than in the crowd of belts already arriving.
        horizontal_first = abs(core[0] - x) >= abs(core[1] - y)
        lines.append(Line(x, y, core[0], core[1], "conveyor", horizontal_first))

    return Design(spec.width, spec.height, spec.palette, machines, lines)


def read_schematic(source: str) -> str:
    """A base64 string, or the path to a file holding one, or a `.msch`."""
    path = Path(source)
    if not path.exists():
        return source.strip()
    if path.suffix == ".msch":
        import base64

        return base64.b64encode(path.read_bytes()).decode("ascii")
    return path.read_text(encoding="utf-8").strip()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("spec", nargs="?", default="copper-line",
                        choices=sorted(specs.CATALOGUE))
    parser.add_argument("--drills", type=int, default=1,
                        help="how many drills the hand-built design gets. One is the first "
                             "thing anybody builds and the honest floor to beat")
    parser.add_argument("--schematic", default=None,
                        help="measure this instead of building one: a base64 string, a "
                             "file holding one, or a .msch")
    parser.add_argument("--origin", type=int, nargs=2, default=None,
                        metavar=("DX", "DY"),
                        help="where the schematic's lower left corner sits, as an offset "
                             "from the output. Required with --schematic: a design put "
                             "back somewhere else is a different design")
    parser.add_argument("--author", default="by hand")
    parser.add_argument("--objective", default="density",
                        help="which leaderboard the entry is for")
    parser.add_argument("--out", type=Path, default=None,
                        help="write a catalogue entry here")
    session.add_world_arguments(parser)
    args = parser.parse_args()

    spec = specs.get(args.spec)
    if args.schematic and args.origin is None:
        raise SystemExit("--schematic needs --origin: see the entry it came from")

    with session.opened(spec, map_name=args.map, world_seed=args.world_seed,
                        keep_out=args.keep_out, bridge_port=args.bridge_port,
                        game_port=args.game_port, jar=args.jar) as world:
        if args.schematic:
            pasted = read_schematic(args.schematic)
            parsed = schematic.from_base64(pasted)
            corner = world.from_core(*args.origin)
            design = schematic.as_layout(parsed, spec.width, spec.height, corner)
            if design.used() != len(parsed["tiles"]):
                raise SystemExit(
                    f"only {design.used()} of {len(parsed['tiles'])} tiles fall inside the "
                    f"work area at that origin, so this would measure a different design"
                )
            source = f"schematic at {tuple(args.origin)} from the output"
        else:
            plane = world.bridge.observe()["spatial"]
            channels = world.bridge.channels
            name = f"ore_{spec.mined}"
            if name not in channels:
                raise SystemExit(
                    f"this world carries no {spec.mined} channel, so nothing can be built "
                    f"by hand against it. Pass --schematic instead."
                )
            design = by_hand(plane[channels.index(name)], world.area, spec, args.drills)
            source = f"built by hand, {args.drills} drill(s)"

        if not design.used():
            raise SystemExit("there is nothing here to measure")

        world.bench.run(design)

        left, bottom, _, _, _ = schematic.cropped(schematic.cells_of(design))
        entry = catalogue.Entry(
            spec=spec.name, objective=args.objective, author=args.author,
            schematic=schematic.to_base64(
                design, name=f"{spec.name} / {args.author}",
                description=(f"{design.delivered} {spec.target} in "
                             f"{spec.ticks / 60:.0f}s, {design.blocks_standing} blocks"),
            ) if design.delivered else "",
            delivered=design.delivered or 0, blocks=design.blocks_standing,
            stuck=design.stuck, conditions=world.conditions,
            origin=world.core_offset(left, bottom),
            name=f"{spec.name} / {args.author}", notes=source,
        )

    print()
    print(f"design    : {source}")
    print(f"delivered : {design.delivered} {spec.target} in {spec.ticks / 60:.0f} seconds")
    print(f"blocks    : {design.blocks_standing} standing")
    print(f"stuck     : {design.stuck} {spec.target} going nowhere")
    print(f"per block : {(design.delivered or 0) / max(1, design.blocks_standing):.2f}")
    print()
    print(design.render())

    if entry.schematic:
        print()
        print("paste into the game with ctrl+v:")
        print(entry.schematic)

    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(entry.to_json(), indent=2) + "\n", encoding="utf-8")
        print()
        print(f"written   : {args.out}")


if __name__ == "__main__":
    main()
