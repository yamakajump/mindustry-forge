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

    /** One scenario waiting its turn. */
    private record Job(String base64, float seconds, Path out) {
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
    public void queue(String base64, float seconds, Path path) {
        waiting.add(new Job(base64, seconds, path));
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
        begin(job.base64(), job.seconds(), job.out());
    }

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
        Vars.logic.play();

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
