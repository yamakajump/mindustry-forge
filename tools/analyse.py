"""Analyse a schematic from the command line.

    python tools/analyse.py                      # reads what you copied in the game
    python tools/analyse.py "bXNjaAF4nD..."
    python tools/analyse.py --file ma-base.msch --supply coal=4

The same call the site will make, kept usable without the site so the analysis can be
checked against the game without a browser in the way.

With no argument it reads the clipboard, because that is where a schematic already is:
select a build in Mindustry, press ctrl+c, run this. Asking a player to paste a nine
hundred character string into a terminal is asking them not to bother.
"""

from __future__ import annotations

import argparse
import base64
import re
import subprocess
import sys
from pathlib import Path

from analyser import report

#: Mindustry copies a bare base64 blob. Anything else on the clipboard is not one, and the
#: check is worth having: a helpful error beats a stack trace out of the base64 decoder.
LOOKS_LIKE = re.compile(r"^[A-Za-z0-9+/=\s]+$")


def from_clipboard() -> str:
    """What is on the clipboard, via PowerShell so nothing has to be installed."""
    try:
        done = subprocess.run(
            ["powershell", "-NoProfile", "-Command", "Get-Clipboard -Raw"],
            capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError) as error:
        raise SystemExit(f"could not read the clipboard: {error}") from error
    return done.stdout.strip()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("text", nargs="?", help="the string the game put on your clipboard")
    parser.add_argument("--file", type=Path, help="a .msch file instead")
    parser.add_argument("--stdin", action="store_true", help="read the string from stdin")
    parser.add_argument("--supply", action="append", default=[],
                        help="what arrives from outside, as item=rate per second")
    args = parser.parse_args()

    if args.file:
        text = base64.b64encode(args.file.read_bytes()).decode("ascii")
    elif args.text:
        text = args.text.strip()
    elif args.stdin:
        text = sys.stdin.read().strip()
    else:
        text = from_clipboard()
        if not text:
            raise SystemExit(
                "le presse-papiers est vide. Dans Mindustry : selectionne des blocs, "
                "ctrl+c, puis relance.")
        if not LOOKS_LIKE.match(text):
            raise SystemExit(
                "ce qui est dans le presse-papiers n'est pas une schematique. "
                "Dans Mindustry : selectionne des blocs, ctrl+c, puis relance.")

    text = "".join(text.split())
    supply = {}
    for pair in args.supply:
        item, _, rate = pair.partition("=")
        supply[item] = float(rate or 0)

    try:
        print(report.analyse(text, supply=supply or None))
    except ValueError as error:
        raise SystemExit(f"schematique illisible : {error}") from error


if __name__ == "__main__":
    main()
