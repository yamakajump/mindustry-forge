"""Write the list of what is left to port, from the game's own class list.

    python tools/build_checklist.py

Every block in Mindustry belongs to a Java class, and the class is what decides how it
behaves: two blocks of the same class share an `updateTile` and differ only in their
numbers. So the honest list of work is the list of classes, taken from the game rather
than typed from memory, and porting one class ticks off every block that uses it.

Generated rather than edited. A hand-kept list of four hundred and forty six blocks is a
list that goes stale the first time the game ships a balance patch, and this repository has
spent enough of its life on second copies of things that drift.

What is already done is read back out of the checklist itself, so ticking a box survives
regenerating the file.
"""

from __future__ import annotations

import collections
import json
import re
from pathlib import Path

SOURCE = Path("bench/data/blocks.json")
TARGET = Path("docs/blocks.md")

#: Classes that cannot appear in a schematic and cannot affect one, so there is nothing to
#: reproduce. The ground is not here: it decides what a drill pulls out and is done.
SCENERY = {
    "Floor", "StaticWall", "StaticProp", "StaticTree", "TreeBlock", "Prop", "SeaBush",
    "TallBlock", "OreBlock", "SteamVent", "ShallowLiquid", "OverlayFloor", "AirBlock",
    "EmptyFloor", "SpawnBlock", "RemoveWall", "RemoveOre", "RuneOverlay",
    "CharacterOverlay", "ConstructBlock", "LegacyMechPad", "LegacyUnitFactory",
    "Cliff", "Boulder", "DirtBlock",
}

#: Classes that can appear in a schematic and cannot change what it produces. A wall is a
#: wall: it stops bullets and moves nothing. Told apart from the scenery because they are
#: really placed by players, and told apart from the work because there is nothing to port.
INERT = {
    "Wall", "Door", "BaseShield", "MessageBlock", "MemoryBlock", "LightBlock",
    "ShockMine",
}

#: `Radar` and `BuildTurret` used to live in the list above, on the grounds that neither
#: moves anything. Both draw power, and a radar draws it every frame for ever: thirty six
#: a second is a real line in a schematic's budget, and "no effect on what circulates" was
#: only true of items.

#: What a class is for, in one line, so the list can be read without opening the game.
#: Only for the ones worth explaining; anything absent is named well enough by itself.
NOTES = {
    "Conveyor": "a belt: item positions along itself",
    "StackConveyor": "moves a whole stack tile by tile",
    "Duct": "the Erekir belts, one tile at a time",
    "GenericCrafter": "any factory: inputs, duration, outputs",
    "AttributeCrafter": "a factory whose speed depends on the floor beneath",
    "HeatCrafter": "a factory that needs heat as well",
    "Separator": "outputs a random item by weight",
    "UnitFactory": "builds units",
    "Reconstructor": "upgrades a unit into a better one",
    "UnitAssembler": "assembles a unit from plans",
    "PowerGraph": "the grid: satisfaction, batteries, balance",
    "ItemTurret": "eats its ammunition at its firing rate",
    "Drill": "pulls out whatever lies beneath it",
    "Pump": "pumps the liquid under it",
    "ItemBridge": "carries over a gap, to the tile it holds",
    "Unloader": "pulls out of a container, eleven a second",
    "OverflowGate": "straight ahead first, sideways only when it clogs",
    "Junction": "four queues, one per side, each leaving opposite",
    "HeatProducer": "heats, for the Erekir half of the game",
    "HeatConductor": "carries heat",
    "Battery": "stores power",
    "PowerNode": "links the grid",
    "ConsumeGenerator": "burns something and makes power",
    "ThermalGenerator": "power from hot ground",
    "ImpactReactor": "consumes and produces, with a warm-up",
    "NuclearReactor": "power, and an explosion if neglected",
    "VariableReactor": "power proportional to what it is fed",
    "SolarGenerator": "power, from nothing",
    "LiquidRouter": "a liquid router, which is also a reserve",
    "Conduit": "a pipe: directional, like a belt",
    "LiquidJunction": "crosses two pipes",
    "LiquidBridge": "a liquid bridge",
    "StorageBlock": "a container: takes everything, pushes nothing",
    "CoreBlock": "the core: a container that counts",
    "Router": "splits round-robin",
    "Sorter": "lets the configured item through, diverts the rest",
    "MendProjector": "repairs, changes no throughput",
    "OverdriveProjector": "speeds up what surrounds it",
    "LogicBlock": "a processor: runs a program",
    "MessageBlock": "displays text, does nothing",
    "MemoryBlock": "holds numbers for a processor",
    "PowerTurret": "a turret that eats power",
    "Wall": "a wall",
    "Door": "a wall that opens",
    "BaseShield": "a shield",
    "Radar": "draws power continuously, and nothing else",
    "BuildTurret": "consumes nothing until it has something to rebuild",
}


