"""Ask Mindustry to read what the writer produced.

`test_schematic.py` compares the writer against a reader written from the same notes, so
the two agree with each other whether or not either is right. This one hands the bytes to
the engine's own decoder, through `tests/game/CheckSchematic.java`, and the failure it
catches is the silent kind: a field written in the wrong order still decodes, still
pastes, and lands as rubble in somebody's base.

It needs a JDK and the pinned server jar, so it skips rather than fails when they are
missing: a contributor without a Java toolchain should still get a green suite, and the
one machine that has both is enough to catch the format drifting.

    python bench/server_setup.py _run   # fetches the pinned v159.7 jar
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from bench import schematic

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "tests" / "game" / "CheckSchematic.java"
#: Where `bench/server_setup.py` and `npm run oracle:measure` both expect the server.
JAR = ROOT / "_run" / "server-release.jar"


needs_java = pytest.mark.skipif(
    not (shutil.which("javac") and shutil.which("java") and JAR.exists()),
    reason="needs a JDK and the pinned server jar: run bench/server_setup.py first",
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
    """The expected tiles are written out rather than computed by the writer.

    Asking `cropped` where it put things and then checking the game agrees with `cropped`
    proves only that one function was called twice. The box below is worked out by hand:
    the drill covers 1..2 by 1..2 and the belt runs 1..5 at y=3, so the lowest and
    leftmost tile anything covers is (1, 1) and everything moves down and left by one.
    """
    tiles = [(1, 1, "mechanical-drill", 0)] + [(x, 3, "conveyor", 0) for x in range(1, 6)]
    expected = sorted(
        [(0, 0, "mechanical-drill", 0)] + [(x, 2, "conveyor", 0) for x in range(0, 5)]
    )

    assert decode(decoder, schematic.write(tiles, name="probe"), tmp_path) == expected


@needs_java
def test_the_game_agrees_about_which_way_a_belt_faces(decoder, tmp_path):
    """The one that matters. A rotation read wrong is a line that delivers nothing."""
    tiles = [(0, y, "conveyor", 1) for y in range(4)]

    read = decode(decoder, schematic.write(tiles, name="upwards"), tmp_path)

    assert {rotation for _, _, _, rotation in read} == {1}
    assert [(x, y) for x, y, _, _ in read] == [(0, 0), (0, 1), (0, 2), (0, 3)]


@needs_java
def test_the_game_agrees_about_which_axis_is_which(decoder, tmp_path):
    """Swapping x and y packs a schematic that loads happily and pastes transposed."""
    tiles = [(0, 0, "router", 0), (3, 0, "router", 0), (0, 1, "junction", 0)]

    read = decode(decoder, schematic.write(tiles, name="lopsided"), tmp_path)

    assert (3, 0, "router", 0) in read
    assert (0, 1, "junction", 0) in read
