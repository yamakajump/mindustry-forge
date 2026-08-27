<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;

/**
 * A short name for the exact analysis that produced a stored figure.
 *
 * The engine changes weekly, and a stored analysis has no way of knowing. Without this the
 * site keeps presenting last month's numbers as measurements, and the only way to find the
 * stale ones is to redo all fifteen thousand. With it, stale is a `where` clause.
 *
 * The version is a hash of the sources, not a number somebody remembers to raise. A number
 * anybody has to remember is a number that is wrong on exactly the commit that mattered,
 * and it would be wrong in the silent direction: figures marked current that are not.
 * `blocks.json` is in the list because the catalogue is an input to the analysis like any
 * other, and a corrected block changes every answer that block appears in.
 *
 * This is the only place the version is computed. The ingestion pass runs the analysis
 * under Node, because `analyse.js` is the one implementation and Node can run it as it
 * stands, but the surrounding orchestration stays here in PHP: Node does the arithmetic,
 * this side owns the database and the version stamped into it.
 */
class EngineVersion
{
    /**
     * Everything an answer depends on, relative to `public/forge`.
     *
     * The renderer and the page's own scripts are deliberately absent. They decide what a
     * schematic looks like, not what it produces, and listing them would invalidate
     * fifteen thousand analyses over a change of colour.
     */
    private const SOURCES = [
        'analyse.js',
        'schematic.js',
        'needs.js',
        'marks.js',
        'ground.js',
        'maxflow.js',
        'blocks.json',
        'engine/core.js',
        'engine/carriers.js',
        'engine/liquids.js',
        'engine/machines.js',
        'engine/massdriver.js',
        'engine/payloads.js',
        'engine/power.js',
        'engine/run.js',
    ];

    /** How wide the stored stamp is. Matches the column. */
    public const WIDTH = 12;

    /**
     * The current engine, as twelve hex characters.
     *
     * Cached for a minute rather than per-request: a browse page can ask this once per row
     * to decide whether to trust a figure, and reading fifteen files to answer the same
     * question fifty times is fifty times too many. A minute is short enough that a
     * developer editing `power.js` sees the effect before wondering why not.
     */
    public static function current(): string
    {
        return Cache::remember('engine.version', 60, fn () => self::compute());
    }

    /** The hash itself, ignoring the cache. */
    public static function compute(): string
    {
        $digest = hash_init('sha256');

        foreach (self::SOURCES as $file) {
            $path = public_path("forge/{$file}");
            // The name goes in as well as the contents, so that renaming a file, or losing
            // one, changes the version. A missing source hashes as absent rather than
            // being skipped: an engine with a file gone is not the engine that ran before.
            hash_update($digest, $file);
            hash_update($digest, is_file($path) ? (string) md5_file($path) : 'absent');
        }

        return substr(hash_final($digest), 0, self::WIDTH);
    }
}
