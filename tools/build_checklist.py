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
TARGET = Path("docs/blocs.md")

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
    "Wall", "Door", "BaseShield", "MessageBlock", "MemoryBlock", "Radar", "LightBlock",
    "ShockMine", "BuildTurret",
}

#: What a class is for, in one line, so the list can be read without opening the game.
#: Only for the ones worth explaining; anything absent is named well enough by itself.
NOTES = {
    "Conveyor": "une bande : positions d'objets le long d'elle-meme",
    "StackConveyor": "deplace une pile entiere de case en case",
    "Duct": "les bandes d'Erekir, une seule case a la fois",
    "GenericCrafter": "toute usine : entrees, duree, sorties",
    "AttributeCrafter": "une usine dont la vitesse depend du sol dessous",
    "HeatCrafter": "une usine qui a besoin de chaleur en plus",
    "Separator": "sort un objet au hasard selon des poids",
    "UnitFactory": "fabrique des unites : c'est ce qu'il a demande",
    "Reconstructor": "ameliore une unite en une meilleure",
    "UnitAssembler": "assemble une unite a partir de plans",
    "PowerGraph": "le reseau : satisfaction, batteries, equilibre",
    "ItemTurret": "mange ses munitions au rythme de son tir",
    "Drill": "sort du sol ce qu'il y a dessous",
    "Pump": "pompe le liquide sous elle",
    "ItemBridge": "porte par dessus un trou, vers la case qu'il retient",
    "Unloader": "tire hors d'un coffre, onze par seconde",
    "OverflowGate": "tout droit d'abord, de cote seulement si ca bouchonne",
    "Junction": "quatre files, une par cote, chacune ressort en face",
    "HeatProducer": "chauffe, pour la moitie Erekir du jeu",
    "HeatConductor": "porte la chaleur",
    "Battery": "stocke l'energie",
    "PowerNode": "relie le reseau",
    "ConsumeGenerator": "brule quelque chose et fait de l'energie",
    "ThermalGenerator": "de l'energie a partir du sol chaud",
    "ImpactReactor": "consomme et produit, avec une chauffe",
    "NuclearReactor": "de l'energie, et une explosion si on la neglige",
    "VariableReactor": "de l'energie proportionnelle a ce qu'on lui donne",
    "SolarGenerator": "de l'energie, sans rien",
    "LiquidRouter": "un routeur a liquide, qui est aussi une reserve",
    "Conduit": "un tuyau : directionnel, comme une bande",
    "LiquidJunction": "croise deux tuyaux",
    "LiquidBridge": "un pont a liquide",
    "StorageBlock": "un coffre : prend tout, ne pousse rien",
    "CoreBlock": "le noyau : un coffre qui compte",
    "Router": "repartit au tourniquet",
    "Sorter": "laisse passer ce qu'on a regle, devie le reste",
    "MendProjector": "repare, ne change aucun debit",
    "OverdriveProjector": "accelere ce qui l'entoure",
    "LogicBlock": "un processeur : execute un programme",
    "MessageBlock": "affiche du texte, ne fait rien",
    "MemoryBlock": "retient des nombres pour un processeur",
    "PowerTurret": "une tourelle qui mange de l'energie",
    "Wall": "un mur",
    "Door": "un mur qui s'ouvre",
    "BaseShield": "un bouclier",
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
        "# Chaque bloc du jeu, et où en est le portage",
        "",
        "Généré par `python tools/build_checklist.py`, depuis la liste de classes que le",
        "jeu donne lui-même. Un bloc de Mindustry appartient à une classe Java, et c'est la",
        "classe qui décide de son comportement : deux blocs de la même classe partagent un",
        "`updateTile` et ne diffèrent que par leurs nombres. Porter une classe coche donc",
        "d'un coup tous les blocs qui s'en servent.",
        "",
        "Cocher une case veut dire deux choses, jamais une seule : la classe est transcrite",
        "depuis la source du jeu, **et** un scénario la mesure dans un vrai serveur. Sans le",
        "second, c'est une intuition qui a l'air d'un portage.",
        "",
        f"**{len(todo)} classes à reproduire**, pour "
        f"{sum(len(v) for v in todo.values())} blocs. "
        f"{scenery} autres sont du décor : sol, murs statiques, arbres, échafaudages de "
        "construction. Rien à reproduire, ils ne bougent pas.",
        "",
    ]

    order = sorted(todo.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    lines.append(f"## Fait : {len(ticked & set(todo))} sur {len(todo)}")
    lines.append("")

    for kind, names in order:
        mark = "x" if kind in ticked else " "
        note = NOTES.get(kind, "")
        shown = ", ".join(sorted(names)[:6])
        if len(names) > 6:
            shown += f", et {len(names) - 6} autres"
        lines.append(f"- [{mark}] `{kind}` &mdash; {len(names)} bloc"
                     f"{'s' if len(names) > 1 else ''}"
                     + (f" &mdash; {note}" if note else ""))
        lines.append(f"      {shown}")

    lines.append("")
    lines.append("## Posés par un joueur, mais sans effet sur ce qui circule")
    lines.append("")
    lines.append("Un mur est un mur : il arrête des balles et ne déplace rien. Rien à")
    lines.append("porter, et rien à mesurer non plus.")
    lines.append("")
    for kind, names in sorted(inert.items(), key=lambda kv: -len(kv[1])):
        lines.append(f"- `{kind}` : {len(names)}")

    lines.append("")
    lines.append("## Le décor, rien à faire")
    lines.append("")
    for kind, names in sorted(((k, v) for k, v in kinds.items() if k in SCENERY),
                              key=lambda kv: -len(kv[1])):
        lines.append(f"- `{kind}` : {len(names)}")
    lines.append("")

    TARGET.write_text("\n".join(lines), encoding="utf-8")
    print(f"{len(todo)} classes a faire, {len(ticked & set(todo))} cochees, "
          f"{scenery} blocs de decor, ecrit dans {TARGET}")


if __name__ == "__main__":
    main()
