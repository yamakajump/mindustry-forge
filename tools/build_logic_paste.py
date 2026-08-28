"""Paste a schematic into the real game, and write down what it reads.

    python tools/build_logic_paste.py

A processor's program comes out of three nested formats: the schematic, one tile's
configuration, the compressed program blob. All three are written in this repository, and a
round trip between them proves one thing only, that this code agrees with this code.

So: `tools/js/logique-collee.mjs` builds the schematic, `tools/LogicPaste.java` hands it to
`Schematics.readBase64` exactly as the game's paste key does, and the verdict goes to
`bench/data/logique-collee.json`. The test reads it back without needing a JVM.

What it found on the first pass: the version byte of a processor configuration is 1, not 0.
Both sides read either one back, because the game's reader discards it, so the mistake was
invisible from here. `matches_game_writer` is the field that said so.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

BUILDER = Path("tools/js/logique-collee.mjs")
PASTE = Path("tools/LogicPaste.java")
TARGET = Path("bench/data/logique-collee.json")

#: Where the other scripts in this repository look for the game, from the parent folder.
DEFAULT_CLASSES = Path("../mindustry-ai/mindustry-env/server-release.jar")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--classes", type=Path, default=DEFAULT_CLASSES)
    parser.add_argument("--target", type=Path, default=TARGET)
    args = parser.parse_args()

    if not args.classes.exists():
        raise SystemExit(f"not found: {args.classes}")

    built = subprocess.run(["node", str(BUILDER)], capture_output=True, text=True,
                           encoding="utf-8")
    if built.returncode or not built.stdout.strip():
        raise SystemExit(built.stderr.strip() or "node wrote nothing")

    seen = subprocess.run(["java", "-cp", str(args.classes), str(PASTE)],
                          input=built.stdout, capture_output=True, text=True,
                          encoding="utf-8")
    if seen.returncode:
        raise SystemExit(seen.stderr.strip() or "java failed")

    # The game chatters about its sectors while loading content; only the last line is the
    # answer.
    verdict = json.loads(seen.stdout.strip().splitlines()[-1])
    args.target.write_text(
        json.dumps(verdict, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    processors = verdict.get("processors", [])
    same = all(entry.get("matches_game_writer") for entry in processors)
    print(f"{args.target}: {len(processors)} processor(s) read back by the game, "
          f"bytes identical to its own writer: {'yes' if same else 'NO'}")


if __name__ == "__main__":
    main()
