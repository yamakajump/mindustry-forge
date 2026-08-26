"""Open the analyser in a browser.

    python tools/serve.py

Paste a schematic or drop a `.msch` file, get told what it makes, where it chokes and what
it wastes. The marketplace will be Laravel calling the same endpoint; this is that endpoint
plus a page, so the two cannot drift into disagreeing about what a schematic does.
"""

from __future__ import annotations

import argparse

from analyser import web


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8770)
    parser.add_argument("--no-open", dest="open", action="store_false", default=True)
    args = parser.parse_args()
    web.serve(args.port, open_browser=args.open)


if __name__ == "__main__":
    main()
