"""Two ways of writing down a design, and why only one of them works.

A design has to be written before it can be searched, and how it is written decides what
can be found. Measured on the same problem, the same budget and the same world:

| written as | after 25 generations |
|---|---|
| a grid of cells, one square at a time | **nothing delivered**, 110 blocks of noise |
| parts, machines and lines | **30 units delivered**, and still climbing |

The reason is arithmetic. Spelling a ten-tile conveyor line one square at a time means
getting ten rotations right in a row, which is one chance in a million before you even
choose which ten of the hundred and sixty-nine tiles. Written as a line, it is one gene,
its rotations come from the direction of travel, and it cannot be wrong.

Both are here because the second is only interesting next to the first.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

#: Direction of travel to Mindustry rotation: 0 right, 1 up, 2 left, 3 down.
#:
#: The obvious order to type is right, left, up, down, and it is wrong. Getting it wrong
#: prints a column carrying material upwards as a column pointing sideways, and the best
#: design a search has found reads as nonsense.
ROTATION = {(1, 0): 0, (0, 1): 1, (-1, 0): 2, (0, -1): 3}

#: Blocks whose rotation the game actually reads. A router faces every way at once and a
#: junction passes things straight through, so rolling a rotation for either spends
#: variation on something nothing will ever look at.
ROTATES = frozenset({
    "conveyor", "titanium-conveyor", "plastanium-conveyor", "armored-conveyor",
    "duct", "duct-router", "sorter", "inverted-sorter", "overflow-gate", "underflow-gate",
    "unloader", "bridge-conveyor", "phase-conveyor",
})

#: Blocks that carry rather than produce. The seam a design gets taken apart on.
CARRIERS = frozenset({
    "conveyor", "titanium-conveyor", "plastanium-conveyor", "armored-conveyor",
    "junction", "router", "distributor", "bridge-conveyor", "phase-conveyor",
    "overflow-gate", "underflow-gate", "sorter", "inverted-sorter", "duct",
})


@dataclass
class Layout:
    """A rectangle of blocks and rotations, stored flat and row-major."""

    width: int
    height: int
    palette: tuple[str, ...]
    blocks: list[int]
    rotations: list[int]

    #: Filled in once the game has been asked. None until it has.
    delivered: int | None = None
    blocks_standing: int = 0
    stuck: int = 0

    def __post_init__(self) -> None:
        expected = self.width * self.height
        if len(self.blocks) != expected or len(self.rotations) != expected:
            raise ValueError(
                f"a {self.width}x{self.height} layout wants {expected} cells, got "
                f"{len(self.blocks)} blocks and {len(self.rotations)} rotations"
            )

    def cells(self):
        """Every non-empty cell, as (x, y, block name, rotation)."""
        for index, block in enumerate(self.blocks):
            name = self.palette[block]
            if name == "air":
                continue
            yield index % self.width, index // self.width, name, self.rotations[index]

    def used(self) -> int:
        return sum(1 for block in self.blocks if self.palette[block] != "air")

    def copy(self) -> Layout:
        return Layout(self.width, self.height, self.palette,
                      list(self.blocks), list(self.rotations))

    def render(self) -> str:
        """As text, so a good design can be read rather than guessed at."""
        arrows = ">^<v"
        rows = []
        for y in range(self.height - 1, -1, -1):
            row = ""
            for x in range(self.width):
                index = y * self.width + x
                name = self.palette[self.blocks[index]]
                if name == "air":
                    row += "."
                elif name in ROTATES:
                    row += arrows[self.rotations[index] % 4]
                else:
                    row += name[0].upper()
            rows.append(row)
        return "\n".join(rows)


def empty(width: int, height: int, palette: tuple[str, ...]) -> Layout:
    size = width * height
    return Layout(width, height, palette, [0] * size, [0] * size)


# Written cell by cell -------------------------------------------------------------------


def random_layout(width: int, height: int, palette: tuple[str, ...],
                  rng: random.Random, density: float = 0.5) -> Layout:
    """A grid drawn at random, mostly empty.

    Filling every cell sounds like more exploration and is less: a solid rectangle has
    nowhere to put the machine that would feed it, and the engine refuses overlapping
    placements anyway.
    """
    blocks, rotations = [], []
    for _ in range(width * height):
        if rng.random() > density or len(palette) < 2:
            blocks.append(0)
            rotations.append(0)
            continue
        choice = rng.randrange(1, len(palette))
        blocks.append(choice)
        rotations.append(rng.randrange(4) if palette[choice] in ROTATES else 0)
    return Layout(width, height, palette, blocks, rotations)


def cross(first: Layout, second: Layout, rng: random.Random) -> Layout:
    """A child taking each cell from one parent or the other.

    Uniform rather than single-point. A layout is two-dimensional and a cut through a flat
    list slices it across rows, severing every line that runs down the grid, which is
    precisely what was worth inheriting.
    """
    child = first.copy()
    for index in range(len(child.blocks)):
        if rng.random() < 0.5:
            child.blocks[index] = second.blocks[index]
            child.rotations[index] = second.rotations[index]
    return child


def mutate(layout: Layout, rng: random.Random, rate: float = 0.04) -> Layout:
    """Change a few cells, in what they hold or in which way they face.

    Both, and separately. A line that is right except for one tile facing the wrong way is
    one rotation from working, and a mutation that could only replace the whole cell would
    have to rediscover the line.
    """
    changed = layout.copy()
    for index in range(len(changed.blocks)):
        if rng.random() >= rate:
            continue
        if rng.random() < 0.4 and changed.palette[changed.blocks[index]] in ROTATES:
            changed.rotations[index] = rng.randrange(4)
            continue
        choice = rng.randrange(len(changed.palette))
        changed.blocks[index] = choice
        changed.rotations[index] = (rng.randrange(4)
                                    if changed.palette[choice] in ROTATES else 0)
    return changed


# Written as parts -----------------------------------------------------------------------


@dataclass(frozen=True)
class Machine:
    """One block that does something, placed somewhere."""

    x: int
    y: int
    block: str


@dataclass(frozen=True)
class Line:
    """A run of carriers from one point to another, elbowed once.

    Rotations come from the direction of travel, so a line is correct by construction.
    That is the whole reason this genome exists.
    """

    x0: int
    y0: int
    x1: int
    y1: int
    block: str
    #: Travel along x first, then y. The elbow is the only choice a corridor between two
    #: fixed points still has.
    horizontal_first: bool

    def tiles(self):
        corner = (self.x1, self.y0) if self.horizontal_first else (self.x0, self.y1)

        points = [(self.x0, self.y0)]
        for tx, ty in (corner, (self.x1, self.y1)):
            x, y = points[-1]
            while x != tx:
                x += 1 if tx > x else -1
                points.append((x, y))
            while y != ty:
                y += 1 if ty > y else -1
                points.append((x, y))

        for index, (x, y) in enumerate(points):
            if index + 1 < len(points):
                nx, ny = points[index + 1]
                rotation = ROTATION.get((nx - x, ny - y), 0)
            elif index:
                px, py = points[index - 1]
                rotation = ROTATION.get((x - px, y - py), 0)
            else:
                rotation = 0
            yield x, y, rotation


@dataclass
class Design:
    """A layout written as machines and lines instead of as cells."""

    width: int
    height: int
    palette: tuple[str, ...]
    machines: list = field(default_factory=list)
    lines: list = field(default_factory=list)

    delivered: int | None = None
    blocks_standing: int = 0
    stuck: int = 0

    def copy(self) -> Design:
        return Design(self.width, self.height, self.palette,
                      list(self.machines), list(self.lines))

    def to_layout(self) -> Layout:
        """Flatten to a grid.

        Machines go down first and lines after, so a line crossing a machine breaks around
        it rather than swallowing it. The engine would refuse the carrier anyway, and what
        stood is what gets charged for.
        """
        grid = empty(self.width, self.height, self.palette)
        index_of = {name: i for i, name in enumerate(self.palette)}

        for machine in self.machines:
            if machine.block not in index_of:
                continue
            if 0 <= machine.x < self.width and 0 <= machine.y < self.height:
                grid.blocks[machine.y * self.width + machine.x] = index_of[machine.block]

        for line in self.lines:
            if line.block not in index_of:
                continue
            for x, y, rotation in line.tiles():
                if not (0 <= x < self.width and 0 <= y < self.height):
                    continue
                cell = y * self.width + x
                if grid.palette[grid.blocks[cell]] not in ("air",) + tuple(CARRIERS):
                    continue
                grid.blocks[cell] = index_of[line.block]
                grid.rotations[cell] = rotation

        return grid

    def cells(self):
        return self.to_layout().cells()

    def used(self) -> int:
        return self.to_layout().used()

    def render(self) -> str:
        return self.to_layout().render()


def producers(palette: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(b for b in palette if b != "air" and b not in CARRIERS)


def carriers(palette: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(b for b in palette if b in CARRIERS) or ("conveyor",)


def random_design(width: int, height: int, palette: tuple[str, ...],
                  rng: random.Random, machines: int = 3, lines: int = 3) -> Design:
    """A few machines and a few lines, all placed at random.

    Small on purpose. A design starting with thirty parts has no room to grow into
    anything and every mutation is lost in the crowd; one starting with a few can be added
    to when adding pays.
    """
    kinds, tracks = producers(palette), carriers(palette)

    def point():
        return rng.randrange(width), rng.randrange(height)

    return Design(
        width, height, palette,
        [Machine(*point(), rng.choice(kinds)) for _ in range(rng.randint(1, machines))]
        if kinds else [],
        [Line(*point(), *point(), rng.choice(tracks), rng.random() < 0.5)
         for _ in range(rng.randint(1, lines))],
    )


def cross_designs(first: Design, second: Design, rng: random.Random) -> Design:
    """A child taking each parent's parts with even odds, then trimmed.

    Taking every part from both doubles the design each generation until a candidate is a
    solid block of conveyors, which scores badly and takes longest to measure.
    """
    machines = [m for m in first.machines + second.machines if rng.random() < 0.5]
    lines = [line for line in first.lines + second.lines if rng.random() < 0.5]
    return Design(first.width, first.height, first.palette, machines[:12], lines[:12])


def mutate_design(design: Design, rng: random.Random, rate: float = 0.35) -> Design:
    """Nudge a part, add one, or drop one.

    Nudging matters more than it looks. A drill one tile off its ore delivers nothing and
    is one step from delivering everything; a mutation that could only replace it outright
    would have to find the patch again from scratch.
    """
    changed = design.copy()
    kinds, tracks = producers(changed.palette), carriers(changed.palette)

    def point():
        return rng.randrange(changed.width), rng.randrange(changed.height)

    def nudge(value: int, limit: int) -> int:
        return min(max(value + rng.randint(-2, 2), 0), limit - 1)

    for index, machine in enumerate(changed.machines):
        if rng.random() < rate:
            block = machine.block if rng.random() > 0.2 or not kinds else rng.choice(kinds)
            changed.machines[index] = Machine(nudge(machine.x, changed.width),
                                              nudge(machine.y, changed.height), block)
    for index, line in enumerate(changed.lines):
        if rng.random() < rate:
            changed.lines[index] = Line(
                nudge(line.x0, changed.width), nudge(line.y0, changed.height),
                nudge(line.x1, changed.width), nudge(line.y1, changed.height),
                line.block,
                line.horizontal_first if rng.random() > 0.25 else not line.horizontal_first,
            )

    if kinds and rng.random() < 0.3 and len(changed.machines) < 12:
        changed.machines.append(Machine(*point(), rng.choice(kinds)))
    if rng.random() < 0.3 and len(changed.lines) < 12:
        changed.lines.append(Line(*point(), *point(), rng.choice(tracks), rng.random() < 0.5))
    if rng.random() < 0.2 and len(changed.machines) > 1:
        changed.machines.pop(rng.randrange(len(changed.machines)))
    if rng.random() < 0.2 and len(changed.lines) > 1:
        changed.lines.pop(rng.randrange(len(changed.lines)))

    return changed
