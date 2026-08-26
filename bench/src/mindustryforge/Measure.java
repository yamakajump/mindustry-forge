package mindustryforge;

import arc.ApplicationListener;
import arc.Core;
import arc.struct.Seq;
import arc.util.Log;
import arc.util.serialization.Jval;
import mindustry.Vars;
import mindustry.content.Blocks;
import mindustry.game.Schematic;
import mindustry.game.Team;
import mindustry.type.Item;
import mindustry.type.Liquid;
import mindustry.world.Tile;
import mindustry.world.blocks.storage.StorageBlock.StorageBuild;

import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * The oracle: the same schematic, run by the real engine, so the port can be checked.
 *
 * <p>The browser side of this repository now carries a transcription of the game's update
 * loop. A transcription is only worth anything if something can tell it apart from a
 * plausible invention, and the only thing that can is the engine it was transcribed from.
 * So the same string goes into both and the two answers are held against each other.
 *
 * <p>The scenario is the schematic itself. It is expected to carry its own sandbox sources
 * at one end and its own containers at the other, which makes it self-contained: nothing
 * here has to be told where things go in or come out, and the browser can run the very
 * same string with nothing else supplied.
 *
 * <p>Measured on an empty metal floor with infinite resources, because the question is
 * what the blocks do and not what the ground under them holds. A test that wants ore under
 * a drill puts the ore in the scenario.
 */
public class Measure implements ApplicationListener {

    /** Room around the schematic, so nothing runs into the edge of the world. */
    private static final int MARGIN = 12;

    private final Clock clock = new Clock();

    private int ticksLeft;
    private int ticksRun;
    private Path out;
    private boolean running;

    /** One scenario waiting its turn, with the ground it is to be run on. */
    private record Job(String base64, float seconds, Path out, String[] ground) {
    }

    /**
     * Scenarios still to run.
     *
     * <p>They queue rather than replace each other. Typed one after another on the console
     * they all arrive in the same frame, and without a queue every one but the last was
     * armed and immediately abandoned: nine commands, one measurement.
     */
    private final Seq<Job> waiting = new Seq<>();

    /** Take a scenario, and run it when the one before it is done. */
    public void queue(String base64, float seconds, Path path, String[] ground) {
        waiting.add(new Job(base64, seconds, path, ground));
        if (!running) {
            start(waiting.remove(0));
        }
    }

    /**
     * Lay out a world, place the schematic in it, and start counting down.
     *
     * <p>The world cannot be advanced from inside a command: the game only moves when its
     * own loop runs. So this arms a countdown and {@link #update()} finishes the job on
     * the frames that follow.
     */
    private void start(Job job) {
        ground = job.ground();
        begin(job.base64(), job.seconds(), job.out());
    }

    /**
     * Ore to paint under the schematic before it runs.
     *
     * <p>A drill makes nothing on bare metal floor, so a scenario that measures one has to
     * say what it stands on. Written as `ore-copper@2,3` on the command line, in the
     * schematic's own coordinates, so the browser and the game paint the same tiles.
     */
    private String[] ground = new String[0];

