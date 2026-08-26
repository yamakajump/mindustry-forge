package mindustryforge;

import arc.struct.Seq;
import arc.util.Log;
import arc.util.serialization.Jval;
import mindustry.Vars;
import mindustry.core.Version;
import mindustry.type.Item;
import mindustry.type.ItemStack;
import mindustry.world.Block;
import mindustry.world.blocks.distribution.Conveyor;
import mindustry.world.blocks.distribution.Duct;
import mindustry.world.blocks.distribution.ItemBridge;
import mindustry.world.blocks.distribution.OverflowGate;
import mindustry.world.blocks.distribution.Sorter;
import mindustry.world.blocks.distribution.Junction;
import mindustry.world.blocks.distribution.Router;
import mindustry.world.blocks.production.Drill;
import mindustry.world.blocks.liquid.Conduit;
import mindustry.world.blocks.liquid.LiquidBridge;
import mindustry.world.blocks.liquid.LiquidJunction;
import mindustry.world.blocks.liquid.LiquidRouter;
import mindustry.world.blocks.power.Battery;
import mindustry.world.blocks.power.ConsumeGenerator;
import mindustry.world.blocks.power.PowerGenerator;
import mindustry.world.blocks.power.PowerNode;
import mindustry.world.blocks.production.GenericCrafter;
import mindustry.world.consumers.Consume;
import mindustry.type.LiquidStack;
import mindustry.world.consumers.ConsumeItems;
import mindustry.world.consumers.ConsumeLiquid;
import mindustry.world.consumers.ConsumeLiquids;
import mindustry.world.consumers.ConsumePower;

import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Write out what every block does, read from the running game.
 *
 * <p>The analyser needs a number per block: how fast a conveyor moves items, how long a
 * press takes, what a recipe consumes. Those numbers exist exactly once, inside Mindustry,
 * and every other calculator on the web has retyped them from a wiki. A retyped table is a
 * table that drifts: the game ships balance changes and the tool goes on being confidently
 * wrong, with nothing to notice it.
 *
 * <p>So nothing here is typed. The plugin loads the game's own block registry and prints
 * it, stamped with the version it came from, and the analyser refuses a table whose
 * version does not match the bench it is checked against.
 *
 * <p>Run with {@code java -jar server-release.jar} and the command {@code dump-blocks}.
 */
public class DumpBlocks {

    /** Ticks per second, which is what turns the game's per-tick figures into per-second. */
    private static final float TPS = 60f;

    public static void dump(Path out) {
        Jval root = Jval.newObject();
        // Stamped with the build it came from, because the analyser must refuse a table
        // that does not match the bench it is checked against. A silent engine bump is
        // exactly how a calculator goes on being confidently wrong.
        root.put("game_version", Version.combined());
        root.put("build", Version.build);
        root.put("revision", Version.revision);

        Jval blocks = Jval.newObject();
        for (Block block : Vars.content.blocks()) {
            Jval entry = Jval.newObject();
            entry.put("name", block.name);
            entry.put("size", block.size);
            entry.put("item_capacity", block.itemCapacity);
            entry.put("has_items", block.hasItems);
            entry.put("has_power", block.hasPower);
            entry.put("rotate", block.rotate);
            entry.put("health", block.health);

            // What it costs to build, which is what "compact" and "cheap" are scored on.
            Jval cost = Jval.newObject();
            for (ItemStack stack : block.requirements) {
                cost.put(stack.item.name, stack.amount);
            }
            entry.put("cost", cost);

            describeRole(block, entry);
            blocks.put(block.name, entry);
        }
        root.put("blocks", blocks);

        Jval items = Jval.newObject();
        for (Item item : Vars.content.items()) {
            Jval entry = Jval.newObject();
            entry.put("name", item.name);
            // Hardness is what decides which drill can touch an ore, and cost is the
            // game's own notion of how precious an item is. Both are needed to say what a
            // layout is worth rather than only how much it moves.
            entry.put("hardness", item.hardness);
            entry.put("cost", item.cost);
            entry.put("explosiveness", item.explosiveness);
            entry.put("flammability", item.flammability);
            items.put(item.name, entry);
        }
        root.put("items", items);

        try {
            Files.createDirectories(out.getParent());
            try (PrintWriter writer = new PrintWriter(
                    Files.newBufferedWriter(out, StandardCharsets.UTF_8))) {
                writer.print(root.toString(Jval.Jformat.formatted));
            }
            Log.info("[forge] wrote @ blocks and @ items to @",
                    Vars.content.blocks().size, Vars.content.items().size, out);
        } catch (Exception error) {
            Log.err("[forge] could not write block data", error);
        }
    }

