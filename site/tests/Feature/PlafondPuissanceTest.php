<?php

use App\Models\Schematic;
use App\Models\SchematicItem;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * Un plafond ne descend jamais dans une ligne « mesure ».
 *
 * `power_made` est rempli depuis `analysis['potential']`, qui est le plafond : ce que la
 * disposition ferait alimentee a fond. Indexee telle quelle, cette valeur devenait une
 * ligne `mesure`, et la vitrine filtre exactement sur ce genre-la - avec un commentaire
 * disant que melanger un plafond a une mesure serait mentir sans que rien ne le dise.
 *
 * C'est ce qui arrivait. Sur POLAR STAR, 110x110 et 2 508 blocs, le meme 1 513 826 etait
 * classe deux fois : honnetement en plafond, faussement en mesure. **195 lignes** dans ce
 * cas, et « celles qui produisent le plus » classait sur des plafonds en croyant classer
 * sur des mesures.
 *
 * La ligne existait deja, c'est une valeur qui l'a traversee. Chaque genre porte donc
 * desormais le chiffre qui lui appartient : la mesure vient de `analysis['power']`, le
 * plafond de `analysis['potential']`.
 */

/** Une ferme de reacteurs sans carburant declare : enorme en plafond, nulle en mesure. */
function fermeSansCarburant(): Schematic
{
    return Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'POLAR STAR', 'blocks' => 2508,
        'produces' => [],
        // Ce que la colonne porte, et qui vient du plafond.
        'power_made' => 1_950_000.0, 'power_used' => 436_174.0,
        'analysis' => [
            'power' => ['made' => 0, 'spent' => 0],
            'potential' => ['made' => 1_950_000.0, 'spent' => 436_174.0],
        ],
    ]);
}

it('ne classe pas un plafond parmi les mesures', function () {
    $ferme = fermeSansCarburant();
    $ferme->indexWhatItMakes();
    $ferme->indexWhatItCouldMake();

    $mesure = $ferme->items()
        ->where('item', SchematicItem::POWER)->where('kind', SchematicItem::MESURE)->first();
    $plafond = $ferme->items()
        ->where('item', SchematicItem::POWER)->where('kind', SchematicItem::PLAFOND)->first();

    expect($mesure)->toBeNull('rien ne tourne, donc rien n\'est mesure');
    expect((float) $plafond?->rate)->toBe(1_513_826.0, 'et le plafond dit ce qu\'il est');
});

it('laisse une centrale reellement alimentee dans le classement', function () {
    /* Le controle qui compte : la regle ne doit pas vider le classement. Une centrale dont
       l'analyse porte une mesure garde sa ligne, et c'est elle que la vitrine sert. */
    $vraie = Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Reacteur nourri', 'blocks' => 30,
        'produces' => [],
        'power_made' => 900.0, 'power_used' => 40.0,
        'analysis' => [
            'power' => ['made' => 900.0, 'spent' => 40.0],
            'potential' => ['made' => 900.0, 'spent' => 40.0],
        ],
    ]);
    $vraie->indexWhatItMakes();

    expect((float) $vraie->items()
        ->where('item', SchematicItem::POWER)->where('kind', SchematicItem::MESURE)
        ->value('rate'))->toBe(860.0);
});

it('garde la ferme sans carburant, parce qu un plafond dit ce qu elle ferait nourrie', function () {
    /*
     * Ce test l en sortait, du temps ou la vitrine n acceptait que des mesures. Une ferme
     * sans carburant a une mesure nulle et un plafond de neuf cents, et « ce qu elle ferait
     * alimentee » est exactement la question que se pose quelqu un qui cherche une centrale.
     *
     * Le plafond est dit comme tel a cote du chiffre, donc rien n est presente comme une
     * mesure. C etait la seule condition.
     */
    fermeSansCarburant()->indexWhatItMakes();

    // `potential` autant que `power` : l analyse rend toujours les deux, et une fixture qui
    // n ecrivait que la mesure decrivait une schematique qui ne peut pas exister.
    Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Reacteur nourri', 'blocks' => 30,
        'produces' => [],
        'power_made' => 900.0, 'power_used' => 40.0,
        'analysis' => [
            'power' => ['made' => 900.0, 'spent' => 40.0],
            'potential' => ['made' => 900.0, 'spent' => 40.0],
        ],
    ]);

    $page = $this->get('/schemas?produit='.SchematicItem::POWER.'&tri=output')->assertOk();

    $page->assertSee('Reacteur nourri');
    $page->assertSee('POLAR STAR');
});
