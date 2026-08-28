<?php

use App\Models\Schematic;
use App\Models\SchematicItem;
use App\Support\Vitrine;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * Chercher par ce qu'un schema reclame, qui est l'autre sens de la question du site.
 *
 * « Qu'est-ce qui fait du graphite » est une liste de courses. « Qu'est-ce qui mange du
 * charbon » est la reponse a « ma mine tourne, que puis-je construire maintenant », et c'est
 * ainsi qu'un joueur choisit sa prochaine usine. La colonne qui repondait dormait depuis le
 * premier jour : `schematics.needs` etait ecrite par l'analyse et lue par personne.
 */

function reclame(string $name, array $needs, int $blocks = 20): Schematic
{
    return Schematic::factory()->create([
        'name' => $name,
        'visibility' => Schematic::PUBLIC,
        'width' => 10, 'height' => 10, 'blocks' => $blocks,
        'needs' => $needs,
    ]);
}

it('indexe ce qu un schema reclame de l exterieur', function () {
    $kept = reclame('Fonderie', ['sand' => 120.0, 'coal' => 60.0]);

    $rows = $kept->items()->where('sens', SchematicItem::CONSOMME)->get();

    expect($rows)->toHaveCount(2)
        ->and($rows->firstWhere('item', 'sand')->rate)->toBe(120.0)
        // Range en plafond, parce que c'est ce que c'est : l'appetit d'un plan tournant a
        // plein regime, jamais un releve. Melanger les deux natures est la faute que ce
        // depot a defaite du cote production, et elle serait aussi silencieuse ici.
        ->and($rows->firstWhere('item', 'sand')->kind)->toBe(SchematicItem::PLAFOND);
});

/*
 * Le besoin et la production ne se confondent pas.
 *
 * Sans ce test, un filtre qui oublierait `sens` rendrait les usines a silicium quand on
 * cherche ce qui MANGE du silicium. Le resultat aurait l'air d'un resultat : plein de
 * schemas, tous lies au silicium, tous faux.
 */
it('ne confond pas ce qu il mange avec ce qu il fait', function () {
    $mangeur = reclame('Mangeur', ['silicon' => 90.0]);
    $faiseur = Schematic::factory()->create([
        'name' => 'Faiseur', 'visibility' => Schematic::PUBLIC,
        'width' => 10, 'height' => 10, 'blocks' => 20,
        'analysis' => ['potentialPerMinute' => ['silicon' => 90.0]],
    ]);

    $this->get('/schemas?consomme=silicon')
        ->assertOk()
        ->assertSee('Mangeur')
        ->assertDontSee('Faiseur');

    // Et le jumeau, sans lequel le test ci-dessus passerait au vert sur une page cassee.
    $this->get('/schemas?produit=silicon')
        ->assertOk()
        ->assertSee('Faiseur')
        ->assertDontSee('Mangeur');

    expect($faiseur->fresh()->items()->where('sens', SchematicItem::CONSOMME)->count())->toBe(0);
});

it('ne garde que ceux qui reclament la chose demandee', function () {
    reclame('Au charbon', ['coal' => 60.0]);
    reclame('Au sable', ['sand' => 60.0]);

    $this->get('/schemas?consomme=coal')
        ->assertOk()
        ->assertSee('Au charbon')
        ->assertDontSee('Au sable');
});

/*
 * Les cles categorielles restent dehors.
 *
 * Un generateur qui brule « n'importe quoi » ne nomme pas de ressource et sort sous
 * `*combustible`. Savoir si du charbon couvre cette faim demande la liste `accepts` que le
 * jeu tient par bloc et que le navigateur lit deja ; la resoudre une seconde fois ici serait
 * la duplication que ce depot refuse. Et un nom qu'aucun joueur ne peut taper n'est pas un
 * filtre.
 */
it('n indexe pas une catégorie comme si c était une ressource', function () {
    $kept = reclame('Bruleur', ['*combustible' => 30.0, 'water' => 10.0]);

    $names = $kept->items()->where('sens', SchematicItem::CONSOMME)->pluck('item')->all();

    expect($names)->toBe(['water']);
});

it('ignore un besoin que le catalogue ne réclame nulle part', function () {
    reclame('Visible', ['coal' => 60.0]);

    // Un nom hors de ce qui est offert ne filtre rien plutot que de vider la page : une
    // liste vide se lirait comme un catalogue vide et non comme un nom qui n'existe pas.
    $this->get('/schemas?consomme=surge-alloy')->assertOk()->assertSee('Visible');
});

it('offre ce que le catalogue réclame vraiment', function () {
    reclame('Un', ['coal' => 60.0]);
    reclame('Deux', ['coal' => 30.0]);
    reclame('Trois', ['sand' => 30.0]);

    expect(Vitrine::eatsOnOffer())->toBe(['coal', 'sand']);
});

it('efface un besoin qui a disparu de l analyse', function () {
    $kept = reclame('Change', ['coal' => 60.0]);

    $kept->update(['needs' => ['sand' => 60.0]]);

    expect($kept->fresh()->items()->where('sens', SchematicItem::CONSOMME)->pluck('item')->all())
        ->toBe(['sand']);
});

it('combine ce qu il mange avec ce qu il rend', function () {
    Schematic::factory()->create([
        'name' => 'Celui qui repond', 'visibility' => Schematic::PUBLIC,
        'width' => 10, 'height' => 10, 'blocks' => 20,
        'needs' => ['coal' => 60.0],
        'analysis' => ['potentialPerMinute' => ['graphite' => 90.0]],
    ]);
    reclame('Mange sans rendre', ['coal' => 60.0]);

    $this->get('/schemas?produit=graphite&consomme=coal')
        ->assertOk()
        ->assertSee('Celui qui repond')
        ->assertDontSee('Mange sans rendre');
});
