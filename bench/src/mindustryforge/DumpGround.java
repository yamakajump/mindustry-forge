package mindustryforge;

import arc.math.Mathf;
import arc.struct.ObjectMap;
import arc.struct.ObjectIntMap;
import arc.struct.Seq;
import arc.util.Log;
import arc.util.serialization.Jval;
import mindustry.Vars;
import mindustry.core.Version;
import mindustry.type.Planet;
import mindustry.type.Sector;
import mindustry.type.SectorPreset;
import mindustry.world.Tile;

import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Which planet each piece of ground belongs to, measured by placing it.
 *
 * <p>A block's planet comes off the tech tree, walked from each planet's own root
 * ({@code DumpBlocks.stampPlanet}). Terrain is not on the tech tree: nobody researches
 * sand, so every floor, every ore and every static wall comes out of that walk with no
 * planet at all, and a palette that filters on it shows Serpulo's grass to somebody
 * building on Erekir.
 *
 * <p>Reading the two planet generators instead is closer, and still short. Measured on
 * v159.7, the classes {@code SerpuloPlanetGenerator} and {@code ErekirPlanetGenerator}
 * name 52 of the 107 floors between them and 8 of the 31 static walls: dacite, grass,
 * dirt, mud and char are on no procedural Serpulo map, and ferric stone and the vents are
 * on no procedural Erekir one. They live in the hand made campaign maps, which are just as
 * much a part of their planet.
 *
 * <p>So the association is not read, it is produced: every campaign map of every planet is
 * loaded the way the game loads it, its generated sectors are generated the way the game
 * generates them, and whatever stands on a tile is counted against that planet. Nothing
 * here names a block, which is the point: a floor the game adds tomorrow files itself the
 * first time a map puts one down.
 *
 * <p>Tiles are counted rather than ticked off, because a campaign map borrows scenery from
 * the other planet and being placed at all does not mean belonging. Measured on v159.7,
 * Serpulo's maps carry 315 tiles of arkyic stone against Erekir's 2 030 901, and 6 795 of
 * red stone wall against Erekir's 384 588, while a floor that is really Serpulo's is placed
 * nowhere else at all: shrubs, 155 tiles, and pine, 49, are Serpulo's and only Serpulo's. A
 * count tells the two apart and a tick mark cannot. What to do with the counts is
 * {@code tools/build_sols.py}'s business; this file measures.
 */
public class DumpGround {

    /**
     * How many of a planet's procedural sectors are generated.
     *
     * <p>Every sector of a planet draws from the same generator, so the biomes repeat long
     * before the sectors run out, and generating all 260 of Serpulo's costs minutes to
     * learn nothing after the first few dozen. Sampled by walking the list at a stride
     * rather than taking a prefix, because sectors are numbered by position on the grid and
     * a prefix is one region of one hemisphere.
     */
    private static final int PROCEDURAL_SAMPLE = 40;

    public static Path defaultOut() {
        return Paths.get("bench", "data", "planetes-sol.json");
    }

    public static void dump(Path out) {
        ObjectMap<String, ObjectIntMap<String>> byPlanet = new ObjectMap<>();
        for (Planet planet : Vars.content.planets()) {
            byPlanet.put(planet.name, new ObjectIntMap<>());
        }

        /* The game's own two entry points, rather than the generators called by hand.
           Calling `PlanetGenerator.generate` directly threw on every single map, on a null
           `state.rules.sector` a generator reads to know which planet it is drawing: the
           world is loaded through `World`, which sets that up, and reaching past it means
           re-deriving state the game already knows how to build. */
        for (SectorPreset preset : Vars.content.sectors()) {
            if (preset.planet == null || preset.generator == null) continue;
            ObjectIntMap<String> into = byPlanet.get(preset.planet.name);
            if (into == null) continue;
            harvest(into, preset.id, () -> Vars.world.loadMap(preset.generator.map),
                preset.name);
        }

        /* The sectors a planet generates rather than ships, which is all a planet with no
           campaign map at all has. Measured on v159.7, this pass names no block Serpulo's
           and Erekir's own maps have not already named, and it is the whole of what the
           four planets without campaign maps offer. */
        for (Planet planet : Vars.content.planets()) {
            if (planet.generator == null || planet.sectors == null) continue;
            ObjectIntMap<String> into = byPlanet.get(planet.name);
            Seq<Sector> procedural = planet.sectors.select(sector -> sector.preset == null);
            if (procedural.isEmpty()) continue;
            int stride = Math.max(1, procedural.size / PROCEDURAL_SAMPLE);
            for (int i = 0; i < procedural.size; i += stride) {
                Sector sector = procedural.get(i);
                harvest(into, sector.id, () -> Vars.world.loadSector(sector),
                    planet.name + "#" + sector.id);
            }
        }

        Jval root = Jval.newObject();
        root.put("game_version", Version.combined());
        Jval planets = Jval.newObject();
        // The content registry's order, not a map's: a map iterates by identity hash, and
        // two dumps of one unchanged game must come out byte for byte the same.
        for (Planet planet : Vars.content.planets()) {
            ObjectIntMap<String> names = byPlanet.get(planet.name);
            if (names == null || names.isEmpty()) continue;
            Seq<String> sorted = new Seq<>();
            for (String name : names.keys()) sorted.add(name);
            sorted.sort();
            Jval list = Jval.newObject();
            for (String name : sorted) list.put(name, names.get(name, 0));
            planets.put(planet.name, list);
        }
        root.put("planets", planets);

        try {
            Files.createDirectories(out.toAbsolutePath().getParent());
            try (PrintWriter writer = new PrintWriter(
                    Files.newBufferedWriter(out, StandardCharsets.UTF_8))) {
                writer.print(root.toString(Jval.Jformat.formatted));
            }
        } catch (java.io.IOException error) {
            Log.err("[forge] could not write @: @", out, error.getMessage());
            return;
        }
        Log.info("[forge] wrote the ground of @ planets to @", planets.asObject().size, out);
    }

    /**
     * Load one map and count every block standing on it.
     *
     * <p>Seeded first, and that is not a nicety. A map carries generation filters that the
     * game applies at load, and {@code GenerateFilter.randomize} draws their seed from the
     * global {@code Mathf.rand}, which starts from the clock. Loading one unchanged map
     * twice in one server then gave two different worlds, and two dumps of one unchanged
     * game disagreed by a few hundred tiles of ore, moss and boulders. Seeded from the map
     * itself, a dump is a function of the game and of nothing else.
     *
     * <p>A load that throws takes its map out of the sample and nothing else: one campaign
     * map failing to build is a hole in the coverage, not a reason to lose the other
     * seventy. It says so out loud, because a hole nobody is told about reads as an answer.
     */
    private static void harvest(ObjectIntMap<String> into, int seed, Runnable load,
                                String what) {
        try {
            Mathf.rand.setSeed(seed);
            load.run();
        } catch (Throwable error) {
            Log.warn("[forge] @ did not generate: @", what, error.toString());
            return;
        }
        for (Tile tile : Vars.world.tiles) {
            if (tile == null) continue;
            // The three layers a tile stacks, and the three families the ground palette
            // shows: the floor, the ore over it and the static wall over both.
            add(into, tile.floor());
            add(into, tile.overlay());
            if (tile.block().isStatic()) add(into, tile.block());
        }
    }

    /** Air is what an empty layer reads as, and it belongs to no planet in particular. */
    private static void add(ObjectIntMap<String> into, mindustry.world.Block block) {
        if (block == null || block == mindustry.content.Blocks.air) return;
        into.increment(block.name);
    }
}
