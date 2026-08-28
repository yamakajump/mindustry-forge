"""Re-dump the game's block data by running the pinned headless server.

    python tools/dump_blocks.py

`dump-blocks` is a console command of the bench plugin rather than a Gradle target, so
getting block data out of the game means building the plugin, installing it, booting a
server and talking to it. Written down as a script because a plan that guessed it was a
Gradle task has already been written once, and because the four steps are the kind that
get half-remembered.

The plugin's own `DumpBlocks.defaultOut()` still points at `analyser/data/blocks.json`,
a path from before the repository was restarted, so the destination is always passed
explicitly.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from bench.server import ServerProcess, install_plugin
from bench.server_setup import setup_server

RUN = ROOT / "_run"
JAR = ROOT / "bench" / "build" / "libs" / "mindustry-forge-bench.jar"
OUT = ROOT / "bench" / "data" / "blocks.json"


def main() -> None:
    # An absolute path, not a bare "gradlew.bat": Windows resolves a name with no path
    # separator against PATH and the parent process's own directory, never against the
    # `cwd=` given to subprocess.run, so the obvious spelling is never found here.
    gradlew = ROOT / "bench" / ("gradlew.bat" if sys.platform == "win32" else "gradlew")
    subprocess.run([str(gradlew), "jar"], cwd=ROOT / "bench", check=True)

    server_dir = setup_server(RUN)
    install_plugin(server_dir, JAR)

    with ServerProcess(server_dir) as server:
        # An absolute path: the server's working directory is the run directory, not the
        # repository, so a relative one writes the catalogue somewhere nobody looks.
        server.command(f"dump-blocks {OUT}", r"\[forge\] wrote", timeout=120)

    print(f"wrote {OUT}, {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
