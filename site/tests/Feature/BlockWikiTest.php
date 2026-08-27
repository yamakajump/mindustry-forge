<?php

use App\Models\Schematic;
use App\Services\BlockCatalogue;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * The wiki is a rendering of a generated file, so most of what can break is the rendering
 * of a shape the catalogue happens to have and the fixtures do not. These tests assert on
 * block names, identifiers and figures rather than on wording, for two reasons: the page
 * text goes through the translator, and until the multilingual groundwork lands the
 * translator answers with the key. A test that pinned the French would fail today for a
 * reason that has nothing to do with what it is testing.
 */

it('liste les blocs et les groupe par categorie', function () {
    $this->get('/blocs')
        ->assertOk()
        ->assertSee('silicon-smelter')
        ->assertSee('conveyor');
});

it('donne une page a chaque bloc que le jeu propose', function () {
    // The whole catalogue, not a sample. Two hundred and fifty-four renders cost under a
    // second, and a sample is exactly what lets the one block with an odd shape through:
    // the page has to survive a turret with no recipe and a floor with no cost alike.
    $names = array_keys(BlockCatalogue::all());

    expect($names)->toHaveCount(254);

    $broken = [];
    foreach ($names as $name) {
        if ($this->get("/blocs/{$name}")->getStatusCode() !== 200) {
            $broken[] = $name;
        }
    }

    expect($broken)->toBe([]);
});

it('ne donne pas de page a un bloc cache', function () {
    // `air` exists in the game and in the catalogue, and is furniture. A page for it would
    // be a page with nothing on it, so there is none, and asking for one is a miss.
    expect(BlockCatalogue::raw()['blocks']['air'] ?? null)->not->toBeNull();

    $this->get('/blocs/air')->assertNotFound();
});

it('refuse un nom qui ne ressemble pas a un bloc', function () {
    $this->get('/blocs/'.urlencode('../../etc/passwd'))->assertNotFound();
    $this->get('/blocs/Silicon-Smelter')->assertNotFound();
});

it('affiche la recette et le plafond de production', function () {
    // The locale is pinned here rather than left to the environment. `.env` is not
    // versioned, so a machine set to `fr` and a CI set to `en` render different pages, and a
    // test that passes on one and fails on the other is testing the environment instead of
    // the page. Pinned to `fr` because that is the one language shipped.
    app()->setLocale('fr');

    $page = $this->get('/blocs/silicon-smelter')->assertOk();

    // One coal and two sand for one silicon, every forty ticks, which is one and a half a
    // second. The figures are the game's; if any of them moves, the catalogue moved.
    $page->assertSee('silicon-smelter')
        ->assertSee('coal')
        ->assertSee('sand')
        ->assertSee('1,5');

    // Never the bare figure. This is a nominal ceiling and the page has to say so, which is
    // the difference this whole site sells: a measurement is not an estimate.
    $page->assertSee('au mieux');
});

it('dit ou trouver ce que le bloc consomme, y compris au sol', function () {
    $page = $this->get('/blocs/silicon-smelter')->assertOk();

    // Sand is both made in a pulveriser and picked up off the ground, and the ground is
    // what nine players out of ten do. Both have to be on the page: showing only the
    // recipe would hide the common answer behind the rare one.
    //
    // Named, not linked. A floor is hidden, so it has no page of its own, and the page
    // prints it in plain text rather than pointing at a dead link. That is why this looks
    // for the title and not for the `sand-floor` identifier: the identifier only ever
    // appears in an href.
    //
    // The titles are the game's own French, since `Block::title()` reads the bundle the jar
    // carries. They were `Pulverizer` and `Sand floor` here, which was the identifier with
    // its dashes taken out and offered to a French reader.
    $page->assertSee('Pulvérisateur')
        ->assertSee('Sable')
        ->assertDontSee('/blocs/sand-floor');
});

it('lie le bloc aux schematiques publiques qui en contiennent', function () {
    $held = Schematic::factory()->create([
        'visibility' => Schematic::PUBLIC,
        'name' => 'Ligne de silicium',
        'analysis' => ['detail' => [
            ['name' => 'silicon-smelter'], ['name' => 'silicon-smelter'],
            ['name' => 'conveyor'],
        ]],
    ]);

    Schematic::factory()->create([
        'visibility' => Schematic::PUBLIC,
        'name' => 'Mur tout bete',
        'analysis' => ['detail' => [['name' => 'copper-wall']]],
    ]);

    $this->get('/blocs/silicon-smelter')
        ->assertOk()
        ->assertSee('Ligne de silicium')
        ->assertDontSee('Mur tout bete');

    expect($held->blocksHeld()->where('block', 'silicon-smelter')->value('count'))->toBe(2);
});

