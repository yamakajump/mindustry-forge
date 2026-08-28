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

it('subtracts what both of them produce', function () {
    $a = comparable('Ligne large', ['graphite' => ['rate' => 40]]);
    $b = comparable('Ligne serree', ['graphite' => ['rate' => 25]]);

    $shared = (new Comparison($a, $b))->shared();

    expect($shared)->toHaveCount(1)
        ->and($shared[0]['item'])->toBe('graphite')
        ->and($shared[0]['gap'])->toBe(15.0)
        ->and($shared[0]['comparable'])->toBeTrue();
});

it('refuses to rank two schematics that do not make the same thing', function () {
    // Ranking forty graphite against twenty-five silicon would amount to declaring that
    // one graphite is worth one silicon, which is false and would be invisible. The same
    // mistake as the ranking by net power, fixed on 27/08.
    $a = comparable('Graphite', ['graphite' => ['rate' => 40]]);
    $b = comparable('Silicium', ['silicon' => ['rate' => 25]]);

    $comparison = new Comparison($a, $b);

    expect($comparison->comparable())->toBeFalse()
        ->and($comparison->shared())->toBe([]);

    $this->get("/comparer?a={$a->slug}&b={$b->slug}")
        ->assertOk()
        ->assertSee('rien en commun', false);
});

it('does not subtract a ceiling from a measurement', function () {
    // The imported catalogue arrives unmarked, so its rates can only be ceilings.
    // Subtracting them from a measurement would build a verdict out of two different
    // kinds of number.
    $a = comparable('Relue', ['graphite' => ['rate' => 40, 'kind' => SchematicItem::MESURE]]);
    $b = comparable('Importee', ['graphite' => ['rate' => 25, 'kind' => SchematicItem::PLAFOND]]);

    $comparison = new Comparison($a, $b);
    $row = $comparison->shared()[0];

    expect($comparison->mixedKinds())->toBeTrue()
        ->and($row['comparable'])->toBeFalse('the two kinds do not subtract');

    // Both values are still shown side by side: refusing the subtraction is not refusing
    // the information.
    $this->get("/comparer?a={$a->slug}&b={$b->slug}")
        ->assertOk()
        ->assertSee('40')
        ->assertSee('25');
});

it('says it is a ceiling even when both sides are one', function () {
    $a = comparable('Une', ['graphite' => ['rate' => 40, 'kind' => SchematicItem::PLAFOND]]);
    $b = comparable('Deux', ['graphite' => ['rate' => 25, 'kind' => SchematicItem::PLAFOND]]);

    $comparison = new Comparison($a, $b);

    // Comparable with one another, and still ceilings: the subtraction is legitimate, and
    // the kind of number still has to be stated.
    expect($comparison->mixedKinds())->toBeFalse()
        ->and($comparison->anyCeiling())->toBeTrue()
        ->and($comparison->shared()[0]['comparable'])->toBeTrue();
});

it('never names a winner', function () {
    // A schematic that produces more and costs three times as much is not better, it is a
    // different trade. No overall score is computed, and the page says so.
    $a = comparable('Grosse', ['graphite' => ['rate' => 40]], ['blocks' => 90]);
    $b = comparable('Petite', ['graphite' => ['rate' => 25]], ['blocks' => 12]);

    $comparison = new Comparison($a, $b);

    expect(method_exists($comparison, 'winner'))->toBeFalse('no winner, ever')
        ->and(method_exists($comparison, 'score'))->toBeFalse('and no overall score either');

    $this->get("/comparer?a={$a->slug}&b={$b->slug}")
        ->assertOk()
        ->assertSee('Aucun vainqueur', false);
});

it('gives space and power as a gap rather than as two columns', function () {
    $a = comparable('Etalee', ['graphite' => ['rate' => 40]],
        ['blocks' => 90, 'power_used' => 300]);
    $b = comparable('Compacte', ['graphite' => ['rate' => 40]],
        ['blocks' => 12, 'power_used' => 120]);

    $sizes = collect((new Comparison($a, $b))->sizes())->keyBy('key');

    expect($sizes['schema.comparer.mesure-blocs']['gap'])->toBe(78.0)
        ->and($sizes['schema.comparer.mesure-energie']['gap'])->toBe(180.0);
});

