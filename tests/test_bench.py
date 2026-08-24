"""The bench, driven against a stand-in for the game.

Nothing here needs Mindustry running. What is worth pinning without it is the bookkeeping
around the engine rather than the engine itself: which tiles get cleared, which get
spared, what order blocks go down in, and how a delivery is counted. Every one of those
has been wrong at least once, and each was expensive to spot from a run, because a bench
that is subtly wrong still produces numbers that rise.
"""

from __future__ import annotations

import numpy as np

from forge.bench import Area, Bench, choose_area, footprint, prepare, reachable
from forge.layout import Design, Line, Machine
from forge.spec import COPPER_LINE, Port, Side, Spec

PALETTE = ("air", "conveyor", "mechanical-drill", "junction", "router")
CHANNELS = ["block_ally", "ore_copper"]

MINING = Spec(
    name="test-line", palette=PALETTE,
    outputs=(Port("copper", Side.TOP),), width=5, height=5, ticks=600,
)
FED = Spec(
    name="test-fed", palette=PALETTE,
    inputs=(Port("coal", Side.LEFT, 0.0, rate=6.0),),
    outputs=(Port("copper", Side.RIGHT),), width=5, height=5, ticks=600,
)


class FakeBridge:
    """Records what it was asked, answers what it was told to answer."""

    def __init__(self, produced=None, held=None, refuse=None, cleared=0, held_by_box=None):
        self.calls = []
        self.produced = list(produced or [0, 0])
        self.held = held or {}
        self.refuse = refuse or set()
        self.cleared = cleared
        #: What a specific rectangle holds, when it differs from the area as a whole.
        self.held_by_box = held_by_box or {}

    def act(self, action):
        self.calls.append(
            ("act", action["type"], action.get("x"), action.get("y"), action.get("block"))
        )
        applied = (action.get("x"), action.get("y")) not in self.refuse
        return {"action": {"applied": applied}}

    def give(self, x, y, item, amount):
        self.calls.append(("give", item, x, y, amount))
        return {"ok": True}

    def clear_ore(self, x, y, radius, item):
        self.calls.append(("clear_ore", item, x, y, radius))
        return {"cleared": self.cleared}

    def observe(self):
        return {"produced": {"copper": self.produced[0]}}

    def step(self, repeat):
        self.calls.append(("step", repeat, None, None, None))
        return {"produced": {"copper": self.produced[1]}}

    def region(self, x, y, width, height):
        self.calls.append(("region", x, y, width, height, None))
        held = self.held_by_box.get((x, y, width, height), self.held)
        return {"held": dict(held)}

    def placements(self):
        return [c for c in self.calls if c[0] == "act" and c[1] == "place"]

    def breaks(self):
        return [c for c in self.calls if c[0] == "act" and c[1] == "break"]


def world(core=(20, 20)):
    """A 40x40 map: a 3x3 core, an ore patch far away, and ore against the core."""
    spatial = np.zeros((2, 40, 40), dtype=np.uint8)
    cx, cy = core
    spatial[0, cy - 1:cy + 2, cx - 1:cx + 2] = 1
    spatial[1, 10:16, 10:16] = 1
    spatial[1, cy - 1:cy + 2, cx + 2:cx + 4] = 1
    return spatial


def area_of(spared=frozenset()):
    return Area(x=10, y=10, width=5, height=5, core=(12, 12), spared=spared, material=4)


def design_with_a_drill_and_a_line():
    return Design(
        5, 5, PALETTE,
        machines=[Machine(1, 1, "mechanical-drill")],
        lines=[Line(0, 0, 4, 0, "conveyor", True)],
    )


# Reading the map ----------------------------------------------------------------------


def test_the_footprint_is_the_tiles_the_core_actually_stands_on():
    found = footprint(world(), CHANNELS, (20, 20))

    assert found == {(x, y) for x in range(19, 22) for y in range(19, 22)}


def test_the_footprint_is_read_off_the_map_rather_than_assumed():
    """A bigger core has to spare more tiles, and nothing here knows core sizes."""
    spatial = world()
    spatial[0, 18:23, 18:23] = 1

    assert len(footprint(spatial, CHANNELS, (20, 20))) == 25


