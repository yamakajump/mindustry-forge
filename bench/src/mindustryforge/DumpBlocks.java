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
import mindustry.world.blocks.distribution.BufferedItemBridge;
import mindustry.world.blocks.distribution.Conveyor;
import mindustry.world.blocks.distribution.Duct;
import mindustry.world.blocks.distribution.ItemBridge;
import mindustry.world.blocks.distribution.OverflowDuct;
import mindustry.world.blocks.distribution.OverflowGate;
import mindustry.world.blocks.distribution.MassDriver;
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
import mindustry.world.blocks.production.ItemIncinerator;
import mindustry.world.blocks.production.Incinerator;
import mindustry.world.blocks.sandbox.LiquidVoid;
import mindustry.world.blocks.sandbox.ItemVoid;
import mindustry.world.blocks.defense.ShockwaveTower;
import mindustry.world.blocks.units.RepairTower;
import mindustry.world.blocks.units.RepairTurret;
import mindustry.world.blocks.defense.RegenProjector;
import mindustry.world.blocks.payloads.Constructor;
import mindustry.world.blocks.payloads.BlockProducer;
import mindustry.type.UnitType;
import mindustry.world.blocks.units.Reconstructor;
import mindustry.world.blocks.payloads.PayloadVoid;
import mindustry.world.blocks.payloads.PayloadSource;
import mindustry.world.blocks.payloads.PayloadRouter;
import mindustry.world.blocks.payloads.PayloadConveyor;
import mindustry.world.blocks.payloads.PayloadBlock;
import mindustry.world.blocks.production.Fracker;
import mindustry.world.blocks.production.SolidPump;
import mindustry.world.meta.Attribute;
import mindustry.world.blocks.production.BurstDrill;
import mindustry.world.blocks.production.WallCrafter;
import mindustry.world.blocks.environment.StaticWall;
import mindustry.world.blocks.production.BeamDrill;
import mindustry.world.blocks.distribution.DirectionLiquidBridge;
import mindustry.world.blocks.distribution.DirectionalUnloader;
import mindustry.world.blocks.defense.Radar;
import mindustry.world.blocks.defense.ForceProjector;
import mindustry.world.blocks.defense.MendProjector;
import mindustry.world.blocks.defense.turrets.TractorBeamTurret;
import mindustry.world.blocks.defense.turrets.LiquidTurret;
import mindustry.world.blocks.defense.turrets.LaserTurret;
import mindustry.world.blocks.defense.turrets.ReloadTurret;
import mindustry.world.blocks.defense.turrets.BaseTurret;
import mindustry.world.blocks.power.BeamNode;
import mindustry.world.blocks.distribution.StackRouter;
import mindustry.world.blocks.distribution.DuctBridge;
import mindustry.world.blocks.distribution.DuctRouter;
import mindustry.world.blocks.power.VariableReactor;
import mindustry.world.blocks.power.NuclearReactor;
import mindustry.world.blocks.power.ImpactReactor;
import mindustry.world.blocks.power.ThermalGenerator;
import mindustry.world.blocks.power.HeaterGenerator;
import mindustry.world.blocks.power.PowerNode;
import mindustry.world.blocks.heat.HeatConductor;
import mindustry.world.blocks.heat.HeatProducer;
import mindustry.world.blocks.production.AttributeCrafter;
import mindustry.world.blocks.production.GenericCrafter;
import mindustry.world.blocks.production.Separator;
import mindustry.world.blocks.production.HeatCrafter;
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
            /* The game's own number for this block. A schematic stores a constructor's
               recipe the way it stores a sorter's item, as a content type and an id, and
               turning that back into a name needs the registry rather than a guess. */
            entry.put("id", block.id);
            entry.put("size", block.size);
            entry.put("item_capacity", block.itemCapacity);
            // How much a block can hold, which a steady-state calculation never needed and
            // a simulation cannot do without: a tank that fills is a tank that stops
            // taking, and that is the whole reason a line backs up.
            entry.put("liquid_capacity", block.liquidCapacity);
            entry.put("has_items", block.hasItems);
            /* Whether an unloader may take out of it. True for nearly everything, and
               false for every carrier: a duct, a router, an unloader itself. Without it an
               Erekir unloader happily drains the duct behind it. */
            if (block.unloadable) entry.put("unloadable", true);
            /* Whether it has a tank at all. Every block reports a `liquidCapacity`, which
               defaults to ten, so a power node reads as something that can hold water: a
               liquid source beside one filled it, and the schematic showed a puddle in a
               wire. `hasLiquids` is the flag the game itself tests. */
            entry.put("has_liquids", block.hasLiquids);
            entry.put("has_power", block.hasPower);
            /* Les trois drapeaux qui decident si deux blocs voisins partagent une grille.
               Le jeu refuse la liaison quand les **deux** consomment, qu'**aucun** ne
               produit, et qu'aucun n'est conducteur : le courant ne traverse pas un
               consommateur. Trois blocs seulement sont conducteurs, et sans eux une rangee
               de machines collees les unes aux autres se retrouve entierement alimentee
               par le seul generateur du bout. */
            if (block.consumesPower) entry.put("consumes_power", true);
            if (block.outputsPower) entry.put("outputs_power_flag", true);
            if (block.conductivePower) entry.put("conductive_power", true);
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
            /* Whether a router will wait before handing to it. Two blocks set it, a sorter
               and an overflow gate, and it is the difference between a router chain at
               eleven items a second and at seven and a half. */
            if (block.instantTransfer) entry.put("instant_transfer", true);
            /* How fast cargo slides into place and turns. Both are on `PayloadBlock` and
               neither is ever redefined: 0.7 pixels and 5 degrees a frame. A payload spends
               real time arriving, and a reconstructor does not start on the frame the
               conveyor hands it over. */
            if (block instanceof PayloadBlock payload) {
                entry.put("payload_speed", payload.payloadSpeed);
                entry.put("payload_rotate_speed", payload.payloadRotateSpeed);
            }
            if (block.outputsPayload) entry.put("outputs_payload", true);
            if (block.acceptsPayload) entry.put("accepts_payload", true);
            /* Si on peut poser une cargaison sur la case : `canDump` vaut
               `front == null || !front.tile.solid()`. Un convoyeur, un duct, une conduite
               ou un routeur ne sont pas solides, donc une usine pointee vers un tapis pose
               son unite au sol et repart. Le portage prenait la seule presence d'un
               batiment pour un mur et s'arretait apres une unite. */
            if (block.solid) entry.put("solid", true);
            /* Si on peut poser une cargaison sur la case : `canDump` vaut
               `front == null || !front.tile.solid()`. Un convoyeur, un duct, une conduite
               ou un routeur ne sont pas solides, donc une usine pointee vers un tapis pose
               son unite au sol et repart. Le portage prenait la seule presence d'un
               batiment pour un mur et s'arretait apres une unite. */
            if (block.solid) entry.put("solid", true);
            /* Whether a pipe pointed at nothing spills. The class sets it one way and the
               block the other: `ArmoredConduit` declares `leaks = false` and
               `reinforced-conduit` turns it back on, so reading the class gets it wrong
               for the only two blocks it applies to. */
            if (block instanceof Conduit pipe && pipe.leaks) entry.put("leaks", true);
            // What a battery holds. A buffered consumer asks for nothing and stores a lot,
            // which is exactly what tells a battery apart from a machine.
            if (block.consPower != null && block.consPower.buffered) {
                entry.put("power_capacity", block.consPower.capacity);
            }
            entry.put("health", block.health);
            /* How long this block takes to build, which is not a field anyone typed: it is
               derived from the requirements in `Block.init` as the sum of amount times item
               cost. A constructor's whole clock is the build time of whatever it was set
               to, so it has to be carried for every block and not only for the buildable
               ones. */
            entry.put("build_time", block.buildTime);
            /* Whether a beam stops at it. Only insulation stops one: a titanium wall does
               not, which is contrary to every instinct and is the game's rule. */
            if (block.insulated) entry.put("insulated", true);

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
                /* And the undivided one beside it, because the simulation needs the field
                   and the reader needs the figure. A turbine condenser reads three power a
                   tick on its own card and holds 1/3, the difference being the nine tiles
                   of vent it is standing on: dividing once for the player and once for the
                   engine would be dividing twice. */
                entry.put("power_production", generator.powerProduction * TPS);
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
            /* What a generator's output is multiplied by. `ConsumeItemFlammable` hands
               back the flammability of what it drew, `ConsumeItemRadioactive` the
               radioactivity: a combustion generator makes 1.0 on coal and 1.4 on pyratite,
               an RTG 1.0 on thorium and 0.6 on phase fabric. */
            entry.put("radioactivity", item.radioactivity);
            entry.put("charge", item.charge);
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
            // Whether an incinerator will take it. Water will not burn.
            if (liquid.incinerable) entry.put("incinerable", true);
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
            /* `60 / speed * capacity`, and not `60 / speed`.

               A junction is four queues of `capacity` items, each item spending `speed`
               frames inside: the throughput is the queue length over the transit time. The
               game states thirteen for itself and its own comment works the real figure out
               at `60/26*6 = 13.84`. Written as `60 / speed` it came to 2.31, so any line
               crossing a junction was capped at a fifth of a copper belt and the junction
               became the bottleneck of every layout containing one. */
            entry.put("items_per_second",
                TPS / Math.max(1f, junction.speed) * junction.capacity);
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
            entry.put("items_per_second", TPS / Math.max(1f, overflowDuct.speed));
            entry.put("duct_speed", overflowDuct.speed);
            entry.put("overflow", true);
            if (overflowDuct.invert) entry.put("invert", true);
            return;
        }
        /* Three Erekir carriers that do not extend anything the reader recognised, so all
           three fell through to "sink" and swallowed whatever was handed to them. A duct
           router is not a `Router`, a duct bridge is not an `ItemBridge`, and a surge
           router is a duct router with a stack. An Erekir schematic built on any of them
           read as a line that produced nothing. */
        /* The payload family, all of it filed as sinks or as nothing at all.

           A payload is a unit or a block being carried around as cargo, and none of it was
           reproduced: a reconstructor read as a hole that swallowed whatever a conveyor
           handed it, and its silicon and its power were counted as consumed by nobody. */
        if (block instanceof PayloadConveyor carrier) {
            entry.put("role", block instanceof PayloadRouter ? "payload-router"
                                                             : "payload-conveyor");
            entry.put("carries", "payload");
            /* Frames per step, and the step is on the **global** clock rather than on a
               counter per block: `curStep = (int)(Time.time / moveTime)`. Every payload
               conveyor on a map moves on the same frame. */
            entry.put("move_time", carrier.moveTime);
            entry.put("payload_limit", carrier.payloadLimit);
            return;
        }
        if (block instanceof BlockProducer maker) {
            /* A constructor: items in, a **block** out as cargo. Its recipe is its
               configuration, so its ingredients and its clock both change with what a
               player set it to, and neither can be written down here. */
            entry.put("role", "constructor");
            entry.put("carries", "payload");
            entry.put("build_speed", maker.buildSpeed);
            /* And what it is allowed to be set to. A constructor is not a general purpose
               factory: it carries a list of seven blocks, and a configuration outside that
               list is silently refused. Set to something it will not make, it reports no
               recipe, `shouldConsume` is false, and it sits at zero looking healthy. */
            if (block instanceof Constructor picky && !picky.filter.isEmpty()) {
                Jval allowed = Jval.newArray();
                for (Block one : picky.filter) allowed.asArray().add(Jval.valueOf(one.name));
                entry.put("produces", allowed);
            }
            return;
        }
        if (block instanceof PayloadSource) {
            entry.put("role", "payload-source");
            entry.put("carries", "payload");
            return;
        }
        if (block instanceof PayloadVoid) {
            entry.put("role", "payload-void");
            entry.put("carries", "payload");
            return;
        }
        if (block instanceof Reconstructor rebuilder) {
            entry.put("role", "reconstructor");
            entry.put("carries", "payload");
            entry.put("construct_time", rebuilder.constructTime);
            /* Which unit becomes which, in order: `upgrade()` takes the first match. */
            Jval upgrades = Jval.newArray();
            for (UnitType[] pair : rebuilder.upgrades) {
                Jval one = Jval.newObject();
                one.put("from", pair[0].name);
                one.put("to", pair[1].name);
                upgrades.asArray().add(one);
            }
            entry.put("upgrades", upgrades);
            /* The cap is **per item** and not the block's own `itemCapacity`: an
               exponential reconstructor takes 1700 silicon, 1500 titanium and 1300
               plastanium, and `itemCapacity` is the largest of the three. Reading one
               number for all of them overfills two ingredients out of three. */
            Jval capacities = Jval.newObject();
            for (Item item : Vars.content.items()) {
                int found = rebuilder.capacities[item.id];
                if (found > 0) capacities.put(item.name, found);
            }
            entry.put("capacities", capacities);
            entry.put("input", inputsOf(block));
            entry.put("input_liquid", liquidInputsOf(block));
            return;
        }
        if (block instanceof BeamDrill bore) {
            /* Erekir's drill, which does not stand on its ore: it points at a cliff and
               eats sideways into it, one item per tile of its own width that has a wall
               within range. Filed as a sink, every plasma bore in a schematic was a hole
               rather than a source. */
            entry.put("role", "beam-drill");
            entry.put("carries", "item");
            entry.put("drill_time", bore.drillTime);
            entry.put("range", bore.range);
            entry.put("tier", bore.tier);
            entry.put("optional_boost_intensity", bore.optionalBoostIntensity);
            entry.put("drill_multipliers", drillMultipliersOf(bore.drillMultipliers));
            if (bore.blockedItems != null) {
                Jval blocked = Jval.newArray();
                for (Item item : bore.blockedItems) blocked.asArray().add(Jval.valueOf(item.name));
                entry.put("blocked_items", blocked);
            }
            entry.put("input_liquid", liquidInputsOf(block));
            /* The liquid that makes it faster and that it runs without: hydrogen, worth
               two and a half times the speed. Kept apart from the ingredient list, because
               a bore with no hydrogen is a slow bore and not a stopped one. */
            Jval boost = Jval.newObject();
            for (Consume consume : block.consumers) {
                if (consume.booster && consume instanceof ConsumeLiquid one) {
                    boost.put(one.liquid.name, one.amount * TPS);
                }
            }
            if (boost.asObject().size > 0) entry.put("boost_liquid", boost);
            return;
        }
        if (block instanceof DirectionalUnloader puller) {
            /* Erekir's unloader: it does not push round, it takes from the block behind it
               and hands to the block in front, one item every `speed` frames. Filed as a
               sink it was a hole in the middle of every Erekir bus. */
            entry.put("role", "duct-unloader");
            entry.put("carries", "item");
            entry.put("speed", puller.speed);
            entry.put("items_per_second", TPS / Math.max(0.0001f, puller.speed));
            if (puller.allowCoreUnload) entry.put("allow_core_unload", true);
            return;
        }
        if (block instanceof DirectionLiquidBridge span) {
            entry.put("role", "liquid-span");
            entry.put("carries", "liquid");
            entry.put("range", span.range);
            return;
        }
        if (block instanceof StackRouter stack) {
            // Checked before `DuctRouter`, which it extends.
            entry.put("role", "stack-router");
            entry.put("carries", "item");
            entry.put("duct_speed", stack.speed);
            // It runs without power, at a seventh of the speed: `efficiency + 1`, and the
            // one is the part that does not come off the grid.
            entry.put("base_efficiency", stack.baseEfficiency);
            entry.put("items_per_second", TPS / Math.max(1f, stack.speed) * block.itemCapacity);
            return;
        }
        if (block instanceof DuctRouter router) {
            entry.put("role", "duct-router");
            entry.put("carries", "item");
            entry.put("duct_speed", router.speed);
            entry.put("items_per_second", TPS / Math.max(1f, router.speed));
            return;
        }
        if (block instanceof DuctBridge span) {
            entry.put("role", "duct-bridge");
            entry.put("carries", "item");
            entry.put("duct_speed", span.speed);
            entry.put("range", span.range);
            entry.put("items_per_second", TPS / Math.max(1f, span.speed));
            return;
        }
        if (block instanceof Duct duct) {
            // Erekir's carrier. Not a conveyor: it holds exactly one item at a time and
              // carries it across in `speed` frames, so its rate falls out of that rather
              // than out of spacing.
            entry.put("carries", "item");
            /* `60 / speed`, which is `Duct.setStats`. The doubling that used to be here
               came from reading `progress += edelta() / speed * 2` as "two steps a frame
               so twice the rate", but the threshold moves with `speed` as well: an item
               takes `ceil(speed - 0.5)` updates to cross, which is `speed`. */
            entry.put("items_per_second", TPS / Math.max(1f, duct.speed));
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
            if (block instanceof BufferedItemBridge buffered) {
                // Not a hand-off but a delay line: an item entering spends `speed` frames
                // inside before it may leave, and the far end may only take one every four
                // frames. Modelled as a plain timer, a bridge line ran five per cent fast.
                entry.put("buffered", true);
                entry.put("buffer_speed", buffered.speed);
                entry.put("buffer_capacity", buffered.bufferCapacity);
            }
            return;
        }
        if (block instanceof MassDriver driver) {
            /* Sans branche a lui, le mass driver tombait dans le repli `sink` : aucun
               `ConsumeItems`, donc ni `accepts` ni `input` dans le catalogue, donc
               `wants()` repondait non a tout et une paire de drivers relies transportait
               zero objet par seconde. */
            entry.put("role", "mass-driver");
            entry.put("carries", "item");
            /* En cases, comme celle d un pont : le jeu la tient en pixels et tout
               le reste du catalogue compte en cases. */
            entry.put("range", driver.range / 8f);
            entry.put("rotate_speed", driver.rotateSpeed);
            entry.put("min_distribute", driver.minDistribute);
            entry.put("reload", driver.reload);
            entry.put("bullet_speed", driver.bulletSpeed);
            entry.put("bullet_lifetime", driver.bulletLifetime);
            entry.put("translation", driver.translation);
            /* Le debit annonce dans la fiche du jeu : une salve de `itemCapacity` toutes
               les `reload` images, plafonnee par ce que le recepteur peut ecouler. */
            entry.put("items_per_second", driver.itemCapacity * (TPS / driver.reload));
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
        if (block instanceof Router plain) {
            entry.put("role", "router");
            /* Eight frames to hand on, and only towards another router or a block that
               transfers instantly. Towards a belt or a machine it lets go the same frame.
               Without it a chain of routers carries eleven items a second where the game
               carries seven and a half. */
            entry.put("speed", plain.speed);
            entry.put("carries", "item");
            return;
        }
        if (block instanceof WallCrafter crusher) {
            /* A cliff crusher, which is a drill that eats the **cliff** rather than the
               ground: its speed is the sand attribute of whatever solid block is against
               each tile of its face. It matched no branch at all before this, so it read
               as an unknown block. */
            entry.put("role", "wall-crafter");
            entry.put("carries", "item");
            entry.put("drill_time", crusher.drillTime);
            entry.put("attribute", crusher.attribute.name);
            if (crusher.output != null) {
                Jval out = Jval.newObject();
                out.put(crusher.output.name, 1);
                entry.put("output", out);
            }
            entry.put("liquid_boost", crusher.liquidBoostIntensity);
            entry.put("item_boost", crusher.itemBoostIntensity);
            entry.put("boost_time", crusher.boostItemUseTime);
            entry.put("boost_input", optionalInputsOf(block));
            entry.put("boost_liquid", boostLiquidsOf(block));
            return;
        }
        if (block instanceof BurstDrill burst) {
            entry.put("drill_multipliers", drillMultipliersOf(burst.drillMultipliers));
            entry.put("blocked_items", blockedItemsOf(burst));
            /* A burst drill, which is a `Drill` with a different clock: its progress does
               not scale with how many ore tiles it covers, only its **batch** does. Nine
               tiles of ore make a burst drill produce nine at a time rather than nine
               times as often, and reading it as an ordinary drill gets the shape of the
               output wrong even where the average is close. */
            entry.put("role", "burst-drill");
            entry.put("tier", burst.tier);
            entry.put("drill_time", burst.drillTime);
            entry.put("hardness_multiplier", burst.hardnessDrillMultiplier);
            entry.put("liquid_boost", burst.liquidBoostIntensity);
            entry.put("boost_liquid", boostLiquidsOf(block));
            entry.put("input_liquid", liquidInputsOf(block));
            return;
        }
        if (block instanceof Drill drill) {
            entry.put("role", "drill");
            entry.put("drill_multipliers", drillMultipliersOf(drill.drillMultipliers));
            entry.put("blocked_items", blockedItemsOf(drill));
            /* L'eau qui la fait aller plus vite, et sans laquelle elle marche : le facteur
               etait dans le catalogue, la quantite non, donc ni le code ni la donnee ne
               savaient combien il en fallait. Une foreuse laser arrosee sort 2,62 objets a
               la seconde contre 1,64 a sec, et le portage donnait 1,64 dans les deux cas. */
            entry.put("boost_liquid", boostLiquidsOf(block));
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
        if (block instanceof mindustry.world.blocks.sandbox.PowerSource source) {
            // The sandbox tap for electricity. Not a `PowerGenerator`, so it fell through
            // every branch and read as a plain wire: a scenario built on one measured a
            // factory with no power at all.
            entry.put("role", "power");
            entry.put("power_out", source.powerProduction * TPS);
            return;
        }
        if (block instanceof BeamNode beam) {
            /* Erekir's wire, which is a battery rather than a wire: `outputsPower` and
               `consumesPower` are both true and the consumer is buffered, so the game
               files it under batteries and it holds a thousand. It matched no branch at
               all before this, so a beam node carried no power and joined no grid: an
               Erekir base wired entirely with them read as unpowered. */
            entry.put("role", "power");
            entry.put("range", beam.range);
            return;
        }
        if (block instanceof PowerNode || block instanceof Battery) {
            // Wires and buffers. They neither make nor spend power on balance, but a
            // schematic full of them is a power schematic, and saying so is most of what a
            // reader needs.
            entry.put("role", "power");
            return;
        }
        if (block instanceof HeatProducer heater) {
            // Erekir's chemistry runs on heat, which travels its own way: not on a belt and
            // not on the power grid, but from a block's face to the face touching it.
            entry.put("role", "crafter");
            entry.put("heat_output", heater.heatOutput);
            entry.put("warmup_rate", heater.warmupRate);
            entry.put("craft_time", heater.craftTime);
            entry.put("input", inputsOf(block));
            entry.put("input_liquid", liquidInputsOf(block));
            entry.put("output", craftedItemsOf(block));
            entry.put("output_liquid", craftedLiquidsOf(block));
            return;
        }
        if (block instanceof HeatConductor conductor) {
            entry.put("role", "heat-conductor");
            if (conductor.splitHeat) entry.put("split_heat", true);
            return;
        }
        if (block instanceof HeatCrafter hot) {
            entry.put("role", "crafter");
            entry.put("heat_requirement", hot.heatRequirement);
            entry.put("overheat_scale", hot.overheatScale);
            entry.put("max_efficiency", hot.maxEfficiency);
            entry.put("craft_time", hot.craftTime);
            entry.put("input", inputsOf(block));
            entry.put("input_liquid", liquidInputsOf(block));
            entry.put("output", craftedItemsOf(block));
            entry.put("output_liquid", craftedLiquidsOf(block));
            entry.put("power", block.consPower != null ? block.consPower.usage * TPS : 0f);
            return;
        }
        if (block instanceof AttributeCrafter boosted) {
            /* A factory whose speed is decided by the ground under it. The boost is the
               sum of one attribute over every tile it covers, not an average: a two by two
               cultivator on four tiles of spore moss reads 1.2, not 0.3. */
            entry.put("role", "crafter");
            entry.put("attribute", boosted.attribute.name);
            entry.put("base_efficiency", boosted.baseEfficiency);
            entry.put("boost_scale", boosted.boostScale);
            entry.put("max_boost", boosted.maxBoost);
            if (boosted.scaleLiquidConsumption) entry.put("scale_liquid_consumption", true);
            entry.put("craft_time", boosted.craftTime);
            entry.put("input", inputsOf(block));
            entry.put("input_liquid", liquidInputsOf(block));
            entry.put("output", craftedItemsOf(block));
            entry.put("output_liquid", craftedLiquidsOf(block));
            entry.put("power", block.consPower != null ? block.consPower.usage * TPS : 0f);
            return;
        }
        if (block instanceof Separator sorted) {
            /* One item per batch, drawn from a weighted list. The draw is a pure function
               of a counter kept on the block, so the sequence is reproducible, but the
               total is reproducible without reproducing the draw at all: every batch
               yields exactly one item whatever it lands on. */
            entry.put("role", "separator");
            entry.put("craft_time", sorted.craftTime);
            Jval results = Jval.newArray();
            for (ItemStack stack : sorted.results) {
                Jval one = Jval.newObject();
                one.put("item", stack.item.name);
                one.put("amount", stack.amount);
                results.asArray().add(one);
            }
            entry.put("results", results);
            entry.put("input", inputsOf(block));
            entry.put("input_liquid", liquidInputsOf(block));
            entry.put("power", block.consPower != null ? block.consPower.usage * TPS : 0f);
            return;
        }
        if (block instanceof GenericCrafter crafter) {
            entry.put("role", "crafter");
            /* Un bloc du jeu verse ses deux liquides par deux faces nommees : l'ozone de
               l'electrolyseur sort par la face relative 1 et l'hydrogene par la 3. Verses
               partout, un plan qui separe correctement les deux gaz les melange, et un plan
               qui ne branche qu'une face recoit un debit qui n'existe pas. */
            if (crafter.liquidOutputDirections != null
                    && crafter.liquidOutputDirections.length > 0) {
                Jval faces = Jval.newArray();
                for (int dir : crafter.liquidOutputDirections) {
                    faces.asArray().add(Jval.valueOf(dir));
                }
                entry.put("liquid_output_directions", faces);
            }
            /* Ecrits a l'envers, parce que le catalogue jette les valeurs fausses : le
               defaut du jeu est `dumpExtraLiquid = true`, donc "absent" doit vouloir dire
               vrai et c'est l'exception qu'il faut nommer. */
            if (!crafter.dumpExtraLiquid) entry.put("no_dump_extra", true);
            if (crafter.ignoreLiquidFullness) entry.put("ignore_liquid_fullness", true);
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
        if (block instanceof SolidPump ground) {
            /* A pump that makes liquid out of dry land: a water extractor and an oil
               extractor. Filed under pumps, both read as pumps that need liquid ground and
               so made nothing at all, which is exactly backwards - a solid pump only works
               where the ground is **not** liquid.

               The two differ by one number that changes everything. `baseEfficiency` is 1
               for the water extractor, so it works anywhere and the ground attribute is a
               bonus; it is 0 for the oil extractor, so the attribute is the whole output
               and an oil extractor off the sand makes nothing. */
            entry.put("role", "solid-pump");
            entry.put("carries", "liquid");
            entry.put("pump_amount", ground.pumpAmount);
            entry.put("base_efficiency", ground.baseEfficiency);
            if (ground.attribute != null) entry.put("attribute", ground.attribute.name);
            if (ground.result != null) {
                Jval out = Jval.newObject();
                out.put(ground.result.name, ground.pumpAmount * TPS);
                entry.put("output_liquid", out);
            }
            if (block instanceof Fracker fracker) entry.put("item_use_time", fracker.itemUseTime);
            entry.put("input", inputsOf(block));
            entry.put("input_liquid", liquidInputsOf(block));
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
            describeGenerator(block, entry);
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
            // How much it holds, in ammunition rather than in items, and what each item is
            // worth when it arrives. A turret fills to `maxAmmo` and then refuses, which is
            // what backs a belt up behind it.
            entry.put("max_ammo", turret.maxAmmo);
            Jval worth = Jval.newObject();
            for (Item item : turret.ammoTypes.keys()) {
                worth.put(item.name, turret.ammoTypes.get(item).ammoMultiplier);
            }
            entry.put("ammo_worth", worth);
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
            // Frames between two pulls, which is what the simulation counts. `60 / speed`
            // is what a player reads; `speed` is what the block actually uses.
            entry.put("speed", unloader.speed);
            if (unloader.allowCoreUnload) entry.put("allow_core_unload", true);
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
        /* The defensive blocks, none of which shoots anything in a measurement and all of
           which were filed as sinks that consume nothing.

           What they do at rest is the whole question for a schematic, and the four answers
           are all different. A liquid turret swallows its tank once and never drinks
           again. A power turret draws until it has finished reloading and then stops
           dead. A meltdown drinks two hundred and twenty five water winding **down** and
           then stops. A projector draws power for ever and eats an item every few
           seconds whether or not anything near it is damaged. */
        if (block instanceof BaseTurret turret) {
            entry.put("role", block instanceof TractorBeamTurret ? "tractor" : "turret-idle");
            entry.put("range", turret.range);
            if (block instanceof ReloadTurret reloader) entry.put("reload", reloader.reload);
            entry.put("coolant_multiplier", turret.coolantMultiplier);
            if (turret.coolant != null) {
                entry.put("coolant_amount", turret.coolant.amount);
                /* What one unit of each accepted coolant is worth to the reload counter:
                   `heatCapacity * coolantMultiplier`. Written per liquid so nothing on the
                   other side has to carry a table of heat capacities around, and because
                   `coolantMultiplier` is 5 by default and 1 for a meltdown, which is a
                   fivefold error waiting to happen. */
                Jval worth = Jval.newObject();
                for (Liquid liquid : Vars.content.liquids()) {
                    if (block.liquidFilter != null && block.liquidFilter.length > liquid.id
                            && block.liquidFilter[liquid.id]) {
                        worth.put(liquid.name, liquid.heatCapacity * turret.coolantMultiplier);
                    }
                }
                if (worth.asObject().size > 0) entry.put("coolant_worth", worth);
            }
            if (block instanceof LaserTurret laser) {
                entry.put("role", "laser-turret");
                entry.put("shoot_duration", laser.shootDuration);
            }
            if (block instanceof LiquidTurret liquidTurret) {
                entry.put("role", "turret-idle");
                Jval ammo = Jval.newObject();
                liquidTurret.ammoTypes.each((liquid, type) ->
                    ammo.put(liquid.name, type.ammoMultiplier));
                if (ammo.asObject().size > 0) entry.put("ammo_types", ammo);
            }
            entry.put("input_liquid", liquidInputsOf(block));
            return;
        }
        if (block instanceof MendProjector mender) {
            entry.put("role", "mender");
            entry.put("reload", mender.reload);
            entry.put("range", mender.range);
            entry.put("heal_percent", mender.healPercent);
            entry.put("phase_boost", mender.phaseBoost);
            entry.put("phase_range_boost", mender.phaseRangeBoost);
            entry.put("use_time", mender.useTime);
            entry.put("boost_input", optionalInputsOf(block));
            return;
        }
        if (block instanceof ForceProjector shield) {
            entry.put("role", "shield");
            entry.put("radius", shield.radius);
            entry.put("shield_health", shield.shieldHealth);
            entry.put("phase_radius_boost", shield.phaseRadiusBoost);
            entry.put("phase_shield_boost", shield.phaseShieldBoost);
            entry.put("use_time", shield.phaseUseTime);
            entry.put("coolant_consumption", shield.coolantConsumption);
            entry.put("boost_input", optionalInputsOf(block));
            return;
        }
        /* Blocks that draw power only when they have something to work on, and so draw
           **nothing** in a still schematic.

           `shouldConsume` is `anyTargets` for a regen projector, `target != null` for a
           repair turret, `targets.size > 0` for a repair tower. Nothing is damaged in a
           schematic and no units are standing in it, so all three are free. Counted as
           permanent consumers they invented four hundred and twenty power a second between
           them, which dims a whole base in the report and in nothing else. */
        if (block instanceof RegenProjector || block instanceof RepairTurret
                || block instanceof RepairTower) {
            entry.put("role", "idle-power");
            entry.put("range", block instanceof RepairTurret repair ? repair.repairRadius
                : block instanceof RepairTower tower ? tower.range : 0f);
            return;
        }
        if (block instanceof ShockwaveTower shock) {
            /* Same family, by a stranger route. `shouldConsume` is `reloadCounter < reload`
               and it looks like a run up, but the counter **starts at a random value**
               between zero and the reload, and only returns to zero when the tower actually
               fires. With no bullets to knock down it reaches a full reload once and is
               silent for ever after.

               So the steady state is the same zero as a repair turret's, and the transient
               is a random couple of seconds nobody can reproduce and nobody would notice:
               three thousandths of a large battery. */
            entry.put("role", "idle-power");
            entry.put("reload", shock.reload);
            entry.put("range", shock.range);
            return;
        }
        if (block instanceof Incinerator || block instanceof ItemIncinerator) {
            /* An incinerator is a sink with a condition, and unpowered it is a **wall**.

               `acceptItem` is `heat > 0.5f`, and `heat` creeps towards `efficiency` at
               0.04 a frame: thirteen frames of power before it will take anything, and
               nothing ever if the grid is down. A belt into one backs up, which is the
               opposite of what a sink does and exactly what a player wants to know. The
               slag one asks `efficiency > 0` instead, which is its slag rather than its
               power. */
            entry.put("role", "incinerator");
            entry.put("carries", "item");
            entry.put("input_liquid", liquidInputsOf(block));
            return;
        }
        if (block instanceof ItemVoid || block instanceof LiquidVoid) {
            /* The sandbox drains. A liquid void was filed under items, so it refused every
               drop and the pipe into it backed up instead of emptying. */
            entry.put("role", "void");
            entry.put("carries", block instanceof LiquidVoid ? "liquid" : "item");
            return;
        }
        if (block instanceof Radar radar) {
            entry.put("role", "radar");
            entry.put("discovery_time", radar.discoveryTime);
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
            entry.put("use_time", projector.useTime);
            entry.put("reload", projector.reload);
            /* Whether the phase fabric is a bonus or a requirement. An overdrive dome has
               `hasBoost` false and its two items are **not** optional: without them it
               boosts nothing at all, where a projector without phase fabric simply boosts
               a little less. Reading both as bonuses makes a starved dome look busy. */
            if (projector.hasBoost) entry.put("has_boost", true);
            entry.put("input", inputsOf(block));
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
        /* A static wall that drops something, which is Erekir's whole ore economy: there
           are no patches on the ground there, the ore is in the cliffs and a plasma bore
           eats sideways into them. Recorded as a wall rather than a floor, because it is
           neither painted under a block nor built by a player: it is what a bore has to be
           pointed at. */
        if (block instanceof StaticWall wall) {
            entry.put("wall", true);
            if (wall.itemDrop != null) entry.put("drops", wall.itemDrop.name);
            entry.put("attributes", attributesOf(block));
            return;
        }
        if (!(block instanceof Floor floor)) {
            return;
        }
        // A floor may carry ore too, in the walls sense: `wallOre` says a bore may take it
        // even though a drill standing on it may not.
        if (floor.wallOre) entry.put("wall_ore", true);
        // An overlay is an ore laid over a floor; a floor is the ground itself. Told apart
        // because painting one replaces the ground and painting the other does not.
        entry.put("floor", true);
        if (block instanceof OverlayFloor) entry.put("overlay", true);

        // What a floor is worth to a block standing on it. A cultivator on spore moss goes
        // faster, and how much faster is the sum of this over every tile it covers.
        Jval gives = Jval.newObject();
        for (mindustry.world.meta.Attribute attribute : mindustry.world.meta.Attribute.all) {
            float value = floor.attributes.get(attribute);
            if (value != 0f) gives.put(attribute.name, value);
        }
        if (gives.asObject().size > 0) entry.put("attributes", gives);
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

    /** What a crafter of any kind leaves behind, per batch. */
    private static Jval craftedItemsOf(Block block) {
        Jval out = Jval.newObject();
        if (block instanceof GenericCrafter crafter && crafter.outputItems != null) {
            for (ItemStack stack : crafter.outputItems) {
                out.put(stack.item.name, stack.amount);
            }
        }
        return out;
    }

    /** And what it pours, per second, since a liquid comes out continuously. */
    private static Jval craftedLiquidsOf(Block block) {
        Jval out = Jval.newObject();
        if (block instanceof GenericCrafter crafter && crafter.outputLiquids != null) {
            for (LiquidStack stack : crafter.outputLiquids) {
                out.put(stack.liquid.name, stack.amount * TPS);
            }
        }
        return out;
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

    /**
     * What tells one generator apart from another, past its nameplate.
     *
     * Six classes hide behind "makes power" and none of them works like the next. A
     * combustion generator's output is the **flammability of what it is burning**, so it
     * makes fifteen per cent more on spore pods and forty per cent more on pyratite. A
     * thermal generator's output is the ground under it, uncapped, so a turbine condenser
     * on nine tiles of vent runs at nine. An impact reactor's is its own warmup to the
     * fifth power, and it consumes while it produces. None of that is derivable from the
     * numbers already dumped, and guessing any of it means being wrong by a factor.
     */
    private static void describeGenerator(Block block, Jval entry) {
        if (block instanceof ConsumeGenerator burner) {
            entry.put("warmup_speed", burner.warmupSpeed);
            /* How much longer one fuel lasts than the default. Pyratite burns three times
               as long in a combustion generator, phase fabric fifteen times as long in an
               RTG: a single `itemDuration` is wrong for three of the seven. */
            Jval durations = Jval.newObject();
            for (Item item : Vars.content.items()) {
                float found = burner.itemDurationMultipliers.get(item, 1f);
                if (found != 1f) durations.put(item.name, found);
            }
            if (durations.asObject().size > 0) entry.put("item_duration_multipliers", durations);
            if (burner.outputLiquid != null) {
                Jval out = Jval.newObject();
                out.put(burner.outputLiquid.liquid.name, burner.outputLiquid.amount * TPS);
                entry.put("output_liquid", out);
            }
            if (burner.explodeOnFull) entry.put("explode_on_full", true);
            /* What burning each accepted item is worth, which is the generator's output
               multiplier and not a property of the block at all: `ConsumeItemFlammable`
               hands back flammability, `ConsumeItemRadioactive` radioactivity, and the
               plain filter hands back one. Written out per item here so the simulation
               never has to know which subclass it is looking at. */
            if (burner.filterItem != null) {
                Jval worth = Jval.newObject();
                for (Item item : Vars.content.items()) {
                    if (burner.filterItem.filter.get(item)) {
                        worth.put(item.name, burner.filterItem.itemEfficiencyMultiplier(item));
                    }
                }
                if (worth.asObject().size > 0) entry.put("item_worth", worth);
            }
        }
        if (block instanceof HeaterGenerator heater) {
            entry.put("heat_output", heater.heatOutput);
            entry.put("warmup_rate", heater.warmupRate);
        }
        if (block instanceof ThermalGenerator thermal) {
            /* The ground, again, but read differently from a cultivator's: there is no cap
               at all. `productionEfficiency = sum + attribute.env()`, and nothing clamps
               it, so a three by three condenser on nine tiles of vent produces nine times
               its field. Clamping it to one is the obvious mistake and it is a ninefold
               one. */
            entry.put("attribute", thermal.attribute.name);
            entry.put("min_efficiency", thermal.minEfficiency);
            entry.put("display_efficiency_scale", thermal.displayEfficiencyScale);
            if (thermal.floating) entry.put("floating", true);
            if (thermal.outputLiquid != null) {
                Jval out = Jval.newObject();
                out.put(thermal.outputLiquid.liquid.name, thermal.outputLiquid.amount * TPS);
                entry.put("output_liquid", out);
            }
        }
        if (block instanceof ImpactReactor impact) {
            entry.put("warmup_speed", impact.warmupSpeed);
            entry.put("item_duration", impact.itemDuration);
        }
        if (block instanceof NuclearReactor nuclear) {
            /* Every one of these lives in the class body or the constructor rather than in
               the block's own initialiser, so reading `Blocks.java` finds none of them. */
            entry.put("heating", nuclear.heating);
            entry.put("coolant_power", nuclear.coolantPower);
            entry.put("ambient_cooldown_time", nuclear.ambientCooldownTime);
            entry.put("heat_output", nuclear.heatOutput);
            entry.put("item_duration", nuclear.itemDuration);
            if (nuclear.fuelItem != null) entry.put("fuel_item", nuclear.fuelItem.name);
        }
        if (block instanceof VariableReactor variable) {
            entry.put("max_heat", variable.maxHeat);
            entry.put("unstable_speed", variable.unstableSpeed);
            entry.put("warmup_speed", variable.warmupSpeed);
        }
    }


    /** The liquids a block goes faster with and runs without. */
    private static Jval boostLiquidsOf(Block block) {
        Jval boost = Jval.newObject();
        for (Consume consume : block.consumers) {
            if (consume.booster && consume instanceof ConsumeLiquid one) {
                boost.put(one.liquid.name, one.amount * TPS);
            }
        }
        return boost;
    }

    /** Every attribute a block carries, which for a cliff is how much sand is in it. */
    private static Jval attributesOf(Block block) {
        Jval out = Jval.newObject();
        for (Attribute attribute : Attribute.all) {
            float found = block.attributes.get(attribute);
            if (found != 0f) out.put(attribute.name, found);
        }
        return out;
    }


    /** Ce qui divise le temps de forage, minerai par minerai. */
    private static Jval drillMultipliersOf(arc.struct.ObjectFloatMap<Item> table) {
        Jval out = Jval.newObject();
        for (Item item : Vars.content.items()) {
            float found = table.get(item, 1f);
            if (found != 1f) out.put(item.name, found);
        }
        return out;
    }

    /** Le minerai qu'une foreuse refuse malgre son palier. */
    private static Jval blockedItemsOf(Drill drill) {
        Jval out = Jval.newArray();
        if (drill.blockedItem != null) out.asArray().add(Jval.valueOf(drill.blockedItem.name));
        return out;
    }

}
