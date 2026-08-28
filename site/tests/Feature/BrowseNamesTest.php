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

it('nomme les choses comme le jeu les nomme', function () {
    /* Le deroulant affichait `blast-compound` et `phase-fabric` a un joueur francophone,
       sur une page dont les blocs etaient deja nommes en francais : « Pulverisateur » pour
       un bloc et « silicon » pour ce qu il produit, cote a cote. */
    expect(Thing::name('silicon'))->toBe('Silicium')
        ->and(Thing::name('water'))->toBe('Eau')
        ->and(Thing::name('blast-compound'))->toBe('Mélange Explosif')
        ->and(Thing::name('silicon-smelter'))->toBe('Fonderie de Silicium');
});

it('range chaque chose dans la famille que l adresse d icone attend', function () {
    // Demande au catalogue et non a une liste : `items` puis `liquids`, le reste est un bloc.
    expect(Thing::family('silicon'))->toBe('objet')
        ->and(Thing::family('water'))->toBe('liquide')
        ->and(Thing::family('silicon-smelter'))->toBe('bloc');
});

it('offre les objets en pastilles, avec leur icone et leur nom francais', function () {
    produces('Fonte', 'silicon');

    $page = $this->get('/schemas')->assertOk();

    /* Des liens et non un controle dessine : un `<select>` natif ne porte pas d image, et le
       remplacer aurait coute le clavier, la recherche par frappe, Echap, l annonce au lecteur
       d ecran et le selecteur natif du telephone, sur le controle de recherche principal du
       site. La rangee ajoute l image sans rien retirer. */
    $page->assertSee('vitrine-pastille', false)
        ->assertSee('/icone/objet/silicon.png', false)
        ->assertSee('Silicium');
});

it('marque la pastille choisie plutot que de laisser deviner', function () {
    produces('Fonte', 'silicon');

    $this->get('/schemas?produit=silicon')
        ->assertOk()
        ->assertSee('aria-current="page"', false);
});
