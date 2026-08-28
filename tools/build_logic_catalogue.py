"""Read the processor language out of the game, rather than out of a wiki.

    python tools/build_logic_catalogue.py

The logic editor needs to know what an instruction is called, what operands it takes, in
which order, and which of them are drawn from a fixed set. Every one of those four facts
lives in the game's own bytecode, and every one of them changes between builds.

So none of it is typed here. `mindustry.gen.LogicIO.write` is the generated method the game
uses to turn a statement back into the line a player reads: it appends the instruction
name, then each operand field, separated by spaces. Disassembled, it *is* the grammar, in
the exact order the game writes it. The enums come from the classes those fields point at,
the help text from the game's own translation bundles, and the content names from the same
bundles, so `@copper` completes because the game ships an item called copper and not
because someone remembered one.

The failure this avoids is the quiet one. A hand-kept instruction table does not break; it
drifts. `setrate` appears in a build, nobody adds it, and the editor marks a perfectly good
program as wrong, in red, for a year.

Inputs, both outside the repository because they are 20 and 35 megabytes of game:

    server-release.jar     the classes, for the grammar
    assets.jar             the bundles, for the words

Output: `site/public/forge/logic/instructions.json`, committed, because the page loads it
and no visitor is going to run a JVM.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from collections import OrderedDict
from pathlib import Path
from zipfile import ZipFile

TARGET = Path("site/public/forge/logic/instructions.json")

#: Where the other scripts in this repository look for the game, from the parent folder.
DEFAULT_CLASSES = Path("../mindustry-ai/mindustry-env/server-release.jar")
DEFAULT_ASSETS = Path("../mindustry-ai/mindustry-bench/assets.jar")

#: The languages shipped. The French comes from the game rather than from us: a player who
#: reads "Controle un batiment" in Mindustry has to read the same sentence here.
LANGUAGES = {"fr": "assets/bundles/bundle_fr.properties",
             "en": "assets/bundles/bundle.properties"}

#: The `@` variables the game declares outside `GlobalVars`, because they belong to the
#: processor that is running rather than to the world.
EXECUTOR_VARS = ("@counter", "@unit", "@this", "@ipt")


def javap(jar: Path, klass: str, *flags: str) -> str:
    """Disassemble one class. Absent classes are not fatal: builds drop statements."""
    result = subprocess.run(
        ["javap", *flags, "-cp", str(jar), klass],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    return "" if result.returncode else result.stdout


LDC = re.compile(r"^\s*\d+: ldc(?:_w)?\s+#\d+\s+// String (.*)$")
CLASS_TEST = re.compile(
    r"^\s*\d+: ldc(?:_w)?\s+#\d+\s+// class mindustry/logic/LStatements\$(\w+)$")
FIELD = re.compile(
    r"^\s*\d+: getfield\s+#\d+\s+// Field mindustry/logic/LStatements\$\w+\.(\w+):(\S+)$")


def type_of(descriptor: str) -> tuple[str, str | None]:
    """A field descriptor, as the editor thinks of it: a free value, or a fixed set."""
    if descriptor == "Ljava/lang/String;":
        return "value", None
    if descriptor == "I":
        return "int", None
    if descriptor == "Z":
        return "bool", None
    if descriptor.startswith("L") and descriptor.endswith(";"):
        return "enum", descriptor[1:-1].replace("/", ".").split(".")[-1].split("$")[-1]
    return "value", None


def grammar(classes: Path) -> tuple[list[dict], dict[str, str]]:
    """Every instruction, from the method the game uses to print one.

    Returns the instructions and, alongside, the enum class each enum operand names, so the
    caller knows which classes it still has to open.
    """
    dump = javap(classes, "mindustry.gen.LogicIO", "-c", "-p")
    if not dump:
        raise SystemExit("mindustry.gen.LogicIO not found: wrong jar?")

    lines = dump.splitlines()
    starts = [(i, m.group(1)) for i, line in enumerate(lines)
              if (m := CLASS_TEST.match(line))
              and i + 1 < len(lines) and "if_acmpne" in lines[i + 1]]

    # `write` comes after `read` in the file and both compare the same classes. Only the
    # second half is kept: the one that writes.
    write_at = next(i for i, line in enumerate(lines)
                    if "public static void write(java.lang.Object" in line)
    starts = [(i, name) for i, name in starts if i > write_at]

    enums: dict[str, str] = {}
    out = []
    for order, (start, statement) in enumerate(starts):
        end = starts[order + 1][0] if order + 1 < len(starts) else len(lines)
        name = None
        operands = []
        for line in lines[start:end]:
            if literal := LDC.match(line):
                text = literal.group(1)
                if text.strip() and name is None:
                    name = text.strip()
                continue
            if field := FIELD.match(line):
                kind, enum = type_of(field.group(2))
                operand = {"name": field.group(1), "type": kind}
                if enum:
                    operand["enum"] = enum
                    enums[enum] = field.group(2)[1:-1].replace("/", ".")
                operands.append(operand)
        if not name:
            continue
        out.append({"name": name, "statement": statement, "operands": operands})
    return out, enums


CATEGORY = re.compile(r"// Field mindustry/logic/LCategory\.(\w+):")


def annotate(classes: Path, instructions: list[dict]) -> None:
    """Each instruction's category and whether it belongs to the world processor.

    Privileged matters here and is not decoration: a schematic cannot contain a world
    processor, so an editor that offers `setrule` without a word of warning is offering an
    instruction the player's program will refuse to assemble.
    """
    for entry in instructions:
        dump = javap(classes, f"mindustry.logic.LStatements${entry['statement']}", "-c", "-p")
        category = "unknown"
        if body := after(dump, "public mindustry.logic.LCategory category();"):
            if found := CATEGORY.search(body):
                category = found.group(1)
        entry["category"] = category
        privileged = after(dump, "public boolean privileged();")
        entry["privileged"] = bool(privileged and "iconst_1" in privileged)
        hidden = after(dump, "public boolean hidden();")
        entry["hidden"] = bool(hidden and "iconst_1" in hidden)


def after(dump: str, signature: str) -> str:
    """The bytecode of one method, up to the blank line that ends it."""
    if signature not in dump:
        return ""
    body = dump.split(signature, 1)[1]
    return body.split("\n\n", 1)[0]


CONSTANT = re.compile(r"^\s*public static final \S+ (\w+);$")


def enum_values(classes: Path, klass: str) -> list[str]:
    """An enum's constants, in the order the game declares them."""
    dump = javap(classes, klass, "-p")
    simple = klass.split(".")[-1].split("$")[-1]
    values = []
    for line in dump.splitlines():
        if match := re.match(r"^\s*public static final \S*" + simple + r" (\w+);$", line):
            values.append(match.group(1))
    return values


