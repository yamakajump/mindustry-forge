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

    @Override
    public void registerServerCommands(CommandHandler handler) {
        handler.register("dump-blocks", "[path]",
                "Write every block and item the game knows to JSON.", args -> {
            Path out = args.length > 0 ? Paths.get(args[0]) : DumpBlocks.defaultOut();
            DumpBlocks.dump(out);
        });

        Log.info("[forge] bench ready");
    }
}
