<?php

use App\Models\Schematic;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * Searching for a schematic by a block it contains.
 *
 * "Show me what people build with a thorium reactor" is the question a player actually
 * asks, and the site had no way to answer it: `schematic_blocks` was empty across all
 * 15 533 rows, for want of an inventory in the analysis.
 *
 * The name searched for is checked against the catalogue rather than taken at face value. A
 * `LIKE` over free text would have returned a plausible and wrong list for a typo, which is
 * the kind of error this repository spends its days closing.
 */

function batie(string $name, array $held): Schematic
{
    return Schematic::factory()->create([
        'name' => $name, 'visibility' => 'public', 'blocks' => array_sum($held),
        'analysis' => ['held' => $held],
    ]);
}

it('returns only the ones that contain the block asked for', function () {
    batie('Ferme a thorium', ['thorium-reactor' => 4, 'conveyor' => 30]);
    batie('Presse a graphite', ['graphite-press' => 2, 'conveyor' => 12]);

    $page = $this->get('/schemas?bloc=thorium-reactor')->assertOk();

    $page->assertSee('Ferme a thorium');
    $page->assertDontSee('Presse a graphite');
});

it('says which block is filtering, and offers to remove the filter', function () {
    batie('Ferme a thorium', ['thorium-reactor' => 4]);

    $page = $this->get('/schemas?bloc=thorium-reactor')->assertOk();

    $page->assertSee('Uniquement ceux qui contiennent');
    $page->assertSee('Enlever ce filtre');
});

it('says an unknown name filters nothing rather than returning everything', function () {
    /* A typo that returns the whole list is a plausible and wrong page: the reader believes
       they searched and searched for nothing. */
    batie('Ferme a thorium', ['thorium-reactor' => 4]);

    $page = $this->get('/schemas?bloc=reacteur-au-thorium')->assertOk();

    // Without the apostrophe: Blade escapes it into `&#039;`, and the assertion would look
    // for it as written.
    $page->assertSee('est pas un bloc du jeu');
    $page->assertSee('Ferme a thorium');
});

it('offers names that really exist in the catalogue', function () {
    batie('Ferme a thorium', ['thorium-reactor' => 4, 'conveyor' => 30]);

    $page = $this->get('/schemas')->assertOk();

    $page->assertSee('<option value="thorium-reactor"></option>', escape: false);
    $page->assertSee('<option value="conveyor"></option>', escape: false);
});

it('combines with setting the creative ones apart', function () {
    /* The two filters are independent and have to stay that way: searching for a conveyor
       must not bring the sandboxes back in on the side. */
    batie('Usine normale', ['conveyor' => 30]);
    batie('Bac a sable', ['conveyor' => 30, 'power-source' => 1]);

    $this->get('/schemas?bloc=conveyor')->assertOk()
        ->assertSee('Usine normale')
        ->assertDontSee('Bac a sable');

    $this->get('/schemas?bloc=conveyor&creatif=oui')->assertOk()
        ->assertSee('Usine normale')
        ->assertSee('Bac a sable');
});
