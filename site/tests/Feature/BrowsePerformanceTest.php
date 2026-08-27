<?php

use App\Models\Schematic;
use App\Models\SchematicItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

/**
 * What the listing ranks on, and what it costs to answer.
 *
 * Two separate problems met on this page, and one of them was hiding the other.
 *
 * The cost: over fifteen thousand rows a single view spent 141 ms reading the `produces`
 * blob of every public schematic to fill a dropdown of twenty, and its default sort was an
 * expression no index could serve. Both are gone now that what a schematic makes is a row
 * in `schematic_items` rather than a key in a blob.
 *
 * The meaning: that default sort ranked on net power, so every factory that consumes
 * electricity scored below zero and sorted beneath an empty schematic. Electricity is
 * something a base already has. It is a prerequisite the page states, never a debt held
 * against a schematic, and these tests are what keep it that way.
 */
function ligne(string $name, array $makes, float $powerUsed = 0, float $powerMade = 0, int $blocks = 40): Schematic
{
    return Schematic::factory()->create([
        'visibility' => 'public', 'name' => $name, 'produces' => $makes,
        'power_used' => $powerUsed, 'power_made' => $powerMade, 'blocks' => $blocks,
    ]);
}

it('ne penalise pas une usine parce qu elle consomme du courant', function () {
    /*
     * The bug this whole design turns on. Ranking on `power_made - power_used` meant a
     * silicon smelter, which eats power and makes none, scored negative, so it sorted
     * below a schematic containing nothing at all. The default view of a site whose pitch
     * is "search by what it makes" showed reactors and empty plates.
     */
    ligne('Four a silicium', ['silicon' => 90.0], powerUsed: 600);
    ligne('Presse a graphite', ['graphite' => 30.0]);
    Schematic::factory()->create(['visibility' => 'public', 'name' => 'Plaque vide', 'blocks' => 40]);

    $page = $this->get('/schematiques?produit=silicon&tri=best')->assertOk();

    $page->assertSee('Four a silicium')
        ->assertDontSee('Plaque vide')
        ->assertDontSee('Presse a graphite');
});

it('classe sur ce qui sort, rapporte a la place occupee', function () {
    ligne('Grosse et molle', ['graphite' => 100.0], blocks: 200);
    ligne('Petite et vive', ['graphite' => 60.0], blocks: 10);

    $page = $this->get('/schematiques?produit=graphite&tri=best')->assertOk()->getContent();

    expect(strpos($page, 'Petite et vive'))->toBeLessThan(strpos($page, 'Grosse et molle'));
});

it('traite l energie comme une production, donc comme un item cherchable', function () {
    // A reactor makes energy the way a press makes graphite, so it is found the same way.
    ligne('Reacteur compact', [], powerUsed: 40, powerMade: 900, blocks: 30);
    ligne('Four a silicium', ['silicon' => 90.0], powerUsed: 600);

    $this->get('/schematiques?produit='.SchematicItem::POWER.'&tri=best')
        ->assertOk()
        ->assertSee('Reacteur compact')
        ->assertDontSee('Four a silicium');
});

it('classe une centrale sur ce qu elle laisse, pas sur ce qu elle brule', function () {
    /*
     * A plant making six thousand and burning thirteen hundred on its own pumps hands the
     * base four thousand seven hundred, and that is what somebody comparing two reactors
     * is comparing. This is not the consumption rule in reverse: a factory's power draw
     * still never touches its ranking on graphite. It is that when energy is the product,
     * the product is the surplus.
     */
    $gourmande = ligne('Grosse et gourmande', [], powerUsed: 1300, powerMade: 6000, blocks: 100);
    $sobre = ligne('Petite et sobre', [], powerUsed: 0, powerMade: 5000, blocks: 100);

    expect($gourmande->items()->where('item', SchematicItem::POWER)->value('rate'))->toBe(4700.0)
        ->and($sobre->items()->where('item', SchematicItem::POWER)->value('rate'))->toBe(5000.0);

    $page = $this->get('/schematiques?produit='.SchematicItem::POWER.'&tri=best')
        ->assertOk()->getContent();

    expect(strpos($page, 'Petite et sobre'))->toBeLessThan(strpos($page, 'Grosse et gourmande'));
});

it('ne repertorie pas comme centrale ce qui consomme plus qu il ne produit', function () {
    // A factory with a few solar panels on it is not a power plant, and must not turn up
    // under "produit de l'energie" ahead of something that actually supplies any.
    $usine = ligne('Usine avec panneaux', ['silicon' => 90.0], powerUsed: 600, powerMade: 100);

    expect($usine->items()->pluck('item')->all())->toBe(['silicon']);
});