it('lists what one makes and the other does not, without calling it a gap', function () {
    $a = comparable('Mixte', ['graphite' => ['rate' => 40], 'silicon' => ['rate' => 10]]);
    $b = comparable('Simple', ['graphite' => ['rate' => 40]]);

    $comparison = new Comparison($a, $b);
    $seul = array_values(array_filter($comparison->outputs(),
        fn ($row) => $row['left'] === null || $row['right'] === null));

    expect($comparison->shared())->toHaveCount(1)
        ->and($seul)->toHaveCount(1)
        ->and($seul[0]['item'])->toBe('silicon');
});

it('does not pull a private or unlisted schematic into the page', function () {
    // A comparison is a page whose whole content is two other people's work, and its link
    // travels. An unlisted schematic is reachable at its own address, which is not the same
    // thing as being fair game beside a stranger's.
    $public = comparable('Publique', ['graphite' => ['rate' => 40]]);
    $unlisted = comparable('Par lien', ['graphite' => ['rate' => 25]],
        ['visibility' => Schematic::UNLISTED]);

    $this->get("/comparer?a={$public->slug}&b={$unlisted->slug}")
        ->assertOk()
        ->assertDontSee('Par lien');
});

it('stays a useful page with nothing chosen', function () {
    comparable('Une recente', ['graphite' => ['rate' => 40]]);

    $this->get('/comparer')
        ->assertOk()
        ->assertSee('Une recente');
});

it('does not take just anything as an identifier', function () {
    $this->get('/comparer?a='.urlencode('../../etc/passwd').'&b=x')->assertOk();
    $this->get('/comparer?a='.str_repeat('a', 200))->assertOk();
    $this->get('/comparer?a[]=1')->assertOk();
});

/*
 * Choosing a schematic rather than copying its key.
 *
 * The page used to take an identifier and nothing else: ten characters read off the list
 * printed right underneath, held in the head, typed into a box, twice. Corentin's words
 * were "nul pour rentrer des identifiants, pas du tout bien pense pour l'utilisateur", and
 * the list below the form was the proof: the site already knew which schematics it was
 * talking about and made the reader spell them out anyway.
 */

it('finds a schematic by its name, not only by its address', function () {
    $wanted = Schematic::factory()->create([
        'visibility' => Schematic::PUBLIC, 'name' => 'Ligne a graphite',
    ]);
    Schematic::factory()->create(['visibility' => Schematic::PUBLIC, 'name' => 'Reacteur']);

    // And nothing else: a search that found something does not go on offering eight
    // unrelated schematics underneath, which would be a second list to read.
    $this->get('/comparer?a=graphite')
        ->assertOk()
        ->assertSee('Ligne a graphite')
        ->assertDontSee('Reacteur');

    // And what was typed stays in the field, so correcting a search is not retyping it.
    $this->get('/comparer?a=graphite')->assertSee('value="graphite"', escape: false);
});

it('keeps the other side when one is picked from the results', function () {
    // Picking a candidate used to be impossible: the list linked to `/s/`, so clicking a
    // suggestion left the comparator and you came back with the identifier in your head.
    $left = Schematic::factory()->create(['visibility' => Schematic::PUBLIC, 'name' => 'Gauche']);
    $right = Schematic::factory()->create(['visibility' => Schematic::PUBLIC, 'name' => 'Droite']);

    $this->get("/comparer?a=Gauche&b={$right->slug}")
        ->assertOk()
        // The link that picks the left one carries the right one along.
        ->assertSee("?a={$left->slug}&b={$right->slug}", escape: false);
});

it('still answers an address, because links get pasted into threads', function () {
    $left = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $right = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->get("/comparer?a={$left->slug}&b={$right->slug}")
        ->assertOk()
        ->assertSee($left->displayName())
        ->assertSee($right->displayName());
});