    public void begin(String base64, float seconds, Path path) {
        Schematic schematic;
        try {
            schematic = Vars.schematics.readBase64(base64);
        } catch (Throwable error) {
            Log.err("[forge] unreadable schematic: @", error.toString());
            return;
        }

        int width = schematic.width + MARGIN * 2;
        int height = schematic.height + MARGIN * 2;

        Vars.logic.reset();
        Vars.world.loadGenerator(width, height, tiles ->
            tiles.each((x, y) -> tiles.set(x, y,
                new Tile(x, y, Blocks.metalFloor, Blocks.air, Blocks.air))));

        // Sandbox rules, so a source pours and nothing has to be paid for. The question is
        // what the blocks do, not whether a core could afford them.
        Vars.state.rules.infiniteResources = true;
        Vars.state.rules.editor = false;
        Vars.state.rules.waves = false;
        Vars.state.rules.attackMode = false;
        /* A unit factory refuses to build when its team is at its unit cap, and the cap
           is worked out from the cores a team owns. A world laid down for a measurement
           has no core, so the cap was zero and every factory sat idle: the engine made
           nothing while the port made daggers, and the port was the one telling the
           truth about the blocks. */
        Vars.state.rules.unitCapVariable = false;
        Vars.state.rules.unitCap = 500;
        Vars.logic.play();

        // The ground, before anything is built on it.
        for (String painted : ground) {
            String[] parts = painted.split("[@,]");
            if (parts.length != 3) continue;
            mindustry.world.Block floor = Vars.content.block(parts[0]);
            Tile tile = Vars.world.tile(MARGIN + Integer.parseInt(parts[1]),
                                        MARGIN + Integer.parseInt(parts[2]));
            if (tile == null || floor == null) continue;
            if (floor instanceof mindustry.world.blocks.environment.OverlayFloor) {
                tile.setOverlay(floor);
            } else if (floor instanceof mindustry.world.blocks.environment.Floor ground2) {
                tile.setFloor(ground2);
            }
        }

        /* Stamped tile by tile rather than handed to `placeLoadout`, which insists on
           finding a core in the schematic and refuses anything else. Nothing here wants a
           core: the scenario is a line of belt between a source and a container. */
        for (Schematic.Stile stile : schematic.tiles) {
            Tile tile = Vars.world.tile(MARGIN + stile.x, MARGIN + stile.y);
            if (tile == null) continue;
            tile.setBlock(stile.block, Team.sharded, stile.rotation);
            if (stile.config != null && tile.build != null) {
                tile.build.configureAny(stile.config);
            }
        }

        clock.install();
        // Uncapped: the loop stops sleeping between frames, so thirty game seconds take a
        // fraction of a real one. The timestep stays fixed, so the world advances by the
        // same amount per frame however fast the frames arrive.
        clock.setSpeed(Integer.MAX_VALUE);

        this.out = path;
        this.ticksLeft = Math.round(seconds * Clock.TICKS_PER_SECOND);
        this.ticksRun = 0;
        this.running = true;

        Log.info("[forge] measuring @ blocks for @s on a @x@ world",
            schematic.tiles.size, seconds, width, height);
    }

    @Override
    public void update() {
        if (!running || Vars.state.isPaused()) {
            return;
        }
        ticksRun++;
        if (--ticksLeft > 0) {
            return;
        }
        running = false;
        report();

        if (waiting.any()) {
            start(waiting.remove(0));
        } else {
            clock.setSpeed(1);
        }
    }

