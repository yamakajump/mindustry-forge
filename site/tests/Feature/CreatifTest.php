<?php

use App\Models\Schematic;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * Le creatif, mis a part et jamais escamote.
 *
 * La capture de Corentin montrait `pure sandbox stupidity`, `Fuck it quad nuke`,
 * `Server lagger` et `useless box` en tete du classement par energie. Ce sont des
 * schematiques faites pour des serveurs bac a sable ou pour faire ramer un serveur : elles
 * ne se posent pas en partie normale, donc elles repondent a une autre question que celle
 * que la liste pose.
 *
 * La detection porte sur les **blocs**, jamais sur le nom. Dix blocs valent `sandboxOnly`
 * dans le catalogue du jeu ; `Def Mega Base (sandbox)` se trahirait par son nom, mais
 * `useless box` et `Server lagger` non, et ce sont les memes.
 *
 * « A part », pas « dehors » : le compte est affiche et un lien defait le filtre.
 */

function creation(string $name, array $held, string $visibility = 'public'): Schematic
{
    return Schematic::factory()->create([
        'name' => $name, 'visibility' => $visibility, 'blocks' => array_sum($held),
        'analysis' => ['held' => $held],
    ]);
}

it('reconnait le creatif par ses blocs et pas par son nom', function () {
    $lagger = creation('Server lagger', ['power-void' => 40, 'conveyor' => 2]);
    $usine = creation('Four a silicium', ['silicon-smelter' => 4, 'conveyor' => 20]);

    expect($lagger->creative())->toBeTrue();
    expect($usine->creative())->toBeFalse();
});

it('met le creatif a part de la liste par defaut', function () {
    creation('Server lagger', ['power-void' => 40]);
    creation('Four a silicium', ['silicon-smelter' => 4]);

    $page = $this->get('/schematiques')->assertOk();

    $page->assertSee('Four a silicium');
    $page->assertDontSee('Server lagger');
});

it('dit combien il en met a part, et offre de les voir', function () {
    /* Le point sur lequel je ne veux pas etre approximative : un catalogue qui annonce
       quinze mille schematiques et en sert quatorze mille sans un mot mentirait sur sa
       propre taille. Le compte est affiche, et le lien defait le filtre. */
    creation('Server lagger', ['power-void' => 40]);
    creation('pure sandbox stupidity', ['item-source' => 3]);
    creation('Four a silicium', ['silicon-smelter' => 4]);

    $page = $this->get('/schematiques')->assertOk();

    $page->assertSee('2 schematiques de bac a sable sont mises a part', escape: false);
    $page->assertSee('creatif=oui', escape: false);
});

it('les affiche quand on le demande, etiquetees', function () {
    creation('Server lagger', ['power-void' => 40]);
    creation('Four a silicium', ['silicon-smelter' => 4]);

    $page = $this->get('/schematiques?creatif=oui')->assertOk();

    $page->assertSee('Server lagger');
    $page->assertSee('Four a silicium');
    $page->assertSee('bac a sable');
});

it('ne compte pas les privees dans ce qui est mis a part', function () {
    /* Le compte annonce doit etre celui de la liste que le lecteur regarde. Compter une
       schematique privee lui promettrait quelque chose que le lien ne lui montrera pas. */
    creation('Privee et creative', ['power-void' => 40], visibility: 'private');
    creation('Four a silicium', ['silicon-smelter' => 4]);

    $this->get('/schematiques')->assertOk()->assertDontSee('mises a part');
});