    /**
     * The part that differs per kind of block, and the only part the flow model cares about.
     *
     * <p>Read off the concrete classes rather than off names. A block called "conveyor" is
     * a guess; a block that is an instance of {@link Conveyor} is a fact, and it keeps
     * working for the blocks a mod adds.
     */
    private static void describeRole(Block block, Jval entry) {
        if (block instanceof Conveyor conveyor) {
            entry.put("role", "conveyor");
            entry.put("carries", "item");
            // displayedSpeed is items per second at full compression, which is the figure
            // the game shows the player and the only one worth comparing tools on.
            entry.put("items_per_second", conveyor.displayedSpeed);
            return;
        }
        if (block instanceof Junction junction) {
            entry.put("role", "junction");
            entry.put("carries", "item");
            entry.put("items_per_second", TPS / Math.max(1f, junction.speed));
            return;
        }
        if (block instanceof Duct duct) {
            // A duct carries like a conveyor and states its speed the same way.
            entry.put("role", "conveyor");
            entry.put("carries", "item");
            entry.put("items_per_second", TPS / Math.max(1f, duct.speed) * 2f);
            return;
        }
        if (block instanceof ItemBridge bridge && !(block instanceof LiquidBridge)) {
            // A bridge carries items over a gap to a tile it remembers, so it is a carrier
            // and not a sink. Classified as a sink it swallowed everything handed to it:
            // ten of them in the first real schematic, and the whole line downstream read
            // as producing nothing.
            entry.put("role", "bridge");
            entry.put("carries", "item");
            entry.put("range", bridge.range);
            entry.put("items_per_second", TPS / Math.max(1f, bridge.transportTime));
            return;
        }
        if (block instanceof OverflowGate) {
            // Straight on when it can, to the sides when it cannot. Modelled as a router
            // for now, which is right on the share it passes and wrong on the priority.
            entry.put("role", "router");
            entry.put("carries", "item");
            return;
        }
        if (block instanceof Sorter) {
            entry.put("role", "sorter");
            entry.put("carries", "item");
            return;
        }
        if (block instanceof Router) {
            entry.put("role", "router");
            entry.put("carries", "item");
            return;
        }
        if (block instanceof Drill drill) {
            entry.put("role", "drill");
            entry.put("tier", drill.tier);
            // The game's own formula, kept as its parts rather than as one number: a
            // drill's rate depends on how many ore tiles it covers and how hard they are,
            // so a single "speed" would be a lie for every square but one.
            entry.put("drill_time", drill.drillTime);
            entry.put("hardness_multiplier", drill.hardnessDrillMultiplier);
            entry.put("liquid_boost", drill.liquidBoostIntensity);
            return;
        }
        if (block instanceof Conduit || block instanceof LiquidJunction
                || block instanceof LiquidRouter || block instanceof LiquidBridge) {
            // Liquids move through their own network, and leaving them out is not a small
            // omission: a schematic that turns water into power reads as producing nothing
            // at all, or worse, as producing its own intermediates for free.
            // Liquids and items travel on networks that never touch. Saying which one a
            // carrier belongs to is what stops a conveyor from being credited with
            // delivering water, which reads as a working factory and is not one.
            entry.put("role", block instanceof LiquidBridge ? "bridge" : "conduit");
            entry.put("carries", "liquid");
            return;
        }
        if (block instanceof PowerNode || block instanceof Battery) {
            // Wires and buffers. They neither make nor spend power on balance, but a
            // schematic full of them is a power schematic, and saying so is most of what a
            // reader needs.
            entry.put("role", "power");
            return;
        }
        if (block instanceof GenericCrafter crafter) {
            entry.put("role", "crafter");
            entry.put("craft_time", crafter.craftTime);
            entry.put("crafts_per_second", TPS / Math.max(1f, crafter.craftTime));

            Jval output = Jval.newObject();
            if (crafter.outputItems != null) {
                for (ItemStack stack : crafter.outputItems) {
                    output.put(stack.item.name, stack.amount);
                }
            }
            entry.put("output", output);

            // Liquids out, per second, since a liquid is produced continuously rather than
            // in batches. A spore press makes oil and nothing else, and without this the
            // press reads as consuming spore pods and returning nothing.
            Jval liquidOut = Jval.newObject();
            if (crafter.outputLiquids != null) {
                for (LiquidStack stack : crafter.outputLiquids) {
                    liquidOut.put(stack.liquid.name, stack.amount * TPS);
                }
            }
            entry.put("output_liquid", liquidOut);

            entry.put("input", inputsOf(crafter));
            entry.put("input_liquid", liquidInputsOf(crafter));
            entry.put("power", powerOf(crafter));
            return;
        }
        if (block instanceof PowerGenerator generator) {
            // What the whole schematic exists for, in the case that started this: water in,
            // power out. Classified as a sink before, with no consumption at all, so the
            // coal feeding it was counted as the layout's output.
            entry.put("role", "generator");
            entry.put("power_out", generator.powerProduction * TPS);
            entry.put("input", inputsOf(block));
            entry.put("input_liquid", liquidInputsOf(block));
            entry.put("craft_time", itemDurationOf(block));
            return;
        }
        if (block.hasItems && block.acceptsItems) {
            // Turrets and anything else that swallows items without producing any. They
            // are sinks, and a layout that feeds one is doing something useful even though
            // nothing comes back out.
            entry.put("role", "sink");
            entry.put("input", inputsOf(block));
            entry.put("input_liquid", liquidInputsOf(block));
            entry.put("power", powerOf(block));
            return;
        }
        if (block.hasLiquids && block.consumesPower) {
            entry.put("role", "sink");
            entry.put("input_liquid", liquidInputsOf(block));
            entry.put("power", powerOf(block));
        }
    }

