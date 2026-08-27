<?php

namespace App\Services;

use App\Support\Block;

/**
 * The block catalogue, read from the file the bench printed out of a running game.
 *
 * `public/forge/blocks.json` is a generated artefact: `tools/build_catalogue.py` writes it
 * from a real Mindustry server, and nobody edits it by hand. This class is the one place
 * on the server that opens it, so that a page never has to know where it lives or what
 * shape the game left it in.
 *
 * It is deliberately not a database table. A table would be a copy of a generated file,
 * and a copy needs a synchronisation step that goes stale exactly when the game gets a new
 * version, which is the one thing this wiki claims not to do. Reading the file is 1.6 ms
 * and there will never be more than a few hundred blocks, because the number of blocks is
 * bounded by the game.
 *
 * Nor does it go through the cache store, which was the first plan. Measured on this repo:
 * `Cache::get` of the decoded array is 1.05 ms against 1.63 ms for reading and decoding the
 * file. Six tenths of a millisecond does not pay for a 320 kB row in the database and a
 * second place for the catalogue to be wrong. The static below makes repeat calls within a
 * request free, which is where the real cost was.
 */
class BlockCatalogue
{
    /** Blocks the game never offers a player. Sols, overlays, `AirBlock`, and the like. */
    private const HIDDEN = 'hidden';

    /** The decoded file, kept for the life of the request. */
    private static ?array $raw = null;

    /** Blocks worth a page, by name. Built once per request, walked many times. */
    private static ?array $blocks = null;

    /** For tests, which need a second read to see a file that changed underneath. */
    public static function forget(): void
    {
        self::$raw = null;
        self::$blocks = null;
    }

    /** Everything in the file, exactly as the game printed it. */
    public static function raw(): array
    {
        if (self::$raw === null) {
            $path = public_path('forge/blocks.json');
            $decoded = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
            self::$raw = is_array($decoded) ? $decoded : [];
        }

        return self::$raw;
    }

    /** Which build of the game these figures came out of. Printed on every page. */
    public static function gameVersion(): string
    {
        return (string) (self::raw()['game_version'] ?? 'inconnue');
    }

    /**
     * Every block a player can meet, by name, in the order the game numbers them.
     *
     * The hidden ones are dropped rather than listed. There are 141 of them against 254
     * kept, and they are the game's internal furniture: `AirBlock`, floors, ore overlays,
     * blocks with no recipe, no cost and no behaviour to describe. Giving each one a page
     * would be 141 pages with nothing on them, which search engines punish rather than
     * ignore, and would bury the pages that do say something.
     *
     * Sorted by the game's own block id, so that a category listing comes out in the order
     * the build menu shows it rather than alphabetically. A player looks for the drill they
     * remember being third, not the one starting with the right letter.
     */
    public static function all(): array
    {
        if (self::$blocks !== null) {
            return self::$blocks;
        }

        $entries = (array) (self::raw()['blocks'] ?? []);

        $kept = [];
        foreach ($entries as $name => $data) {
            if (! is_string($name) || ! is_array($data)) {
                continue;
            }
            if (($data['build_visibility'] ?? 'shown') === self::HIDDEN) {
                continue;
            }
            $kept[$name] = new Block($name, $data);
        }

        uasort($kept, fn (Block $a, Block $b) => ($a->get('id') ?? PHP_INT_MAX) <=> ($b->get('id') ?? PHP_INT_MAX));

        return self::$blocks = $kept;
    }

    public static function find(string $name): ?Block
    {
        return self::all()[$name] ?? null;
    }

    public static function has(string $name): bool
    {
        return isset(self::all()[$name]);
    }

    /**
     * Blocks grouped the way the build menu groups them, categories in the game's order.
     *
     * The order is fixed here rather than taken from the data, because the data is a map
     * and a map has whatever order it was written in. This is the order of the tabs in the
     * game, and a player who knows where drills live should find them in the same place.
     */
    public const CATEGORIES = [
        'distribution', 'liquid', 'power', 'production', 'crafting',
        'defense', 'turret', 'units', 'effect', 'logic',
    ];

