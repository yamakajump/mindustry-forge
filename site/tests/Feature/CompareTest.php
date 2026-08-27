<?php

use App\Models\Schematic;
use App\Models\SchematicItem;
use App\Support\Comparison;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * What this page is worth is what it refuses to say.
 *
 * Subtracting two rates is arithmetic anybody can do. The value is in the three cases where
 * there is no answer and the page says so instead of inventing one: two layouts that make
 * different things, a measurement set against a ceiling, and the overall verdict that never
 * exists. Each of those has a test here, because each of them is a line somebody will
 * "simplify" later.
 */

/** A public schematic with figures already indexed, as the ingestion pass leaves them. */
function comparable(string $name, array $produces, array $extra = []): Schematic
{
    $schematic = Schematic::factory()->create(array_merge([
        'visibility' => Schematic::PUBLIC,
        'name' => $name,
        'blocks' => 20,
        'width' => 5,
        'height' => 4,
    ], $extra));

    $schematic->items()->delete();
    foreach ($produces as $item => $spec) {
        $schematic->items()->create([
            'item' => $item,
            'sens' => SchematicItem::PRODUIT,
            'kind' => $spec['kind'] ?? SchematicItem::MESURE,
            'rate' => $spec['rate'],
            'rate_per_block' => $spec['rate'] / max(1, $schematic->blocks),
        ]);
    }

    return $schematic->fresh(['items']);
}

it('soustrait ce que les deux produisent', function () {
    $a = comparable('Ligne large', ['graphite' => ['rate' => 40]]);
    $b = comparable('Ligne serree', ['graphite' => ['rate' => 25]]);

    $shared = (new Comparison($a, $b))->shared();

    expect($shared)->toHaveCount(1)
        ->and($shared[0]['item'])->toBe('graphite')
        ->and($shared[0]['gap'])->toBe(15.0)
        ->and($shared[0]['comparable'])->toBeTrue();
});

it('refuse de departager deux schematiques qui ne font pas la meme chose', function () {
    // Classer quarante graphite contre vingt-cinq silicium reviendrait a decreter qu'un
    // graphite vaut un silicium, ce qui est faux et serait invisible. Meme faute que le
    // classement par energie nette repare le 27/08.
    $a = comparable('Graphite', ['graphite' => ['rate' => 40]]);
    $b = comparable('Silicium', ['silicon' => ['rate' => 25]]);

    $comparison = new Comparison($a, $b);

    expect($comparison->comparable())->toBeFalse()
        ->and($comparison->shared())->toBe([]);

    $this->get("/comparer?a={$a->slug}&b={$b->slug}")
        ->assertOk()
        ->assertSee('rien en commun', false);
});

it('ne soustrait pas une mesure et un plafond', function () {
    // Le catalogue importe arrive sans marquage, donc ses debits ne peuvent etre que des
    // plafonds. Les soustraire d'une mesure fabriquerait un verdict a partir de deux
    // natures de chiffre differentes.
    $a = comparable('Relue', ['graphite' => ['rate' => 40, 'kind' => SchematicItem::MESURE]]);
    $b = comparable('Importee', ['graphite' => ['rate' => 25, 'kind' => SchematicItem::PLAFOND]]);

    $comparison = new Comparison($a, $b);
    $row = $comparison->shared()[0];

    expect($comparison->mixedKinds())->toBeTrue()
        ->and($row['comparable'])->toBeFalse('les deux natures ne se soustraient pas');

    // Les deux valeurs restent montrees cote a cote : refuser la soustraction n'est pas
    // refuser l'information.
    $this->get("/comparer?a={$a->slug}&b={$b->slug}")
        ->assertOk()
        ->assertSee('40')
        ->assertSee('25');
});

it('signale un plafond meme quand les deux cotes en sont un', function () {
    $a = comparable('Une', ['graphite' => ['rate' => 40, 'kind' => SchematicItem::PLAFOND]]);
    $b = comparable('Deux', ['graphite' => ['rate' => 25, 'kind' => SchematicItem::PLAFOND]]);

    $comparison = new Comparison($a, $b);

    // Comparables entre eux, et toujours des plafonds : la soustraction est licite, la
    // nature du chiffre doit quand meme etre dite.
    expect($comparison->mixedKinds())->toBeFalse()
        ->and($comparison->anyCeiling())->toBeTrue()
        ->and($comparison->shared()[0]['comparable'])->toBeTrue();
});

it('ne designe jamais de vainqueur', function () {
    // Une schematique qui produit plus et coute trois fois plus cher n'est pas meilleure,
    // c'est un autre marche. Aucun score global n'est calcule, et la page le dit.
    $a = comparable('Grosse', ['graphite' => ['rate' => 40]], ['blocks' => 90]);
    $b = comparable('Petite', ['graphite' => ['rate' => 25]], ['blocks' => 12]);

    $comparison = new Comparison($a, $b);

    expect(method_exists($comparison, 'winner'))->toBeFalse('pas de vainqueur, jamais')
        ->and(method_exists($comparison, 'score'))->toBeFalse('et pas de score global');

    $this->get("/comparer?a={$a->slug}&b={$b->slug}")
        ->assertOk()
        ->assertSee('Aucun vainqueur', false);
});

it('dit la place et le courant en ecart plutot qu en deux colonnes', function () {
    $a = comparable('Etalee', ['graphite' => ['rate' => 40]],
        ['blocks' => 90, 'power_used' => 300]);
    $b = comparable('Compacte', ['graphite' => ['rate' => 40]],
        ['blocks' => 12, 'power_used' => 120]);

    $sizes = collect((new Comparison($a, $b))->sizes())->keyBy('key');

    expect($sizes['schema.comparer.mesure-blocs']['gap'])->toBe(78.0)
        ->and($sizes['schema.comparer.mesure-energie']['gap'])->toBe(180.0);
});

it('liste ce que l une fait et pas l autre sans en faire un ecart', function () {
    $a = comparable('Mixte', ['graphite' => ['rate' => 40], 'silicon' => ['rate' => 10]]);
    $b = comparable('Simple', ['graphite' => ['rate' => 40]]);

    $comparison = new Comparison($a, $b);
    $seul = array_values(array_filter($comparison->outputs(),
        fn ($row) => $row['left'] === null || $row['right'] === null));

    expect($comparison->shared())->toHaveCount(1)
        ->and($seul)->toHaveCount(1)
        ->and($seul[0]['item'])->toBe('silicon');
});

it('ne tire pas une schematique privee ou par lien dans la page', function () {
    // Une comparaison est une page dont tout le contenu est le travail de deux autres
    // personnes, et son lien voyage. Une schematique par lien est joignable par son adresse
    // a elle, ce qui n'est pas la meme chose qu'etre de bonne prise a cote d'une inconnue.
    $public = comparable('Publique', ['graphite' => ['rate' => 40]]);
    $unlisted = comparable('Par lien', ['graphite' => ['rate' => 25]],
        ['visibility' => Schematic::UNLISTED]);

    $this->get("/comparer?a={$public->slug}&b={$unlisted->slug}")
        ->assertOk()
        ->assertDontSee('Par lien');
});

it('reste une page utile sans rien de choisi', function () {
    comparable('Une recente', ['graphite' => ['rate' => 40]]);

    $this->get('/comparer')
        ->assertOk()
        ->assertSee('Une recente');
});

it('ne se laisse pas donner n importe quoi comme identifiant', function () {
    $this->get('/comparer?a='.urlencode('../../etc/passwd').'&b=x')->assertOk();
    $this->get('/comparer?a='.str_repeat('a', 200))->assertOk();
    $this->get('/comparer?a[]=1')->assertOk();
});
