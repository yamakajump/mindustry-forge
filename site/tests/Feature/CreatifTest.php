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

it('compte ce que cette page met a part, pas ce que le catalogue met a part', function () {
    /* La septieme face du meme defaut, et sur la phrase qui explique une mise a part.
     *
     * En production la phrase annoncait 4 475 sur **toutes** les pages, ce qui est le bon
     * compte du catalogue et la mauvaise reponse a « combien cette page en a-t-elle mis a
     * part ». Sur le classement par energie la vraie reponse etait zero : ces schematiques
     * en etaient deja absentes, retirees par la separation mesure/plafond puisque leur
     * energie mesuree vaut zero, donc ce filtre n'avait plus rien a retirer.
     *
     * Une page qui ne met rien a part annoncait quatre mille cinq cents. */
    creation('Bac a sable a graphite', ['power-source' => 1, 'graphite-press' => 2]);
    creation('Usine a silicium', ['silicon-smelter' => 4]);
    creation('Presse a graphite', ['graphite-press' => 2]);

    // Filtree sur un bloc que le bac a sable ne contient pas : rien a mettre a part ici.
    $ciblee = $this->get('/schematiques?bloc=silicon-smelter')->assertOk();
    $ciblee->assertSee('Usine a silicium');
    $ciblee->assertDontSee('mise a part');

    // Sans filtre, la seule creative du lot est comptee, et au singulier.
    $toutes = $this->get('/schematiques')->assertOk();
    $toutes->assertSee('1 schematique de bac a sable est mise a part', escape: false);
});

it('ne compte pas les privees dans ce qui est mis a part', function () {
    /* Le compte annonce doit etre celui de la liste que le lecteur regarde. Compter une
       schematique privee lui promettrait quelque chose que le lien ne lui montrera pas. */
    creation('Privee et creative', ['power-void' => 40], visibility: 'private');
    creation('Four a silicium', ['silicon-smelter' => 4]);

    $this->get('/schematiques')->assertOk()->assertDontSee('mises a part');
});
