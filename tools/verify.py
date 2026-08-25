"""Re-measure what the catalogue claims, and disagree out loud when it is wrong.

    python tools/verify.py                       every entry
    python tools/verify.py --spec copper-line    one specification
    python tools/verify.py --changed-against origin/main

This is the auto-validation. A submission from a stranger is not trusted and does not need
to be: its schematic is put back where it says it stood, on the same world, for the same
seconds, and the engine says what it delivered. If that disagrees with the claim, the
entry does not go in.

It costs one candidate. A search costs a thousand and stays on one machine, which is the
asymmetry the whole thing rests on: finding is expensive and verifying is not, so anybody
can check anything, including checking the forge.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from forge import catalogue, schematic, session
from forge import spec as specs

CATALOGUE = Path("docs") / "catalogue.json"

#: How far a re-measurement may sit from the claim before it counts as a disagreement.
#:
#: Not zero. The engine is deterministic given a seed, but a design sitting exactly on the
#: boundary of a production tick can land either side of it, and failing a submission for
#: one item would be failing it for arithmetic rather than for dishonesty.
TOLERANCE = 0.02


def changed_entries(against: str, path: Path) -> set[str] | None:
    """The schematics this branch added or altered, or None if git cannot say."""
    try:
        before = subprocess.run(["git", "show", f"{against}:{path.as_posix()}"],
                                capture_output=True, text=True, check=True).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None

    try:
        payload = json.loads(before)
    except json.JSONDecodeError:
        return None

    known = {entry.get("schematic") for entry in payload.get("entries", [])}
    return {e.schematic for e in catalogue.load(path)} - known


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--catalogue", type=Path, default=CATALOGUE)
    parser.add_argument("--spec", default=None, help="only this specification")
    parser.add_argument("--changed-against", default=None, metavar="REF",
                        help="only entries this branch added, compared with that ref")
    parser.add_argument("--tolerance", type=float, default=TOLERANCE)
    session.add_world_arguments(parser)
    args = parser.parse_args()

    entries = catalogue.load(args.catalogue)
    if args.spec:
        entries = [e for e in entries if e.spec == args.spec]

    if args.changed_against:
        fresh = changed_entries(args.changed_against, args.catalogue)
        if fresh is None:
            print(f"cannot read {args.catalogue} at {args.changed_against}, "
                  f"checking everything instead")
        else:
            entries = [e for e in entries if e.schematic in fresh]
            print(f"{len(entries)} entry(s) added against {args.changed_against}")

    if not entries:
        print("nothing to verify")
        return 0

    # Grouped, because opening a world costs a server boot and every entry of one
    # specification shares the same one.
    disagreements = []
    for spec_name in sorted({e.spec for e in entries}):
        mine = [e for e in entries if e.spec == spec_name]
        spec = specs.get(spec_name)
        conditions = mine[0].conditions

        print()
        print(f"=== {spec_name}: {len(mine)} entry(s) ===")

        with session.opened(spec, map_name=conditions.map,
                            world_seed=conditions.world_seed,
                            keep_out=conditions.keep_out,
                            bridge_port=args.bridge_port, game_port=args.game_port,
                            jar=args.jar) as world:
            if world.conditions != conditions:
                for difference in world.conditions.differences(conditions):
                    print(f"  conditions do not match the entry: {difference}")
                disagreements.append((mine[0], "the bench is not the one it was measured on"))
                continue

            for entry in mine:
                problem = check(world, spec, entry, args.tolerance)
                if problem:
                    disagreements.append((entry, problem))

    print()
    if disagreements:
        print(f"{len(disagreements)} entry(s) do not hold up:")
        for entry, problem in disagreements:
            print(f"  {entry.name or entry.schematic[:24]}: {problem}")
        return 1

    print(f"every entry holds up ({len(entries)} checked)")
    return 0


def check(world, spec, entry, tolerance: float) -> str | None:
    """Put one entry back on the bench. Returns what is wrong, or None."""
    parsed = schematic.from_base64(entry.schematic)
    corner = world.from_core(*entry.origin)
    design = schematic.as_layout(parsed, spec.width, spec.height, corner)

    if design.used() != len(parsed["tiles"]):
        return (f"only {design.used()} of {len(parsed['tiles'])} tiles fall inside the "
                f"work area at origin {tuple(entry.origin)}")

    world.bench.run(design)
    delivered, blocks = design.delivered or 0, design.blocks_standing

    label = entry.name or entry.author
    print(f"  {label:38} claimed {entry.delivered:5d} in {entry.blocks:3d}   "
          f"measured {delivered:5d} in {blocks:3d}")

    allowed = max(1.0, entry.delivered * tolerance)
    if abs(delivered - entry.delivered) > allowed:
        return (f"claims {entry.delivered} {spec.target}, delivered {delivered}")
    if blocks != entry.blocks:
        return f"claims {entry.blocks} blocks, {blocks} stood"
    return None


if __name__ == "__main__":
    raise SystemExit(main())