def test_blanking_the_plane_hides_ore_near_the_output():
    plane = world()[1]
    masked = reachable(plane, (20, 20), keep_out=3)

    assert plane[20, 22] == 1
    assert masked[20, 22] == 0
    assert masked[12, 12] == plane[12, 12]


def test_blanking_nothing_returns_the_plane_untouched():
    plane = world()[1]

    assert reachable(plane, (20, 20), keep_out=0) is plane


def test_blanking_uses_a_square_and_not_a_circle():
    """Chebyshev, because a drill on the diagonal touches the core just as well."""
    plane = np.ones((10, 10), dtype=np.uint8)
    masked = reachable(plane, (5, 5), keep_out=2)

    assert masked[3, 3] == 0
    assert masked[7, 7] == 0
    assert masked[3, 5] == 0
    assert masked[5, 3] == 0
    assert masked[2, 5] == 1
    assert masked[5, 8] == 1


# Scraping the ore off -------------------------------------------------------------------


def test_preparing_takes_the_ore_off_the_map_and_says_how_much():
    bridge = FakeBridge(cleared=17)

    assert prepare(bridge, (20, 20), "copper", keep_out=3) == 17
    assert bridge.calls == [("clear_ore", "copper", 20, 20, 3)]


def test_a_specification_that_is_fed_scrapes_nothing():
    """Nothing is mined, so nothing near the output can shortcut the question."""
    bridge = FakeBridge(cleared=17)

    assert prepare(bridge, (20, 20), None) == 0
    assert bridge.calls == []


def test_asking_for_no_clearance_scrapes_nothing():
    bridge = FakeBridge(cleared=17)

    assert prepare(bridge, (20, 20), "copper", keep_out=0) == 0
    assert bridge.calls == []


# Placing the work area --------------------------------------------------------------------


def test_the_work_area_always_covers_the_output():
    """Nothing inside the area can deliver anywhere else, so the core has to be in it."""
    area = choose_area(world(), CHANNELS, (20, 20), MINING, "copper")

    assert area.contains(20, 20)


def test_the_work_area_lands_on_as_much_usable_ore_as_it_can():
    """A real specification is wide enough to reach past the keep-out square.

    Wide enough matters: a work area no larger than twice the keep-out fits entirely
    inside it, every tile of ore it could cover is blanked, and the count comes back zero
    however much ore is really there.
    """
    spatial = np.zeros((2, 40, 40), dtype=np.uint8)
    spatial[0, 19:22, 19:22] = 1
    spatial[1, 10:16, 10:16] = 1

    area = choose_area(spatial, CHANNELS, (20, 20), COPPER_LINE, "copper")

    assert area.material > 0
    assert area.contains(20, 20)


def test_an_area_no_wider_than_the_keep_out_can_never_find_material():
    """Not a bug, but the reason a cramped specification reports an empty world."""
    spatial = np.zeros((2, 40, 40), dtype=np.uint8)
    spatial[0, 19:22, 19:22] = 1
    spatial[1, :, :] = 1

    area = choose_area(spatial, CHANNELS, (20, 20), MINING, "copper", keep_out=3)

    assert area.material == 0


def test_ore_against_the_output_is_not_counted_as_usable():
    """Only the ore near the core exists, so an honest count is zero, not four."""
    spatial = np.zeros((2, 40, 40), dtype=np.uint8)
    spatial[0, 19:22, 19:22] = 1
    spatial[1, 19:22, 22:24] = 1

    area = choose_area(spatial, CHANNELS, (20, 20), MINING, "copper", keep_out=3)

    assert area.material == 0


def test_a_specification_with_no_material_sits_centred_on_the_output():
    area = choose_area(world(), CHANNELS, (20, 20), FED, None)

    assert area.contains(20, 20)
    assert area.material == 0


def test_an_unknown_ore_does_not_crash_the_placement():
    """A palette can name a material the map does not carry a channel for."""
    area = choose_area(world(), CHANNELS, (20, 20), MINING, "thorium")

    assert area.contains(20, 20)


