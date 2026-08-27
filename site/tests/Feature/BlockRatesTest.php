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
it('donne exactement les memes chiffres que le moteur', function () {
    $command = sprintf(
        'node %s %s %s %s',
        escapeshellarg(base_path('tests/Fixtures/engine-figures.mjs')),
        escapeshellarg(public_path('forge/analyse.js')),
        escapeshellarg(public_path('forge/blocks.json')),
        escapeshellarg(public_path('forge/ground.js')),
    );

    $output = [];
    $status = 0;
    exec($command.' 2>&1', $output, $status);
    $printed = implode('
', $output);

    // Not skipped when node is missing. A guard that quietly stops running is worse than no
    // guard, because the reason it exists is that nobody would otherwise notice.
    expect($status)->toBe(0, "le moteur n'a pas pu etre execute :
".$printed);

    $engine = json_decode($printed, true);
    expect($engine)->toBeArray()
        ->and($engine['rates'] ?? null)->toBeArray()->not->toBeEmpty()
        ->and($engine['drills'] ?? null)->toBeArray()->not->toBeEmpty();

    $items = BlockCatalogue::items();
    $disagreements = [];

    foreach ((array) (BlockCatalogue::raw()['blocks'] ?? []) as $name => $data) {
        $block = new Block($name, $data);

        // Floats, so compared on a tolerance rather than on identity. A billionth is far
        // below anything a page rounds to and far above the noise of two languages parsing
        // the same decimal.
        $php = $block->craftsPerSecond();
        $js = (float) ($engine['rates'][$name] ?? 0);
        if (abs($php - $js) > 1e-9) {
            $disagreements["{$name} craftsPerSecond"] = ['php' => $php, 'js' => $js];
        }

        foreach ((array) ($engine['drills'][$name] ?? []) as $item => $jsTicks) {
            $phpTicks = $block->drillTicksFor($item, (int) ($items[$item]['hardness'] ?? 0));
            if (abs($phpTicks - (float) $jsTicks) > 1e-9) {
                $disagreements["{$name} drill {$item}"] = ['php' => $phpTicks, 'js' => $jsTicks];
            }
        }
    }

    expect($disagreements)->toBe([], 'Block a diverge du moteur');
})->group('engine');

/**
 * The hardness term is the whole point of asking the engine rather than reading a field.
 *
 * A mechanical drill takes 600 ticks on sand and 750 on titanium, because hardness costs it
 * fifty ticks a point. The page printed the bare `drill_time` before this, so it was right
 * on sand and understated every other ore on every drill in the game.
 *
 * Burst drills are the counter-case that makes it worth a test of its own: their class sets
 * `hardnessDrillMultiplier` to zero, so hardness costs them nothing, and they halve their
 * time on beryllium. A single formula would be wrong for one family or the other.
 */
it('compte la durete du minerai, sauf la ou le jeu ne la compte pas', function () {
    $mechanical = BlockCatalogue::find('mechanical-drill');

    expect($mechanical->drillTicksFor('sand', 0))->toBe(600.0)
        ->and($mechanical->drillTicksFor('copper', 1))->toBe(650.0)
        ->and($mechanical->drillTicksFor('titanium', 3))->toBe(750.0);

    // Too hard for a tier two drill, whatever the arithmetic says it would cost.
    expect($mechanical->canDrill('titanium', 3))->toBeFalse()
        ->and($mechanical->canDrill('copper', 1))->toBeTrue();

    $impact = BlockCatalogue::find('impact-drill');

    // No hardness term, and half the time on beryllium.
    expect($impact->drillTicksFor('tungsten', 5))->toBe(720.0)
        ->and($impact->drillTicksFor('beryllium', 3))->toBe(360.0);

    // Refused outright, even though thorium is within its tier.
    expect($impact->blockedItems())->toContain('thorium')
        ->and($impact->canDrill('thorium', 4))->toBeFalse();
});

/**
 * The ranges the page prints, pinned against the game.
 *
 * These four were read off the game's own block cards and have not moved through the one
 * change that could have moved them. They were pinned while this class divided turret
 * ranges by eight and the catalogue stored them in world units; the dumper now stores tiles
 * and the division is gone, and the same four numbers come out. Two independent paths
 * landing on the same figure is the only real evidence that neither is wrong.
 *
 * They stay for the next such change, whichever direction it comes from.
 */
it('donne les portees en cases', function () {
    expect(BlockCatalogue::find('wave')->rangeInTiles())->toBe(13.75)
        ->and(BlockCatalogue::find('mender')->rangeInTiles())->toBe(5.0)
        ->and(BlockCatalogue::find('bridge-conveyor')->rangeInTiles())->toBe(4.0)
        ->and(BlockCatalogue::find('overdrive-projector')->rangeInTiles())->toBe(10.0);
});

/**
 * The ammunition turrets used to have no range at all, and the page had a hole there.
 *
 * Seventeen of the twenty-eight visible turrets carried no `range` field: the dumper's
 * `ItemTurret` branch returned before the one that writes it. It was invisible precisely
 * because a missing field prints nothing rather than something wrong, which is the failure
 * mode this repository keeps finding. They are pinned here so the hole cannot reopen.
 */
it('donne une portee a toutes les tourelles', function () {
    $turrets = array_filter(
        BlockCatalogue::all(),
        fn ($block) => $block->category() === 'turret',
    );

    $mute = array_keys(array_filter($turrets, fn ($block) => $block->rangeInTiles() === null));

    expect($mute)->toBe([]);
    expect(BlockCatalogue::find('duo')->rangeInTiles())->toBe(20.0)
        ->and(BlockCatalogue::find('salvo')->rangeInTiles())->toBe(23.75);
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