    /** @return array<string, array<string, Block>> */
    public static function byCategory(): array
    {
        $grouped = array_fill_keys(self::CATEGORIES, []);

        foreach (self::all() as $name => $block) {
            $grouped[$block->category()][$name] = $block;
        }

        // A category the catalogue never used is not a tab worth drawing.
        return array_filter($grouped);
    }

    /** The items the game holds, in its own numbering, which is the order a cost is read in. */
    public static function items(): array
    {
        return (array) (self::raw()['items'] ?? []);
    }

    public static function liquids(): array
    {
        return (array) (self::raw()['liquids'] ?? []);
    }

    /**
     * Everything that can actually come out of the ground, with how hard it is.
     *
     * Taken from the floors rather than from the item list: plenty of items exist that no
     * drill will ever produce, and offering silicon on a drill's page would be describing a
     * game nobody is playing. Read over the whole catalogue because floors are hidden.
     *
     * @return array<string, int> item name to hardness
     */
    public static function minableItems(): array
    {
        $items = self::items();

        $ores = [];
        foreach ((array) (self::raw()['blocks'] ?? []) as $data) {
            $drop = is_array($data) ? ($data['drops'] ?? null) : null;
            if (is_string($drop) && isset($items[$drop])) {
                $ores[$drop] = (int) ($items[$drop]['hardness'] ?? 0);
            }
        }

        // Softest first, which is the order a drill meets them: a tier two drill reads its
        // own list top down and stops where the game stops it.
        asort($ores);

        return $ores;
    }

    /**
     * Sort a handful of item names into the order the game's own panel lists them.
     *
     * A build cost read off the block card in game is copper first, then lead, then the
     * rest by id. Sorting by quantity instead would put 30 lead above 25 copper and quietly
     * disagree with the panel a player is comparing it against.
     */
    public static function inGameOrder(array $amounts): array
    {
        $items = self::items();

        uksort($amounts, fn ($a, $b) => ($items[$a]['id'] ?? PHP_INT_MAX) <=> ($items[$b]['id'] ?? PHP_INT_MAX));

        return $amounts;
    }

    /**
     * Which blocks produce a given thing, item or liquid.
     *
     * This is half of what makes a block page more than a stat sheet: standing on the
     * silicon smelter page, the answer to "where do I get sand" is a list of links rather
     * than a trip to a wiki. Drills are deliberately absent from it, because a drill
     * produces whatever it is standing on rather than a fixed thing; the ground answers
     * that question, and `minedFrom` asks it.
     *
     * @return array<string, Block>
     */
    public static function makersOf(string $thing): array
    {
        return array_filter(
            self::all(),
            fn (Block $block) => isset($block->outputs()[$thing]) || isset($block->outputLiquids()[$thing]),
        );
    }

    /**
     * Which blocks take a given thing in, whether as a recipe input or as ammunition.
     *
     * The other half: from the graphite press page, everything graphite is good for.
     *
     * @return array<string, Block>
     */
    public static function takersOf(string $thing): array
    {
        return array_filter(
            self::all(),
            fn (Block $block) => isset($block->inputs()[$thing])
                || isset($block->inputLiquids()[$thing])
                || in_array($thing, $block->accepts(), true)
                || in_array($thing, $block->drinks(), true),
        );
    }

    /**
     * The ground a thing is dug out of, when it is dug rather than made.
     *
     * Sand has no recipe: it comes off a sand floor under a drill. Without this the silicon
     * smelter page would say sand is only made in a pulveriser, which is true and is not
     * the answer, since nine players out of ten put a drill on a beach.
     *
     * Searched over the whole catalogue rather than over `all()`, and that is the point:
     * floors are hidden, so they have no page and `all()` drops them. They are still the
     * answer. The caller links the ones that have a page and prints the rest as plain text,
     * because a floor is somewhere you stand, not somewhere to click.
     *
     * @return array<string, Block>
     */
    public static function minedFrom(string $thing): array
    {
        $found = [];
        foreach ((array) (self::raw()['blocks'] ?? []) as $name => $data) {
            if (is_string($name) && is_array($data) && ($data['drops'] ?? null) === $thing) {
                $found[$name] = new Block($name, $data);
            }
        }

        return $found;
    }
}
