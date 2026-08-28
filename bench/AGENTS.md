# The measurement

This directory runs a real headless Mindustry server on a fixed world, stamps the schematic
into it and counts what comes out. No model of the game is used anywhere in here, because a
model is one more thing that can be wrong, and it would be wrong in exactly the places a
search learns to exploit.

## Numbers are proven against the game, not against us

If the analysis and the measurement disagree, that is a bug in the analysis, not a matter
of opinion. **Never adjust a constant to make a test pass** without checking what the bench
says. If a figure cannot be explained by reading the game's own source or bytecode, say so
in the pull request rather than shipping it.

Adding a scenario of your own is `../docs/bench-scenarios.md`.

## The oracle

```bash
npm run oracle          # replay every recorded scenario, expected gap 0.00 %
npm run oracle:measure  # re-measure in a real server, needs the jar
```

The replay reads the measurements already recorded under `data/oracle/`. It needs no game
and no server, which is why CI runs it on every pull request and why its gap is a barrier
rather than a note.

`--measure` is the other half, and it is a flag rather than the default because it needs a
JDK and the pinned `server-release.jar`. `server_setup.py` downloads one at the version
this repository pins, and refuses a file well under the expected size: a truncated download
or an error page saved under the wrong name is otherwise a jar that starts and lies. The
driver of both passes is `tools/oracle.mjs`, and the game answers through the plugin built
from `src/`.

`tests/test_schematic_in_the_game.py` is the other half of the same idea, for the file format
rather than the throughput: it hands the writer's bytes to the game's own decoder. It skips
rather than fails when the JDK or the jar is missing, so that a contributor without a Java
toolchain still gets a green suite. A green run on such a machine proves nothing about the
game side.