# Clearing between candidates ----------------------------------------------------------------


def test_clearing_empties_the_area_and_spares_the_output():
    bridge = FakeBridge()
    Bench(bridge, MINING, area_of(spared=frozenset({(12, 12)}))).clear()

    broken = {(call[2], call[3]) for call in bridge.breaks()}

    assert len(broken) == 24
    assert (12, 12) not in broken
    assert broken <= {(x, y) for x in range(10, 15) for y in range(10, 15)}


def test_clearing_never_reaches_outside_the_area():
    """A bench that tidied its neighbours would destroy the core it delivers into."""
    bridge = FakeBridge()
    Bench(bridge, MINING, area_of()).clear()

    for _, _, x, y, _ in bridge.breaks():
        assert 10 <= x < 15 and 10 <= y < 15


# Stamping a design --------------------------------------------------------------------------


def test_producers_go_down_before_carriers():
    """A drill needs clear tiles; a conveyor laid where it wanted makes it impossible."""
    bridge = FakeBridge()
    Bench(bridge, MINING, area_of()).stamp(design_with_a_drill_and_a_line())

    blocks = [call[4] for call in bridge.placements()]

    assert blocks[0] == "mechanical-drill"
    assert set(blocks[1:]) == {"conveyor"}


def test_a_design_is_stamped_in_area_coordinates_not_map_coordinates():
    bridge = FakeBridge()
    Bench(bridge, MINING, area_of()).stamp(design_with_a_drill_and_a_line())

    positions = {(call[2], call[3]) for call in bridge.placements()}

    assert (11, 11) in positions
    assert (10, 10) in positions
    assert all(10 <= x < 15 and 10 <= y < 15 for x, y in positions)


def test_nothing_is_stamped_onto_the_output():
    bridge = FakeBridge()
    bench = Bench(bridge, MINING, area_of(spared=frozenset({(12, 10)})))
    bench.stamp(design_with_a_drill_and_a_line())

    assert (12, 10) not in {(call[2], call[3]) for call in bridge.placements()}


def test_only_the_blocks_the_engine_accepted_are_charged_for():
    """What was asked for and refused is not a block the design owns."""
    bridge = FakeBridge(refuse={(10, 10), (11, 10)})
    placed = Bench(bridge, MINING, area_of()).stamp(design_with_a_drill_and_a_line())

    assert len(bridge.placements()) == 6
    assert placed == 4


# Measuring ------------------------------------------------------------------------------------


def test_a_delivery_is_the_rise_during_the_run_and_not_the_running_total():
    """The counter is the core's and never resets, so every candidate would inherit it."""
    bridge = FakeBridge(produced=[100, 130], held={"copper": 7})
    candidate = design_with_a_drill_and_a_line()

    Bench(bridge, MINING, area_of()).run(candidate)

    assert candidate.delivered == 30
    assert candidate.stuck == 7


def test_a_counter_that_went_backwards_reads_as_nothing_delivered():
    bridge = FakeBridge(produced=[130, 100])
    candidate = design_with_a_drill_and_a_line()

    Bench(bridge, MINING, area_of()).run(candidate)

    assert candidate.delivered == 0


def test_the_output_keeps_its_own_stock_out_of_the_count():
    """The work area covers a core holding hundreds of the item being counted.

    Measured on a hand-built line standing six blocks, the raw figure read 210 held when
    thirty is the physical maximum for that many carriers. Left in, every candidate
    collects the same large number, the partial credit stops telling any two of them apart
    and becomes a constant, which is the one thing a gradient must never be.
    """
    spared = frozenset({(12, 12), (13, 12), (12, 13), (13, 13)})
    area = Area(x=10, y=10, width=5, height=5, core=(12, 12), spared=spared, material=4)
    bridge = FakeBridge(produced=[0, 5], held={"copper": 218},
                        held_by_box={(12, 12, 2, 2): {"copper": 210}})
    candidate = design_with_a_drill_and_a_line()

    Bench(bridge, MINING, area).run(candidate)

    assert candidate.stuck == 8


