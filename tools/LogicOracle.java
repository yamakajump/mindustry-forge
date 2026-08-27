/**
 * Ask the game what a program means, so the editor does not have to guess.
 *
 * Runs Mindustry's own `LParser` over every `.mlog` file in a directory and writes down,
 * per file, how many statements came out and the text the game writes back. That second
 * one is the interesting half: `LAssembler.write` is the canonical form, so it settles
 * every question about spacing, quoting, dropped operands and renamed operators without
 * anybody having to hold an opinion.
 *
 *     java -cp <server-release.jar> tools/LogicOracle.java bench/data/logique > out.json
 *
 * The result is committed, and `npm test` reads it. So the check runs everywhere while the
 * game runs nowhere: `tools/build_logic_oracle.py` is what re-takes it.
 *
 * Written against Mindustry v8 build 159.7, the build pinned throughout this repository.
 */

import arc.struct.Seq;
import mindustry.logic.LAssembler;
import mindustry.logic.LStatement;

import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class LogicOracle {
    public static void main(String[] args) throws Exception {
        Path dir = Paths.get(args[0]);
        List<Path> files = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir, "*.mlog")) {
            for (Path found : stream) files.add(found);
        }
        Collections.sort(files);

        StringBuilder out = new StringBuilder("{\n");
        boolean first = true;
        for (Path file : files) {
            String text = new String(Files.readAllBytes(file), StandardCharsets.UTF_8);
            if (!first) out.append(",\n");
            first = false;
            out.append(" ").append(quote(file.getFileName().toString())).append(": ");
            try {
                Seq<LStatement> parsed = LAssembler.read(text, false);
                out.append("{\"statements\": ").append(parsed.size)
                   .append(", \"written\": ").append(quote(LAssembler.write(parsed)))
                   .append("}");
            } catch (Throwable error) {
                /* A parse error is a result, not a crash: the editor has to agree with the
                   game about which programs are refused, and those are half of them. */
                out.append("{\"refused\": ")
                   .append(quote(error.getClass().getSimpleName() + ": " + error.getMessage()))
                   .append("}");
            }
        }
        System.out.print(out.append("\n}\n"));
    }

    /** JSON, by hand. Pulling in a library to print four fields would be worse. */
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
