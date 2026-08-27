/**
 * Hand the game a schematic this site produced, and ask it what it sees.
 *
 * A processor's program comes out the far end of three nested formats, and each one of them
 * is written here: the schematic, the tile configuration, the deflated program blob. All
 * three round trip against themselves in `tests/js/logic/`, which proves this code agrees
 * with this code. It proves nothing at all about the game.
 *
 * So this reads the string with `Schematics.readBase64`, exactly as pressing paste in
 * Mindustry does, and prints back what the game found: which block, where, and the program
 * and links it decoded. Then it re-compresses that program with `LogicBlock.compress` and
 * compares it to the bytes we shipped, so the writer is held against the game's own writer
 * rather than against our reader.
 *
 *     echo <base64> | java -cp <server-release.jar> tools/LogicPaste.java
 *
 * Content has to be loaded first, because a schematic stores block names and the game turns
 * them back into blocks. `createBaseContent` is enough; nothing here needs a window, a
 * world or a server.
 *
 * Mindustry v8 build 159.7.
 */

import arc.struct.Seq;
import mindustry.Vars;
import mindustry.core.ContentLoader;
import mindustry.game.Schematic;
import mindustry.game.Schematics;
import mindustry.world.blocks.logic.LogicBlock;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Scanner;
import java.util.zip.InflaterInputStream;

public class LogicPaste {
    public static void main(String[] args) throws Exception {
        Vars.content = new ContentLoader();
        /* `createBaseContent` and no more. `init` walks the planets and reads settings,
           which do not exist outside a running game; a schematic only needs block names to
           map back to blocks, and that registry is built by the time this returns. */
        Vars.content.createBaseContent();

        StringBuilder input = new StringBuilder();
        try (Scanner scanner = new Scanner(System.in, StandardCharsets.UTF_8)) {
            while (scanner.hasNextLine()) input.append(scanner.nextLine().trim());
        }

        Schematic schematic;
        try {
            schematic = Schematics.readBase64(input.toString());
        } catch (Throwable error) {
            System.out.print("{\"refused\": " + quote(String.valueOf(error.getMessage())) + "}\n");
            return;
        }

        StringBuilder out = new StringBuilder("{\"width\": ").append(schematic.width)
            .append(", \"height\": ").append(schematic.height)
            .append(", \"processors\": [");

        boolean first = true;
        for (Schematic.Stile tile : schematic.tiles) {
            if (!(tile.block instanceof LogicBlock)) continue;
            if (!first) out.append(", ");
            first = false;

            out.append("{\"block\": ").append(quote(tile.block.name))
               .append(", \"x\": ").append(tile.x)
               .append(", \"y\": ").append(tile.y);

            if (!(tile.config instanceof byte[])) {
                out.append(", \"config\": null}");
                continue;
            }

            byte[] stored = (byte[]) tile.config;
            byte[] plain = inflate(stored);
            DataInputStream reader = new DataInputStream(new ByteArrayInputStream(plain));
            reader.read();                                   // version
            byte[] code = new byte[reader.readInt()];
            reader.readFully(code);

            Seq<LogicBlock.LogicLink> links = new Seq<>();
            StringBuilder written = new StringBuilder("[");
            int count = reader.readInt();
            for (int i = 0; i < count; i++) {
                String name = reader.readUTF();
                int x = reader.readShort(), y = reader.readShort();
                links.add(new LogicBlock.LogicLink(x, y, name, true));
                if (i > 0) written.append(", ");
                written.append("{\"name\": ").append(quote(name))
                       .append(", \"dx\": ").append(x)
                       .append(", \"dy\": ").append(y).append("}");
            }

            String program = new String(code, StandardCharsets.UTF_8);
            /* The game's own writer, over what the game's own reader just found. Compared
               inflated: two deflate implementations are free to disagree about how to
               spend their bytes, and that difference says nothing about the format. */
            boolean same = Arrays.equals(plain, inflate(LogicBlock.compress(program, links)));

            out.append(", \"code\": ").append(quote(program))
               .append(", \"links\": ").append(written.append("]"))
               .append(", \"matches_game_writer\": ").append(same)
               .append("}");
        }

        System.out.print(out.append("]}\n"));
    }

    static byte[] inflate(byte[] bytes) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (InputStream in = new InflaterInputStream(new ByteArrayInputStream(bytes))) {
            byte[] buffer = new byte[4096];
            for (int read; (read = in.read(buffer)) > 0; ) out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }

    /** JSON, by hand. Pulling in a library to print six fields would be worse. */
    static String quote(String value) {
        StringBuilder out = new StringBuilder("\"");
        for (char c : value.toCharArray()) {
            if (c == '"' || c == '\\') out.append('\\').append(c);
            else if (c == '\n') out.append("\\n");
            else if (c == '\r') out.append("\\r");
            else if (c == '\t') out.append("\\t");
            else if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
            else out.append(c);
        }
        return out.append('"').toString();
    }
}
