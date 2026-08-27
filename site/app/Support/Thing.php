<?php

namespace App\Support;

use App\Services\BlockCatalogue;
use App\Services\GameNames;

/**
 * How to name and how to picture one thing of the game, in one place.
 *
 * Three surfaces ask the same two questions of the same names: the marketplace filter, the
 * block wiki, and the build cost of a schematic. They asked them separately, and separately
 * is how one of them ends up showing `phase-fabric` while its neighbour shows "Tissu Phasé".
 *
 * Neither answer is invented here. The name comes from the game's own French bundle, and the
 * family is read off the catalogue rather than off a list somebody keeps: what sits in
 * `items` is an item, what sits in `liquids` is a liquid, the rest is a block. A hand-kept
 * list starts lying the day the game adds one.
 */
class Thing
{
    /**
     * Which family the icon endpoint should be asked for.
     *
     * The endpoint serves `bloc`, `objet` and `liquide`, and the last two share a prefix in
     * the sheet without ever colliding, since no item and no liquid share a name.
     */
    public static function family(string $name): string
    {
        if (isset(BlockCatalogue::items()[$name])) {
            return 'objet';
        }

        return isset(BlockCatalogue::liquids()[$name]) ? 'liquide' : 'bloc';
    }

    /**
     * What to call it on screen, in the reader's language.
     *
     * The game names four hundred and forty-four of its blocks, items and liquids in French,
     * and those names are what a player has in front of them while playing. Falling back to
     * the identifier with its dashes taken out is reached only by what the game itself never
     * names, which nothing on these pages shows.
     */
    public static function name(string $thing): string
    {
        $family = match (self::family($thing)) {
            'objet' => 'item',
            'liquide' => 'liquid',
            default => 'block',
        };

        return GameNames::of($family, $thing)
            ?? ucfirst(str_replace('-', ' ', $thing));
    }
}
