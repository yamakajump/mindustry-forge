<?php

use App\Models\Schematic;
use App\Models\SchematicItem;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * The constraints of the catalogue: the half of this repository's promise that could not
 * be typed in.
 *
 * "A hundred graphite a minute under thirty blocks" is the sentence this repository opens
 * with, and until this file none of its three clauses could be expressed: not a minimum
 * rate, not a footprint, not a block count.
 *
 * What is tested here is not that a number is right. It is that a right number answers the
 * question that was asked, which no test of a value checks. Hence the strict footprint
 * below, which is where this file earns its existence.
 */

/** A published schematic that really makes something, with both of its rates indexed. */
function schemaQuiProduit(
    string $name,
    int $width,
    int $height,
    int $blocks,
    float $rate,
    string $item = 'silicon',
    array $extra = [],
): Schematic {
    $schematic = Schematic::factory()->imported()->create(array_merge([
        'name' => $name,
        'visibility' => Schematic::PUBLIC,
        'width' => $width,
        'height' => $height,
        'blocks' => $blocks,
    ], $extra));

    SchematicItem::create([
        'schematic_id' => $schematic->id,
        'item' => $item,
        'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::PLAFOND,
        'rate' => $rate,
        'rate_per_block' => $rate / max(1, $blocks),
        'rate_per_tile' => $rate / max(1, $width * $height),
    ]);

    return $schematic;
}

/*
 * The footprint, and the fact that it does not swap the two sides.
 *
 * This is the test that matters most in this file, because the wrong version would have
 * been exact: a 20 by 15 schematic does fit in a 15 by 20 hole, if you are allowed to turn
 * it. You are not. Checked in the game jar rather than on a wiki: `Binding` exposes only
 * `schematicFlipX` and `schematicFlipY`, no rotation, and `Schematics.rotate()` is called
 * only by `BaseBuilderAI` and `BaseGenerator`, which build the enemy bases. A mirror does
 * not change a footprint.
 *
 * Without this test, a well meaning `orWhere` would pass review: it would return more
 * results, all plausible, and the player would find out by pasting the schematic.
 */
it('does not offer a schematic that would have to be turned to fit', function () {
    schemaQuiProduit('Large', 20, 15, 40, 900);
    schemaQuiProduit('Etroit', 15, 20, 40, 900);

    $page = $this->get('/schemas?produit=silicon&large=15&haut=20');

    $page->assertOk()
        ->assertSee('Etroit')
        ->assertDontSee('Large');
});

it('accepts a schematic exactly the size of the hole', function () {
    schemaQuiProduit('Pile', 16, 16, 40, 900);
    schemaQuiProduit('Un de trop', 17, 16, 40, 900);

    $this->get('/schemas?produit=silicon&large=16&haut=16')
        ->assertSee('Pile')
        ->assertDontSee('Un de trop');
});

it('bounds one side without requiring the other', function () {
    schemaQuiProduit('Long et fin', 30, 4, 20, 900);
    schemaQuiProduit('Trop haut', 30, 12, 20, 900);

    $this->get('/schemas?produit=silicon&haut=5')
        ->assertSee('Long et fin')
        ->assertDontSee('Trop haut');
});

it('ignores a footprint that is not a number rather than emptying the page', function () {
    schemaQuiProduit('Visible', 10, 10, 20, 900);

    $this->get('/schemas?produit=silicon&large=beaucoup')->assertSee('Visible');
});

/*
 * The minimum rate, which means nothing until the item is chosen.
 *
 * With no item, `schematic_items` is not joined: a floor on `rate` would then filter on
 * whichever row the database found convenient, which is a wrong result that looks like a
 * result.
 */
it('keeps only what puts out at least the rate asked for', function () {
    schemaQuiProduit('Gros', 10, 10, 30, 1200);
    schemaQuiProduit('Petit', 10, 10, 30, 300);

    /* The field is per second and the column is not: 1 200 a minute is 20 a second, 300 is
       5, and a floor of 10 keeps the first and drops the second. The site states per second
       everywhere now, so that is what somebody types; `BrowseController` converts before
       comparing. */
    $this->get('/schemas?produit=silicon&min=10')
        ->assertSee('Gros')
        ->assertDontSee('Petit');
});

it('does not apply a minimum rate when no item is chosen', function () {
    schemaQuiProduit('Sans objet choisi', 10, 10, 30, 300);

    $this->get('/schemas?min=10')->assertSee('Sans objet choisi');
});

it('bounds the block count', function () {
    schemaQuiProduit('Leger', 10, 10, 18, 900);
    schemaQuiProduit('Lourd', 10, 10, 120, 900);

    $this->get('/schemas?produit=silicon&blocs=30')
        ->assertSee('Leger')
        ->assertDontSee('Lourd');
});

/*
 * Self sufficiency in power, which compares a ceiling against a ceiling.
 *
 * `power_made` and `power_used` both come from `analysis['potential']`. Comparing them is
 * therefore legitimate; comparing either one against a measurement would not be, and that
 * is the mistake this repository spent a day undoing.
 */
