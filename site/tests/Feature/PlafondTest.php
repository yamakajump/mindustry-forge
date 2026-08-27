<?php

use App\Models\Schematic;
use App\Models\SchematicItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * Le plafond en base : ce qu'une schematique pourrait faire, range a cote de ce qu'elle
 * fait, et jamais confondu avec.
 *
 * Deux lignes pour une meme schematique et un meme objet, distinguees par `kind`. C'est la
 * moitie qui rend le catalogue collecte utile : quinze mille conceptions que personne ne
 * marquera une par une n'ont pas de mesure, donc sans plafond « trouve-moi une usine a
 * silicium » ne les trouve pas.
 *
 * Et c'est aussi la moitie la plus facile a rendre malhonnete. Toute la journee du 27 aout
 * a servi a defaire un classement qui presentait comme une mesure ce qui n'en etait pas
 * une ; les tests ci-dessous existent pour que ca ne se reproduise pas a quinze mille
 * exemplaires.
 */

/** Ce que le navigateur renvoie pour une usine que rien n'alimente : un plafond, pas une mesure. */
function analyseAvecPlafond(array $ceiling = ['silicon' => 90.0], array $power = ['made' => 0, 'spent' => 0]): array
{
    return [
        'width' => 10, 'height' => 10, 'blocks' => 30,
        'perMinute' => [],
        'potentialPerMinute' => $ceiling,
        'potential' => $power,
        'needs' => [],
    ];
}

it('indexe le plafond sans le confondre avec une mesure', function () {
    $kept = Schematic::factory()->imported()->create([
        'blocks' => 30, 'analysis' => analyseAvecPlafond(),
    ]);

    $ceiling = $kept->items()->where('kind', SchematicItem::PLAFOND)->sole();

    expect($ceiling->item)->toBe('silicon')
        ->and($ceiling->sens)->toBe(SchematicItem::PRODUIT)
        ->and($ceiling->rate)->toBe(90.0)
        ->and($ceiling->rate_per_block)->toBe(3.0)
        // Et surtout : rien ne s'est glisse du cote mesure.
        ->and($kept->items()->where('kind', SchematicItem::MESURE)->count())->toBe(0);
});

it('laisse coexister la mesure et le plafond du meme objet', function () {
    // Une schematique marquee par son auteur a les deux, et ils ne disent pas la meme
    // chose : ce qu'elle rend branchee comme elle est, et ce qu'elle rendrait nourrie.
    $kept = Schematic::factory()->create([
        'blocks' => 30,
        'produces' => ['silicon' => 45.0],
        'analysis' => analyseAvecPlafond(['silicon' => 90.0]),
    ]);

    $rows = $kept->items()->where('item', 'silicon')->get()->keyBy('kind');

    expect($rows)->toHaveCount(2)
        ->and($rows[SchematicItem::MESURE]->rate)->toBe(45.0)
        ->and($rows[SchematicItem::PLAFOND]->rate)->toBe(90.0);
});

it('n efface pas le plafond quand un moderateur corrige un nom', function () {
    /*
     * Le piege que le pilote vient de reparer dans l'autre sens, et qui existe des deux
     * cotes. Une sauvegarde qui ne touche pas a l'analyse ne doit pas conclure que le
     * plafond est vide : elle n'en sait rien, elle ne l'a pas calcule.
     */
    $kept = Schematic::factory()->imported()->create([
        'blocks' => 30, 'analysis' => analyseAvecPlafond(),
    ]);

    $kept->update(['name' => 'Un nom corrige']);

    expect($kept->items()->where('kind', SchematicItem::PLAFOND)->count())->toBe(1);
});

it('ne laisse pas trainer un plafond que la schematique n atteint plus', function () {
    // Une schematique corrigee qui ne peut plus faire de silicium doit cesser de figurer
    // sous silicium, plafond comme mesure.
    $kept = Schematic::factory()->imported()->create([
        'blocks' => 30, 'analysis' => analyseAvecPlafond(['silicon' => 90.0]),
    ]);

    $kept->update(['analysis' => analyseAvecPlafond(['graphite' => 40.0])]);

    expect($kept->items()->where('kind', SchematicItem::PLAFOND)->pluck('item')->all())
        ->toBe(['graphite']);
});

it('indexe l energie au plafond sur ce qui reste, pas sur ce qui sort des generateurs', function () {
    /*
     * Meme regle que du cote mesure. Une centrale qui produit six mille et en brule treize
     * cents sur ses propres pompes en rend quatre mille sept cents a la base, et c'est ce
     * chiffre-la que quelqu'un qui compare deux reacteurs compare.
     */
    $kept = Schematic::factory()->imported()->create([
        'blocks' => 10,
        'analysis' => analyseAvecPlafond([], ['made' => 6000.0, 'spent' => 1300.0]),
    ]);

    $power = $kept->items()
        ->where('kind', SchematicItem::PLAFOND)
        ->where('item', SchematicItem::POWER)
        ->sole();

    expect($power->rate)->toBe(4700.0)
        ->and($power->rate_per_block)->toBe(470.0);
});

it('n invente pas de plafond pour une schematique qui n en a pas', function () {
    $kept = Schematic::factory()->create(['analysis' => ['width' => 4, 'blocks' => 2]]);

    expect($kept->items()->where('kind', SchematicItem::PLAFOND)->count())->toBe(0);
});

it('garde les plafonds hors de la vitrine tant que personne n a dit comment les montrer', function () {
    /*
     * La vitrine lit `sens = produit` et `kind = mesure`, explicitement. Un plafond en base
     * ne doit donc apparaitre ni dans le classement ni dans la liste deroulante : mieux
     * vaut invisible que melange a une mesure sans que rien ne les distingue.
     */
    $ceilingOnly = Schematic::factory()->for(User::factory())->create([
        'visibility' => Schematic::PUBLIC, 'name' => 'Plafond seul', 'blocks' => 30,
        'analysis' => analyseAvecPlafond(['silicon' => 900.0]),
    ]);

    expect($ceilingOnly->items()->where('kind', SchematicItem::PLAFOND)->count())->toBe(1);

    // Ni dans le classement filtre sur ce qu'elle est censee produire...
    $this->get('/schematiques?produit=silicon')
        ->assertOk()
        ->assertDontSee('Plafond seul');

    // ...ni dans la liste deroulante, qui n'offre que ce qui a ete mesure. Une entree
    // « silicon » qui ne rend aucune schematique serait une impasse pour le visiteur.
    $this->get('/schematiques')
        ->assertOk()
        ->assertDontSee('<option value="silicon"', escape: false);
});
