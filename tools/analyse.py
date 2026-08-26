"""Analyse a schematic from the command line.

    python tools/analyse.py "bXNjaAF4nD..."
    python tools/analyse.py --file ma-base.msch --supply coal=4

The same call the site will make, kept usable without the site so the analysis can be
checked against the game without a browser in the way.
"""

from __future__ import annotations

import argparse
import base64
import sys
from pathlib import Path

from analyser import report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("text", nargs="?", help="the string the game put on your clipboard")
    parser.add_argument("--file", type=Path, help="a .msch file instead")
    parser.add_argument("--supply", action="append", default=[],
                        help="what arrives from outside, as item=rate per second")
    args = parser.parse_args()

    if args.file:
        text = base64.b64encode(args.file.read_bytes()).decode("ascii")
    elif args.text:
        text = args.text.strip()
    else:
        text = sys.stdin.read().strip()

    supply = {}
    for pair in args.supply:
        item, _, rate = pair.partition("=")
        supply[item] = float(rate or 0)

    print(report.analyse(text, supply=supply or None))


if __name__ == "__main__":
    main()