it('keeps only what produces at least what it consumes', function () {
    schemaQuiProduit('Autonome', 10, 10, 30, 900, 'silicon',
        ['power_made' => 500.0, 'power_used' => 200.0]);
    schemaQuiProduit('A brancher', 10, 10, 30, 900, 'silicon',
        ['power_made' => 0.0, 'power_used' => 400.0]);

    $this->get('/schemas?produit=silicon&autonome=oui')
        ->assertSee('Autonome')
        ->assertDontSee('A brancher');
});

/*
 * The two worlds, which do not share a build menu.
 *
 * This is not a preference the way the sandbox is: an Erekir schematic cannot be placed on
 * Serpulo, the block is not in the menu. A result that cannot be placed at all is worse
 * than a poorly suited one, because nothing on the tile says so.
 */
it('rules out a schematic built with blocks from the other world', function () {
    // The inventory goes through `analysis['held']`, which saving indexes into
    // `schematic_blocks`. Written the way the rest of the suite writes it rather than
    // inserted by hand: a test that fills the table another way tests a table, not the site.
    schemaQuiProduit('De Serpulo', 10, 10, 20, 900, 'silicon',
        ['analysis' => ['held' => ['graphite-press' => 4, 'conveyor' => 16]]]);
    schemaQuiProduit('D Erekir', 10, 10, 20, 900, 'silicon',
        ['analysis' => ['held' => ['silicon-arc-furnace' => 4, 'duct' => 16]]]);

    $this->get('/schemas?produit=silicon&planete=serpulo')
        ->assertSee('De Serpulo')
        ->assertDontSee('D Erekir');
});

it('ignores an unknown planet name rather than ruling everything out', function () {
    schemaQuiProduit('Toujours la', 10, 10, 20, 900);

    $this->get('/schemas?produit=silicon&planete=mars')->assertSee('Toujours la');
});

/*
 * Sorting by ground taken, and the fact that it is not a duplicate of sorting by block.
 *
 * Two schematics that put out the same rate: one spread out with few blocks, the other
 * dense. The first wins per block placed, the second wins per tile taken. If both orders
 * returned the same first row, the new sort would be useless and this test would say so.
 */
it('ranks differently by ground taken than by block placed', function () {
    // 900/min over 400 tiles and 20 blocks: 45 per block, 2.25 per tile.
    schemaQuiProduit('Etale', 20, 20, 20, 900);
    // 900/min over 100 tiles and 45 blocks: 20 per block, 9 per tile.
    schemaQuiProduit('Dense', 10, 10, 45, 900);

    /* Looks in the grid only, and not in the whole page.
     *
     * The banner of verdicts names the winners above the tiles, so the first occurrence of
     * a name in the HTML is no longer its tile. The test said "Dense comes before Etale"
     * and was in fact measuring the position of a name in a summary sentence: an exact test
     * that checked something other than what it announces. */
    $grille = function (string $url) {
        $html = $this->get($url)->content();

        return substr($html, strpos($html, '<div class="grid">'));
    };

    $auBloc = $grille('/schemas?produit=silicon&tri=best');
    $auSol = $grille('/schemas?produit=silicon&tri=dense');

    expect(strpos($auBloc, 'Etale'))->toBeLessThan(strpos($auBloc, 'Dense'))
        ->and(strpos($auSol, 'Dense'))->toBeLessThan(strpos($auSol, 'Etale'));
});

it('falls back to the date when sorting by ground with no item chosen', function () {
    schemaQuiProduit('Peu importe', 10, 10, 20, 900);

    // The sort compares outputs: with no item, ranking forty graphite against twenty-five
    // silicon would amount to declaring an exchange rate between the two.
    $this->get('/schemas?tri=dense')
        ->assertOk()
        ->assertSee('Les plus récents', false);
});

/** The column is filled on save, otherwise the sort ranks fifteen thousand zeroes. */
it('fills the rate per tile when the ceiling is indexed', function () {
    $schematic = Schematic::factory()->imported()->create([
        'width' => 10, 'height' => 5, 'blocks' => 25,
        'analysis' => ['potentialPerMinute' => ['silicon' => 100.0]],
    ]);

    $schematic->indexWhatItCouldMake();

    $row = $schematic->items()->where('kind', SchematicItem::PLAFOND)->first();

    // 100 over 50 tiles, against 100 over 25 blocks. The two columns really do say two
    // different things about the same schematic.
    expect($row->rate_per_tile)->toBe(2.0)
        ->and($row->rate_per_block)->toBe(4.0);
});

/*
 * The constraints combine, which is the only point of having several.
 *
 * This is the sentence of the README made typable: a rate, a footprint, a block budget.
 */
it('combines the rate, the footprint and the block count', function () {
    schemaQuiProduit('Celui qui repond', 12, 12, 25, 1500);
    schemaQuiProduit('Trop gros', 20, 20, 25, 1500);
    schemaQuiProduit('Trop faible', 12, 12, 25, 200);
    schemaQuiProduit('Trop de blocs', 12, 12, 300, 1500);

    $this->get('/schemas?produit=silicon&min=10&large=14&haut=14&blocs=40')
        ->assertSee('Celui qui repond')
        ->assertDontSee('Trop gros')
        ->assertDontSee('Trop faible')
        ->assertDontSee('Trop de blocs');
});
