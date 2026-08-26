package mindustryforge;

import arc.struct.Seq;
import arc.util.Log;
import arc.util.serialization.Jval;
import mindustry.Vars;
import mindustry.core.Version;
import mindustry.type.Item;
import mindustry.type.Liquid;
import mindustry.type.ItemStack;
import mindustry.world.Block;
import mindustry.world.blocks.distribution.Conveyor;
import mindustry.world.blocks.distribution.Duct;
import mindustry.world.blocks.distribution.ItemBridge;
import mindustry.world.blocks.distribution.OverflowDuct;
import mindustry.world.blocks.distribution.OverflowGate;
import mindustry.world.blocks.environment.Floor;
import mindustry.world.blocks.environment.OverlayFloor;
import mindustry.world.blocks.defense.OverdriveProjector;
import mindustry.world.blocks.defense.turrets.ItemTurret;
import mindustry.world.blocks.distribution.Sorter;
import mindustry.world.blocks.distribution.StackConveyor;
import mindustry.world.blocks.storage.StorageBlock;
import mindustry.world.blocks.storage.Unloader;
import mindustry.world.blocks.units.UnitFactory;
import mindustry.world.blocks.distribution.Junction;
import mindustry.world.blocks.distribution.Router;
import mindustry.world.blocks.production.Drill;
import mindustry.world.blocks.production.Pump;
import mindustry.world.blocks.sandbox.ItemSource;
import mindustry.world.blocks.sandbox.LiquidSource;
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

    /** Pixels to a tile, which is what turns the game's ranges into tiles. */
    private static final float TILESIZE = 8f;

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
            // The Java class, which is what decides how a block behaves: two blocks of the
            // same class share an `updateTile` and differ only in their numbers. It is the
            // only honest way to write a list of what is left to port, because it is the
            // game's own list rather than one typed from memory.
            entry.put("kind", kindOf(block));
            entry.put("size", block.size);
            entry.put("item_capacity", block.itemCapacity);
            // How much a block can hold, which a steady-state calculation never needed and
            // a simulation cannot do without: a tank that fills is a tank that stops
            // taking, and that is the whole reason a line backs up.
            entry.put("liquid_capacity", block.liquidCapacity);
            entry.put("has_items", block.hasItems);
            entry.put("has_power", block.hasPower);
            entry.put("rotate", block.rotate);
            // Frames between two attempts to hand an output on. It rarely binds - a press
            // makes one graphite every ninety frames and may offload every five - but it
            // is the difference between a machine that trickles and one that bursts.
            entry.put("dump_time", block.dumpTime);

            /* Exactly which items and liquids a block will take, read off the filters the
               game builds when its consumers are declared.
            
               Inferred from the recipe instead, a generator that burns "anything" accepted
               anything at all: a drill beside one fed it copper, the generator burned it,
               and twenty two items out of forty eight vanished on the way to the vault.
               The game's answer is `ConsumeItemFlammable`, which writes a filter, and the
               filter is a fact rather than a guess. */
            Jval accepts = Jval.newArray();
            for (Item item : Vars.content.items()) {
                if (block.itemFilter != null && block.itemFilter.length > item.id
                        && block.itemFilter[item.id]) {
                    accepts.asArray().add(Jval.valueOf(item.name));
                }
            }
            if (accepts.asArray().size > 0) entry.put("accepts", accepts);

            Jval drinks = Jval.newArray();
            for (Liquid liquid : Vars.content.liquids()) {
                if (block.liquidFilter != null && block.liquidFilter.length > liquid.id
                        && block.liquidFilter[liquid.id]) {
                    drinks.asArray().add(Jval.valueOf(liquid.name));
                }
            }
            if (drinks.asArray().size > 0) entry.put("drinks", drinks);
            // How hard a block pushes a liquid at the next one. `moveLiquid` compares the
            // fraction it holds, times this, against the fraction the other holds, so a
            // settled line has a gradient along it rather than a flat rate.
            entry.put("liquid_pressure", block.liquidPressure);
            // What a battery holds. A buffered consumer asks for nothing and stores a lot,
            // which is exactly what tells a battery apart from a machine.
            if (block.consPower != null && block.consPower.buffered) {
                entry.put("power_capacity", block.consPower.capacity);
            }
            entry.put("health", block.health);

            // What it costs to build, which is what "compact" and "cheap" are scored on.
            Jval cost = Jval.newObject();
            for (ItemStack stack : block.requirements) {
                cost.put(stack.item.name, stack.amount);
            }
            entry.put("cost", cost);

            // Power, read the way the game reads it for its own schematic panel:
            // `Schematic.powerConsumption` sums `consPower.usage` and `powerProduction`
            // sums `getDisplayedPowerProduction()`, both per tick. Taken here for every
            // block rather than per role, because a phase conveyor draws power and is not
            // a power block: filed under bridges, its 0.3 a tick went uncounted and a 334
            // block layout came out 144 energy a second cheaper than the game says.
            // Guarded, because the sandbox power void declares an infinite draw and
            // `Infinity` is not JSON: the dump it produced could not be parsed at all by
            // anything stricter than Python.
            float draw = block.consPower != null ? block.consPower.usage * TPS : 0f;
            entry.put("power", Float.isFinite(draw) ? draw : 0f);
            if (!Float.isFinite(draw)) entry.put("power_void", true);
            // An overdrive projector speeds up what stands near it, and the game's own
            // schematic panel ignores that entirely: forty thorium reactors under five
            // projectors read as 36,900 energy a second when they make 55,350. Two flags
            // decide who is sped up, and both are the game's, read rather than guessed.
            if (!block.canOverdrive) entry.put("no_overdrive", true);
            if (block.privileged) entry.put("privileged", true);
            if (block instanceof PowerGenerator generator) {
                // Not `powerProduction`: a thermal generator divides by its display scale,
                // and the game's own figure is the divided one.
                entry.put("power_out", generator.getDisplayedPowerProduction() * TPS);
            }

            describeRole(block, entry);
            describeFloor(block, entry);
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
            // The id, because a schematic stores a sorter's filter and a source's output as
            // a content type and a number, and turning that back into "titanium" needs the
            // game's own numbering rather than the order a JSON object happens to be in.
            entry.put("id", item.id);
            // The colour the game paints a sorter and a source with. Without it those
            // blocks draw as blank frames, and telling twelve identical sources apart is
            // exactly what the colour is for.
            entry.put("color", "#" + item.color.toString().substring(0, 6));
            entry.put("hardness", item.hardness);
            entry.put("cost", item.cost);
            entry.put("explosiveness", item.explosiveness);
            entry.put("flammability", item.flammability);
            items.put(item.name, entry);
        }
        root.put("items", items);

        // Which names are liquids, stated rather than inferred. It had been worked out
        // from whatever appeared in a recipe, which is right until a schematic configures
        // a source with a liquid no block in it consumes.
        Jval liquids = Jval.newObject();
        for (Liquid liquid : Vars.content.liquids()) {
            Jval entry = Jval.newObject();
            entry.put("id", liquid.id);
            entry.put("color", "#" + liquid.color.toString().substring(0, 6));
            entry.put("heat_capacity", liquid.heatCapacity);
            entry.put("temperature", liquid.temperature);
            liquids.put(liquid.name, entry);
        }
        root.put("liquids", liquids);

        // The units, so a factory's plan can be read back out of a schematic: the
        // configuration stores a content type and an id, and an id means nothing without
        // the registry it came from.
        Jval units = Jval.newObject();
        for (mindustry.type.UnitType unit : Vars.content.units()) {
            Jval entry = Jval.newObject();
            entry.put("id", unit.id);
            entry.put("health", unit.health);
            units.put(unit.name, entry);
        }
        root.put("units", units);

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
        if (block instanceof StackConveyor stack) {
            // Not a `Conveyor`: it moves a whole stack from tile to tile rather than items
            // along a length, so it shares no ancestor with one and fell through every
            // branch below. It came out classified as a sink, which made every plastanium
            // conveyor in every schematic a hole that swallowed whatever reached it.
            entry.put("role", "stack-conveyor");
            entry.put("carries", "item");
            entry.put("items_per_second", Math.round(block.itemCapacity * stack.speed * TPS));
            entry.put("speed", stack.speed);
            entry.put("recharge", stack.recharge);
            entry.put("output_router", stack.outputRouter);
            return;
        }
        if (block instanceof Conveyor conveyor) {
            entry.put("role", "conveyor");
            entry.put("carries", "item");
            // displayedSpeed is items per second at full compression, which is the figure
            // the game shows the player and the only one worth comparing tools on.
            entry.put("items_per_second", conveyor.displayedSpeed);
            // How far along a belt an item slides in one frame. `displayedSpeed` is a
            // figure typed by hand for the player, block by block; it is not `speed` times
            // anything, so a simulation that needs the real one has to be given it.
            entry.put("speed", conveyor.speed);
            return;
        }
        if (block instanceof Junction junction) {
            entry.put("role", "junction");
            entry.put("carries", "item");
            entry.put("items_per_second", TPS / Math.max(1f, junction.speed));
            // Frames an item spends crossing, and how many may be crossing at once, per
            // side. A junction is four queues, not a buffer.
            entry.put("junction_speed", junction.speed);
            entry.put("junction_capacity", junction.capacity);
            return;
        }
        if (block instanceof OverflowDuct overflowDuct) {
            // A duct that goes straight on when it can and to the sides when it cannot.
            // Same shape as an overflow gate, on Erekir's carrier instead of Serpulo's.
            entry.put("role", "duct");
            entry.put("carries", "item");
            entry.put("items_per_second", TPS / Math.max(1f, overflowDuct.speed) * 2f);
            entry.put("duct_speed", overflowDuct.speed);
            entry.put("overflow", true);
            if (overflowDuct.invert) entry.put("invert", true);
            return;
        }
        if (block instanceof Duct duct) {
            // Erekir's carrier. Not a conveyor: it holds exactly one item at a time and
              // carries it across in `speed` frames, so its rate falls out of that rather
              // than out of spacing.
            entry.put("carries", "item");
            entry.put("items_per_second", TPS / Math.max(1f, duct.speed) * 2f);
            // Frames to carry one item across, which is what the simulation needs: a duct
            // holds exactly one thing at a time and its rate falls out of that.
            entry.put("duct_speed", duct.speed);
            if (duct.armored) entry.put("armored", true);
            entry.put("role", "duct");
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
            entry.put("transport_time", bridge.transportTime);
            return;
        }
        if (block instanceof OverflowGate gate) {
            // Straight on when it can, to the sides when it cannot. A maximum flow cannot
            // express that priority and reads it as a plain router, which is right on the
            // total and wrong on which branch carries it. A simulation can, so the flag
            // travels even though the analytic side ignores it.
            entry.put("role", "router");
            entry.put("carries", "item");
            entry.put("overflow", true);
            if (gate.invert) entry.put("invert", true);
            entry.put("overflow_speed", gate.speed);
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
            // How fast it gets up to speed. A drill does not start at full pace, and over
            // a thirty second measurement the ramp is worth a whole item.
            entry.put("warmup_speed", drill.warmupSpeed);
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
            // Told apart rather than lumped together, and the lumping was not harmless:
            // a conduit points somewhere and a liquid router does not, so the four of them
            // sharing one role meant either every pipe leaked sideways or every router
            // was a one-way street. The first was the state of things; a schematic's
            // pipes fed themselves in both directions.
            entry.put("role",
                block instanceof LiquidBridge ? "bridge"
                : block instanceof LiquidJunction ? "junction"
                : block instanceof LiquidRouter ? "router"
                : "conduit");
            entry.put("carries", "liquid");
            if (block instanceof LiquidBridge bridge) {
                // A liquid bridge is an ItemBridge, and it was sent down this branch to be
                // told it carries liquid - which lost its range on the way. With no range
                // every link it stored was judged out of reach and thrown away: six phase
                // conduits with no line drawn between them and, worse, no edge in the
                // graph, so the liquid stopped there.
                entry.put("range", bridge.range);
            }
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
            return;
        }
        if (block instanceof Pump pump) {
            // What a player actually installs to feed a schematic. Stated per second over a
            // full footprint of liquid, which is the figure the game itself shows.
            entry.put("role", "pump");
            entry.put("output_per_second", TPS * pump.pumpAmount * block.size * block.size);
            // Per tile as well as per pump, because a pump half on the water pumps half
            // as much: the game sums `liquidMultiplier` over the tiles it covers.
            entry.put("pump_amount", pump.pumpAmount);
            entry.put("input_liquid", liquidInputsOf(block));
            return;
        }
        if (block instanceof PowerGenerator generator) {
            // What the whole schematic exists for, in the case that started this: water in,
            // power out. Classified as a sink before, with no consumption at all, so the
            // coal feeding it was counted as the layout's output.
            entry.put("role", "generator");
            entry.put("input", inputsOf(block));
            entry.put("input_liquid", liquidInputsOf(block));
            entry.put("craft_time", itemDurationOf(block));
            return;
        }
        if (block instanceof ItemTurret turret) {
            // A turret eats ammunition, and it was filed as a sink that consumed nothing:
            // a belt feeding one carried items into a hole and the layout read as wasting
            // them. How fast it eats depends on how often it fires, which a still picture
            // cannot know, so the rate here is the rate while firing and is labelled so.
            entry.put("role", "turret");
            entry.put("carries", "item");
            entry.put("reload", turret.reload);
            entry.put("ammo_per_shot", turret.ammoPerShot);
            entry.put("shots_per_second", TPS / Math.max(1f, turret.reload));

            Jval ammo = Jval.newArray();
            for (Item item : turret.ammoTypes.keys()) {
                ammo.asArray().add(Jval.valueOf(item.name));
            }
            entry.put("ammo", ammo);
            entry.put("input_liquid", liquidInputsOf(block));
            return;
        }
        if (block instanceof Unloader unloader) {
            // It pulls out of whatever container it touches, so it is a source rather than
            // a sink: modelled as neither, a line starting at one started at nothing.
            entry.put("role", "unloader");
            entry.put("carries", "item");
            // `60f / speed`, which is what the game puts on its own stat line. Written as
            // `speed * 60` it came out at 327 items a second instead of 11: thirty times
            // too fast, and a container behind one looked like an inexhaustible mine.
            entry.put("items_per_second", TPS / Math.max(0.0001f, unloader.speed));
            return;
        }
        if (block instanceof ItemSource source) {
            // Sandbox blocks, and the reason a test layout reads as producing nothing:
            // filed as sinks, the twelve sources feeding a reactor farm looked like twelve
            // places its output disappeared into.
            entry.put("role", "source");
            entry.put("carries", "item");
            entry.put("output_per_second", source.itemsPerSecond);
            return;
        }
        if (block instanceof LiquidSource) {
            entry.put("role", "source");
            entry.put("carries", "liquid");
            // It refills itself every tick, so what comes out is whatever the pipe on the
            // other side can take. Stated as its own capacity per tick, which is past any
            // real pipe by three orders of magnitude.
            entry.put("output_per_second", block.liquidCapacity * TPS);
            return;
        }
        if (block instanceof UnitFactory factory) {
            /* A unit factory is a crafter whose output is not an item.
            
               It carries a list of plans - a unit, how long it takes, what it costs - and
               the schematic says which one is selected. Everything else about it is a
               `GenericCrafter`: progress accumulates while it has what it needs, and a
               unit comes out when the progress is done. */
            entry.put("role", "unit-factory");
            Jval plans = Jval.newArray();
            for (UnitFactory.UnitPlan plan : factory.plans) {
                Jval one = Jval.newObject();
                one.put("unit", plan.unit.name);
                one.put("unit_id", plan.unit.id);
                one.put("time", plan.time);
                Jval needs = Jval.newObject();
                for (ItemStack stack : plan.requirements) {
                    needs.put(stack.item.name, stack.amount);
                }
                one.put("requirements", needs);
                plans.asArray().add(one);
            }
            entry.put("plans", plans);
            entry.put("input_liquid", liquidInputsOf(block));
            return;
        }
        if (block instanceof OverdriveProjector projector) {
            // Range is in world units in the game and in tiles here, because every other
            // distance on this site is in tiles and one unit per file is how a conversion
            // gets forgotten.
            entry.put("role", "projector");
            entry.put("boost", projector.speedBoost);
            entry.put("boost_phase", projector.speedBoostPhase);
            entry.put("range", projector.range / TILESIZE);
            entry.put("phase_range_boost", projector.phaseRangeBoost / TILESIZE);
            entry.put("boost_input", optionalInputsOf(block));
            entry.put("boost_time", projector.useTime);
            return;
        }
        if (block instanceof mindustry.world.blocks.storage.CoreBlock) {
            // A container that counts, and where most schematics are meant to deliver.
            entry.put("role", "core");
            entry.put("carries", "item");
            entry.put("item_capacity", block.itemCapacity);
            return;
        }
        if (block instanceof StorageBlock) {
            // A vault, a container, a core. It takes anything and gives anything back to
            // whatever pulls from it.
            entry.put("role", "store");
            entry.put("carries", "item");
            entry.put("item_capacity", block.itemCapacity);
            return;
        }
        if (block.hasItems && block.acceptsItems) {
            // Turrets and anything else that swallows items without producing any. They
            // are sinks, and a layout that feeds one is doing something useful even though
            // nothing comes back out.
            entry.put("role", "sink");
            entry.put("input", inputsOf(block));
            entry.put("input_liquid", liquidInputsOf(block));
            return;
        }
        if (block.hasLiquids && block.consumesPower) {
            entry.put("role", "sink");
            entry.put("input_liquid", liquidInputsOf(block));
        }
    }

    /**
     * The ground, which decides what a drill on it actually pulls out.
     *
     * <p>Without it a drill can only be reported at its best case, on a full patch of
     * whatever the reader imagines, which is the tool admitting it does not know what the
     * drill is standing on. `itemDrop` and `liquidDrop` are what the game asks when a
     * drill or a pump looks down, so they are what gets asked here.
     */
    private static void describeFloor(Block block, Jval entry) {
        if (!(block instanceof Floor floor)) {
            return;
        }
        // An overlay is an ore laid over a floor; a floor is the ground itself. Told apart
        // because painting one replaces the ground and painting the other does not.
        entry.put("floor", true);
        if (block instanceof OverlayFloor) entry.put("overlay", true);
        if (floor.isLiquid) entry.put("floor_liquid", true);
        if (floor.playerUnmineable) entry.put("unmineable", true);
        if (floor.itemDrop != null) entry.put("drops", floor.itemDrop.name);
        if (floor.liquidDrop != null) {
            entry.put("drops_liquid", floor.liquidDrop.name);
            entry.put("liquid_multiplier", floor.liquidMultiplier);
        }
        if (floor.isDeep()) entry.put("deep", true);
        entry.put("buildable", floor.hasSurface() || floor.placeableOn);
    }

    /**
     * The class that decides how a block behaves.
     *
     * <p>Almost every block in the game is declared as an anonymous subclass, `new
     * Conveyor("conveyor"){{ speed = 0.046f; }}`, whose simple name is the empty string.
     * Asked for it directly, three hundred and eighty eight of four hundred and forty six
     * blocks came back nameless. What is wanted is the first named class above it, which
     * is where `updateTile` actually lives.
     */
    private static String kindOf(Block block) {
        Class<?> found = block.getClass();
        while (found != null && found.getSimpleName().isEmpty()) {
            found = found.getSuperclass();
        }
        return found == null ? "Block" : found.getSimpleName();
    }

    /** Liquids a block drinks, per second. */
    private static Jval liquidInputsOf(Block block) {
        Jval input = Jval.newObject();
        for (Consume consume : block.consumers) {
            if (consume.optional) continue;
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

    /**
     * What a block takes to go faster but runs without.
     *
     * Kept apart from {@link #inputsOf}, which had been mixing the two: an overdrive
     * projector with no phase fabric still boosts, and reading its phase fabric as an
     * ingredient makes a working layout report as starved.
     */
    private static Jval optionalInputsOf(Block block) {
        Jval input = Jval.newObject();
        for (Consume consume : block.consumers) {
            if (consume.optional && consume instanceof ConsumeItems items) {
                for (ItemStack stack : items.items) {
                    input.put(stack.item.name, stack.amount);
                }
            }
        }
        return input;
    }

    private static Jval inputsOf(Block block) {
        Jval input = Jval.newObject();
        for (Consume consume : block.consumers) {
            if (consume.optional) continue;
            if (consume instanceof ConsumeItems items) {
                for (ItemStack stack : items.items) {
                    input.put(stack.item.name, stack.amount);
                }
            }
        }
        return input;
    }

    public static Path defaultOut() {
        return Paths.get("analyser", "data", "blocks.json");
    }
}
