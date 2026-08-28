<?php

use App\Models\Schematic;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * Chercher une schematique par un bloc qu'elle contient.
 *
 * « Montre-moi ce qu'on construit avec un reacteur au thorium » est la question qu'un
 * joueur pose vraiment, et le site ne savait pas y repondre : `schematic_blocks` etait vide
 * sur les 15 533 lignes, faute d'inventaire dans l'analyse.
 *
 * Le nom cherche est confronte au catalogue plutot que pris pour argent comptant. Un `LIKE`
 * sur du texte libre aurait rendu une liste plausible et fausse pour une faute de frappe,
 * ce qui est la forme d'erreur que ce depot passe ses journees a fermer.
 */

function batie(string $name, array $held): Schematic
{
    return Schematic::factory()->create([
        'name' => $name, 'visibility' => 'public', 'blocks' => array_sum($held),
        'analysis' => ['held' => $held],
    ]);
}

it('ne rend que celles qui contiennent le bloc demande', function () {
    batie('Ferme a thorium', ['thorium-reactor' => 4, 'conveyor' => 30]);
    batie('Presse a graphite', ['graphite-press' => 2, 'conveyor' => 12]);

    $page = $this->get('/schemas?bloc=thorium-reactor')->assertOk();

    $page->assertSee('Ferme a thorium');
    $page->assertDontSee('Presse a graphite');
});

it('dit quel bloc filtre, et offre d enlever le filtre', function () {
    batie('Ferme a thorium', ['thorium-reactor' => 4]);

    $page = $this->get('/schemas?bloc=thorium-reactor')->assertOk();

    $page->assertSee('Uniquement ceux qui contiennent');
    $page->assertSee('Enlever ce filtre');
});

it('dit qu un nom inconnu ne filtre rien plutot que de rendre tout', function () {
    /* Une faute de frappe qui rend la liste entiere est une page plausible et fausse : le
       lecteur croit avoir cherche et n'a rien cherche. */
    batie('Ferme a thorium', ['thorium-reactor' => 4]);

    $page = $this->get('/schemas?bloc=reacteur-au-thorium')->assertOk();

    // Sans l'apostrophe : Blade l'echappe en `&#039;`, et l'assertion la chercherait
    // telle quelle.
    $page->assertSee('est pas un bloc du jeu');
    $page->assertSee('Ferme a thorium');
});

it('propose des noms qui existent vraiment dans le catalogue', function () {
    batie('Ferme a thorium', ['thorium-reactor' => 4, 'conveyor' => 30]);

    $page = $this->get('/schemas')->assertOk();

    $page->assertSee('<option value="thorium-reactor"></option>', escape: false);
    $page->assertSee('<option value="conveyor"></option>', escape: false);
});

it('se combine avec la mise a part du creatif', function () {
    /* Les deux filtres sont independants et doivent le rester : chercher un convoyeur ne
       doit pas ramener les bacs a sable par la bande. */
    batie('Usine normale', ['conveyor' => 30]);
    batie('Bac a sable', ['conveyor' => 30, 'power-source' => 1]);

    $this->get('/schemas?bloc=conveyor')->assertOk()
        ->assertSee('Usine normale')
        ->assertDontSee('Bac a sable');

    $this->get('/schemas?bloc=conveyor&creatif=oui')->assertOk()
        ->assertSee('Usine normale')
        ->assertSee('Bac a sable');
});
