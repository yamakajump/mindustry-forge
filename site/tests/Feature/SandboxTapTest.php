<?php

use App\Models\Schematic;
use App\Models\SchematicItem;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * A sandbox tap is stated, it is not quantified.
 *
 * `power-source` gives 999 999.94 power per second, which is how the game writes "as much
 * as you want". With consumption correctly subtracted, the page showed 479 999 971 in
 * green, presented as what was left for the rest of the base. The arithmetic was right;
 * the sentence was wrong.
 *
 * One thousand two hundred and forty-six pages out of fifteen thousand, eight per cent of
 * the catalogue, and they held the top of the "who produces power" ranking with a ceiling
 * no player can match.
 *
 * The block is recognised through `build_visibility`, which the game writes itself, rather
 * than through a list of names typed here: a list would be right until the next version
 * adds a block to the sandbox, and silently wrong after that.
 */

/** An analysis as the browser renders it, with whatever blocks it is given. */
function analyseAvecBlocs(array $names, array $produces = ['silicon' => 90.0]): array
{
    return [
        'width' => 10, 'height' => 10, 'blocks' => count($names),
        'perMinute' => $produces,
        'potentialPerMinute' => $produces,
        'potential' => ['made' => 480_000_000.0, 'spent' => 29.0],
        'needs' => [],
        'detail' => array_map(fn ($name) => ['name' => $name], $names),
    ];
}

it('recognises a sandbox source and names it', function () {
    $kept = Schematic::factory()->imported()->create([
        'blocks' => 3,
        'analysis' => analyseAvecBlocs(['power-source', 'silicon-smelter', 'conveyor']),
    ]);

    expect($kept->fedBySandbox())->toBeTrue();
    expect($kept->sandboxTaps())->toBe(['power-source']);
});

it('does not count a void as a source', function () {
    /* A `power-void` is a sandbox block too, and it swallows instead of pouring: it inflates
       what a schematic appears to *ask for*, which is another sentence on another card, and
       it never puts a schematic at the top of a ranking of producers. */
    $kept = Schematic::factory()->imported()->create([
        'blocks' => 2,
        'analysis' => analyseAvecBlocs(['power-void', 'conveyor']),
    ]);

    expect($kept->fedBySandbox())->toBeFalse();
});

it('indexes nothing as produced when a tap feeds the schematic', function () {
    /* Neither measurement nor ceiling. It is not that the layout is uninteresting: it is
       that what it gives comes from a tap and not from its blocks, so it is not a
       production measurement and is not filed as one. */
    $kept = Schematic::factory()->imported()->create([
        'blocks' => 3,
        'analysis' => analyseAvecBlocs(['power-source', 'silicon-smelter', 'conveyor']),
        // Filled in on purpose: without it, "nothing is indexed" would be true for the
        // wrong reason, and the test would pass the day the rule disappeared.
        'produces' => ['silicon' => 90.0],
        'power_made' => 999_999.94, 'power_used' => 29.0,
    ]);

    $kept->indexWhatItMakes();
    $kept->indexWhatItCouldMake();

    expect($kept->items()->where('sens', SchematicItem::PRODUIT)->count())->toBe(0);
});

it('leaves a real factory alone', function () {
    /* The check that matters: the fix must not empty the catalogue. The same schematic
       without the tap is indexed exactly as before. */
    $kept = Schematic::factory()->imported()->create([
        'blocks' => 3,
        'analysis' => analyseAvecBlocs(['combustion-generator', 'silicon-smelter', 'conveyor']),
        'produces' => ['silicon' => 90.0],
        'power_made' => 60.0, 'power_used' => 30.0,
    ]);

    $kept->indexWhatItMakes();

    expect($kept->fedBySandbox())->toBeFalse();
    expect($kept->items()
        ->where('sens', SchematicItem::PRODUIT)
        ->where('kind', SchematicItem::MESURE)
        ->pluck('rate', 'item')->all())
        ->toHaveKey('silicon');
});

it('does not quote the figure in the catalogue either', function () {
    /* The thumbnail and the `description` tag carry the same figure as the page, shorter
       and seen by more people: a thumbnail announcing 999 971 energie/s is the same wrong
       sentence. */
    Schematic::factory()->imported()->create([
        'name' => 'Banc a robinet', 'blocks' => 3, 'visibility' => 'public',
        'analysis' => analyseAvecBlocs(['power-source', 'silicon-smelter', 'conveyor']),
        'produces' => ['silicon' => 90.0],
        'power_made' => 999_999.94, 'power_used' => 29.0,
    ]);

    /* The creative view asked for explicitly: a schematic holding a sandbox block has since
       been set apart from the default listing, and that is another rule. The one tested
       here is that the thumbnail, when it does show, does not quote the figure. */
    $liste = $this->get('/schemas?creatif=oui');

    $liste->assertOk();
    $liste->assertSee('Banc a robinet');
    $liste->assertSee('source de bac a sable');
    $liste->assertDontSee('999 971 energie/s');
});

it('states the tap on the page instead of quoting its value', function () {
    $kept = Schematic::factory()->imported()->create([
        'blocks' => 3, 'visibility' => 'public',
        'analysis' => analyseAvecBlocs(['power-source', 'silicon-smelter', 'conveyor']),
        'power_made' => 999_999.94, 'power_used' => 29.0,
    ]);

    $page = $this->get("/s/{$kept->slug}");

    $page->assertOk();
    $page->assertSee('Alimenté par une source de bac a sable');
    $page->assertSee('power-source');
    // The figure that started all this, in both forms the page can give it.
    $page->assertDontSee('479 999');
    $page->assertDontSee('999 999');
    // The form that travels furthest: what social networks and search engines read.
    $page->assertSee('content="source de bac a sable - 3 blocs"', false);
});
