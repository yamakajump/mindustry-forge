<?php

use App\Models\Schematic;
use App\Support\Thing;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * A public schematic carrying both figures, as every real one does.
 *
 * The measurement and the ceiling are written from the same analysis, by two passes. A
 * fixture that wrote only one described a schematic that cannot exist, and the listing
 * filters on the ceiling, which is the only figure the imported catalogue has.
 */
function produces(string $name, string $item, float $rate = 100): Schematic
{
    $schematic = Schematic::factory()->create([
        'visibility' => Schematic::PUBLIC, 'name' => $name, 'blocks' => 30,
        'analysis' => ['potentialPerMinute' => [$item => $rate]],
    ]);

    return $schematic;
}

it('names things the way the game names them', function () {
    /* The dropdown showed `blast-compound` and `phase-fabric` to a French-speaking player,
       on a page whose blocks were already named in French: "Pulverisateur" for a block and
       "silicon" for what it produces, side by side. */
    expect(Thing::name('silicon'))->toBe('Silicium')
        ->and(Thing::name('water'))->toBe('Eau')
        ->and(Thing::name('blast-compound'))->toBe('Mélange Explosif')
        ->and(Thing::name('silicon-smelter'))->toBe('Fonderie de Silicium');
});

it('files each thing in the family the icon address expects', function () {
    // Asks the catalogue rather than a list: `items` then `liquids`, everything else is a block.
    expect(Thing::family('silicon'))->toBe('objet')
        ->and(Thing::family('water'))->toBe('liquide')
        ->and(Thing::family('silicon-smelter'))->toBe('bloc');
});

it('offers the items as images, with their French name', function () {
    produces('Fonte', 'silicon');

    $page = $this->get('/schemas')->assertOk();

    /* Links inside a `<details>`, and not a control drawn by hand. That is what made it
       possible to drop the duplicate: the row of pills and the dropdown asked the same
       question twice, and the dropdown only existed because a native `<option>` carries no
       image. A grid of links carries the image and keeps the keyboard, Escape, the screen
       reader announcement and one address per choice, since all of that comes from the
       browser. */
    $page->assertSee('ch-case', false)
        ->assertSee('/icone/objet/silicon.png', false)
        ->assertSee('Silicium');
});

/* The dropdown is gone, and nothing should bring it back unnoticed: two controls for the
   same question is the duplicate this page has just lost. */
it('no longer asks the product question twice', function () {
    produces('Fonte', 'silicon');

    $this->get('/schemas')->assertOk()->assertDontSee('<select name="produit"', false);
});

it('marks the current choice rather than leaving it to be guessed', function () {
    produces('Fonte', 'silicon');

    $this->get('/schemas?produit=silicon')
        ->assertOk()
        ->assertSee('aria-current="page"', false);
});
