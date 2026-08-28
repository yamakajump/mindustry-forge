<?php

use App\Models\Schematic;
use App\Models\SchematicItem;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * Les contraintes de la vitrine : la moitie de la promesse du depot qui ne pouvait pas
 * etre tapee.
 *
 * « Cent graphite par minute sous trente blocs » est la phrase par laquelle ce depot
 * s'ouvre, et jusqu'a ce fichier aucune de ses trois propositions n'etait exprimable : ni
 * un debit minimum, ni un encombrement, ni un nombre de blocs.
 *
 * Ce qui est teste ici n'est pas qu'un nombre soit juste. C'est qu'un nombre juste reponde
 * a la question posee, ce qu'aucun test de valeur ne verifie. D'ou l'encombrement strict
 * ci-dessous, qui est la ou ce fichier gagne son existence.
 */

/** Un schema publie qui produit vraiment quelque chose, avec ses deux rendements indexes. */
function schemaQuiProduit(
    string $name,
    int $width,
    int $height,
    int $blocks,
    float $rate,
    string $item = 'silicon',
    array $extra = [],
): Schematic {
    $schematic = Schematic::factory()->imported()->create(array_merge([
        'name' => $name,
        'visibility' => Schematic::PUBLIC,
        'width' => $width,
        'height' => $height,
        'blocks' => $blocks,
    ], $extra));

    SchematicItem::create([
        'schematic_id' => $schematic->id,
        'item' => $item,
        'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::PLAFOND,
        'rate' => $rate,
        'rate_per_block' => $rate / max(1, $blocks),
        'rate_per_tile' => $rate / max(1, $width * $height),
    ]);

    return $schematic;
}

/*
 * L'encombrement, et le fait qu'il ne permute pas les deux cotes.
 *
 * C'est le test qui compte le plus de ce fichier, parce que la version fausse aurait ete
 * exacte : un plan de 20 sur 15 tient bien dans une surface de 15 sur 20, si on a le droit
 * de le tourner. On ne l'a pas. Verifie dans le jar du jeu et non sur un wiki : `Binding`
 * n'expose que `schematicFlipX` et `schematicFlipY`, aucune rotation, et
 * `Schematics.rotate()` n'est appelee que par `BaseBuilderAI` et `BaseGenerator`, qui
 * construisent les bases ennemies. Un miroir ne change pas un encombrement.
 *
 * Sans ce test, un `orWhere` bien intentionne passerait la revue : il rendrait plus de
 * resultats, tous plausibles, et le joueur decouvrirait le probleme en collant le plan.
 */
it('ne propose pas un plan qu il faudrait tourner pour le faire rentrer', function () {
    schemaQuiProduit('Large', 20, 15, 40, 900);
    schemaQuiProduit('Etroit', 15, 20, 40, 900);

    $page = $this->get('/schemas?produit=silicon&large=15&haut=20');

    $page->assertOk()
        ->assertSee('Etroit')
        ->assertDontSee('Large');
});

it('accepte un plan exactement de la taille du trou', function () {
    schemaQuiProduit('Pile', 16, 16, 40, 900);
    schemaQuiProduit('Un de trop', 17, 16, 40, 900);

    $this->get('/schemas?produit=silicon&large=16&haut=16')
        ->assertSee('Pile')
        ->assertDontSee('Un de trop');
});

it('borne un cote sans exiger l autre', function () {
    schemaQuiProduit('Long et fin', 30, 4, 20, 900);
    schemaQuiProduit('Trop haut', 30, 12, 20, 900);

    $this->get('/schemas?produit=silicon&haut=5')
        ->assertSee('Long et fin')
        ->assertDontSee('Trop haut');
});

it('ignore un encombrement qui n est pas un nombre plutot que de vider la page', function () {
    schemaQuiProduit('Visible', 10, 10, 20, 900);

    $this->get('/schemas?produit=silicon&large=beaucoup')->assertSee('Visible');
});

/*
 * Le debit minimum, qui n'a de sens qu'une fois l'objet choisi.
 *
 * Sans objet, `schematic_items` n'est pas jointe : un plancher sur `rate` filtrerait alors
 * sur la ligne que la base a trouve commode, ce qui est un resultat faux qui a l'air d'un
 * resultat.
 */
it('ne garde que ce qui sort au moins le debit demande', function () {
    schemaQuiProduit('Gros', 10, 10, 30, 1200);
    schemaQuiProduit('Petit', 10, 10, 30, 300);

    $this->get('/schemas?produit=silicon&min=1000')
        ->assertSee('Gros')
        ->assertDontSee('Petit');
});

it('n applique pas un debit minimum quand aucun objet n est choisi', function () {
    schemaQuiProduit('Sans objet choisi', 10, 10, 30, 300);

    $this->get('/schemas?min=1000')->assertSee('Sans objet choisi');
});

it('borne le nombre de blocs', function () {
    schemaQuiProduit('Leger', 10, 10, 18, 900);
    schemaQuiProduit('Lourd', 10, 10, 120, 900);

    $this->get('/schemas?produit=silicon&blocs=30')
        ->assertSee('Leger')
        ->assertDontSee('Lourd');
});

/*
 * L'autonomie en electricite, qui compare un plafond a un plafond.
 *
 * `power_made` et `power_used` viennent tous deux de `analysis['potential']`. Les comparer
 * est donc legitime ; comparer l'un des deux a une mesure ne le serait pas, et c'est la
 * faute que ce depot a passe une journee a defaire.
 */