    /** Liquids a block drinks, per second. */
    private static Jval liquidInputsOf(Block block) {
        Jval input = Jval.newObject();
        for (Consume consume : block.consumers) {
            if (consume instanceof ConsumeLiquid one) {
                input.put(one.liquid.name, one.amount * TPS);
            } else if (consume instanceof ConsumeLiquids many) {
                for (LiquidStack stack : many.liquids) {
                    input.put(stack.liquid.name, stack.amount * TPS);
                }
            }
        }
        return input;
    }

    /**
     * How long one unit of fuel lasts a generator, in ticks.
     *
     * A generator states how much power it makes and how long an item burns, never a rate
     * of consumption, so the rate has to come from the two together.
     */
    private static float itemDurationOf(Block block) {
        if (block instanceof ConsumeGenerator burner) {
            return burner.itemDuration;
        }
        return 0f;
    }

    private static Jval inputsOf(Block block) {
        Jval input = Jval.newObject();
        for (Consume consume : block.consumers) {
            if (consume instanceof ConsumeItems items) {
                for (ItemStack stack : items.items) {
                    input.put(stack.item.name, stack.amount);
                }
            }
        }
        return input;
    }

    private static float powerOf(Block block) {
        for (Consume consume : block.consumers) {
            if (consume instanceof ConsumePower power) {
                return power.usage * TPS;
            }
        }
        return 0f;
    }

    public static Path defaultOut() {
        return Paths.get("analyser", "data", "blocks.json");
    }
}