def done(text: str) -> set[str]:
    """Which classes are already ticked, read back so regenerating keeps them."""
    return set(re.findall(r"^- \[x\] `(\w+)`", text, re.M))


def main() -> None:
    raw = json.loads(SOURCE.read_text(encoding="utf-8"))
    blocks = raw["blocks"]

    ticked = done(TARGET.read_text(encoding="utf-8")) if TARGET.exists() else set()

    kinds: dict[str, list[str]] = collections.defaultdict(list)
    for name, block in blocks.items():
        kinds[block.get("kind", "Block")].append(name)

    todo = {k: v for k, v in kinds.items() if k not in SCENERY and k not in INERT}
    scenery = sum(len(v) for k, v in kinds.items() if k in SCENERY)
    inert = {k: v for k, v in kinds.items() if k in INERT}

    lines = [
        "# Every block in the game, and where the port stands",
        "",
        "Generated by `python tools/build_checklist.py`, from the class list the game",
        "gives itself. A Mindustry block belongs to a Java class, and the class is what",
        "decides its behaviour: two blocks of the same class share an `updateTile` and",
        "differ only in their numbers. Porting one class therefore ticks every block",
        "that uses it at once.",
        "",
        "A ticked box means two things, never one: the class is transcribed from the",
        "game source, **and** a scenario measures it in a real server. Without the",
        "second, it is a hunch that looks like a port.",
        "",
        f"**{len(todo)} classes to reproduce**, covering "
        f"{sum(len(v) for v in todo.values())} blocks. "
        f"{scenery} more are scenery: floors, static walls, trees, construction "
        "scaffolding. Nothing to reproduce, they do not move.",
        "",
    ]

    order = sorted(todo.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    lines.append(f"## Done: {len(ticked & set(todo))} of {len(todo)}")
    lines.append("")

    for kind, names in order:
        mark = "x" if kind in ticked else " "
        note = NOTES.get(kind, "")
        shown = ", ".join(sorted(names)[:6])
        if len(names) > 6:
            shown += f", and {len(names) - 6} more"
        lines.append(f"- [{mark}] `{kind}` - {len(names)} block"
                     f"{'s' if len(names) > 1 else ''}"
                     + (f" - {note}" if note else ""))
        lines.append(f"      {shown}")

    lines.append("")
    lines.append("## Ticked and still incomplete")
    lines.append("")
    lines.append("A ticked box says the class is transcribed and measured, not that")
    lines.append("none of its blocks has a problem. What is still missing, named")
    lines.append("rather than left to be discovered:")
    lines.append("")
    lines.append("- **A payload that is itself a building.** The payload family is")
    lines.append("  transcribed and measured, cargo slides and the reconstructor")
    lines.append("  consumes, but a payload carrying a building with its own contents")
    lines.append("  needs machinery the engine does not have yet.")
    lines.append("")
    lines.append("- **The two air freight blocks**, `UnitCargoLoader` and")
    lines.append("  `UnitCargoUnloadPoint`, need a unit that flies. They are the two")
    lines.append("  unticked lines above, and they are unticked on purpose.")
    lines.append("")
    lines.append("- **Processors do not run.** `LogicBlock` reads a program that can")
    lines.append("  drive any block in the schematic. None of that is simulated, and it")
    lines.append("  probably never will be.")
    lines.append("")
    lines.append("## Placed by a player, with no effect on what circulates")
    lines.append("")
    lines.append("A wall is a wall: it stops bullets and moves nothing. Nothing to")
    lines.append("port, and nothing to measure either.")
    lines.append("")
    for kind, names in sorted(inert.items(), key=lambda kv: -len(kv[1])):
        lines.append(f"- `{kind}` : {len(names)}")

    lines.append("")
    lines.append("## Scenery, nothing to do")
    lines.append("")
    for kind, names in sorted(((k, v) for k, v in kinds.items() if k in SCENERY),
                              key=lambda kv: -len(kv[1])):
        lines.append(f"- `{kind}` : {len(names)}")
    lines.append("")

    TARGET.write_text("\n".join(lines), encoding="utf-8")
    print(f"{len(todo)} classes to do, {len(ticked & set(todo))} ticked, "
          f"{scenery} scenery blocks, written to {TARGET}")


if __name__ == "__main__":
    main()