it('ne montre pas une schematique privee sur la page d un bloc', function () {
    Schematic::factory()->create([
        'visibility' => Schematic::PRIVATE,
        'name' => 'Brouillon secret',
        'analysis' => ['detail' => [['name' => 'silicon-smelter']]],
    ]);

    $this->get('/blocs/silicon-smelter')
        ->assertOk()
        ->assertDontSee('Brouillon secret');
});

it('refait l index quand la schematique change', function () {
    $schematic = Schematic::factory()->create([
        'analysis' => ['detail' => [['name' => 'silicon-smelter']]],
    ]);

    expect($schematic->blocksHeld()->pluck('block')->all())->toBe(['silicon-smelter']);

    // Rebuilt wholesale, so a block it no longer holds cannot linger and keep it listed on
    // a page it does not belong on. This is the failure the index exists to avoid.
    $schematic->update(['analysis' => ['detail' => [['name' => 'graphite-press']]]]);

    expect($schematic->blocksHeld()->pluck('block')->all())->toBe(['graphite-press']);
});

it('ne se laisse pas empoisonner par une analyse envoyee a la main', function () {
    // The analysis arrives from a browser, so it is not to be trusted. A name too long for
    // the column and a payload of the wrong shape both have to land as data, never as a
    // database error on a page somebody is looking at.
    $schematic = Schematic::factory()->create([
        'analysis' => ['detail' => [
            ['name' => str_repeat('a', 200)],
            ['name' => 42],
            ['name' => ''],
            'pas un objet',
            ['pas_de_nom' => true],
        ]],
    ]);

    $rows = $schematic->blocksHeld()->pluck('count', 'block')->all();

    expect($rows)->toHaveCount(1)
        ->and(array_key_first($rows))->toBe(str_repeat('a', 40));
});

it('filtre par categorie et par planete', function () {
    $this->get('/blocs?categorie=crafting')
        ->assertOk()
        ->assertSee('silicon-smelter')
        ->assertDontSee('>duo<', false);

    // A block belonging to neither world stays visible whichever world is asked for: the
    // conveyor is on both, and a player filtering to Erekir still needs to move things.
    $erekir = $this->get('/blocs?planete=erekir')->assertOk();
    $erekir->assertDontSee('>silicon-smelter<', false);

    // A filter value nobody offered falls back to everything rather than to an error page.
    $this->get('/blocs?categorie=nimportequoi&planete=mars')
        ->assertOk()
        ->assertSee('silicon-smelter');
});

it('choisit un monde par defaut plutot que de melanger les deux', function () {
    /* On joue Serpulo ou Erekir, jamais les deux a la fois, et les deux arbres ne partagent
       presque rien : melanges, les 254 blocs mettaient un convoyeur a cote d une gaine
       renforcee, que le meme joueur ne posera jamais dans la meme partie. Mesure sur le
       catalogue : 139 blocs Serpulo, 102 Erekir, 13 communs. */
    $page = $this->get('/blocs')->assertOk();

    $page->assertSee('silicon-smelter')          // Serpulo
        ->assertDontSee('silicon-arc-furnace');  // Erekir

    // Un convoyeur n appartient a aucun des deux mondes, donc il appartient aux deux : le
    // retirer des deux listes le rendrait introuvable partout.
    $page->assertSee('conveyor');
});

it('laisse demander les deux mondes, et dit combien chacun en porte', function () {
    $tout = $this->get('/blocs?planete=tout')->assertOk();

    $tout->assertSee('silicon-smelter')
        ->assertSee('silicon-arc-furnace');

    /* Les comptes a cote de chaque monde. Un choix qui retire une centaine de blocs doit
       annoncer combien il retire, sinon c est un filtre qui se fait passer pour un
       catalogue complet. */
    $tout->assertSee('254')   // les deux
        ->assertSee('152')    // Serpulo, communs compris
        ->assertSee('115');   // Erekir, communs compris
});

it('retombe sur le monde par defaut plutot que de refuser une planete inventee', function () {
    $this->get('/blocs?planete=mars')
        ->assertOk()
        ->assertSee('silicon-smelter')
        ->assertDontSee('silicon-arc-furnace');
});
