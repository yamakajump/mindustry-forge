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
import mindustry.gen.Building;
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
    private record Job(String base64, float seconds, Path out, String[] ground,
                      String[] stock, Path trace) {
    }

    /**
     * Where to write a line per frame, or null.
     *
     * <p>Two of the bench's scenarios have sat one item apart for weeks, and a total after
     * eighteen hundred frames cannot say which frame it was. This can: the same shape comes
     * out of the port, and the first line where the two differ names the block and the
     * frame, which is a bug report rather than a discrepancy.
     */
    private Path trace;
    private StringBuilder traced;

    /**
     * Scenarios still to run.
     *
     * <p>They queue rather than replace each other. Typed one after another on the console
     * they all arrive in the same frame, and without a queue every one but the last was
     * armed and immediately abandoned: nine commands, one measurement.
     */
    private final Seq<Job> waiting = new Seq<>();

    /** Take a scenario, and run it when the one before it is done. */
    public void queue(String base64, float seconds, Path path, String[] ground,
                      String[] stock) {
        queue(base64, seconds, path, ground, stock, null);
    }

    public void queue(String base64, float seconds, Path path, String[] ground,
                      String[] stock, Path traceTo) {
        waiting.add(new Job(base64, seconds, path, ground, stock, traceTo));
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
        stock = job.stock();
        trace = job.trace();
        traced = trace == null ? null : new StringBuilder();
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

    /** What each block starts out holding: `coal*10@3,0`, or `water~60@3,0`. */
    private String[] stock = new String[0];

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
        /* The environment is left alone on purpose.

           Turning it up to `Env.any` looked like a way to let a constructor accept an
           Erekir recipe on a Serpulo world. It is not: `supportsEnv` is
           `(envEnabled & env) != 0 && (envDisabled & env) == 0`, so an environment with
           every bit set means every block that **disables** one is refused. A payload
           source stopped making daggers, and three scenarios went from four payloads to
           none. What a block is allowed to make is a property of the world, and a
           scenario that needs another world should say so rather than widen this one. */
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
            } else {
                // A static wall, which is a block and not a layer. Erekir's ore lives in
                // these, and a plasma bore with nothing to point at measures nothing.
                tile.setBlock(floor);
            }
        }

        /* Stamped tile by tile rather than handed to `placeLoadout`, which insists on
           finding a core in the schematic and refuses anything else. Nothing here wants a
           core: the scenario is a line of belt between a source and a container. */
        for (Schematic.Stile stile : schematic.tiles) {
            Tile tile = Vars.world.tile(MARGIN + stile.x, MARGIN + stile.y);
            if (tile == null) continue;
            tile.setBlock(stile.block, Team.sharded, stile.rotation);
        }

        /* Whatever a block is meant to be holding when the clock starts.

           A sandbox source never runs out, so anything measured beside one measures a
           machine that is never hungry. Half the interesting questions are the other kind:
           how far does ten coal go, how long does a reactor last on the thorium it has,
           when exactly does the fourth silicon leave a mender. Written `coal*10@3,0`. */
        for (String filled : stock) {
            boolean wet = filled.contains("~");
            String[] parts = filled.split("[*~@,]");
            if (parts.length != 4) continue;
            Tile tile = Vars.world.tile(MARGIN + Integer.parseInt(parts[2]),
                                        MARGIN + Integer.parseInt(parts[3]));
            if (tile == null || tile.build == null) continue;
            if (wet) {
                Liquid liquid = Vars.content.liquid(parts[0]);
                if (liquid != null) tile.build.liquids.add(liquid, Float.parseFloat(parts[1]));
            } else {
                Item item = Vars.content.item(parts[0]);
                if (item != null) tile.build.items.add(item, Integer.parseInt(parts[1]));
            }
        }

        /* Configured only once everything is standing.
        
           A power node's configuration is the list of what it is wired to, and a bridge's
           is where it reaches. Applied as each block went down, anything pointing at a
           block later in the list pointed at empty ground: a node wired to a drill four
           tiles away connected to nothing, and the engine measured a drill with no power
           while the port measured one with plenty. */
        for (Schematic.Stile stile : schematic.tiles) {
            if (stile.config == null) continue;
            Tile tile = Vars.world.tile(MARGIN + stile.x, MARGIN + stile.y);
            if (tile == null || tile.build == null) continue;
            tile.build.configureAny(stile.config);
        }

        /* And then told they were built.

           `placed()` is what a block gets when a player finishes building it, and several
           blocks put their opening state there rather than in their constructor. A
           meltdown sets its reload counter to full in `placed()`, so a bench that stamps
           blocks straight onto tiles measures a meltdown that never drinks its two hundred
           and twenty five water: the port was right and the oracle was the one lying. */
        for (Schematic.Stile stile : schematic.tiles) {
            Tile tile = Vars.world.tile(MARGIN + stile.x, MARGIN + stile.y);
            if (tile != null && tile.build != null) tile.build.placed();
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
        if (traced != null) {
            traced.append(snapshot()).append('\n');
        }
        if (--ticksLeft > 0) {
            return;
        }
        running = false;
        report();
        writeTrace();

        if (waiting.any()) {
            start(waiting.remove(0));
        } else {
            clock.setSpeed(1);
        }
    }

    /**
     * One frame, as one line.
     *
     * <p>Every building that is holding anything, in tile order so the two engines write
     * the same line for the same state. Items as whole numbers, liquids rounded to a
     * thousandth: below that the two are comparing floating point noise rather than a
     * disagreement.
     */
    private String snapshot() {
        StringBuilder line = new StringBuilder();
        line.append(ticksRun);
        Seq<Building> order = new Seq<>();
        for (Building one : mindustry.gen.Groups.build) order.add(one);
        for (Tile tile : Vars.world.tiles) {
            Building build = tile.build;
            if (build == null || build.tile != tile) continue;

            StringBuilder held = new StringBuilder();
            if (build.items != null) {
                for (Item item : Vars.content.items()) {
                    int count = build.items.get(item);
                    if (count > 0) held.append(' ').append(item.name).append(':').append(count);
                }
            }
            if (build.liquids != null) {
                for (mindustry.type.Liquid liquid : Vars.content.liquids()) {
                    float amount = build.liquids.get(liquid);
                    if (amount > 0.0005f) {
                        held.append(' ').append(liquid.name).append(':')
                            .append(String.format(java.util.Locale.ROOT, "%.3f", amount));
                    }
                }
            }
            /* Ce qu'un tapis tient vraiment, qui n'est pas dans son module d'objets : le
               nombre en vol et la position du plus en retard. Les deux moteurs ont mis
               neuf images a se rejoindre sur un seul charbon, et un total ne sait pas dire
               laquelle. */
            /* Et le compteur d'une source, qui decide si elle verse une fois ou deux
               dans la meme image : cent objets par seconde pour soixante images. */
            if (build instanceof mindustry.world.blocks.sandbox.ItemSource
                    .ItemSourceBuild tap) {
                held.append(" ~").append(
                    String.format(java.util.Locale.ROOT, "%.3f", tap.counter));
            }
            // Le compteur d'une plateforme de lancement, et son efficacite.
            if (build instanceof mindustry.world.blocks.campaign.LaunchPad
                    .LaunchPadBuild pad) {
                held.append(" ~").append(
                    String.format(java.util.Locale.ROOT, "%.3f", pad.launchCounter))
                    .append('/').append(
                    String.format(java.util.Locale.ROOT, "%.3f", pad.efficiency));
            }
            // Et l'avancement d'une machine, qui dit a quelle image tombe la fournee.
            if (build instanceof mindustry.world.blocks.production.GenericCrafter
                    .GenericCrafterBuild machine) {
                held.append(" ~").append(
                    String.format(java.util.Locale.ROOT, "%.4f", machine.progress))
                    .append('/').append(
                    String.format(java.util.Locale.ROOT, "%.3f", machine.efficiency));
            }
            if (build instanceof mindustry.world.blocks.distribution.Conveyor
                    .ConveyorBuild belt) {
                held.append(" ~").append(belt.len).append(':')
                    .append(String.format(java.util.Locale.ROOT, "%.3f", belt.minitem));
            }
            // Le canon d'un mass driver a cargaison : charge, rechargement, glissement.
            if (build instanceof mindustry.world.blocks.payloads.PayloadMassDriver
                    .PayloadDriverBuild gun) {
                held.append(" $").append(
                    String.format(java.util.Locale.ROOT, "%.2f/%.3f/%.2f/%.1f",
                        gun.charge, gun.reloadCounter, gun.payLength, gun.turretRotation));
            }
            // Et ce qu'il porte, avec ce qu'il y a dedans.
            mindustry.world.blocks.payloads.Payload cargo = build.getPayload();
            if (cargo != null) {
                held.append(" %").append(cargo.content().name);
                if (cargo instanceof mindustry.world.blocks.payloads.BuildPayload inside
                        && inside.build.items != null) {
                    for (Item item : Vars.content.items()) {
                        int count = inside.build.items.get(item);
                        if (count > 0) held.append('/').append(item.name).append(':')
                            .append(count);
                    }
                }
            }
            /* Et sa place dans la liste de mise a jour, parce qu'un bloc qui s'endort en
               sort et que se reveiller le remet a la fin. Moins un veut dire qu'il dort. */
            held.append(" @").append(order.indexOf(build, true));
            if (held.length() == 0) continue;
            line.append(" | ").append(tile.x - MARGIN).append(',').append(tile.y - MARGIN)
                .append(held);
        }
        return line.toString();
    }

    /** The whole run, once, rather than a write a frame. */
    private void writeTrace() {
        if (traced == null) return;
        try {
            if (trace.getParent() != null) Files.createDirectories(trace.getParent());
            Files.writeString(trace, traced.toString(), StandardCharsets.UTF_8);
            Log.info("[forge] traced @ frames to @", ticksRun, trace);
        } catch (Exception error) {
            Log.err("[forge] could not write the trace: @", error.toString());
        }
        traced = null;
        trace = null;
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
            /* Every liquid it holds, not only `current()`.

               `current` is whichever was added last, which for a block that holds one is
               the same thing and for a block that holds two is a coin toss: an oil
               extractor drinks water and makes oil, and reporting one of the two picked a
               different winner on each side of the comparison. */
            for (Liquid liquid : Vars.content.liquids()) {
                float amount = tile.build.liquids.get(liquid);
                if (amount <= 0.001f) continue;

                Jval one = Jval.newObject();
                one.put("block", tile.block().name);
                one.put("x", tile.x);
                one.put("y", tile.y);
                one.put("liquid", liquid.name);
                one.put("amount", amount);
                pools.asArray().add(one);
            }
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

        /* What each block is carrying as cargo.

           A payload is neither an item nor a liquid: it never reaches a container and it
           never shows in a pool, so without this the whole payload family is measurable
           only by the side effects of what it consumes. Where a unit has got to along a
           line of payload conveyors is the measurement. */
        Jval carried = Jval.newArray();
        for (Tile tile : Vars.world.tiles) {
            if (tile.build == null || tile.build.tile != tile) continue;
            mindustry.world.blocks.payloads.Payload held = tile.build.getPayload();
            if (held == null) continue;

            Jval one = Jval.newObject();
            one.put("block", tile.block().name);
            one.put("x", tile.x);
            one.put("y", tile.y);
            one.put("payload", held.content().name);
            /* Et ce qu'il y a **dedans**, parce qu'une charge utile est un batiment entier
               et que trois blocs ne s'interessent qu'a ca : un chargeur remplit le coffre
               qu'il porte, un dechargeur le vide. Sans son contenu, la moitie de la famille
               se mesure a rien du tout. */
            if (held instanceof mindustry.world.blocks.payloads.BuildPayload inside) {
                Jval stock = Jval.newObject();
                if (inside.build.items != null) {
                    for (Item item : Vars.content.items()) {
                        int count = inside.build.items.get(item);
                        if (count > 0) stock.put(item.name, count);
                    }
                }
                one.put("payload_items", stock);
                Jval wet = Jval.newObject();
                if (inside.build.liquids != null) {
                    for (Liquid liquid : Vars.content.liquids()) {
                        float amount = inside.build.liquids.get(liquid);
                        if (amount > 0.0005f) wet.put(liquid.name, amount);
                    }
                }
                one.put("payload_liquids", wet);
            }
            carried.asArray().add(one);
        }
        root.put("payloads", carried);

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
            /* Zero plutot que `NaN`, qui n'est pas du JSON et faisait planter le lecteur.
               Un incinerateur a scories a vide en produit un : sa recette demande zero
               scorie par image, donc son efficacite est zero divise par zero. */
            one.put("efficiency", Float.isFinite(tile.build.efficiency)
                ? tile.build.efficiency : 0f);
            if (tile.build instanceof mindustry.world.blocks.units.UnitFactory.UnitFactoryBuild f) {
                one.put("plan", f.currentPlan);
                one.put("progress", f.progress);
                one.put("payload", f.payload != null);
            }
            if (tile.build instanceof mindustry.world.blocks.defense.turrets.ItemTurret.ItemTurretBuild turret) {
                // A turret's ammunition is not in its item module, so it never shows up as
                // something held: counted here, it becomes the thing a scenario can check.
                one.put("ammo", turret.totalAmmo);
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
            // A core is not a `StorageBuild` in this version, and it is where most
            // schematics are meant to deliver: reported by what it is rather than by what
            // it inherits from, a core full of copper counted as no container at all.
            boolean holds = tile.build instanceof StorageBuild
                || tile.block() instanceof mindustry.world.blocks.storage.CoreBlock;
            if (!holds || seen.contains(tile)) {
                continue;
            }
            Building store = tile.build;
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