VAR = re.compile(r"// String (@\w+)$", re.M)


def globals_of(classes: Path) -> list[str]:
    """The `@` variables a program can read without declaring anything."""
    found = set(EXECUTOR_VARS)
    for klass in ("mindustry.logic.GlobalVars", "mindustry.logic.LExecutor"):
        found.update(VAR.findall(javap(classes, klass, "-c", "-p")))
    return sorted(found)


LDC_STRING = re.compile(r"^\s*\d+: ldc(?:_w)?\s+#\d+\s+// String (\S+)$", re.M)


def aliases(classes: Path) -> dict[str, str]:
    """The old spellings the parser silently accepts, from the table that holds them.

    `LParser.opNameChanges` is two pairs today, `atan2` for `angle` and `dst` for `len`, and
    it exists because the game renamed two operators and would not break the programs people
    had already written. An editor that does not know about it paints working code red.

    The two `configure` spellings are handled inline in `LParser.statement` rather than in
    that table, so they are named here, and only here.
    """
    dump = javap(classes, "mindustry.logic.LParser", "-c", "-p")
    clinit = dump.split("static {};", 1)[-1]
    words = LDC_STRING.findall(clinit)
    table = dict(zip(words[::2], words[1::2]))
    table.update({"configure": "config", "@configure": "@config"})
    return table


