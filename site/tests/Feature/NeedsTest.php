<?php

use App\Models\Schematic;
use App\Models\SchematicItem;
use App\Support\Vitrine;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * Searching by what a schematic needs, which is the site's own question asked backwards.
 *
 * "What makes graphite" is a shopping list. "What eats coal" is the answer to "my mine is
 * running, what can I build now", and that is how a player picks their next factory. The
 * column that answered it had been asleep since the first day: `schematics.needs` was written
 * by the analysis and read by nobody.
 */

function reclame(string $name, array $needs, int $blocks = 20): Schematic
{
    return Schematic::factory()->create([
        'name' => $name,
        'visibility' => Schematic::PUBLIC,
        'width' => 10, 'height' => 10, 'blocks' => $blocks,
        'needs' => $needs,
    ]);
}

it('indexes what a schematic needs from outside', function () {
    $kept = reclame('Fonderie', ['sand' => 120.0, 'coal' => 60.0]);

    $rows = $kept->items()->where('sens', SchematicItem::CONSOMME)->get();

    expect($rows)->toHaveCount(2)
        ->and($rows->firstWhere('item', 'sand')->rate)->toBe(120.0)
        // Stored as a ceiling, because that is what it is: the appetite of a schematic
        // running at full tilt, never a measurement. Mixing the two kinds is the fault this
        // repository defeated on the production side, and it would be just as silent here.
        ->and($rows->firstWhere('item', 'sand')->kind)->toBe(SchematicItem::PLAFOND);
});

/*
 * A need and a production are not the same thing.
 *
 * Without this test, a filter that forgot `sens` would return the silicon factories when the
 * search is for what EATS silicon. The result would look like a result: plenty of schematics,
 * all of them about silicon, all of them wrong.
 */
it('never confuses what it eats with what it makes', function () {
    $mangeur = reclame('Mangeur', ['silicon' => 90.0]);
    $faiseur = Schematic::factory()->create([
        'name' => 'Faiseur', 'visibility' => Schematic::PUBLIC,
        'width' => 10, 'height' => 10, 'blocks' => 20,
        'analysis' => ['potentialPerMinute' => ['silicon' => 90.0]],
    ]);

    $this->get('/schemas?consomme=silicon')
        ->assertOk()
        ->assertSee('Mangeur')
        ->assertDontSee('Faiseur');

    // And the twin, without which the test above would go green on a broken page.
    $this->get('/schemas?produit=silicon')
        ->assertOk()
        ->assertSee('Faiseur')
        ->assertDontSee('Mangeur');

    expect($faiseur->fresh()->items()->where('sens', SchematicItem::CONSOMME)->count())->toBe(0);
});

it('keeps only the ones that need the thing asked for', function () {
    reclame('Au charbon', ['coal' => 60.0]);
    reclame('Au sable', ['sand' => 60.0]);

    $this->get('/schemas?consomme=coal')
        ->assertOk()
        ->assertSee('Au charbon')
        ->assertDontSee('Au sable');
});

/*
 * Category keys stay out.
 *
 * A generator that burns "anything" names no resource and comes out under `*combustible`.
 * Knowing whether coal covers that hunger takes the `accepts` list the game keeps per block
 * and the browser already reads; resolving it a second time here would be the duplication
 * this repository refuses. And a name no player can type is not a filter.
 */
it('does not index a category as if it were a resource', function () {
    $kept = reclame('Bruleur', ['*combustible' => 30.0, 'water' => 10.0]);

    $names = $kept->items()->where('sens', SchematicItem::CONSOMME)->pluck('item')->all();

    expect($names)->toBe(['water']);
});

it('ignores a need the catalogue asks for nowhere', function () {
    reclame('Visible', ['coal' => 60.0]);

    // A name outside what is on offer filters nothing rather than emptying the page: an
    // empty list would read as an empty catalogue and not as a name that does not exist.
    $this->get('/schemas?consomme=surge-alloy')->assertOk()->assertSee('Visible');
});

it('offers what the catalogue actually needs', function () {
    reclame('Un', ['coal' => 60.0]);
    reclame('Deux', ['coal' => 30.0]);
    reclame('Trois', ['sand' => 30.0]);

    expect(Vitrine::eatsOnOffer())->toBe(['coal', 'sand']);
});

it('erases a need that vanished from the analysis', function () {
    $kept = reclame('Change', ['coal' => 60.0]);

    $kept->update(['needs' => ['sand' => 60.0]]);

    expect($kept->fresh()->items()->where('sens', SchematicItem::CONSOMME)->pluck('item')->all())
        ->toBe(['sand']);
});

it('combines what it eats with what it gives back', function () {
    Schematic::factory()->create([
        'name' => 'Celui qui repond', 'visibility' => Schematic::PUBLIC,
        'width' => 10, 'height' => 10, 'blocks' => 20,
        'needs' => ['coal' => 60.0],
        'analysis' => ['potentialPerMinute' => ['graphite' => 90.0]],
    ]);
    reclame('Mange sans rendre', ['coal' => 60.0]);

    $this->get('/schemas?produit=graphite&consomme=coal')
        ->assertOk()
        ->assertSee('Celui qui repond')
        ->assertDontSee('Mange sans rendre');
});
