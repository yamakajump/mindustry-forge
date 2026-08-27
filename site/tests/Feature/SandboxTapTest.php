<?php

use App\Models\Schematic;
use App\Models\SchematicItem;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * Un robinet de bac a sable se dit, il ne se chiffre pas.
 *
 * `power-source` rend 999 999,94 energie par seconde, ce qui est la facon dont le jeu ecrit
 * « autant que tu veux ». La consommation soustraite correctement, la page affichait
 * 479 999 971 en vert, presente comme ce qu'il restait pour le reste de la base. Le calcul
 * etait juste ; la phrase etait fausse.
 *
 * Mille deux cent quarante-six pages sur quinze mille, soit huit pour cent du catalogue,
 * et elles occupaient le haut du classement « qui produit de l'energie » avec un plafond
 * qu'aucun joueur ne peut suivre.
 *
 * Le bloc est reconnu par `build_visibility`, que le jeu ecrit lui-meme, plutot que par une
 * liste de noms tapee ici : une liste serait juste jusqu'a la prochaine version qui ajoute
 * un bloc au bac a sable, et fausse en silence ensuite.
 */

/** Une analyse comme le navigateur la rend, avec les blocs qu'on lui donne. */
function analyseAvecBlocs(array $names, array $produces = ['silicon' => 90.0]): array
{
    return [
        'width' => 10, 'height' => 10, 'blocks' => count($names),
        'perMinute' => $produces,
        'potentialPerMinute' => $produces,
        'potential' => ['made' => 480_000_000.0, 'spent' => 29.0],
        'needs' => [],
        'detail' => array_map(fn ($name) => ['name' => $name], $names),
    ];
}

it('reconnait une source de bac a sable et la nomme', function () {
    $kept = Schematic::factory()->imported()->create([
        'blocks' => 3,
        'analysis' => analyseAvecBlocs(['power-source', 'silicon-smelter', 'conveyor']),
    ]);

    expect($kept->fedBySandbox())->toBeTrue();
    expect($kept->sandboxTaps())->toBe(['power-source']);
});

it('ne compte pas un puits comme une source', function () {
    /* Un `power-void` est un bloc de bac a sable lui aussi, et il avale au lieu de verser :
       il gonfle ce qu'une schematique parait *demander*, ce qui est une autre phrase sur
       une autre carte, et il ne met jamais une schematique en tete d'un classement de
       productrices. */
    $kept = Schematic::factory()->imported()->create([
        'blocks' => 2,
        'analysis' => analyseAvecBlocs(['power-void', 'conveyor']),
    ]);

    expect($kept->fedBySandbox())->toBeFalse();
});

it('n indexe rien comme produit quand un robinet alimente la schematique', function () {
    /* Ni mesure ni plafond. Ce n'est pas que la disposition soit sans interet : c'est que
       ce qu'elle rend vient d'un robinet et non de ses blocs, donc elle n'est pas une
       mesure de production et n'est pas rangee comme telle. */
    $kept = Schematic::factory()->imported()->create([
        'blocks' => 3,
        'analysis' => analyseAvecBlocs(['power-source', 'silicon-smelter', 'conveyor']),
        // Renseigne expres : sans ca, « rien n'est indexe » serait vrai pour la mauvaise
        // raison, et le test passerait le jour ou la regle disparaitrait.
        'produces' => ['silicon' => 90.0],
        'power_made' => 999_999.94, 'power_used' => 29.0,
    ]);

    $kept->indexWhatItMakes();
    $kept->indexWhatItCouldMake();

    expect($kept->items()->where('sens', SchematicItem::PRODUIT)->count())->toBe(0);
});

it('laisse une vraie usine tranquille', function () {
    /* Le controle qui compte : la correction ne doit pas vider le catalogue. La meme
       schematique sans le robinet est indexee exactement comme avant. */
    $kept = Schematic::factory()->imported()->create([
        'blocks' => 3,
        'analysis' => analyseAvecBlocs(['combustion-generator', 'silicon-smelter', 'conveyor']),
        'produces' => ['silicon' => 90.0],
        'power_made' => 60.0, 'power_used' => 30.0,
    ]);

    $kept->indexWhatItMakes();

    expect($kept->fedBySandbox())->toBeFalse();
    expect($kept->items()
        ->where('sens', SchematicItem::PRODUIT)
        ->where('kind', SchematicItem::MESURE)
        ->pluck('rate', 'item')->all())
        ->toHaveKey('silicon');
});

it('ne cite pas le chiffre dans la vitrine non plus', function () {
    /* La vignette et la balise `description` portent le meme chiffre que la page, en plus
       court et vues par plus de monde : une vignette qui annonce 999 971 energie/s est la
       meme phrase fausse. */
    Schematic::factory()->imported()->create([
        'name' => 'Banc a robinet', 'blocks' => 3, 'visibility' => 'public',
        'analysis' => analyseAvecBlocs(['power-source', 'silicon-smelter', 'conveyor']),
        'produces' => ['silicon' => 90.0],
        'power_made' => 999_999.94, 'power_used' => 29.0,
    ]);

    $liste = $this->get('/schematiques');

    $liste->assertOk();
    $liste->assertSee('Banc a robinet');
    $liste->assertSee('source de bac a sable');
    $liste->assertDontSee('999 971 energie/s');
});

it('dit le robinet sur la page au lieu d en citer la valeur', function () {
    $kept = Schematic::factory()->imported()->create([
        'blocks' => 3, 'visibility' => 'public',
        'analysis' => analyseAvecBlocs(['power-source', 'silicon-smelter', 'conveyor']),
        'power_made' => 999_999.94, 'power_used' => 29.0,
    ]);

    $page = $this->get("/s/{$kept->slug}");

    $page->assertOk();
    $page->assertSee('Alimentee par une source de bac a sable');
    $page->assertSee('power-source');
    // Le chiffre qui a tout declenche, sous les deux formes que la page peut en donner.
    $page->assertDontSee('479 999');
    $page->assertDontSee('999 999');
    // La forme qui voyage le plus loin : ce que les reseaux sociaux et les moteurs lisent.
    $page->assertSee('content="source de bac a sable - 3 blocs"', false);
});
