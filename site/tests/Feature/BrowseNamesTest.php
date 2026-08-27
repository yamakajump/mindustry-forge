<?php

use App\Models\Schematic;
use App\Models\SchematicItem;
use App\Support\Thing;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/** A public schematic with a measured figure, which is what the filter offers. */
function produces(string $name, string $item, float $rate = 100): Schematic
{
    $schematic = Schematic::factory()->create([
        'visibility' => Schematic::PUBLIC, 'name' => $name, 'blocks' => 30,
    ]);
    $schematic->items()->delete();
    $schematic->items()->create([
        'item' => $item, 'sens' => SchematicItem::PRODUIT, 'kind' => SchematicItem::MESURE,
        'rate' => $rate, 'rate_per_block' => $rate / 30,
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

    $page = $this->get('/schematiques')->assertOk();

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

    $this->get('/schematiques?produit=silicon')
        ->assertOk()
        ->assertSee('aria-current="page"', false);
});
