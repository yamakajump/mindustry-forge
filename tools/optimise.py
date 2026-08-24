"""Ask the forge for a design, and watch it look.

    python tools/optimise.py copper-line
    python tools/optimise.py graphite --objective compact
    python tools/optimise.py copper-line --objective budget --budget-blocks 20

Every candidate is stamped into a real Mindustry world, given a few seconds, and scored on
what the engine says came out. Nothing here is told what a conveyor is for. The rules of
the game are the whole of the fitness function, so whatever comes back is the forge's own
answer rather than a blueprint copied off somebody who already knew one.
"""

from __future__ import annotations

import argparse
import json
import random
import time
import webbrowser
from pathlib import Path

from forge import objective as objectives
from forge import spec as specs
from forge.bench import Bench, choose_area, prepare
from forge.bridge import Bridge
from forge.evolve import Population
from forge.server import ServerProcess, install_plugin
from forge.server_setup import setup_server
from forge.watch import Run, serve

BRIDGE_PORT = 7970
GAME_PORT = 6570


def material_for(spec: specs.Spec) -> str | None:
    """The ore a design has to be sat on, if any.

    A specification with inputs is fed from its ports and can be built anywhere. One
    without them has to mine, so the work area is worthless unless it covers ore.
    """
    return None if spec.inputs else spec.target if spec.name == "copper-line" else "coal"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("spec", nargs="?", default="copper-line",
                        choices=sorted(specs.CATALOGUE),
                        help="what to build: what goes in, what comes out, how big")
    parser.add_argument("--objective", default="throughput",
                        choices=sorted(objectives.OBJECTIVES),
                        help="what best means: as much as possible, as small as possible, "
                             "as much per block, or as much inside a budget")
    parser.add_argument("--budget-blocks", type=int, default=20,
                        help="the ceiling, when the objective is a budget")
    parser.add_argument("--block-cost", type=float, default=0.05,
                        help="what a block costs against a unit delivered, for throughput")
    parser.add_argument("--genome", default="parts", choices=("cells", "parts"),
                        help="cells writes a design one square at a time; parts writes it "
                             "as machines and lines, so a line is one gene and cannot be "
                             "wrong")
    parser.add_argument("--population", type=int, default=48)
    parser.add_argument("--generations", type=int, default=40)
    parser.add_argument("--map", default="Ancient_Caldera")
    parser.add_argument("--world-seed", type=int, default=16,
                        help="pins the ore. Mindustry repaints it on every load, so "
                             "without this two runs are not comparable")
    parser.add_argument("--keep-out", type=int, default=3,
                        help="tiles around the output whose material is scraped off the "
                             "map, so that a line is the only way to deliver anything")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--port", type=int, default=8900)
    parser.add_argument("--no-open", dest="open", action="store_false", default=True)
    parser.add_argument("--out", type=Path, default=Path("designs"))
    parser.add_argument("--jar", type=Path, default=None)
    args = parser.parse_args()

    spec = specs.get(args.spec)
    options = {"budget": {"blocks": args.budget_blocks},
               "throughput": {"block_cost": args.block_cost}}.get(args.objective, {})
    score = objectives.get(args.objective, **options)

    run = Run(f"{spec.name} / {args.objective}")
    run.describe(spec, args.objective, args.genome, args.population)
    url = serve(run, args.port)

    jar = str(args.jar or next((Path("bridge") / "build" / "libs").glob("*.jar")))
    directory = setup_server("mindustry-forge")
    install_plugin(directory, jar)

    print(f"forge   : {spec.name} -> {spec.target}, {args.objective}")
    print(f"watch   : {url}")
    if args.open:
        webbrowser.open(url)

    with ServerProcess(directory, jvm_args=[f"-Dmindustryai.port={BRIDGE_PORT}"],
                       port=GAME_PORT) as server:
        server.wait_for(rf"listening on 127\.0\.0\.1:{BRIDGE_PORT}", timeout=120)

        with Bridge(port=BRIDGE_PORT, tensor=True, timeout=120.0) as bridge:
            # Sandbox, so a candidate is never refused for being unaffordable. What is
            # being searched for is a shape that works, and making the search pay for
            # copper would only teach it to be small.
            observation = bridge.reset(args.map, "sandbox", seed=args.world_seed)
            server.command("bridge-speed max", r"speed set")

            core = (int(observation["core_x"]), int(observation["core_y"]))
            material = material_for(spec)

            # Before anything is measured, and before the area is chosen against a map
            # that is about to change under it.
            scraped = prepare(bridge, core, material, args.keep_out)
            if scraped:
                observation = bridge.observe()

            area = choose_area(observation["spatial"], bridge.channels, core, spec,
                               material, args.keep_out)

            print(f"scraped : {scraped} tiles of {material or 'nothing'} within "
                  f"{args.keep_out} of the output, so a line is the only way to deliver")
            print(f"area    : {spec.width}x{spec.height} at ({area.x}, {area.y}), "
                  f"{area.material} tiles of usable material")
            print()
            if material is not None and area.material == 0:
                raise SystemExit(
                    "no usable material in the work area: nothing here can deliver "
                    "anything, and the search would be measuring noise. Try another "
                    "--world-seed."
                )

            bench = Bench(bridge, spec, area)
            population = Population(spec, score, size=args.population,
                                    genome=args.genome, rng=random.Random(args.seed))
            population.seed()

            started = time.time()
            for generation in range(1, args.generations + 1):
                for candidate in population.members:
                    if candidate.delivered is None:
                        bench.run(candidate)

                report = population.report()
                run.record(report, population.best(), time.time() - started)
                print(f"generation {generation:3d}  best {report['best_delivered']:5d} "
                      f"{spec.target} with {report['best_blocks']:3d} blocks  "
                      f"{report['working']:3d}/{report['size']} work  "
                      f"score {report['best_score']:9.2f}  stuck {report['most_stuck']:5d}",
                      flush=True)

                if generation < args.generations:
                    population.advance()

            run.finish()
            best = population.best()

    print()
    if best is None or not best.delivered:
        print("Nothing delivered anything. Either the work area has no workable design in")
        print("it, the time budget is too short for one to show, or there were too few")
        print("generations: on this bench the first delivery has taken ten of them.")
    else:
        print(f"{best.delivered} {spec.target} in {spec.ticks / 60:.0f} seconds, "
              f"{best.used()} blocks")
        print()
        print(best.render())

    # Written whether or not anything worked. A run that found nothing is exactly the run
    # worth reading afterwards, and an early return left nothing to read.
    args.out.mkdir(parents=True, exist_ok=True)
    written = args.out / f"{spec.name}-{args.objective}.json"
    written.write_text(json.dumps({
        "spec": spec.name, "target": spec.target, "objective": args.objective,
        "genome": args.genome, "map": args.map, "world_seed": args.world_seed,
        "area": [area.x, area.y, spec.width, spec.height], "core": list(area.core),
        "ticks": spec.ticks,
        "delivered": best.delivered if best else 0,
        "blocks": best.used() if best else 0,
        "text": best.render() if best else "",
        "cells": ([[x, y, block, rotation] for x, y, block, rotation in best.cells()]
                  if best else []),
        "history": run.snapshot()["history"],
    }, indent=2), encoding="utf-8")
    print(f"written to {written}")


if __name__ == "__main__":
    main()
