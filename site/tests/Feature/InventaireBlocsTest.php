<?php

use App\Models\Schematic;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * L'inventaire des blocs, cote base.
 *
 * `schematic_blocks` etait vide sur les 15 533 lignes collectees. La relation existait, la
 * table existait, `indexWhatItHolds()` etait bien appele au save et par `forge:indexer`.
 * Ce qui manquait est ailleurs : `countBlocks` lisait `analysis['detail']`, et `detail`
 * n'a jamais figure dans la liste blanche de `tools/ingest.mjs`.
 *
 * Le chemin interactif marchait, lui, parce que le navigateur poste le rapport entier.
 * C'est ce qui rendait le trou invisible de l'interieur.
 *
 * L'analyse rend maintenant `held`, un dictionnaire compact, et c'est lui qui traverse le
 * tamis. `detail` reste lu en second : une analyse enregistree avant ce changement doit
 * continuer d'etre lisible.
 */

it('lit l inventaire compact', function () {
    $kept = Schematic::factory()->create([
        'blocks' => 4,
        'analysis' => ['held' => ['conveyor' => 3, 'router' => 1]],
    ]);
    $kept->indexWhatItHolds();

    expect($kept->blocksHeld()->pluck('count', 'block')->all())
        ->toBe(['conveyor' => 3, 'router' => 1]);
});

it('retombe sur le detail pour une analyse enregistree avant', function () {
    /* Le repli n'est pas de la prudence gratuite : quinze mille analyses stockees n'ont pas
       `held`, et une page ouverte avant le deploiement postera encore `detail` seul. */
    $kept = Schematic::factory()->create([
        'blocks' => 3,
        'analysis' => ['detail' => [
            ['name' => 'conveyor'], ['name' => 'conveyor'], ['name' => 'router'],
        ]],
    ]);
    $kept->indexWhatItHolds();

    expect($kept->blocksHeld()->pluck('count', 'block')->all())
        ->toBe(['conveyor' => 2, 'router' => 1]);
});

it('prefere l inventaire quand les deux sont la', function () {
    /* Les deux decrivent la meme schematique et `held` est le chiffre que l'analyse a
       calcule ; les compter tous les deux doublerait l'inventaire. */
    $kept = Schematic::factory()->create([
        'blocks' => 2,
        'analysis' => [
            'held' => ['conveyor' => 2],
            'detail' => [['name' => 'conveyor'], ['name' => 'conveyor']],
        ],
    ]);
    $kept->indexWhatItHolds();

    expect($kept->blocksHeld()->pluck('count', 'block')->all())->toBe(['conveyor' => 2]);
});

it('se defend contre ce qu un navigateur peut envoyer', function () {
    /* L'analyse arrive d'un navigateur, et un navigateur envoie ce qu'il veut. Meme regle
       que le reste de `fromAnalysis` : on convertit et on jette, on ne fait pas confiance. */
    $kept = Schematic::factory()->create([
        'blocks' => 1,
        'analysis' => ['held' => [
            'conveyor' => 90000,
            'router' => 0,
            'sorter' => 'beaucoup',
            '' => 4,
        ]],
    ]);
    $kept->indexWhatItHolds();

    expect($kept->blocksHeld()->pluck('count', 'block')->all())
        ->toBe(['conveyor' => 65535]);
});