it('reads what was typed as text, not as a pattern', function () {
    /*
     * `%` and `_` are wildcards to a `like`, and somebody searching for "100%" is not
     * writing a query. Without escaping, "%" alone would match the whole catalogue and
     * look like a search that found everything.
     */
    Schematic::factory()->create(['visibility' => Schematic::PUBLIC, 'name' => 'Rendement 100%']);
    Schematic::factory()->create(['visibility' => Schematic::PUBLIC, 'name' => 'Autre chose']);

    /*
     * A lone `%` finds the one name that literally contains a percent sign, and not the
     * other. Both halves matter: as a wildcard it would have returned everything, and
     * over-escaped it would have returned nothing. This is the assertion that tells those
     * three outcomes apart.
     *
     * It also needs an explicit `escape` in the SQL. SQLite has no default escape
     * character, so `\%` written without one is matched as two literal characters and
     * finds nothing, while MySQL takes `\` by default and finds it. Left implicit this
     * passes here and behaves differently in production, which is the failure this
     * repository keeps meeting in other clothes.
     */
    $this->get('/comparer?a=%25')
        ->assertOk()
        ->assertSee('Rendement 100%')
        ->assertDontSee('Autre chose');
});

it('says nothing was found rather than showing an empty form', function () {
    // An empty form after a search reads as "there is no such schematic", when what
    // happened is that it was never looked for.
    Schematic::factory()->create(['visibility' => Schematic::PUBLIC, 'name' => 'Reacteur']);

    $this->get('/comparer?a=introuvable')
        ->assertOk()
        ->assertSee(__('schema.comparer.rien-trouve'));
});

it('offers the comparison from the schematic page, with one side already filled', function () {
    /*
     * Where the gesture actually starts. Nobody arrives at the comparator with two
     * identifiers in mind: they are on a schematic and wondering how it stands.
     */
    $kept = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->get("/s/{$kept->slug}")
        ->assertOk()
        ->assertSee("/comparer?a={$kept->slug}", escape: false);
});

it('does not offer to compare something nobody else can see', function () {
    // A comparison is a public page. Offering it from an unlisted schematic would be
    // offering a link that answers nothing.
    $mine = Schematic::factory()->create(['visibility' => Schematic::UNLISTED]);

    $this->get("/s/{$mine->slug}")->assertOk()->assertDontSee('/comparer?a=');
});

it('survives every character a search box can be handed', function () {
    /*
     * A backslash in the search field returned a 500 in production and passed every test
     * here, because the local database is SQLite and the live one is MySQL. `escape '\\'`
     * is an escaped quote to MySQL, so the string literal never closes and the query is a
     * syntax error: one character, typed into a public box, by anybody.
     *
     * So this sends the characters rather than checking that the code escapes them. A test
     * asserting "the term was escaped" would pass with the wrong escaping function, which
     * is exactly what happened.
     */
    Schematic::factory()->create(['visibility' => Schematic::PUBLIC, 'name' => 'Rendement 100%']);
    Schematic::factory()->create(['visibility' => Schematic::PUBLIC, 'name' => 'Ligne_A']);
    Schematic::factory()->create(['visibility' => Schematic::PUBLIC, 'name' => 'Chemin\\Windows']);
    Schematic::factory()->create(['visibility' => Schematic::PUBLIC, 'name' => 'Sortie = entree']);

    $awkward = ['\\', '%', '_', '=', "'", '"', '\\\\', '%_\\', '100%', 'Ligne_A', '=%'];

    foreach ($awkward as $typed) {
        $this->get('/comparer?a='.rawurlencode($typed))->assertOk();
    }

    // And each one is still read as text: a search finds what literally contains it, and
    // nothing else. A wildcard would have matched everything, an over-escape nothing.
    $this->get('/comparer?a='.rawurlencode('\\'))->assertOk()->assertSee('Chemin\\Windows');
    $this->get('/comparer?a='.rawurlencode('_'))->assertOk()
        ->assertSee('Ligne_A')->assertDontSee('Rendement');
    $this->get('/comparer?a='.rawurlencode('='))->assertOk()->assertSee('Sortie = entree');
    $this->get('/comparer?a='.rawurlencode('%'))->assertOk()
        ->assertSee('Rendement 100%')->assertDontSee('Ligne_A');
});
