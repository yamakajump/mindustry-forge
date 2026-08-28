<?php

use App\Models\Schematic;
use App\Models\SchematicItem;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * A ceiling never comes down into a `mesure` row.
 *
 * `power_made` is filled from `analysis['potential']`, which is the ceiling: what the
 * layout would make fed to the full. Indexed as it stood, that value became a `mesure`
 * row, and the catalogue filters on exactly that kind - with a comment saying that mixing
 * a ceiling into a measurement would be lying without anything saying so.
 *
 * That is what was happening. On POLAR STAR, 110x110 and 2 508 blocks, the same 1 513 826
 * was ranked twice: honestly as a ceiling, falsely as a measurement. **195 rows** in that
 * case, and "the ones that produce the most" ranked on ceilings while believing it ranked
 * on measurements.
 *
 * The row already existed, it is a value that went through it. So each kind now carries
 * the figure that belongs to it: the measurement comes from `analysis['power']`, the
 * ceiling from `analysis['potential']`.
 */

/** A reactor farm with no fuel declared: enormous as a ceiling, zero as a measurement. */
function fermeSansCarburant(): Schematic
{
    return Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'POLAR STAR', 'blocks' => 2508,
        'produces' => [],
        // What the column carries, and it comes from the ceiling.
        'power_made' => 1_950_000.0, 'power_used' => 436_174.0,
        'analysis' => [
            'power' => ['made' => 0, 'spent' => 0],
            'potential' => ['made' => 1_950_000.0, 'spent' => 436_174.0],
        ],
    ]);
}

it('never ranks a ceiling among the measurements', function () {
    $ferme = fermeSansCarburant();
    $ferme->indexWhatItMakes();
    $ferme->indexWhatItCouldMake();

    $mesure = $ferme->items()
        ->where('item', SchematicItem::POWER)->where('kind', SchematicItem::MESURE)->first();
    $plafond = $ferme->items()
        ->where('item', SchematicItem::POWER)->where('kind', SchematicItem::PLAFOND)->first();

    expect($mesure)->toBeNull('nothing runs, so nothing is measured');
    expect((float) $plafond?->rate)->toBe(1_513_826.0, 'and the ceiling says what it is');
});

it('leaves a genuinely fed power plant in the ranking', function () {
    /* The check that matters: the rule must not empty the ranking. A power plant whose
       analysis carries a measurement keeps its row, and that is what the catalogue serves. */
    $vraie = Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Reacteur nourri', 'blocks' => 30,
        'produces' => [],
        'power_made' => 900.0, 'power_used' => 40.0,
        'analysis' => [
            'power' => ['made' => 900.0, 'spent' => 40.0],
            'potential' => ['made' => 900.0, 'spent' => 40.0],
        ],
    ]);
    $vraie->indexWhatItMakes();

    expect((float) $vraie->items()
        ->where('item', SchematicItem::POWER)->where('kind', SchematicItem::MESURE)
        ->value('rate'))->toBe(860.0);
});

it('keeps the fuel-less farm, because a ceiling says what it would make fed', function () {
    /*
     * Ce test l en sortait, du temps ou la vitrine n acceptait que des mesures. Une ferme
     * sans carburant a une mesure nulle et un plafond de neuf cents, et « ce qu elle ferait
     * alimentee » est exactement la question que se pose quelqu un qui cherche une centrale.
     *
     * Le plafond est dit comme tel a cote du chiffre, donc rien n est presente comme une
     * mesure. C etait la seule condition.
     */
    fermeSansCarburant()->indexWhatItMakes();

    // `potential` as much as `power`: the analysis always returns both, and a fixture that
    // wrote only the measurement described a schematic that cannot exist.
    Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Reacteur nourri', 'blocks' => 30,
        'produces' => [],
        'power_made' => 900.0, 'power_used' => 40.0,
        'analysis' => [
            'power' => ['made' => 900.0, 'spent' => 40.0],
            'potential' => ['made' => 900.0, 'spent' => 40.0],
        ],
    ]);

    $page = $this->get('/schemas?produit='.SchematicItem::POWER.'&tri=output')->assertOk();

    $page->assertSee('Reacteur nourri');
    $page->assertSee('POLAR STAR');
});
