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
import mindustry.world.blocks.distribution.Junction;
import mindustry.world.blocks.distribution.Router;
import mindustry.world.blocks.production.Drill;
import mindustry.world.blocks.production.GenericCrafter;
import mindustry.world.consumers.Consume;
import mindustry.world.consumers.ConsumeItems;
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
            // displayedSpeed is items per second at full compression, which is the figure
            // the game shows the player and the only one worth comparing tools on.
            entry.put("items_per_second", conveyor.displayedSpeed);
            return;
        }
        if (block instanceof Junction junction) {
            entry.put("role", "junction");
            entry.put("items_per_second", TPS / Math.max(1f, junction.speed));
            return;
        }
        if (block instanceof Router) {
            entry.put("role", "router");
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
            entry.put("input", inputsOf(crafter));
            entry.put("power", powerOf(crafter));
            return;
        }
        if (block.hasItems && block.acceptsItems) {
            // Turrets and anything else that swallows items without producing any. They
            // are sinks, and a layout that feeds one is doing something useful even though
            // nothing comes back out.
            entry.put("role", "sink");
            entry.put("input", inputsOf(block));
        }
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
