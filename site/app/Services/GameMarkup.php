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
 * The last named case is deliberately not handled here, and that is the whole reason this
 * class exists as a subset rather than as a copy. It needs the game's colour registry, and
 * the same argument that keeps the block catalogue out of a hand-written list keeps a
 * colour list out of one: it belongs beside `blocks.json`, dumped by the bench. Until it
 * is, `[green]` survives and `[Silicon]` survives, which is the pair of outcomes worth
 * having. Half the defect closed today beats all of it closed next week, and the missing
 * half cannot break a correct name.
 *
 * Written as a scan rather than as a regular expression, because that is what the game
 * does, and because the day the registry lands only `markupAt()` grows.
 */
class GameMarkup
{
    /** How many hex digits a colour may carry, either side included. */
    private const HEX = [2, 8];

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
     * Where the markup starting after this bracket ends, or null if it is not markup.
     *
     * Only the two unambiguous forms. A named colour returns null on purpose: without the
     * game's registry there is no way to tell `[green]` from `[Silicon]`, and guessing
     * wrong in that direction destroys somebody's title.
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
            return null;
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
