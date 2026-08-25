"""One prepared world, set up the same way for everyone who needs one.

Searching for a design, measuring a design by hand and re-checking a submission all need
exactly the same thing first: a server, a bridge, a world loaded on a pinned seed, the ore
scraped from around the output, and a work area chosen over it. Three copies of that
sequence would drift, and the day one of them drifts is the day two numbers stop being
comparable without anybody noticing.

That matters more here than it usually would. The catalogue's only claim is that every
figure in it came off the same bench. This file is that bench.
"""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from forge.bench import Area, Bench, choose_area, prepare
from forge.bridge import Bridge
from forge.catalogue import Conditions
from forge.server import ServerProcess, install_plugin
from forge.server_setup import MINDUSTRY_VERSION, setup_server
from forge.spec import Spec

DEFAULT_MAP = "Ancient_Caldera"
DEFAULT_WORLD_SEED = 16
DEFAULT_KEEP_OUT = 3
BRIDGE_PORT = 7970
GAME_PORT = 6570


@dataclass
class Session:
    """A world that is ready to be measured on."""

    bridge: Bridge
    bench: Bench
    area: Area
    spec: Spec
    conditions: Conditions
    #: Tiles of the wanted ore taken off the map around the output.
    scraped: int

    def core_offset(self, x: int, y: int) -> tuple[int, int]:
        """An area coordinate, as an offset from the output.

        What the catalogue stores, because the work area is this repository's choice and
        the output is the thing being delivered into.
        """
        return self.area.x + x - self.area.core[0], self.area.y + y - self.area.core[1]

    def from_core(self, dx: int, dy: int) -> tuple[int, int]:
        """The reverse: an offset from the output, back into area coordinates."""
        return self.area.core[0] + dx - self.area.x, self.area.core[1] + dy - self.area.y


def find_jar(explicit: Path | None = None) -> str:
    if explicit is not None:
        return str(explicit)
    built = sorted((Path("bridge") / "build" / "libs").glob("*.jar"))
    if not built:
        raise SystemExit(
            "no bridge jar found. Build it first:  cd bridge && ./gradlew jar"
        )
    return str(built[0])


@contextmanager
def opened(
    spec: Spec,
    map_name: str = DEFAULT_MAP,
    world_seed: int = DEFAULT_WORLD_SEED,
    keep_out: int = DEFAULT_KEEP_OUT,
    bridge_port: int = BRIDGE_PORT,
    game_port: int = GAME_PORT,
    jar: Path | None = None,
    server_dir: str = "mindustry-forge",
    announce=print,
):
    """Boot a server, prepare a world for this specification, and hand back the bench."""
    directory = setup_server(server_dir)
    install_plugin(directory, find_jar(jar))

    with ServerProcess(directory, jvm_args=[f"-Dmindustryai.port={bridge_port}"],
                       port=game_port) as server:
        # Both outcomes waited on together. The plugin logs a failure to bind and lets the
        # server carry on running, which looks entirely healthy from outside: waiting only
        # for success turns a busy port into two minutes of silence and a timeout naming
        # the wrong problem.
        line = server.wait_for(
            rf"listening on 127\.0\.0\.1:{bridge_port}"
            rf"|could not listen on port {bridge_port}",
            timeout=120,
        )
        if "could not listen" in line:
            raise SystemExit(
                f"the agent socket {bridge_port} is already taken, so this server came up "
                f"without a bridge. Something else is on it: another forge, or a run of "
                f"mindustry-ai, which uses the same plugin and the same default port. "
                f"Pass --bridge-port and --game-port to sit beside it.\n  {line}"
            )

        with Bridge(port=bridge_port, tensor=True, timeout=120.0) as bridge:
            # Sandbox, so a candidate is never refused for being unaffordable. What is
            # wanted is a shape that works, and making the search pay for copper would
            # only teach it to be small.
            observation = bridge.reset(map_name, "sandbox", seed=world_seed)
            server.command("bridge-speed max", r"speed set")

            core = (int(observation["core_x"]), int(observation["core_y"]))
            material = spec.mined

            # Before anything is measured, and before the area is chosen against a map
            # that is about to change under it.
            scraped = prepare(bridge, core, material, keep_out)
            if scraped:
                observation = bridge.observe()

            area = choose_area(observation["spatial"], bridge.channels, core, spec,
                               material, keep_out)

            if material is not None and area.material == 0:
                raise SystemExit(
                    "no usable material in the work area: nothing here can deliver "
                    "anything, and any measurement would be of noise. Try another "
                    "--world-seed."
                )

            conditions = Conditions(map=map_name, world_seed=world_seed,
                                    ticks=spec.ticks, keep_out=keep_out,
                                    engine=MINDUSTRY_VERSION)

            announce(f"world   : {map_name}, seed {world_seed}, engine {MINDUSTRY_VERSION}")
            announce(f"scraped : {scraped} tiles of {material or 'nothing'} within "
                     f"{keep_out} of the output")
            announce(f"area    : {spec.width}x{spec.height} at ({area.x}, {area.y}), "
                     f"{area.material} tiles of usable material")

            yield Session(bridge=bridge, bench=Bench(bridge, spec, area), area=area,
                          spec=spec, conditions=conditions, scraped=scraped)


def add_world_arguments(parser) -> None:
    """The flags every tool that opens a world has to agree on, defined once."""
    parser.add_argument("--map", default=DEFAULT_MAP)
    parser.add_argument("--world-seed", type=int, default=DEFAULT_WORLD_SEED,
                        help="pins the ore. Mindustry repaints it on every load, so two "
                             "designs measured on different seeds were measured on "
                             "different problems")
    parser.add_argument("--keep-out", type=int, default=DEFAULT_KEEP_OUT,
                        help="tiles around the output whose ore is scraped off the map, "
                             "so that a line is the only way to deliver anything")
    parser.add_argument("--bridge-port", type=int, default=BRIDGE_PORT,
                        help="the agent socket. Change it to run two forges at once, or "
                             "to sit beside a run of mindustry-ai, which uses the same "
                             "plugin and the same default")
    parser.add_argument("--game-port", type=int, default=GAME_PORT,
                        help="the port the server hosts on. Every instance binds one even "
                             "when nothing connects, so parallel runs need distinct ones")
    parser.add_argument("--jar", type=Path, default=None)
