"""Trim the game's block registry down to what the browser needs.

    python tools/build_catalogue.py

`bench/data/blocks.json` is everything the game knows, 367 kilobytes of it, and most of it
is blocks that carry nothing. The page loads the trimmed copy, 176 kilobytes, which gzips
to a fraction of that and is small enough that nobody waits for it.

Those figures are measured rather than remembered. The docstring claimed 128 and 29 for a
long time after both had stopped being true, which is how a file comes to document a
program that no longer exists.

Generated rather than edited. A hand-maintained second copy of the block data would drift
from the first, which is the failure this whole repository is arranged to avoid.
"""

from __future__ import annotations

import json
from pathlib import Path

SOURCE = Path("bench/data/blocks.json")
TARGET = Path("site/public/forge/blocks.json")

#: What the analysis reads. Everything else the game knows about a block is weight.
KEEP = ("id", "size", "role", "items_per_second", "craft_time", "input", "output",
        "input_liquid", "output_liquid", "power", "power_out",
        "tier", "drill_time", "hardness_multiplier", "cost", "item_capacity",
        "range", "carries", "output_per_second",
        "ammo", "reload", "ammo_per_shot", "shots_per_second", "liquid_capacity",
        "boost", "boost_phase", "boost_input", "boost_time", "phase_range_boost",
        "no_overdrive", "privileged", "rotate",
        # The ground. What a drill on it pulls out and what a pump on it draws, which is
        # the difference between "at best, on a full patch" and an actual figure.
        "floor", "overlay", "floor_liquid", "drops", "drops_liquid", "liquid_multiplier",
        "deep", "buildable", "unmineable", "pump_amount",
        # What the tick by tick simulation needs and the steady state one never did: the
        # real speeds, not the figures the game prints for a player.
        "speed", "junction_speed", "junction_capacity", "transport_time",
        "overflow", "invert", "overflow_speed", "recharge", "output_router",
        "dump_time", "kind", "liquid_pressure", "power_capacity", "accepts", "drinks", "warmup_speed", "plans", "duct_speed", "armored", "max_ammo", "ammo_worth",
        "heat_output", "warmup_rate", "heat_requirement", "overheat_scale",
        "max_efficiency", "split_heat", "buffered", "buffer_speed", "buffer_capacity",
        "attributes", "attribute", "base_efficiency", "boost_scale", "max_boost",
        "scale_liquid_consumption", "results", "has_liquids",
        # The generators, which share one word and no behaviour at all.
        "power_production", "item_duration_multipliers", "explode_on_full",
        "min_efficiency", "display_efficiency_scale", "floating", "item_duration",
        "heating", "coolant_power", "ambient_cooldown_time", "fuel_item",
        "max_heat", "unstable_speed", "item_worth", "leaks", "insulated",
        # La defense, dont la question est ce qu'elle consomme au repos.
        "coolant_amount", "coolant_multiplier", "ammo_types", "shoot_duration",
        "heal_percent", "phase_boost", "use_time", "radius", "shield_health",
        "phase_radius_boost", "phase_shield_boost", "coolant_consumption",
        "discovery_time", "has_boost", "coolant_worth", "allow_core_unload", "unloadable",
        # Les foreuses d'Erekir, qui mangent le mur en face plutot que le sol.
        "wall", "wall_ore", "drill_time", "optional_boost_intensity",
        "drill_multipliers", "blocked_items", "boost_liquid", "item_boost",
        "liquid_boost", "item_use_time",
        # Les charges utiles : une unite ou un bloc transporte comme cargaison.
        "move_time", "payload_limit", "payload_speed", "payload_rotate_speed",
        "outputs_payload", "accepts_payload", "construct_time", "upgrades",
        "capacities", "build_time", "build_speed", "produces", "incinerable", "instant_transfer",
        "consumes_power", "outputs_power_flag", "conductive_power", "power_node", "heat_warmup_rate",
        "laser_range", "max_nodes", "no_autolink", "no_connected_power", "no_update",
        "launch_time", "accept_multiple_items",
        # Les processeurs, dont la vitesse est tout ce qui les distingue, et la portee de
        # liaison, qui decide si un capteur est joignable depuis le processeur qui le lit.
        "instructions_per_tick", "max_instruction_scale", "max_instructions_per_tick",
        "logic_range",
        "load_time", "items_loaded", "liquids_loaded", "max_block_size",
        "offload_speed", "deconstruct_speed", "dump_rate", "max_payload_size",
        "charge_time", "length", "knockback", "transfer_time",
        "area_size", "drones_created", "drone_construct_time", "drone_type",
        "plans", "tier", "unit_build_time", "unit_type", "stale_time",
        "drawers",
        "base_explosiveness", "explosiveness_scale", "explosion_radius",
        "explosion_damage", "health",
        "same_block_link", "liquid_output_directions", "no_dump_extra", "ignore_liquid_fullness", "solid",
        # Le mass driver, qui lance ses objets a distance.
        "rotate_speed", "min_distribute", "reload", "bullet_speed",
        "bullet_lifetime", "translation",
        # Ce qui decide d une pose dans l editeur, lu dans `Build.validPlace` et
        # `Block.canReplace`. Ranger la palette demande `category` et `planet` ; decider
        # d un remplacement demande tous les autres, et en connaitre une partie seulement
        # donne un editeur qui refuse des gestes que le jeu accepte.
        "category", "group", "group_any_replace", "subclass", "planet",
        "conveyor_placement", "replaceable", "always_replace", "quick_rotate",
        "privileged", "placeable_on", "requires_water", "placeable_liquid",
        # Comment un glisse trace, et jusqu ou un pont ou un pylone porte.
        "allow_diagonal", "swap_diagonal_placement", "allow_rectangle_placement",
        "laser_range",
        # Ce qu un convoyeur devient tout seul quand la ligne le demande, et le reste de ce
        # que la pose lit : rotations forcees, miroirs inverses, configurabilite, casse.
        "junction_replacement", "bridge_replacement", "ignore_line_rotation",
        "lock_rotation", "invert_flip", "save_config", "copy_config", "configurable",
        "clear_on_double_tap", "placeable_player", "schematic_priority",
        "build_visibility",
        )