#: One enum constant as the class initialiser builds it: its own name, then its ordinal,
#: then the symbol it prints as, then the constructor whose signature states the arity.
ENUM_ENTRY = re.compile(
    r"ldc(?:_w)?\s+#\d+\s+// String (\S+)\n"
    r"(?:.*\n)?"
    r"\s*\d+: ldc(?:_w)?\s+#\d+\s+// String (\S+)\n"
    r"(?:.*\n){0,3}?"
    r'\s*\d+: invokespecial\s+#\d+\s+// Method "<init>":\(([^)]*)\)V')


def operators(classes: Path, klass: str) -> dict[str, dict]:
    """How an operator is written when a human writes it, and how many sides it has.

    `op add result a b` is the game's storage form and nobody reads it at a glance;
    `result = a + b` is the same line and everybody does. The game already knows both,
    because `LogicOp` carries the symbol next to the name and picks a one or two argument
    lambda: that is the arity, stated by the constructor it calls rather than guessed from
    whether a symbol looks infix.

    Read from the bytecode for the usual reason. A table of forty operators typed here
    would be right until the version that adds the forty-first.
    """
    dump = javap(classes, klass, "-c", "-p")
    clinit = dump.split("static {};", 1)[-1]

    out = {}
    for name, symbol, signature in ENUM_ENTRY.findall(clinit):
        out[name] = {
            "symbol": symbol,
            # `OpLambda1` takes one side, `OpLambda2` takes two. Nothing else distinguishes
            # `abs` from `add` at this level, and the difference is the whole reading.
            "unary": "Lambda1" in signature or "OpLambda2" not in signature,
        }
    return out


MARKUP = re.compile(r"\[[a-zA-Z#][^\[\]]*\]|\[\]")


def bundles(assets: Path) -> dict[str, dict[str, str]]:
    """The game's own words, per language, with its colour markup taken back out."""
    out: dict[str, dict[str, str]] = {}
    with ZipFile(assets) as jar:
        for language, path in LANGUAGES.items():
            text = jar.read(path).decode("utf-8")
            table = {}
            for line in text.splitlines():
                if "=" not in line or line.startswith("#"):
                    continue
                key, _, value = line.partition("=")
                table[key.strip()] = MARKUP.sub("", value.strip()).replace("\\n", "\n")
            out[language] = table
    return out


def helps(words: dict[str, dict[str, str]], key: str) -> dict[str, str]:
    """One phrase per language, English kept only when it says something else.

    Mindustry's translations are volunteer work and incomplete: half the newer instructions
    have no French line at all. Falling back to English is right; storing English twice
    under two names is fifteen kilobytes of the same sentence.
    """
    out = {}
    for language, table in words.items():
        if value := table.get(key):
            out[language] = value
    if out.get("fr") == out.get("en"):
        out.pop("en", None)
    return out


NAMED = re.compile(r"^(item|liquid|unit|block|status)\.([a-zA-Z0-9-]+)\.name\s*=")


def contents(words: dict[str, dict[str, str]]) -> dict[str, list[str]]:
    """What `@` can name: every piece of content the game ships, by family.

    Read from the bundle rather than from `mindustry.content.*`, because the field a
    programmer wrote is `thoriumReactor` and the name a player types is
    `@thorium-reactor`. The bundle is keyed by the second one.
    """
    families: dict[str, list[str]] = {}
    for key in words["en"]:
        if match := NAMED.match(key + "="):
            families.setdefault(match.group(1), []).append(match.group(2))
    return {family: sorted(names) for family, names in sorted(families.items())}


BLOCKS = Path("bench/data/blocks.json")