def test_an_output_holding_more_than_the_area_reads_as_nothing_stuck():
    """Both figures are the engine's own, and a design cannot hold a negative amount."""
    spared = frozenset({(12, 12)})
    area = Area(x=10, y=10, width=5, height=5, core=(12, 12), spared=spared, material=4)
    bridge = FakeBridge(produced=[0, 1], held={"copper": 5},
                        held_by_box={(12, 12, 1, 1): {"copper": 900}})
    candidate = design_with_a_drill_and_a_line()

    Bench(bridge, MINING, area).run(candidate)

    assert candidate.stuck == 0


def test_an_area_sparing_nothing_asks_about_no_output():
    """A specification fed from its ports has no core inside it to discount."""
    bridge = FakeBridge(produced=[0, 1], held={"copper": 12})
    Bench(bridge, MINING, area_of()).run(design_with_a_drill_and_a_line())

    assert len([call for call in bridge.calls if call[0] == "region"]) == 1


def test_the_output_box_is_the_rectangle_the_spared_tiles_fill():
    spared = frozenset({(19, 19), (21, 21), (20, 20)})
    area = Area(x=10, y=10, width=20, height=20, core=(20, 20), spared=spared, material=0)

    assert area.output_box() == (19, 19, 3, 3)
    assert area_of().output_box() is None


def test_only_the_wanted_item_counts_as_stuck():
    """Coal asleep in a graphite line is not evidence of graphite being close."""
    bridge = FakeBridge(produced=[0, 5], held={"coal": 400, "copper": 3})
    candidate = design_with_a_drill_and_a_line()

    Bench(bridge, MINING, area_of()).run(candidate)

    assert candidate.stuck == 3


def test_the_run_gives_the_design_exactly_the_time_the_specification_says():
    bridge = FakeBridge(produced=[0, 1])
    Bench(bridge, MINING, area_of()).run(design_with_a_drill_and_a_line())

    steps = [call for call in bridge.calls if call[0] == "step"]

    assert [call[1] for call in steps] == [MINING.ticks]


def test_stuck_is_read_from_the_work_area_and_not_the_whole_map():
    bridge = FakeBridge(produced=[0, 1])
    area = area_of()
    Bench(bridge, MINING, area).run(design_with_a_drill_and_a_line())

    region = [call for call in bridge.calls if call[0] == "region"][0]

    assert region[1:5] == (area.x, area.y, area.width, area.height)


def test_a_measured_candidate_carries_all_three_numbers():
    bridge = FakeBridge(produced=[0, 12], held={"copper": 4})
    candidate = design_with_a_drill_and_a_line()

    Bench(bridge, MINING, area_of()).run(candidate)

    assert (candidate.delivered, candidate.stuck) == (12, 4)
    assert candidate.blocks_standing == 6


# Feeding the input ports --------------------------------------------------------------------------


def test_a_fed_specification_has_its_ports_filled():
    bridge = FakeBridge(produced=[0, 1])
    Bench(bridge, FED, area_of()).run(design_with_a_drill_and_a_line())

    gives = [call for call in bridge.calls if call[0] == "give"]

    assert len(gives) == 1
    assert gives[0][1] == "coal"


def test_a_port_is_filled_for_the_whole_run_and_not_for_one_second():
    """Six per second over 600 ticks is 60, not 6."""
    bridge = FakeBridge(produced=[0, 1])
    Bench(bridge, FED, area_of()).run(design_with_a_drill_and_a_line())

    give = [call for call in bridge.calls if call[0] == "give"][0]

    assert give[4] == 60


def test_a_port_is_filled_inside_the_area():
    bridge = FakeBridge(produced=[0, 1])
    area = area_of()
    Bench(bridge, FED, area).run(design_with_a_drill_and_a_line())

    give = [call for call in bridge.calls if call[0] == "give"][0]

    assert area.contains(give[2], give[3])


def test_a_mining_specification_is_fed_nothing():
    bridge = FakeBridge(produced=[0, 1])
    Bench(bridge, MINING, area_of()).run(design_with_a_drill_and_a_line())

    assert [call for call in bridge.calls if call[0] == "give"] == []
