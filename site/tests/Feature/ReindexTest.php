<?php

use App\Models\Schematic;
use App\Models\SchematicItem;
use App\Services\EngineVersion;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * A fix that applies to nothing.
 *
 * The sandbox tap is recognised, stated rather than quantified, and taken out of the
 * producer index. All of that is true of the code, and false of the one thousand two
 * hundred and forty-six rows it was written for.
 *
 * `schematic_items` is rebuilt by the `saved` hook, and the only path that saves a row in
 * bulk is `forge:analyser`, which takes only what `stale()` designates. `stale()` compares
 * `engine_version` against the engine hash, and that hash covers JavaScript files and the
 * catalogue only. A fix written entirely in PHP therefore does not change it: the queue
 * stays empty, the rows are never picked up again, and the index keeps what it had.
 *
 * Deploying is not enough either: a deployment changes the code, not the rows already
 * written. These tests hold both halves, the one that works and the one that reaches
 * nobody.
 */

/** An analysis as the browser renders it, with a power tap inside. */
function analyseAvecRobinet(): array
{
    return [
        'width' => 10, 'height' => 10, 'blocks' => 2,
        'perMinute' => ['silicon' => 90.0],
        'potentialPerMinute' => ['silicon' => 90.0],
        'potential' => ['made' => 999_999.94, 'spent' => 29.0],
        'needs' => [],
        'detail' => [['name' => 'power-source'], ['name' => 'battery']],
    ];
}

it('rebuilds the index when the row is saved', function () {
    $one = Schematic::factory()->imported()->create([
        'analysis' => analyseAvecRobinet(),
        'engine_version' => EngineVersion::current(),
    ]);

    // What the old code had written, and what production still carries.
    SchematicItem::create([
        'schematic_id' => $one->id,
        'item' => SchematicItem::POWER,
        'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::MESURE,
        'rate' => 999_970.94,
        'rate_per_block' => 499_985.47,
    ]);

    $one->touch();

    expect($one->items()->where('kind', SchematicItem::MESURE)->count())->toBe(0,
        'a save rebuilds the index and throws out the tap ceiling');
});

it('but nothing ever saves those rows, because the engine has not moved', function () {
    $one = Schematic::factory()->imported()->create([
        'analysis' => analyseAvecRobinet(),
        'engine_version' => EngineVersion::current(),
    ]);

    /* The only bulk path is `forge:analyser`, and it takes only `stale()`. A fix written in
       PHP does not change the engine hash, so this row is not in there, so it will never be
       picked up again and its index will never be rebuilt. */
    expect(Schematic::stale()->pluck('id'))->not->toContain($one->id,
        'if this row went stale, the rest of this test would have no reason to exist');
});

it('so a row already indexed keeps its ceiling, deployment or not', function () {
    $one = Schematic::factory()->imported()->create([
        'analysis' => analyseAvecRobinet(),
        'engine_version' => EngineVersion::current(),
    ]);

    SchematicItem::create([
        'schematic_id' => $one->id,
        'item' => SchematicItem::POWER,
        'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::MESURE,
        'rate' => 999_970.94,
        'rate_per_block' => 499_985.47,
    ]);

    // Nobody touches it: this is exactly what production looks like after a deployment.
    expect(SchematicItem::query()
        ->where('sens', SchematicItem::PRODUIT)
        ->where('kind', SchematicItem::MESURE)
        ->where('rate', '>', 100_000)
        ->count())->toBe(1,
            'the power ranking is still led by a figure no player can match');
});

it('and forge:indexer is what picks it up again', function () {
    $one = Schematic::factory()->imported()->create([
        'analysis' => analyseAvecRobinet(),
        'engine_version' => EngineVersion::current(),
    ]);

    SchematicItem::create([
        'schematic_id' => $one->id,
        'item' => SchematicItem::POWER,
        'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::MESURE,
        'rate' => 999_970.94,
        'rate_per_block' => 499_985.47,
    ]);

    $this->artisan('forge:indexer')->assertSuccessful();

    expect($one->items()->where('kind', SchematicItem::MESURE)->count())->toBe(0,
        'the tap ceiling must have left the producer ranking');
});

it('does not touch a real factory, nor its date', function () {
    /* The test that matters most here. A clean-up pass that empties the catalogue is not a
       fix, and one that lifts fifteen thousand rows to the top of "recently modified" is
       seen by everybody, for work nobody asked for. */
    $real = Schematic::factory()->imported()->create([
        'analysis' => [
            'width' => 10, 'height' => 10, 'blocks' => 2,
            'perMinute' => ['silicon' => 90.0],
            'potentialPerMinute' => ['silicon' => 90.0],
            'potential' => ['made' => 108.0, 'spent' => 29.0],
            'needs' => [],
            'detail' => [['name' => 'silicon-smelter'], ['name' => 'thermal-generator']],
        ],
        'engine_version' => EngineVersion::current(),
    ]);

    $before = $real->fresh()->updated_at;
    $this->artisan('forge:indexer')->assertSuccessful();

    expect($real->items()->where('item', 'silicon')->count())->toBe(1,
        'a real factory stays indexed under what it produces');
    expect($real->fresh()->updated_at->equalTo($before))->toBeTrue(
        'reindexing is not modifying');
});
