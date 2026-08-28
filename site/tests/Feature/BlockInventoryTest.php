<?php

use App\Models\Schematic;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * The block inventory, on the database side.
 *
 * `schematic_blocks` was empty across all 15 533 collected rows. The relation existed, the
 * table existed, `indexWhatItHolds()` was indeed called on save and by `forge:indexer`.
 * What was missing is elsewhere: `countBlocks` read `analysis['detail']`, and `detail` never
 * appeared in the whitelist of `tools/ingest.mjs`.
 *
 * The interactive path did work, because the browser posts the whole report. That is what
 * made the hole invisible from the inside.
 *
 * The analysis now returns `held`, a compact dictionary, and that is what goes through the
 * sieve. `detail` is still read second: an analysis stored before this change has to stay
 * readable.
 */

it('reads the compact inventory', function () {
    $kept = Schematic::factory()->create([
        'blocks' => 4,
        'analysis' => ['held' => ['conveyor' => 3, 'router' => 1]],
    ]);
    $kept->indexWhatItHolds();

    expect($kept->blocksHeld()->pluck('count', 'block')->all())
        ->toBe(['conveyor' => 3, 'router' => 1]);
});

it('falls back to the detail for an analysis stored earlier', function () {
    /* The fallback is not free-floating caution: fifteen thousand stored analyses have no
       `held`, and a page opened before the deployment will still post `detail` alone. */
    $kept = Schematic::factory()->create([
        'blocks' => 3,
        'analysis' => ['detail' => [
            ['name' => 'conveyor'], ['name' => 'conveyor'], ['name' => 'router'],
        ]],
    ]);
    $kept->indexWhatItHolds();

    expect($kept->blocksHeld()->pluck('count', 'block')->all())
        ->toBe(['conveyor' => 2, 'router' => 1]);
});

it('prefers the inventory when both are there', function () {
    /* Both describe the same schematic and `held` is the figure the analysis computed;
       counting both would double the inventory. */
    $kept = Schematic::factory()->create([
        'blocks' => 2,
        'analysis' => [
            'held' => ['conveyor' => 2],
            'detail' => [['name' => 'conveyor'], ['name' => 'conveyor']],
        ],
    ]);
    $kept->indexWhatItHolds();

    expect($kept->blocksHeld()->pluck('count', 'block')->all())->toBe(['conveyor' => 2]);
});

it('defends itself against what a browser can send', function () {
    /* The analysis comes from a browser, and a browser sends whatever it wants. Same rule as
       the rest of `fromAnalysis`: convert and discard, do not trust. */
    $kept = Schematic::factory()->create([
        'blocks' => 1,
        'analysis' => ['held' => [
            'conveyor' => 90000,
            'router' => 0,
            'sorter' => 'beaucoup',
            '' => 4,
        ]],
    ]);
    $kept->indexWhatItHolds();

    expect($kept->blocksHeld()->pluck('count', 'block')->all())
        ->toBe(['conveyor' => 65535]);
});
