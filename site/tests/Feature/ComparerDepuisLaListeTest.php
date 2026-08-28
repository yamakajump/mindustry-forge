<?php

use App\Models\Schematic;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * Comparer deux plans depuis la liste, en deux clics et sans une ligne de JavaScript.
 *
 * `/comparer` existait depuis longtemps et la vitrine ne l'alimentait pas : opposer deux
 * resultats demandait deux onglets et deux adresses recopiees a la main.
 *
 * Des cases a cocher auraient demande un script, et sans lui elles n'auraient rien fait du
 * tout, ce qui est pire qu'une absence : un controle qui ne repond pas se lit comme un site
 * casse. Un parametre d'adresse fait le meme travail et garde ce que ce site tient a garder,
 * une adresse par etape, donc un lien qui se partage et un bouton precedent qui marche.
 */

function listee(string $name): Schematic
{
    return Schematic::factory()->create([
        'name' => $name,
        'visibility' => Schematic::PUBLIC,
        'width' => 10, 'height' => 10, 'blocks' => 12,
    ]);
}

it('propose de retenir un schéma quand rien n est retenu', function () {
    listee('Premier');

    $this->get('/schemas')->assertOk()->assertSee('Comparer');
});

it('dit ce qui est retenu, plutôt que de le laisser deviner', function () {
    $first = listee('Le premier');
    listee('Le second');

    $this->get("/schemas?comparer={$first->slug}")
        ->assertOk()
        ->assertSee('À comparer avec')
        ->assertSee('Le premier');
});

it('mène à la comparaison des deux au second clic', function () {
    $first = listee('Le premier');
    $second = listee('Le second');

    $this->get("/schemas?comparer={$first->slug}")
        ->assertOk()
        ->assertSee("/comparer?a={$first->slug}&amp;b={$second->slug}", false);
});

/*
 * Le schema retenu ne se propose pas contre lui-meme.
 *
 * `/comparer?a=x&b=x` rendrait une page qui compare un plan a lui-meme : exacte, vide de
 * sens, et sans rien pour dire au lecteur pourquoi les deux colonnes sont identiques.
 */
it('ne se propose pas de se comparer à lui-même', function () {
    $only = listee('Tout seul');

    $this->get("/schemas?comparer={$only->slug}")
        ->assertOk()
        ->assertDontSee("/comparer?a={$only->slug}&amp;b={$only->slug}", false)
        ->assertSee('retenu');
});

/*
 * Un slug invente ne retient rien.
 *
 * Une adresse se tape et se partage. Retenir un identifiant inexistant afficherait un
 * bandeau nommant un schema qui n'existe pas, et chaque tuile pointerait vers une
 * comparaison impossible : une page plausible et fausse.
 */
it('ignore un identifiant qui ne désigne aucun schéma listé', function () {
    listee('Visible');

    $this->get('/schemas?comparer=nexistepas')
        ->assertOk()
        ->assertSee('Visible')
        ->assertDontSee('À comparer avec');
});

it('ne retient pas un schéma privé, que la liste ne montre pas', function () {
    $hidden = Schematic::factory()->create([
        'name' => 'Cache', 'visibility' => 'private', 'width' => 10, 'height' => 10,
    ]);
    listee('Visible');

    $this->get("/schemas?comparer={$hidden->slug}")
        ->assertOk()
        ->assertDontSee('À comparer avec');
});

/*
 * Retenir ne defait pas la recherche en cours.
 *
 * C'est tout l'interet de passer par l'adresse plutot que par un etat de navigateur : le
 * lien de chaque tuile repart de l'adresse courante, donc les filtres survivent au clic.
 */
it('garde les filtres en retenant un schéma', function () {
    $first = listee('Le premier');
    listee('Le second');

    $this->get("/schemas?large=12&haut=12&comparer={$first->slug}")
        ->assertOk()
        ->assertSee('À comparer avec')
        // La contrainte est toujours la, dite par sa puce.
        ->assertSee('Tient dans');
});
