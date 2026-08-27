<?php

namespace App\Support;

/**
 * Printing a number the way a French page reads it, without inventing precision.
 *
 * Two decimals at most and trailing zeros dropped, so a silicon smelter says 1,5 rather
 * than 1,50 and a conveyor says 6,5 rather than 6,50. The catalogue holds floats that came
 * out of the game's own fields, and some of them are long: printing `0.019166666` under a
 * heading would look like a measurement carried to seven places when it is a tick rate
 * divided by sixty.
 */
class Figure
{
    public static function short(float $value): string
    {
        $rounded = round($value, 2);

        // Whole numbers stay whole. A cost of thirty copper is thirty, never 30,00.
        if (abs($rounded - round($rounded)) < 0.005) {
            return number_format(round($rounded), 0, ',', "\u{202f}");
        }

        return rtrim(rtrim(number_format($rounded, 2, ',', "\u{202f}"), '0'), ',');
    }
}
