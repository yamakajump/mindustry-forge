<?php

use App\Models\Schematic;
use App\Models\SchematicItem;
use App\Services\EngineVersion;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * Une correction qui ne s'applique a rien.
 *
 * Le robinet de bac a sable est reconnu, dit plutot que chiffre, et retire de l'index des
 * producteurs. Tout cela est vrai du code, et faux des mille deux cent quarante-six lignes
 * pour lesquelles il a ete ecrit.
 *
 * `schematic_items` est reconstruit par le crochet `saved`, et le seul chemin qui sauve une
 * ligne en masse est `forge:analyser`, qui ne prend que ce que `stale()` designe. `stale()`
 * compare `engine_version` au hache du moteur, et ce hache ne couvre que des fichiers
 * JavaScript et le catalogue. Une correction ecrite entierement en PHP ne le change donc
 * pas : la file reste vide, les lignes ne sont jamais reprises, et l'index garde ce qu'il
 * avait.
 *
 * Deployer ne suffit pas non plus : le deploiement change le code, pas les lignes deja
 * ecrites. Ces tests tiennent les deux moities, celle qui marche et celle qui n'atteint
 * personne.
 */

/** Une analyse comme le navigateur la rend, avec un robinet d'energie dedans. */
function analyseAvecRobinet(): array
{
    return [
        'width' => 10, 'height' => 10, 'blocks' => 2,
        'perMinute' => ['silicon' => 90.0],
        'potentialPerMinute' => ['silicon' => 90.0],
        'potential' => ['made' => 999_999.94, 'spent' => 29.0],
        'needs' => [],
        'detail' => [['name' => 'power-source'], ['name' => 'battery']],
    ];
}

it('reconstruit bien l index quand la ligne est sauvee', function () {
    $one = Schematic::factory()->imported()->create([
        'analysis' => analyseAvecRobinet(),
        'engine_version' => EngineVersion::current(),
    ]);

    // Ce que l'ancien code avait ecrit, et que la production porte encore.
    SchematicItem::create([
        'schematic_id' => $one->id,
        'item' => SchematicItem::POWER,
        'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::MESURE,
        'rate' => 999_970.94,
        'rate_per_block' => 499_985.47,
    ]);

    $one->touch();

    expect($one->items()->where('kind', SchematicItem::MESURE)->count())->toBe(0,
        'une sauvegarde reconstruit l index et jette le plafond du robinet');
});

it('mais rien ne sauve jamais ces lignes, parce que le moteur n a pas bouge', function () {
    $one = Schematic::factory()->imported()->create([
        'analysis' => analyseAvecRobinet(),
        'engine_version' => EngineVersion::current(),
    ]);

    /* Le seul chemin de masse est `forge:analyser`, et il ne prend que `stale()`. Une
       correction ecrite en PHP ne change pas le hache du moteur, donc cette ligne n'y est
       pas, donc elle ne sera jamais reprise et son index ne sera jamais reconstruit. */
    expect(Schematic::stale()->pluck('id'))->not->toContain($one->id,
        'si cette ligne devenait perimee, le reste de ce test n a plus lieu d etre');
});

it('donc une ligne deja indexee garde son plafond, deploiement ou pas', function () {
    $one = Schematic::factory()->imported()->create([
        'analysis' => analyseAvecRobinet(),
        'engine_version' => EngineVersion::current(),
    ]);

    SchematicItem::create([
        'schematic_id' => $one->id,
        'item' => SchematicItem::POWER,
        'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::MESURE,
        'rate' => 999_970.94,
        'rate_per_block' => 499_985.47,
    ]);

    // Personne ne la touche : c'est exactement l'etat de la production apres un deploiement.
    expect(SchematicItem::query()
        ->where('sens', SchematicItem::PRODUIT)
        ->where('kind', SchematicItem::MESURE)
        ->where('rate', '>', 100_000)
        ->count())->toBe(1,
            'le classement par energie reste mene par un chiffre qu aucun joueur ne suit');
});

it('et forge:indexer est ce qui la reprend', function () {
    $one = Schematic::factory()->imported()->create([
        'analysis' => analyseAvecRobinet(),
        'engine_version' => EngineVersion::current(),
    ]);

    SchematicItem::create([
        'schematic_id' => $one->id,
        'item' => SchematicItem::POWER,
        'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::MESURE,
        'rate' => 999_970.94,
        'rate_per_block' => 499_985.47,
    ]);

    $this->artisan('forge:indexer')->assertSuccessful();

    expect($one->items()->where('kind', SchematicItem::MESURE)->count())->toBe(0,
        'le plafond du robinet doit avoir quitte le classement des producteurs');
});

it('ne touche pas une vraie usine, ni sa date', function () {
    /* Le test qui compte le plus ici. Une passe de menage qui vide le catalogue n'est pas
       une correction, et une qui remonte quinze mille lignes en tete de « recemment
       modifiees » se voit par tout le monde pour un travail que personne n'a demande. */
    $real = Schematic::factory()->imported()->create([
        'analysis' => [
            'width' => 10, 'height' => 10, 'blocks' => 2,
            'perMinute' => ['silicon' => 90.0],
            'potentialPerMinute' => ['silicon' => 90.0],
            'potential' => ['made' => 108.0, 'spent' => 29.0],
            'needs' => [],
            'detail' => [['name' => 'silicon-smelter'], ['name' => 'thermal-generator']],
        ],
        'engine_version' => EngineVersion::current(),
    ]);

    $before = $real->fresh()->updated_at;
    $this->artisan('forge:indexer')->assertSuccessful();

    expect($real->items()->where('item', 'silicon')->count())->toBe(1,
        'une usine reelle reste indexee sous ce qu elle produit');
    expect($real->fresh()->updated_at->equalTo($before))->toBeTrue(
        'reclasser n est pas modifier');
});
