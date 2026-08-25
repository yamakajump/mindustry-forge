"""Ask the forge for a design, and watch it look.

    python tools/optimise.py copper-line
    python tools/optimise.py graphite --objective compact
    python tools/optimise.py copper-line --objective budget --budget-blocks 20

Every candidate is stamped into a real Mindustry world, given a few seconds, and scored on
what the engine says came out. Nothing here is told what a conveyor is for. The rules of
the game are the whole of the fitness function, so whatever comes back is the forge's own
answer rather than a blueprint copied off somebody who already knew one.

A run leaves two files behind: the record, with the whole history so the run can be read
after it ends, and the catalogue entry, which is what `tools/publish.py` puts in the
warehouse.
"""

from __future__ import annotations

import argparse
import base64
import json
import random
import sys
import time
from pathlib import Path

# Python puts the *script's* directory on the import path, not the one it was run from,
# so `python tools/optimise.py` searches tools/ for a package that lives beside it and
# fails before argparse is ever reached. Adding the repository root keeps the documented
# command working from a fresh clone, with no install step and no PYTHONPATH to remember.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from forge import catalogue
from forge import objective as objectives
from forge import schematic
from forge import session
from forge import spec as specs
from forge.evolve import Population, standing
from forge.watch import Run, serve


def entry_for(best, spec, args, run_session) -> catalogue.Entry:
    """The design, written down the way the warehouse wants it."""
    left, bottom, _, _, _ = schematic.cropped(schematic.cells_of(best))
    return catalogue.Entry(
        spec=spec.name,
        objective=args.objective,
        author="mindustry-forge",
        schematic=schematic.to_base64(
            best, name=f"{spec.name} / {args.objective}",
            description=(f"{best.delivered} {spec.target} in {spec.ticks / 60:.0f}s, "
                         f"{standing(best)} blocks, found by mindustry-forge"),
        ),
        delivered=best.delivered,
        blocks=standing(best),
        stuck=best.stuck,
        conditions=run_session.conditions,
        origin=run_session.core_offset(left, bottom),
        name=f"{spec.name} / {args.objective}",
        notes=(f"{args.generations} generations of {args.population}, "
               f"{args.genome} genome, seed {args.seed}"),
        options=objective_options(args),
    )


def objective_options(args) -> dict:
    return {"budget": {"blocks": args.budget_blocks},
            "throughput": {"block_cost": args.block_cost}}.get(args.objective, {})


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
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--port", type=int, default=8900,
                        help="where to serve the live view")
    parser.add_argument("--no-open", dest="open", action="store_false", default=True)
    parser.add_argument("--out", type=Path, default=Path("designs"))
    session.add_world_arguments(parser)
    args = parser.parse_args()

    spec = specs.get(args.spec)
    score = objectives.get(args.objective, **objective_options(args))

    run = Run(f"{spec.name} / {args.objective}")
    run.describe(spec, args.objective, args.genome, args.population)
    url = serve(run, args.port)

    print(f"forge   : {spec.name} -> {spec.target}, {args.objective}")
    print(f"watch   : {url}")
    if args.open:
        import webbrowser

        webbrowser.open(url)

    with session.opened(spec, map_name=args.map, world_seed=args.world_seed,
                        keep_out=args.keep_out, bridge_port=args.bridge_port,
                        game_port=args.game_port, jar=args.jar) as world:
        print()
        population = Population(spec, score, size=args.population,
                                genome=args.genome, rng=random.Random(args.seed))
        population.seed()

        started = time.time()
        for generation in range(1, args.generations + 1):
            for candidate in population.members:
                if candidate.delivered is None:
                    world.bench.run(candidate)

            report = population.report()
            run.record(report, population.best(), time.time() - started)
            print(f"generation {generation:3d}  best {report['best_delivered']:5d} "
                  f"{spec.target} with {report['best_blocks']:3d} blocks  "
                  f"{report['working']:3d}/{report['size']} work  "
                  f"score {report['best_score']:9.2f}  stuck {report['most_stuck']:5d}",
                  flush=True)

            population.advance()

        best = population.best()
        entry = entry_for(best, spec, args, world) if best and best.delivered else None

    print()
    if best is None or not best.delivered:
        print("nothing delivered. Either the world has no reachable ore for this")
        print("specification, the time budget is too short for one to show, or there were")
        print("too few generations: on this bench the first delivery has taken ten.")
    else:
        print(f"{best.delivered} {spec.target} in {spec.ticks / 60:.0f} seconds, "
              f"{standing(best)} blocks")
        print()
        print(best.render())
        print()
        print("paste into the game with ctrl+v:")
        print(entry.schematic)

    # Written whether or not anything worked. A run that found nothing is exactly the run
    # worth reading afterwards, and an early return left nothing to read.
    args.out.mkdir(parents=True, exist_ok=True)
    stem = f"{spec.name}-{args.objective}"

    record = args.out / f"{stem}.json"
    record.write_text(json.dumps({
        "spec": spec.name, "target": spec.target, "objective": args.objective,
        "genome": args.genome, "delivered": best.delivered if best else 0,
        "blocks": standing(best) if best else 0,
        "text": best.render() if best else "",
        "cells": ([list(cell) for cell in schematic.cells_of(best)] if best else []),
        "history": run.snapshot()["history"],
    }, indent=2), encoding="utf-8")

    written = [record]
    if entry is not None:
        (args.out / f"{stem}.msch").write_bytes(base64.b64decode(entry.schematic))
        submission = args.out / f"{stem}.entry.json"
        submission.write_text(json.dumps(entry.to_json(), indent=2) + "\n",
                              encoding="utf-8")
        written += [args.out / f"{stem}.msch", submission]

    print()
    for path in written:
        print(f"written : {path}")
    if entry is not None:
        print()
        print(f"put it in the catalogue with:  python tools/publish.py {submission}")


if __name__ == "__main__":
    main()
