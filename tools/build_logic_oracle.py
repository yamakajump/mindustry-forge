"""Ask the game to read a shelf of programs, and write down what it made of them.

    python tools/build_logic_oracle.py

`bench/data/logique/*.mlog` is a shelf of small programs, each one aimed at a corner of the
language: labels, semicolons, a quote left open, an instruction that does not exist, one
that only a world processor may run. This runs Mindustry's own parser over every one of
them and records the verdict in `bench/data/logique-oracle.json`.

The recording is committed and `npm test` reads it, so the editor is held against the game
on every run while the game itself is needed only when the shelf changes. Same arrangement
as `bench/data/oracle`, for the same reason: a check nobody can run is a check nobody runs.

What it caught, on the first pass, and none of it was guessable:

  * An instruction the game does not know becomes `noop`. It is not refused. A typo runs.
  * So does an instruction reserved to the world processor. `setrate` in a schematic is a
    line that does nothing, silently, forever.
  * Operands beyond the count are dropped, also silently.
  * `atan2`, `dst` and `configure` are quietly rewritten to `angle`, `len` and `config`.
  * A quote left open, or a label defined twice, refuses the whole program.

Needs a JDK and the server jar. Neither is needed to run the tests afterwards.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

CORPUS = Path("bench/data/logique")
TARGET = Path("bench/data/logique-oracle.json")
ORACLE = Path("tools/LogicOracle.java")

#: Where the other scripts in this repository look for the game, from the parent folder.
DEFAULT_CLASSES = Path("../mindustry-ai/mindustry-env/server-release.jar")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--classes", type=Path, default=DEFAULT_CLASSES)
    parser.add_argument("--corpus", type=Path, default=CORPUS)
    parser.add_argument("--target", type=Path, default=TARGET)
    args = parser.parse_args()

    if not args.classes.exists():
        raise SystemExit(f"introuvable : {args.classes}")

    result = subprocess.run(
        ["java", "-cp", str(args.classes), str(ORACLE), str(args.corpus)],
        capture_output=True, text=True, encoding="utf-8")
    if result.returncode:
        raise SystemExit(result.stderr.strip() or "java a echoue")

    verdicts = json.loads(result.stdout)
    args.target.write_text(
        json.dumps(verdicts, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    refused = sum(1 for entry in verdicts.values() if "refused" in entry)
    print(f"{args.target} : {len(verdicts)} programmes, {refused} refuses par le jeu")


if __name__ == "__main__":
    main()
