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
 * under Node, because `bilan.js` is the one implementation and Node can run it as it
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
        'bilan.js',
        'schematic.js',
        'needs.js',
        'marks.js',
        'ground.js',
        'maxflow.js',
        'logic.js',
        'blocks.json',
        'engine/core.js',
        'engine/carriers.js',
        'engine/liquids.js',
        'engine/machines.js',
        'engine/massdriver.js',
        'engine/payloads.js',
        'engine/power.js',
        'engine/run.js',
        'engine/assembler.js',
        'engine/blast.js',
        'engine/cargo.js',
        'engine/units.js',
    ];

    /**
     * What survives the pass, as opposed to what computes it.
     *
     * `tools/ingest.mjs` decides which of the analysis's fields reach a column, and a
     * figure the engine produced but the pass dropped is a figure nobody has. It cost two
     * evenings to learn that: `potentialPerMinute` was computed for every schematic and
     * kept for none, the version never moved because only `public/forge` was hashed, so
     * fifteen thousand rows read as current while the item ceiling did not exist in any of
     * them. Relative to the repository root, not to `public/forge`.
     */
    private const PIPELINE = [
        'tools/ingest.mjs',
    ];

    /* The list has to be walked against the directory when a file is added, and it was not:
       `assembler.js`, `blast.js`, `cargo.js` and `units.js` sat outside it for four commits.
       A missing file is the silent failure this class exists to prevent - the version stays
       the same while the answers change, so every stored figure reads as current and none of
       them is. `EngineVersionTest` now fails if a source appears in `public/forge/engine`
       without appearing here. */

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

        $files = [];
        foreach (self::SOURCES as $file) {
            $files[$file] = public_path("forge/{$file}");
        }
        foreach (self::PIPELINE as $file) {
            $files[$file] = dirname(base_path()).DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $file);
        }

        foreach ($files as $file => $path) {
            // The name goes in as well as the contents, so that renaming a file, or losing
            // one, changes the version. A missing source hashes as absent rather than
            // being skipped: an engine with a file gone is not the engine that ran before.
            hash_update($digest, $file);
            hash_update($digest, is_file($path) ? (string) md5_file($path) : 'absent');
        }

        return substr(hash_final($digest), 0, self::WIDTH);
    }
}
