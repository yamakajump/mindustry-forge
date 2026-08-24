import arc.struct.Seq;
import mindustry.Vars;
import mindustry.core.ContentLoader;
import mindustry.game.Schematic;
import mindustry.game.Schematics;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Paths;

/**
 * Reads a schematic with Mindustry's own decoder and prints what it found.
 *
 * <p>The Python tests round-trip the format through a reader written from the same notes
 * as the writer, so the two agree whether or not either is right. This is the only check
 * that asks the game. It exists because the failure it catches is silent: a schematic
 * with a field written in the wrong order still decodes, still pastes, and lands as
 * rubble in somebody's base.
 *
 * <p>{@code content.init()} is deliberately not called. It loads planet rules and wants
 * {@code Core.settings}, which no headless process has, and decoding only ever resolves
 * block names, which {@code createBaseContent} has already registered.
 */
public class CheckSchematic {
    public static void main(String[] args) throws Exception {
        Vars.content = new ContentLoader();
        Vars.content.createBaseContent();

        try (InputStream in = Files.newInputStream(Paths.get(args[0]))) {
            Schematic s = Schematics.read(in);
            System.out.println("READ OK  " + s.width + "x" + s.height
                + "  tiles=" + s.tiles.size + "  name=" + s.name());
            Seq<Schematic.Stile> tiles = s.tiles;
            for (int i = 0; i < tiles.size; i++) {
                Schematic.Stile t = tiles.get(i);
                System.out.println("  " + t.x + "," + t.y + "  " + t.block.name
                    + "  rot=" + t.rotation);
            }
        }
    }
}