it('ne pretend pas classer un rendement sans savoir de quoi on parle', function () {
    /*
     * Ranking forty graphite a minute against twenty-five silicon a minute would declare
     * one graphite worth one silicon. It is false, and it would be invisible. So with no
     * item chosen the listing sorts by date and says so.
     */
    ligne('Une schematique', ['graphite' => 40.0]);

    $page = $this->get('/schematiques?tri=best')->assertOk();

    expect($page->viewData('order'))->toBe('new');
    $page->assertSee('Classees par date, faute de mieux');
});

it('dit sur la page qu il faudra l alimenter', function () {
    // The page used to mention power only when there was a surplus, so a silicon line
    // asking for six hundred energy a second said nothing at all about needing any.
    $usine = ligne('Four a silicium', ['silicon' => 90.0], powerUsed: 600);

    $this->get("/s/{$usine->slug}")
        ->assertOk()
        ->assertSee('Il lui faut')
        ->assertSee('electricite')
        ->assertSee('600')
        ->assertSee('il faudra la brancher sur ton reseau', escape: false)
        // And it must be clear this is not held against it.
        ->assertSee('Ce n\'est pas compte contre elle', escape: false);
});

it('dit au contraire ce qu une centrale laisse au reste de la base', function () {
    $centrale = ligne('Reacteur compact', [], powerUsed: 40, powerMade: 900, blocks: 30);

    $this->get("/s/{$centrale->slug}")
        ->assertOk()
        ->assertSee('elle s\'alimente', escape: false)
        ->assertSee('860');
});

it('tient l index de ce qu elle produit a jour a chaque ecriture', function () {
    $schematic = ligne('Chaine', ['graphite' => 40.0], powerMade: 300, blocks: 20);

    expect($schematic->items()->pluck('rate_per_block', 'item')->all())
        ->toBe(['graphite' => 2.0, SchematicItem::POWER => 15.0]);

    // Corrected to make something else: it has to stop turning up under graphite.
    $schematic->update(['produces' => ['silicon' => 10.0], 'power_made' => 0]);

    expect($schematic->items()->pluck('item')->all())->toBe(['silicon']);
});

it('ne relit pas tout le catalogue a chaque affichage de la liste', function () {
    // The 141 ms: filling the dropdown meant pulling every public row's `produces` into
    // PHP and counting keys, on every single view, for twenty entries.
    Schematic::factory()->count(30)->create([
        'visibility' => 'public', 'produces' => ['graphite' => 40.0],
    ]);

    DB::flushQueryLog();
    DB::enableQueryLog();
    $this->get('/schematiques')->assertOk();

    $lourdes = collect(DB::getQueryLog())->pluck('query')
        ->filter(fn ($sql) => str_contains($sql, 'produces') && ! str_contains($sql, 'limit'));

    expect($lourdes->all())->toBeEmpty();
});

it('propose les items reellement produits, l energie comprise', function () {
    ligne('Chaine a graphite', ['graphite' => 40.0]);
    ligne('Reacteur', [], powerMade: 900);
    Schematic::factory()->create(['visibility' => 'private', 'produces' => ['thorium' => 5.0]]);

    $page = $this->get('/schematiques')->assertOk();

    expect($page->viewData('items'))->toContain('graphite', SchematicItem::POWER)
        // Nothing private leaks into the dropdown.
        ->and($page->viewData('items'))->not->toContain('thorium');
});

it('ne construit pas une requete avec ce que le visiteur tape', function () {
    ligne('Presse a graphite', ['graphite' => 40.0]);

    foreach (["graphite' or '1'='1", str_repeat('x', 300), 'GRAPHITE"', '../etc'] as $bidon) {
        $this->get('/schematiques?produit='.urlencode($bidon))
            ->assertOk()
            // Rejected, so the filter falls away and the listing is simply unfiltered.
            ->assertSee('Presse a graphite');
    }
});

it('donne un ordre total, pour que la pagination ne perde rien', function () {
    /*
     * Every sort here has ties, and rows that compare equal come back in whatever order
     * the database found convenient, which it has no reason to repeat between two pages.
     * The result would be a schematic shown twice while another is never shown at all.
     */
    Schematic::factory()->count(50)->create([
        'visibility' => 'public', 'produces' => ['graphite' => 40.0], 'blocks' => 10,
    ]);

    $vus = [];
    foreach (range(1, 3) as $page) {
        foreach ($this->get("/schematiques?produit=graphite&tri=best&page={$page}")
            ->assertOk()->viewData('schematics')->items() as $row) {
            $vus[] = $row->id;
        }
    }

    expect($vus)->toHaveCount(50)
        ->and(array_unique($vus))->toHaveCount(50);
});
