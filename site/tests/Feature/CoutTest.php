<?php

use App\Models\Schematic;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * Ce qu'une schematique coute a poser, avec les icones du jeu.
 *
 * Le chiffre vient de l'analyse, qui le tient de `Block.requirements` : c'est ce que le jeu
 * retire du noyau, a l'unite pres. Recalcule ici depuis `schematic_blocks` fois le
 * catalogue, ce serait la meme arithmetique ecrite une deuxieme fois, donc une deuxieme
 * chose a avoir tort, sur le chiffre qu'un joueur verifie contre son propre noyau avant de
 * coller.
 */

function avecCout(array $cost): Schematic
{
    return Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Chaine a silicium', 'blocks' => 12,
        'analysis' => ['cost' => $cost],
    ]);
}

it('range le cout dans l ordre du jeu, pas dans l ordre alphabetique', function () {
    /* Le cuivre avant le plomb, le titane avant le thorium : l'ordre que le joueur lit sur
       tous les panneaux du jeu. En alphabetique, une construction de Serpulo commencerait
       par le beryllium, qui n'y a rien a faire. */
    $kept = avecCout(['titanium' => 40, 'copper' => 320, 'lead' => 96]);

    expect(array_keys($kept->cost()))->toBe(['copper', 'lead', 'titanium']);
});

it('affiche chaque ressource avec son icone', function () {
    $kept = avecCout(['copper' => 320, 'lead' => 96]);

    $page = $this->get("/s/{$kept->slug}")->assertOk();

    $page->assertSee('Ce qu elle coute');
    $page->assertSee('/icone/objet/copper.png?t=32', escape: false);
    $page->assertSee('/icone/objet/lead.png?t=32', escape: false);
    $page->assertSee('320');
});

it('ne montre pas de carte vide quand le cout est inconnu', function () {
    /* Une analyse enregistree avant que le champ existe, ou une schematique faite de blocs
       qu'aucun catalogue ne connait : mieux vaut ne rien dire qu'afficher un zero. */
    $kept = Schematic::factory()->create([
        'visibility' => 'public', 'blocks' => 3, 'analysis' => [],
    ]);

    $this->get("/s/{$kept->slug}")->assertOk()->assertDontSee('Ce qu elle coute');
});

it('se defend contre ce qu un navigateur peut envoyer', function () {
    $kept = avecCout(['copper' => 320, 'lead' => 0, 'plomb' => 'beaucoup', '' => 4]);

    expect($kept->cost())->toBe(['copper' => 320]);
});
