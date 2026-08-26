"""Ask Mindustry to read what the writer produced.

Every other test of the format compares the writer against a reader written from the same
notes, which means the two agree with each other whether or not either is right. This one
hands the bytes to the engine's own decoder.

It needs a JDK and the pinned server jar, so it skips rather than fails when they are
missing: a contributor without a Java toolchain should still get a green suite, and the
one machine that has both is enough to catch the format drifting.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from forge.layout import Design, Line, Machine
from forge.schematic import write

PALETTE = ("air", "conveyor", "mechanical-drill", "junction", "router")

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "tests" / "game" / "CheckSchematic.java"
JAR = ROOT / "mindustry-forge" / "server-release.jar"


needs_java = pytest.mark.skipif(
    not (shutil.which("javac") and shutil.which("java") and JAR.exists()),
    reason="needs a JDK and the pinned server jar: run forge/server_setup.py first",
)


@pytest.fixture(scope="module")
def decoder(tmp_path_factory) -> Path:
    """Compile the checker once, and hand back where it landed."""
    out = tmp_path_factory.mktemp("decoder")
    subprocess.run(["javac", "-cp", str(JAR), "-d", str(out), str(SOURCE)],
                   check=True, capture_output=True, text=True)
    return out


def decode(decoder: Path, payload: bytes, tmp_path: Path) -> list[tuple]:
    """What the game says is in these bytes."""
    target = tmp_path / "probe.msch"
    target.write_bytes(payload)

    result = subprocess.run(
        ["java", "-cp", os.pathsep.join([str(JAR), str(decoder)]),
         "CheckSchematic", str(target)],
        check=True, capture_output=True, text=True,
    )
    if "READ OK" not in result.stdout:
        raise AssertionError(f"the game refused the schematic:\n{result.stdout}\n{result.stderr}")

    tiles = []
    for line in result.stdout.splitlines():
        found = re.match(r"\s+(\d+),(\d+)\s+(\S+)\s+rot=(\d+)", line)
        if found:
            x, y, block, rotation = found.groups()
            tiles.append((int(x), int(y), block, int(rotation)))
    return sorted(tiles)


@needs_java
def test_the_game_reads_back_exactly_what_was_written(decoder, tmp_path):
    design = Design(
        8, 8, PALETTE,
        machines=[Machine(1, 1, "mechanical-drill")],
        lines=[Line(1, 3, 5, 3, "conveyor", True)],
    )
    expected = sorted(
        (x - 1, y - 1, block, rotation) for x, y, block, rotation in design.cells()
    )

    assert decode(decoder, write(design, name="probe"), tmp_path) == expected


@needs_java
def test_the_game_agrees_about_which_way_a_belt_faces(decoder, tmp_path):
    """The one that matters. A rotation read wrong is a line that delivers nothing."""
    design = Design(6, 6, PALETTE, lines=[Line(0, 0, 0, 3, "conveyor", True)])

    tiles = decode(decoder, write(design, name="upwards"), tmp_path)

    assert {rotation for _, _, _, rotation in tiles} == {1}
    assert [(x, y) for x, y, _, _ in tiles] == [(0, 0), (0, 1), (0, 2), (0, 3)]


@needs_java
def test_the_game_agrees_about_which_axis_is_which(decoder, tmp_path):
    """Swapping x and y packs a schematic that loads happily and pastes transposed."""
    design = Design(10, 10, PALETTE,
                    machines=[Machine(0, 0, "router"), Machine(3, 0, "router"),
                              Machine(0, 1, "junction")])

    tiles = decode(decoder, write(design, name="lopsided"), tmp_path)

    assert (3, 0, "router", 0) in tiles
    assert (0, 1, "junction", 0) in tiles