    /**
     * What every container ended up holding, per second.
     *
     * <p>Containers rather than a global counter, because a global counter answers "did
     * anything happen" and a container answers "how much came out of this line". A
     * schematic with two outputs has two answers and they are not interchangeable.
     */
    private void report() {
        Jval root = Jval.newObject();
        root.put("game_version", mindustry.core.Version.combined());
        root.put("ticks", ticksRun);
        root.put("seconds", ticksRun / (float) Clock.TICKS_PER_SECOND);

        /* Liquids too, and from every building rather than only from the containers.
        
           A liquid tank is a `LiquidRouter`, not a `StorageBlock`, so a scenario that ends
           in one reported nothing at all. And unlike items, what matters about a liquid is
           often where it settled rather than how much arrived: a line of pipe holds a
           gradient, and that gradient is the answer. */
        Jval pools = Jval.newArray();
        for (Tile tile : Vars.world.tiles) {
            if (tile.build == null || tile.build.tile != tile) continue;
            if (tile.build.liquids == null) continue;
            Liquid current = tile.build.liquids.current();
            float amount = tile.build.liquids.currentAmount();
            if (current == null || amount <= 0.001f) continue;

            Jval one = Jval.newObject();
            one.put("block", tile.block().name);
            one.put("x", tile.x);
            one.put("y", tile.y);
            one.put("liquid", current.name);
            one.put("amount", amount);
            pools.asArray().add(one);
        }
        root.put("pools", pools);

        /* And what the batteries are holding.
        
           A grid is not a sum: it strikes a balance every frame, tops one side up from the
           other, and hands every consumer the same fraction. The state of the batteries at
           the end is the compact way to check the whole of that arithmetic at once - a
           port that got the balance wrong by a per cent ends the run somewhere else. */
        Jval charges = Jval.newArray();
        for (Tile tile : Vars.world.tiles) {
            if (tile.build == null || tile.build.tile != tile) continue;
            if (tile.build.power == null || tile.block().consPower == null) continue;
            if (!tile.block().consPower.buffered) continue;

            Jval one = Jval.newObject();
            one.put("block", tile.block().name);
            one.put("x", tile.x);
            one.put("y", tile.y);
            one.put("charge", tile.build.power.status);
            charges.asArray().add(one);
        }
        root.put("batteries", charges);

        /* And the units standing on the map, which is the only way to measure a factory:
           what it makes is not an item and never reaches a container. */
        Jval units = Jval.newObject();
        for (mindustry.gen.Unit unit : mindustry.gen.Groups.unit) {
            String name = unit.type.name;
            units.put(name, (units.get(name) == null ? 0 : units.get(name).asFloat()) + 1);
        }
        root.put("units", units);

        /* Every building, with how well it was running when the clock stopped.
        
           Not for comparing - the port and the engine are compared on what came out - but
           for finding out why nothing did. A factory that made no units is either
           unconfigured, unpowered or unfed, and `efficiency` says which in one number. */
        Jval running = Jval.newArray();
        for (Tile tile : Vars.world.tiles) {
            if (tile.build == null || tile.build.tile != tile) continue;
            Jval one = Jval.newObject();
            one.put("block", tile.block().name);
            one.put("x", tile.x);
            one.put("y", tile.y);
            one.put("efficiency", tile.build.efficiency);
            if (tile.build instanceof mindustry.world.blocks.units.UnitFactory.UnitFactoryBuild f) {
                one.put("plan", f.currentPlan);
                one.put("progress", f.progress);
                one.put("payload", f.payload != null);
            }
            if (tile.build.items != null && tile.build.items.total() > 0) {
                Jval held = Jval.newObject();
                for (Item item : Vars.content.items()) {
                    if (tile.build.items.get(item) > 0) {
                        held.put(item.name, tile.build.items.get(item));
                    }
                }
                one.put("holds", held);
            }
            running.asArray().add(one);
        }
        root.put("running", running);

        Jval stores = Jval.newArray();
        Jval totals = Jval.newObject();
        Seq<Tile> seen = new Seq<>();

        for (Tile tile : Vars.world.tiles) {
            if (!(tile.build instanceof StorageBuild store) || seen.contains(tile)) {
                continue;
            }
            // A three by three vault covers nine tiles and is one building.
            if (store.tile != tile) {
                continue;
            }
            seen.add(tile);

            Jval one = Jval.newObject();
            one.put("block", tile.block().name);
            one.put("x", tile.x);
            one.put("y", tile.y);

            Jval held = Jval.newObject();
            for (Item item : Vars.content.items()) {
                int count = store.items.get(item);
                if (count <= 0) continue;
                held.put(item.name, count);
                totals.put(item.name,
                    (totals.get(item.name) == null ? 0 : totals.get(item.name).asFloat())
                        + count);
            }
            one.put("items", held);
            stores.asArray().add(one);
        }
        root.put("containers", stores);

        Jval perSecond = Jval.newObject();
        float span = ticksRun / (float) Clock.TICKS_PER_SECOND;
        for (String item : totals.asObject().keys()) {
            perSecond.put(item, totals.get(item).asFloat() / span);
        }
        root.put("per_second", perSecond);

        String text = root.toString(Jval.Jformat.formatted);
        Log.info("[forge] measured: @", root.toString(Jval.Jformat.plain));

        if (out == null) {
            return;
        }
        try {
            Files.createDirectories(out.getParent());
            try (PrintWriter writer = new PrintWriter(
                    Files.newBufferedWriter(out, StandardCharsets.UTF_8))) {
                writer.print(text);
            }
            Log.info("[forge] wrote @", out);
        } catch (Exception error) {
            Log.err("[forge] could not write the measurement", error);
        }
    }

    /** Whether a run is still going, so the caller knows not to exit yet. */
    public boolean busy() {
        return running;
    }
}
