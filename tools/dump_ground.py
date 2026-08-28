"""Re-dump which planet each piece of ground belongs to, by generating the planets.

    python tools/dump_ground.py

Same four steps as `dump_blocks.py`, and the same reason for being written down: build the
plugin, install it, boot a server, talk to it. The command is `dump-ground`, and what it
answers is spelled out in `bench/src/mindustryforge/DumpGround.java`: terrain is on no tech
tree, so the walk that gives every buildable block its planet gives every floor none, and
the only honest source left is the game putting the ground down.

Generating a few dozen sectors takes minutes rather than the seconds `dump-blocks` takes,
which is what the longer timeout is for.
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
OUT = ROOT / "bench" / "data" / "planetes-sol.json"


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
        # repository, so a relative one writes the file somewhere nobody looks.
        server.command(f"dump-ground {OUT}", r"\[forge\] wrote the ground", timeout=900)

    print(f"wrote {OUT}, {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
