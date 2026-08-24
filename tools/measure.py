"""Measure one design on the bench, instead of searching for one.

    python tools/measure.py copper-line
    python tools/measure.py copper-line --drills 3
    python tools/measure.py copper-line --design designs/somebody-elses.json

Two jobs, and they are the same job.

The first is the question nobody has asked yet: **is the forge any good?** A search that
delivers 28 copper is a triumph or an embarrassment depending entirely on what a person
would have built in the same square, and until that number exists next to it the search
result means nothing. So this builds the obvious thing a competent player builds, drills
on the thickest ore and a belt to the base, and measures it on the identical bench.

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

from forge import spec as specs
from forge.bench import Area, Bench, choose_area, prepare
from forge.bridge import Bridge
from forge.layout import Design, Line, Machine
from forge.server import ServerProcess, install_plugin
from forge.server_setup import setup_server

BRIDGE_PORT = 7970
GAME_PORT = 6570

#: A mechanical drill covers this many tiles on a side. Its output scales with how much
#: ore sits under it, which is the whole of why placement is a skill.
DRILL_SIZE = 2


def ore_plane(spatial: np.ndarray, channels: list[str], material: str) -> np.ndarray | None:
    name = f"ore_{material}"
    return spatial[channels.index(name)] if name in channels else None


def drill_sites(plane: np.ndarray, area: Area, wanted: int) -> list[tuple[int, int]]:
    """Where a person would put drills: on the thickest ore, nearest the base.

    Scored by how much ore the drill actually covers rather than by whether its own tile
    happens to be ore, because a drill sitting on one tile of a four tile patch runs at a
    quarter speed and looks, from the outside, exactly like a drill that works.
    """
    sites: list[tuple[int, int, int]] = []
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


def from_file(path: Path, spec: specs.Spec) -> Design:
    """A design somebody else wrote down. The shape a submission arrives in."""
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    return Design(
        spec.width, spec.height, spec.palette,
        [Machine(m["x"], m["y"], m["block"]) for m in payload.get("machines", [])],
        [Line(line["x0"], line["y0"], line["x1"], line["y1"], line["block"],
              line.get("horizontal_first", True))
         for line in payload.get("lines", [])],
    )


def material_for(spec: specs.Spec) -> str | None:
    return None if spec.inputs else spec.target if spec.name == "copper-line" else "coal"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("spec", nargs="?", default="copper-line",
                        choices=sorted(specs.CATALOGUE))
    parser.add_argument("--drills", type=int, default=1,
                        help="how many drills the hand-built design gets. One is the first "
                             "thing anybody builds and the honest floor to beat")
    parser.add_argument("--design", type=Path, default=None,
                        help="measure this design instead of building one by hand")
    parser.add_argument("--map", default="Ancient_Caldera")
    parser.add_argument("--world-seed", type=int, default=16,
                        help="must match the run being compared against: Mindustry "
                             "repaints its ore on every load, so two designs measured on "
                             "different seeds were measured on different problems")
    parser.add_argument("--keep-out", type=int, default=3)
    parser.add_argument("--bridge-port", type=int, default=BRIDGE_PORT)
    parser.add_argument("--game-port", type=int, default=GAME_PORT)
    parser.add_argument("--jar", type=Path, default=None)
    args = parser.parse_args()

    spec = specs.get(args.spec)
    jar = str(args.jar or next((Path("bridge") / "build" / "libs").glob("*.jar")))
    directory = setup_server("mindustry-forge")
    install_plugin(directory, jar)

    with ServerProcess(directory, jvm_args=[f"-Dmindustryai.port={args.bridge_port}"],
                       port=args.game_port) as server:
        opened = server.wait_for(
            rf"listening on 127\.0\.0\.1:{args.bridge_port}"
            rf"|could not listen on port {args.bridge_port}",
            timeout=120,
        )
        if "could not listen" in opened:
            raise SystemExit(
                f"the agent socket {args.bridge_port} is already taken. Pass --bridge-port "
                f"and --game-port to sit beside whatever is on it.\n  {opened}"
            )

        with Bridge(port=args.bridge_port, tensor=True, timeout=120.0) as bridge:
            observation = bridge.reset(args.map, "sandbox", seed=args.world_seed)
            server.command("bridge-speed max", r"speed set")

            core = (int(observation["core_x"]), int(observation["core_y"]))
            material = material_for(spec)

            scraped = prepare(bridge, core, material, args.keep_out)
            if scraped:
                observation = bridge.observe()

            area = choose_area(observation["spatial"], bridge.channels, core, spec,
                               material, args.keep_out)

            if args.design is not None:
                design = from_file(args.design, spec)
                source = str(args.design)
            else:
                plane = ore_plane(observation["spatial"], bridge.channels, material or "")
                if plane is None:
                    raise SystemExit(
                        f"this world carries no {material} channel, so a design cannot be "
                        f"built by hand against it. Pass --design instead."
                    )
                design = by_hand(plane, area, spec, args.drills)
                source = f"built by hand, {args.drills} drill(s)"

            if not design.machines and not design.lines:
                raise SystemExit(
                    "no ore in the work area to put a drill on, so there is nothing to "
                    "measure. Try another --world-seed."
                )

            bench = Bench(bridge, spec, area)
            bench.run(design)

            print()
            print(f"design    : {source}")
            print(f"world     : {args.map}, seed {args.world_seed}, "
                  f"{scraped} tiles of {material} scraped around the output")
            print(f"area      : {spec.width}x{spec.height} at ({area.x}, {area.y}), "
                  f"{area.material} tiles of usable material")
            print(f"delivered : {design.delivered} {spec.target} "
                  f"in {spec.ticks / 60:.0f} seconds")
            print(f"blocks    : {design.blocks_standing} standing")
            print(f"stuck     : {design.stuck} {spec.target} going nowhere")
            print()
            print(design.render())
            print()


if __name__ == "__main__":
    main()
