<?php

use App\Services\BlockCatalogue;
use App\Support\Block;

/**
 * The PHP copy of the game's arithmetic must answer exactly what the engine answers.
 *
 * This repository has one rule above the others: one implementation of the analysis, in
 * `analyse.js`, because a second one in another language is a second thing to have wrong.
 * `Block::craftsPerSecond()` is a deliberate exception of one line, since a Blade page
 * cannot call a browser module, and an exception is only acceptable while it cannot drift.
 *
 * So this runs the real thing. Node reads `analyse.js`, lifts the current definition out of
 * it, applies it to every block in the catalogue, and PHP checks it agrees on all of them.
 * The day somebody corrects the formula for a boost or a warmup, this fails on the same
 * commit instead of the wiki quietly printing last month's number.
 *
 * The whole catalogue, never a sample: a sample is what lets through the one block whose
 * shape is unusual, which is the only block this test would ever have caught.
 */
it('donne exactement les memes debits que le moteur', function () {
    $script = base_path('tests/Fixtures/craft-rates.mjs');
    $engine = public_path('forge/analyse.js');
    $catalogue = public_path('forge/blocks.json');

    $command = sprintf(
        'node %s %s %s',
        escapeshellarg($script),
        escapeshellarg($engine),
        escapeshellarg($catalogue),
    );

    $output = [];
    $status = 0;
    exec($command.' 2>&1', $output, $status);
    $printed = implode("\n", $output);

    // Not skipped when node is missing. A guard that quietly stops running is worse than no
    // guard, because the reason it exists is that nobody would otherwise notice.
    expect($status)->toBe(0, "le moteur n'a pas pu etre execute :\n".$printed);

    $fromEngine = json_decode($printed, true);
    expect($fromEngine)->toBeArray()->not->toBeEmpty();

    $disagreements = [];
    foreach ((array) (BlockCatalogue::raw()['blocks'] ?? []) as $name => $data) {
        $php = (new Block($name, $data))->craftsPerSecond();
        $js = (float) ($fromEngine[$name] ?? 0);

        // Floats, so compared on a tolerance rather than on identity. A millionth is far
        // below anything a page rounds to and far above the noise of two languages parsing
        // the same decimal.
        if (abs($php - $js) > 1e-9) {
            $disagreements[$name] = ['php' => $php, 'js' => $js];
        }
    }

    expect($disagreements)->toBe([], 'Block::craftsPerSecond a diverge de analyse.js');
})->group('engine');

/**
 * The units of `range` have to stay classified, block by block.
 *
 * The catalogue stores `range` in tiles for some blocks and in world units for others, says
 * which nowhere, and the value alone cannot settle it. `Block::RANGE_IN_TILES` is a stopgap
 * list, and a stopgap that nobody is told about becomes a fact somebody trusts.
 *
 * So this fails the moment a block carrying `range` belongs to a subclass neither list
 * knows. That covers the two ways this goes wrong: a new block arriving in a game update,
 * and somebody fixing `DumpBlocks.java` to emit one unit, which would silently make every
 * turret range on the site eight times too small.
 */
it('sait dans quelle unite chaque portee est stockee', function () {
    $inTiles = (new ReflectionClass(Block::class))->getConstant('RANGE_IN_TILES');

    // Everything else the catalogue currently stores in world units, at eight to the tile.
    // Pinned rather than inferred, so that an unknown class is a failure and not a guess.
    $inWorldUnits = [
        'MendProjector', 'BuildTurret', 'ShockwaveTower', 'RepairTurret', 'RepairTower',
        'LiquidTurret', 'PowerTurret', 'LaserTurret', 'ContinuousTurret',
        'ContinuousLiquidTurret', 'TractorBeamTurret', 'PointDefenseTurret', 'ItemTurret',
    ];

    $unclassified = [];
    foreach (BlockCatalogue::all() as $name => $block) {
        if ($block->get('range') === null) {
            continue;
        }
        $kind = $block->kind();
        if (! in_array($kind, $inTiles, true) && ! in_array($kind, $inWorldUnits, true)) {
            $unclassified[$name] = $kind;
        }
    }

    expect($unclassified)->toBe([], 'une sous-classe porte une portee sans unite connue');
});

/**
 * A few ranges checked against the game, so the classification is not merely self-consistent.
 *
 * These four were read off the game's own block cards. If the dumper is ever corrected to
 * emit one unit, these move and somebody has to look, which is the whole point.
 */
it('convertit les portees dans la bonne unite', function () {
    expect(BlockCatalogue::find('wave')->rangeInTiles())->toBe(13.75)
        ->and(BlockCatalogue::find('mender')->rangeInTiles())->toBe(5.0)
        ->and(BlockCatalogue::find('bridge-conveyor')->rangeInTiles())->toBe(4.0)
        ->and(BlockCatalogue::find('overdrive-projector')->rangeInTiles())->toBe(10.0);
});

/**
 * `consumes_power` is not what it sounds like and must never be read.
 *
 * The graphite press is a mechanical block with no `power` field, and the flag is true on
 * it: the game sets it from whether the block could have a power consumer. A page trusting
 * it would announce that a dozen blocks consume zero electricity per second.
 */
it('ne se fie pas au drapeau consumes_power', function () {
    $press = BlockCatalogue::find('graphite-press');

    expect($press->get('consumes_power'))->toBeTrue()
        ->and($press->powerIn())->toBeNull();

    expect(BlockCatalogue::find('silicon-smelter')->powerIn())->toBe(30.0);
});

/**
 * A generator's page prints the card's figure, which is not the field the solver reads.
 *
 * `power_out` has already been divided by the ground a block expects to stand on, and
 * `power_production` has not. The solver wants the raw one because it multiplies by the
 * ground itself; a block card wants the printed one. Getting these the wrong way round on
 * a vent condenser would be a page describing a block nobody can build.
 */
it('annonce l energie produite comme la carte du jeu', function () {
    expect(BlockCatalogue::find('thermal-generator')->powerOut())->toBe(108.0);

    $condenser = BlockCatalogue::find('vent-condenser');
    if ($condenser !== null && $condenser->get('power_out') !== null) {
        expect($condenser->powerOut())->toBe((float) $condenser->get('power_out'));
    }
});