def processors(words: dict[str, dict[str, str]]) -> list[dict]:
    """The blocks that run a program, from the registry the game printed.

    Three numbers are needed to wrap a program into a schematic, and one of them is how big
    the block is. Read from `bench/data/blocks.json` rather than kept here, and read from
    there rather than from `site/public/forge/blocks.json`, so that the editor page does not
    have to fetch two hundred kilobytes of block data to learn that a micro processor is one
    tile wide.

    Two of the rate fields are copied and the third is not. `instructions_per_tick` and
    `max_instruction_scale` are what `updateTile` actually runs on. `max_instructions_per_tick`
    is left behind on purpose: the only thing that writes to a building's rate is `setrate`,
    and `updateTile` puts the rate back to the block's own every tick on anything that is
    not privileged. So on the three processors a schematic can hold, that ceiling is a
    number no program can ever reach, and carrying it here would be handing the page
    something true about the world processor and false about everything it can show.
    """
    registry = json.loads(BLOCKS.read_text(encoding="utf-8"))
    registry = registry.get("blocks", registry)
    out = []
    for name, block in sorted(registry.items()):
        if block.get("kind") != "LogicBlock":
            continue
        out.append({"name": name,
                    "size": block.get("size", 1),
                    "label": words["fr"].get(f"block.{name}.name")
                          or words["en"].get(f"block.{name}.name", name),
                    "instructions_per_tick": block.get("instructions_per_tick"),
                    "max_instruction_scale": block.get("max_instruction_scale"),
                    # The world processor cannot be placed: it has no business in a
                    # schematic, and it is here so the page can say so rather than offer it.
                    "world": name == "world-processor"})
    return out


def limits(classes: Path) -> dict[str, int]:
    """What the game refuses, so the editor can say so before the paste does."""
    dump = javap(classes, "mindustry.world.blocks.logic.LogicBlock", "-p", "-constants")
    out = {}
    for field, key in (("maxByteLen", "code_bytes"),
                       ("maxCompressedLen", "config_bytes"),
                       ("maxLinks", "links"),
                       ("maxNameLength", "link_name")):
        if match := re.search(rf"static final int {field} = (\d+)", dump):
            out[key] = int(match.group(1))
    return out


def build(classes: Path, assets: Path) -> dict:
    words = bundles(assets)
    instructions, enum_classes = grammar(classes)
    annotate(classes, instructions)

    for entry in instructions:
        entry["help"] = helps(words, f"lst.{entry['name']}")
        del entry["statement"]

    enums = OrderedDict()
    for name, klass in sorted(enum_classes.items()):
        values = enum_values(classes, klass)
        if not values:
            continue
        written = operators(classes, klass)
        enums[name] = [{"name": value,
                        **({"symbol": written[value]["symbol"],
                            "unary": written[value]["unary"]} if value in written else {}),
                        "help": helps(words, f"lenum.{value.lower()}")
                             or helps(words, f"laccess.{value.lower()}")}
                       for value in values]

    categories = {name: helps(words, f"lcategory.{name}")
                  for name in sorted({e["category"] for e in instructions})}

    with ZipFile(classes) as jar:
        version = jar.read("version.properties").decode("utf-8")
    build_number = re.search(r"build=(\S+)", version).group(1)
    major = re.search(r"number=(\S+)", version).group(1)

    return {
        "_": "Generated by tools/build_logic_catalogue.py. Do not edit by hand.",
        "build": f"v{major} build {build_number}",
        "limits": limits(classes),
        "categories": categories,
        "processors": processors(words),
        "instructions": instructions,
        "enums": enums,
        "globals": globals_of(classes),
        "aliases": aliases(classes),
        "content": contents(words),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--classes", type=Path, default=DEFAULT_CLASSES)
    parser.add_argument("--assets", type=Path, default=DEFAULT_ASSETS)
    parser.add_argument("--target", type=Path, default=TARGET)
    args = parser.parse_args()

    for path in (args.classes, args.assets):
        if not path.exists():
            raise SystemExit(f"not found: {path}")

    catalogue = build(args.classes, args.assets)
    args.target.parent.mkdir(parents=True, exist_ok=True)
    args.target.write_text(
        json.dumps(catalogue, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    print(f"{args.target}: {len(catalogue['instructions'])} instructions, "
          f"{len(catalogue['enums'])} lists, "
          f"{sum(len(v) for v in catalogue['content'].values())} content entries, "
          f"{args.target.stat().st_size // 1024} kB")


if __name__ == "__main__":
    main()