it('ne garde que ce qui produit au moins ce qu il consomme', function () {
    schemaQuiProduit('Autonome', 10, 10, 30, 900, 'silicon',
        ['power_made' => 500.0, 'power_used' => 200.0]);
    schemaQuiProduit('A brancher', 10, 10, 30, 900, 'silicon',
        ['power_made' => 0.0, 'power_used' => 400.0]);

    $this->get('/schemas?produit=silicon&autonome=oui')
        ->assertSee('Autonome')
        ->assertDontSee('A brancher');
});

/*
 * Les deux mondes, qui ne partagent pas leur menu de construction.
 *
 * Ce n'est pas une preference comme le bac a sable : un plan d'Erekir ne se pose pas sur
 * Serpulo, le bloc n'est pas dans le menu. Un resultat impossible a poser est pire qu'un
 * resultat mal adapte, parce que rien sur la tuile ne le dit.
 */
it('ecarte un plan bati avec les blocs de l autre monde', function () {
    // L'inventaire passe par `analysis['held']`, que l'enregistrement indexe dans
    // `schematic_blocks`. Ecrit comme le fait le reste de la suite plutot qu'insere a la
    // main : un test qui remplit la table autrement teste une table, pas le site.
    schemaQuiProduit('De Serpulo', 10, 10, 20, 900, 'silicon',
        ['analysis' => ['held' => ['graphite-press' => 4, 'conveyor' => 16]]]);
    schemaQuiProduit('D Erekir', 10, 10, 20, 900, 'silicon',
        ['analysis' => ['held' => ['silicon-arc-furnace' => 4, 'duct' => 16]]]);

    $this->get('/schemas?produit=silicon&planete=serpulo')
        ->assertSee('De Serpulo')
        ->assertDontSee('D Erekir');
});

it('ignore un nom de planete inconnu plutot que de tout ecarter', function () {
    schemaQuiProduit('Toujours la', 10, 10, 20, 900);

    $this->get('/schemas?produit=silicon&planete=mars')->assertSee('Toujours la');
});

/*
 * Le tri a la surface, et le fait qu'il ne soit pas un doublon de celui au bloc.
 *
 * Deux schemas qui sortent le meme debit : l'un etale avec peu de blocs, l'autre dense.
 * Le premier gagne au bloc pose, le second gagne a la place occupee. Si les deux ordres
 * rendaient la meme premiere ligne, le tri neuf ne servirait a rien et ce test le dirait.
 */
it('classe autrement au sol qu au bloc pose', function () {
    // 900/min sur 400 tuiles et 20 blocs : 45 par bloc, 2,25 par tuile.
    schemaQuiProduit('Etale', 20, 20, 20, 900);
    // 900/min sur 100 tuiles et 45 blocs : 20 par bloc, 9 par tuile.
    schemaQuiProduit('Dense', 10, 10, 45, 900);

    /* Cherche dans la grille seulement, et pas dans la page.
     *
     * Le bandeau des verdicts nomme les gagnants au-dessus des tuiles, donc la premiere
     * occurrence d'un nom dans le HTML n'est plus sa tuile. Le test disait « Dense arrive
     * avant Etale » et mesurait en fait la position d'un nom dans une phrase de resume :
     * un test exact qui verifiait autre chose que ce qu'il annonce. */
    $grille = function (string $url) {
        $html = $this->get($url)->content();

        return substr($html, strpos($html, '<div class="grid">'));
    };

    $auBloc = $grille('/schemas?produit=silicon&tri=best');
    $auSol = $grille('/schemas?produit=silicon&tri=dense');

    expect(strpos($auBloc, 'Etale'))->toBeLessThan(strpos($auBloc, 'Dense'))
        ->and(strpos($auSol, 'Dense'))->toBeLessThan(strpos($auSol, 'Etale'));
});

it('retombe sur la date quand on classe au sol sans avoir choisi d objet', function () {
    schemaQuiProduit('Peu importe', 10, 10, 20, 900);

    // Le tri compare des productions : sans objet, classer quarante graphite contre
    // vingt-cinq silicium reviendrait a decreter un taux de change entre les deux.
    $this->get('/schemas?tri=dense')
        ->assertOk()
        ->assertSee('Les plus récents', false);
});

/** La colonne se remplit a l'enregistrement, sinon le tri classe quinze mille zeros. */
it('remplit le rendement au sol quand le plafond est indexe', function () {
    $schematic = Schematic::factory()->imported()->create([
        'width' => 10, 'height' => 5, 'blocks' => 25,
        'analysis' => ['potentialPerMinute' => ['silicon' => 100.0]],
    ]);

    $schematic->indexWhatItCouldMake();

    $row = $schematic->items()->where('kind', SchematicItem::PLAFOND)->first();

    // 100 sur 50 tuiles, contre 100 sur 25 blocs. Les deux colonnes disent bien deux
    // choses differentes de la meme schematique.
    expect($row->rate_per_tile)->toBe(2.0)
        ->and($row->rate_per_block)->toBe(4.0);
});

/*
 * Les contraintes se combinent, ce qui est le seul interet d'en avoir plusieurs.
 *
 * C'est la phrase du README rendue tapable : un debit, un encombrement, un budget de blocs.
 */
it('combine le debit, l encombrement et le nombre de blocs', function () {
    schemaQuiProduit('Celui qui repond', 12, 12, 25, 1500);
    schemaQuiProduit('Trop gros', 20, 20, 25, 1500);
    schemaQuiProduit('Trop faible', 12, 12, 25, 200);
    schemaQuiProduit('Trop de blocs', 12, 12, 300, 1500);

    $this->get('/schemas?produit=silicon&min=1000&large=14&haut=14&blocs=40')
        ->assertSee('Celui qui repond')
        ->assertDontSee('Trop gros')
        ->assertDontSee('Trop faible')
        ->assertDontSee('Trop de blocs');
});
