<?php

namespace App\Services\Cards;

use App\Models\Schematic;
use App\Models\SchematicItem;
use GdImage;

/**
 * What a link to a schematic shows when it is pasted somewhere.
 *
 * The page used to push the raw plan render as `og:image`. It worked in the sense that an
 * image appeared, but a plan is square or very long depending on what was copied: an
 * unfurler crops it or sits it on black bars, and it carries no title, no figure and no
 * mark. A link that shows what a schematic does gets clicked; a link that shows a smear of
 * grey pixels does not.
 */
class SchematicCard extends Card
{
    /** The share of the width given to the plan. The rest carries the text. */
    private const PLAN_SHARE = 0.52;

    public function render(Schematic $schematic, ?string $planPath = null): string
    {
        return $this->paint(function (GdImage $canvas) use ($schematic, $planPath) {
            $panel = 0;
            $plan = $planPath !== null ? @imagecreatefrompng($planPath) : false;

            if ($plan !== false) {
                $panel = (int) (self::WIDTH * self::PLAN_SHARE);
                $this->drawPanel($canvas, $plan, $panel);
                imagedestroy($plan);
            }

            $this->drawColumn(
                $canvas,
                $panel + self::PAD * ($panel > 0 ? 1 : 2),
                $schematic->displayName(),
                $schematic->width.'x'.$schematic->height.'  -  '.$schematic->blocks.' blocs',
                $this->figures($schematic),
            );
        });
    }

    /**
     * What the analysis kept, three lines at most.
     *
     * Three and not the whole list: the thumbnail is read in a second inside a conversation,
     * and a list of eight outputs is not read there at all.
     *
     * @return array<int, array{0: string, 1: array<int, int>}>
     */
    private function figures(Schematic $schematic): array
    {
        $lines = [];

        foreach (collect($schematic->produces ?? [])->sortDesc()->take(2) as $item => $rate) {
            // Per second, like the page this card links to. `produces` is per minute,
            // and `debitAffiche` is the one place that difference is dealt with.
            $lines[] = [
                SchematicItem::debitAffiche($item, (float) $rate).' '.$item.' / s',
                self::ACCENT,
            ];
        }

        $power = round($schematic->power_made - $schematic->power_used);
        if (abs($power) >= 1 || $schematic->power_used > 0) {
            $lines[] = [
                ($power > 0 ? '+' : '').$this->number($power).' energie / s',
                $power < 0 ? self::BAD : self::GOOD,
            ];
        }

        return array_slice($lines, 0, 3);
    }
}