#: Les champs dont `False` est l information, et non l absence d information.
#:
#: Le filtre plus bas jette les valeurs vides, et en Python `False == 0` : un champ à
#: `False` y passait donc à la trappe avec les zéros. Sans importance tant que tout drapeau
#: valait vrai par défaut, mais `replaceable` et `placeable_on` valent **vrai** par défaut
#: dans le jeu et ne sont écrits que là où ils sont faux. Les jeter revenait à supprimer la
#: seule chose qu'ils avaient à dire.
FALSE_MATTERS = ("replaceable", "placeable_on", "allow_diagonal", "placeable_player")


def main() -> None:
    raw = json.loads(SOURCE.read_text(encoding="utf-8"))

    blocks = {}
    for name, entry in raw["blocks"].items():
        # A block with neither a role nor a build cost cannot appear in a schematic and
        # cannot affect one. Air, spawn markers, the wall-removal tool.
        #
        # The ground is the exception: it never appears in a schematic and it decides what
        # the schematic does, because a drill pulls out whatever it is standing on.
        if (not entry.get("role") and not entry.get("cost")
                and not entry.get("floor") and not entry.get("wall")):
            continue
        blocks[name] = {k: v for k, v in entry.items()
                        if k in KEEP
                        and (k in FALSE_MATTERS or v not in (0, {}, "", None))}

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(json.dumps({
        "game_version": raw["game_version"],
        "build": raw["build"],
        "blocks": blocks,
        "items": raw["items"],
        "liquids": raw["liquids"],
        "units": raw["units"],
    }, separators=(",", ":")), encoding="utf-8")

    print(f"{len(blocks)} blocs sur {len(raw['blocks'])}, "
          f"{TARGET.stat().st_size // 1024} ko dans {TARGET}")


if __name__ == "__main__":
    main()
