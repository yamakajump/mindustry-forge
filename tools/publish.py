"""Put a measured design into the warehouse.

    python tools/publish.py designs/copper-line-density.entry.json
    python tools/publish.py designs/*.entry.json

Merging only. Nothing here measures anything, and nothing here trusts anything either:
what it checks is that an entry can be ranked honestly against the ones already in its
category, which mostly means that it was measured on the same world, the same seed and
the same engine. `tools/verify.py` is what checks that the numbers are true.

The catalogue is a JSON file in the repository rather than a database, so a submission is
a diff somebody can read and an entry can be withdrawn by deleting a few lines.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from forge import catalogue

CATALOGUE = Path("docs") / "catalogue.json"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("entries", nargs="+", type=Path,
                        help="entry files, as written by optimise.py or measure.py")
    parser.add_argument("--catalogue", type=Path, default=CATALOGUE)
    parser.add_argument("--dry-run", action="store_true",
                        help="say what would happen and write nothing")
    args = parser.parse_args()

    entries = catalogue.load(args.catalogue)
    before = len(entries)
    refused = 0

    for path in args.entries:
        candidate = catalogue.Entry.of(json.loads(path.read_text(encoding="utf-8")))
        accepted, why = catalogue.admit(entries, candidate)

        if not accepted:
            print(f"refused : {path.name}")
            print(f"          {why}")
            refused += 1
            continue

        position = catalogue.place(entries, candidate)
        total = len(catalogue.ranked(entries, *candidate.category)) + 1
        entries.append(candidate)
        crown = "  <- new leader" if position == 1 else ""
        print(f"added   : {path.name}")
        print(f"          {candidate.spec} / {candidate.objective}, "
              f"{candidate.delivered} delivered, {candidate.blocks} blocks, "
              f"placed {position} of {total}{crown}")

    if args.dry_run:
        print()
        print(f"dry run: {len(entries) - before} would join, {refused} refused")
        return 1 if refused else 0

    catalogue.save(args.catalogue, entries)
    print()
    print(f"{args.catalogue}: {before} -> {len(entries)} entries, {refused} refused")
    return 1 if refused else 0


if __name__ == "__main__":
    raise SystemExit(main())
