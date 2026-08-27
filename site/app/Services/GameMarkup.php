<?php

namespace App\Services;

/**
 * Mindustry's colour markup, removed the way the game removes it.
 *
 * A schematic name may carry colour tags, and 1 233 of the 15 533 collected ones do. They
 * were published raw: in the listing, on the page, and in `og:title`, so they reached the
 * cards that unfurl in a Discord thread.
 *
 * **The obvious fix damages real names, and there is already a victim in the catalogue.** A
 * schematic published on 27/08/2026 is called `[Silicon]Stackable Thin Crusibles`. Any
 * expression of the shape `\[[^\]]*\]` renames it `Stackable Thin Crusibles`, which is not
 * cleaning a name, it is breaking one.
 *
 * So the rule is read from `Strings.stripColors` and `parseColorMarkup` in Arc, the way
 * every other format in this repository is read from the game rather than from a wiki:
 *
 *   - `[#rrggbb]` to `[#rrggbbaa]`, between two and eight hex digits and nothing else.
 *   - `[]`, which closes the current colour.
 *   - `[[`, an escaped bracket, which the game prints as one `[`.
 *   - `[name]` **only when `Colors.get(name)` finds a registered colour.** Everything else,
 *     `[Silicon]` included, is text.
 *   - An unclosed `[` is text.
 *
 * That last case is why this reads a file instead of holding a list. The registry is dumped
 * from `Colors` by the bench, the same way the block catalogue is, because a colour list
 * typed here would be a second copy of the game's data right until the game adds a colour.
 * It sits in `colors.json` rather than in `blocks.json` on purpose: `EngineVersion` hashes
 * the catalogue, so putting a colour there would mark fifteen thousand stored analyses
 * stale to add something that cannot change a single one of their figures.
 *
 * Both cases are kept because the game keeps both, and its lookup is exact: `[GREEN]` and
 * `[green]` are markup, `[Green]` is a title.
 *
 * Written as a scan rather than as a regular expression, because that is what the game
 * does, and because a pattern cannot express "only if this name is registered".
 */
class GameMarkup
{
    /** How many hex digits a colour may carry, either side included. */
    private const HEX = [2, 8];

    /** Where the bench leaves the game's own registry. */
    private const REGISTRY = 'forge/colors.json';

    /** @var array<string, string>|null */
    private static ?array $named = null;

    /**
     * The text without the markup this class is sure about.
     *
     * Left to right, one pass, exactly as `stripColors` walks it. Anything that is not
     * recognised is copied through, which is the safe direction: a tag left in is visible
     * and reported, a name eaten is gone.
     */
    public static function strip(string $text): string
    {
        $out = '';
        $at = 0;
        $length = strlen($text);

        while ($at < $length) {
            if ($text[$at] !== '[') {
                $out .= $text[$at];
                $at++;

                continue;
            }

            // `[[` is how the game writes a bracket somebody meant. It prints as one.
            if ($at + 1 < $length && $text[$at + 1] === '[') {
                $out .= '[';
                $at += 2;

                continue;
            }

            $span = self::markupAt($text, $at + 1, $length);
            if ($span === null) {
                $out .= $text[$at];
                $at++;

                continue;
            }

            $at = $span;
        }

        return $out;
    }

    /** Whether anything here still carries markup, which is what a test asks. */
    public static function marked(string $text): bool
    {
        return self::strip($text) !== $text;
    }

    /**
     * Every name the game answers to, read once from what the bench dumped.
     *
     * An empty registry is not a failure to shout about: it means the file has not been
     * generated yet, and the honest behaviour then is to leave `[green]` alone rather than
     * to guess. A tag left in is visible and gets reported; a title eaten is gone.
     *
     * @return array<string, string>
     */
    private static function named(): array
    {
        if (self::$named === null) {
            $path = public_path(self::REGISTRY);
            $found = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
            self::$named = is_array($found) ? $found : [];
        }

        return self::$named;
    }

    /**
     * Where the markup starting after this bracket ends, or null if it is not markup.
     *
     * A name is only markup when the registry holds that exact key, which is the game's own
     * test. Anything else is copied through, and that is the safe direction: `[Silicon]` is
     * somebody's title and there is one in the catalogue.
     */
    private static function markupAt(string $text, int $start, int $length): ?int
    {
        if ($start >= $length) {
            return null;
        }

        // `[]`, the reset. Zero characters between the brackets.
        if ($text[$start] === ']') {
            return $start + 1;
        }

        if ($text[$start] !== '#') {
            // A named colour, if the game knows that name. The closing bracket is found
            // first so an unclosed one falls through to text, as it does in the game.
            $close = strpos($text, ']', $start);

            return $close !== false
                && array_key_exists(substr($text, $start, $close - $start), self::named())
                ? $close + 1
                : null;
        }

        for ($at = $start + 1; $at < $length; $at++) {
            $char = $text[$at];

            if ($char === ']') {
                $digits = $at - $start - 1;

                return $digits >= self::HEX[0] && $digits <= self::HEX[1] ? $at + 1 : null;
            }

            if (! ctype_xdigit($char)) {
                return null;
            }
        }

        // Ran off the end without closing: text, like any other unclosed bracket.
        return null;
    }
}
