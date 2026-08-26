package mindustryforge;

import arc.util.CommandHandler;
import arc.util.Log;
import mindustry.mod.Plugin;

import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * The half of this repository that runs the real game.
 *
 * <p>The analyser computes what a schematic should produce. This measures what it actually
 * produces, on a headless server, on a pinned world, for a pinned number of seconds. The
 * point of having both is that they must agree: a disagreement is a bug in the analyser
 * rather than a matter of opinion, and that check is the only reason anyone should believe
 * a number on the site.
 */
public class BenchPlugin extends Plugin {

    private final Measure measure = new Measure();

    /**
     * Hooked into the game's own loop, because the world only moves when the loop runs.
     *
     * A command cannot advance the world from inside itself: it arms a countdown and the
     * frames that follow finish the job.
     */
    @Override
    public void init() {
        arc.Core.app.addListener(measure);
    }

    @Override
    public void registerServerCommands(CommandHandler handler) {
        handler.register("dump-blocks", "[path]",
                "Write every block and item the game knows to JSON.", args -> {
            Path out = args.length > 0 ? Paths.get(args[0]) : DumpBlocks.defaultOut();
            DumpBlocks.dump(out);
        });

        /* The oracle. The browser carries a transcription of the game's update loop, and a
           transcription is worth nothing unless something can tell it apart from a
           plausible invention. The only thing that can is the engine it came from. */
        handler.register("measure", "<schematique> [secondes] [chemin] [sol...]",
                "Run a schematic in the real engine and write down what came out.", args -> {
            float seconds = args.length > 1 ? Float.parseFloat(args[1]) : 30f;
            Path out = args.length > 2 ? Paths.get(args[2]) : Paths.get("bench", "data", "mesure.json");
            // Anything after the path is ground to paint: `ore-copper@2,3`, in the
            // schematic's own coordinates. A drill on bare floor measures nothing.
            // The last parameter swallows the rest of the line, so it arrives as one
            // string with spaces in it.
            String[] ground = args.length > 3 && !args[3].isBlank()
                ? args[3].trim().split("\s+") : new String[0];
            measure.queue(args[0], seconds, out, ground);
        });

        Log.info("[forge] bench ready");
    }
}
