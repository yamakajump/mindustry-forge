<?php

use App\Models\Schematic;
use App\Models\SchematicItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

/**
 * What the listing ranks on, and what it costs to answer.
 *
 * Two separate problems met on this page, and one of them was hiding the other.
 *
 * The cost: over fifteen thousand rows a single view spent 141 ms reading the `produces`
 * blob of every public schematic to fill a dropdown of twenty, and its default sort was an
 * expression no index could serve. Both are gone now that what a schematic makes is a row
 * in `schematic_items` rather than a key in a blob.
 *
 * The meaning: that default sort ranked on net power, so every factory that consumes
 * electricity scored below zero and sorted beneath an empty schematic. Electricity is
 * something a base already has. It is a prerequisite the page states, never a debt held
 * against a schematic, and these tests are what keep it that way.
 */
function ligne(string $name, array $makes, float $powerUsed = 0, float $powerMade = 0, int $blocks = 40): Schematic
{
    /*
     * `analysis['power']` alongside the columns, and not merely to keep these tests green.
     *
     * The two are different figures: the columns are filled from `analysis['potential']`,
     * the ceiling, while `analysis['power']` is what the layout was measured doing. Only
     * the second may be indexed as a measurement. A fixture that set the columns alone
     * described a schematic whose ceiling was known and whose measurement was missing,
     * which is precisely the 195 rows this rule exists for.
     *
     * Set to the same figures here on purpose: these are plants that are fed, so the two
     * agree, and every assertion below is about the net-versus-gross rule rather than
     * about which of the two figures is being read.
     *
     * The ceiling is written as well, and that is not padding. Every real schematic carries
     * both: `indexWhatItMakes` writes the measurement and `indexWhatItCouldMake` the
     * ceiling, from the same analysis. A fixture that wrote only the measurement described a
     * schematic that cannot exist, and it went unnoticed for as long as the listing ranked
     * on measurements alone.
     */
    return Schematic::factory()->create([
        'visibility' => 'public', 'name' => $name, 'produces' => $makes,
        'power_used' => $powerUsed, 'power_made' => $powerMade, 'blocks' => $blocks,
        'analysis' => [
            'power' => ['made' => $powerMade, 'spent' => $powerUsed],
            'potentialPerMinute' => $makes,
            'potential' => ['made' => $powerMade, 'spent' => $powerUsed],
        ],
    ]);
}

it('ne penalise pas une usine parce qu elle consomme du courant', function () {
    /*
     * The bug this whole design turns on. Ranking on `power_made - power_used` meant a
     * silicon smelter, which eats power and makes none, scored negative, so it sorted
     * below a schematic containing nothing at all. The default view of a site whose pitch
     * is "search by what it makes" showed reactors and empty plates.
     */
    ligne('Four a silicium', ['silicon' => 90.0], powerUsed: 600);
    ligne('Presse a graphite', ['graphite' => 30.0]);
    Schematic::factory()->create(['visibility' => 'public', 'name' => 'Plaque vide', 'blocks' => 40]);

    $page = $this->get('/schematiques?produit=silicon&tri=best')->assertOk();

    $page->assertSee('Four a silicium')
        ->assertDontSee('Plaque vide')
        ->assertDontSee('Presse a graphite');
});

it('classe sur ce qui sort, rapporte a la place occupee', function () {
    ligne('Grosse et molle', ['graphite' => 100.0], blocks: 200);
    ligne('Petite et vive', ['graphite' => 60.0], blocks: 10);

    $page = $this->get('/schematiques?produit=graphite&tri=best')->assertOk()->getContent();

    expect(strpos($page, 'Petite et vive'))->toBeLessThan(strpos($page, 'Grosse et molle'));
});

it('traite l energie comme une production, donc comme un item cherchable', function () {
    // A reactor makes energy the way a press makes graphite, so it is found the same way.
    ligne('Reacteur compact', [], powerUsed: 40, powerMade: 900, blocks: 30);
    ligne('Four a silicium', ['silicon' => 90.0], powerUsed: 600);

    $this->get('/schematiques?produit='.SchematicItem::POWER.'&tri=best')
        ->assertOk()
        ->assertSee('Reacteur compact')
        ->assertDontSee('Four a silicium');
});

it('classe une centrale sur ce qu elle laisse, pas sur ce qu elle brule', function () {
    /*
     * A plant making six thousand and burning thirteen hundred on its own pumps hands the
     * base four thousand seven hundred, and that is what somebody comparing two reactors
     * is comparing. This is not the consumption rule in reverse: a factory's power draw
     * still never touches its ranking on graphite. It is that when energy is the product,
     * the product is the surplus.
     */
    $gourmande = ligne('Grosse et gourmande', [], powerUsed: 1300, powerMade: 6000, blocks: 100);
    $sobre = ligne('Petite et sobre', [], powerUsed: 0, powerMade: 5000, blocks: 100);

    expect($gourmande->items()->where('item', SchematicItem::POWER)->value('rate'))->toBe(4700.0)
        ->and($sobre->items()->where('item', SchematicItem::POWER)->value('rate'))->toBe(5000.0);

    $page = $this->get('/schematiques?produit='.SchematicItem::POWER.'&tri=best')
        ->assertOk()->getContent();

    expect(strpos($page, 'Petite et sobre'))->toBeLessThan(strpos($page, 'Grosse et gourmande'));
});

it('ne repertorie pas comme centrale ce qui consomme plus qu il ne produit', function () {
    // A factory with a few solar panels on it is not a power plant, and must not turn up
    // under "produit de l'energie" ahead of something that actually supplies any.
    $usine = ligne('Usine avec panneaux', ['silicon' => 90.0], powerUsed: 600, powerMade: 100);

    expect($usine->items()->where('kind', SchematicItem::MESURE)->pluck('item')->all())
        ->toBe(['silicon']);
});

it('ne pretend pas classer un rendement sans savoir de quoi on parle', function () {
    /*
     * Ranking forty graphite a minute against twenty-five silicon a minute would declare
     * one graphite worth one silicon. It is false, and it would be invisible. So with no
     * item chosen the listing sorts by date and says so.
     */
    ligne('Une schematique', ['graphite' => 40.0]);

    $page = $this->get('/schematiques?tri=best')->assertOk();

    expect($page->viewData('order'))->toBe('new');
    $page->assertSee('Classees par date, faute de mieux');
});

it('dit sur la page qu il faudra l alimenter', function () {
    // The page used to mention power only when there was a surplus, so a silicon line
    // asking for six hundred energy a second said nothing at all about needing any.
    $usine = ligne('Four a silicium', ['silicon' => 90.0], powerUsed: 600);

    $this->get("/s/{$usine->slug}")
        ->assertOk()
        ->assertSee('Il lui faut')
        ->assertSee('electricite')
        ->assertSee('600')
        ->assertSee('il faudra la brancher sur ton reseau', escape: false)
        // And it must be clear this is not held against it.
        ->assertSee('Ce n\'est pas compte contre elle', escape: false);
});

it('dit au contraire ce qu une centrale laisse au reste de la base', function () {
    $centrale = ligne('Reacteur compact', [], powerUsed: 40, powerMade: 900, blocks: 30);

    $this->get("/s/{$centrale->slug}")
        ->assertOk()
        ->assertSee('elle s\'alimente', escape: false)
        ->assertSee('860');
});

it('tient l index de ce qu elle produit a jour a chaque ecriture', function () {
    $schematic = ligne('Chaine', ['graphite' => 40.0], powerMade: 300, blocks: 20);

    expect($schematic->items()->where('kind', SchematicItem::MESURE)
        ->pluck('rate_per_block', 'item')->all())
        ->toBe(['graphite' => 2.0, SchematicItem::POWER => 15.0]);

    /* Corrected to make something else: it has to stop turning up under graphite.
     *
     * The analysis is rewritten alongside the column, because that is where the measured
     * budget lives now. Clearing `power_made` alone would leave the schematic indexed as a
     * power plant while its own analysis said it made none - which is the same crossing of
     * the measured/ceiling line this rule closes, arriving from the other direction. */
    $schematic->update([
        'produces' => ['silicon' => 10.0], 'power_made' => 0,
        'analysis' => ['power' => ['made' => 0, 'spent' => 0]],
    ]);

    expect($schematic->items()->where('kind', SchematicItem::MESURE)->pluck('item')->all())
        ->toBe(['silicon']);
});

it('ne relit pas tout le catalogue a chaque affichage de la liste', function () {
    // The 141 ms: filling the dropdown meant pulling every public row's `produces` into
    // PHP and counting keys, on every single view, for twenty entries.
    Schematic::factory()->count(30)->create([
        'visibility' => 'public', 'produces' => ['graphite' => 40.0],
    ]);

    DB::flushQueryLog();
    DB::enableQueryLog();
    $this->get('/schematiques')->assertOk();

    $lourdes = collect(DB::getQueryLog())->pluck('query')
        ->filter(fn ($sql) => str_contains($sql, 'produces') && ! str_contains($sql, 'limit'));

    expect($lourdes->all())->toBeEmpty();
});

it('propose les items reellement produits, l energie comprise', function () {
    ligne('Chaine a graphite', ['graphite' => 40.0]);
    ligne('Reacteur', [], powerMade: 900);
    Schematic::factory()->create(['visibility' => 'private', 'produces' => ['thorium' => 5.0]]);

    $page = $this->get('/schematiques')->assertOk();

    expect($page->viewData('items'))->toContain('graphite', SchematicItem::POWER)
        // Nothing private leaks into the dropdown.
        ->and($page->viewData('items'))->not->toContain('thorium');
});

it('ne construit pas une requete avec ce que le visiteur tape', function () {
    ligne('Presse a graphite', ['graphite' => 40.0]);

    foreach (["graphite' or '1'='1", str_repeat('x', 300), 'GRAPHITE"', '../etc'] as $bidon) {
        $this->get('/schematiques?produit='.urlencode($bidon))
            ->assertOk()
            // Rejected, so the filter falls away and the listing is simply unfiltered.
            ->assertSee('Presse a graphite');
    }
});

it('donne un ordre total, pour que la pagination ne perde rien', function () {
    /*
     * Every sort here has ties, and rows that compare equal come back in whatever order
     * the database found convenient, which it has no reason to repeat between two pages.
     * The result would be a schematic shown twice while another is never shown at all.
     */
    // Le plafond autant que la mesure, comme toute schematique reelle en porte : c est sur
    // le plafond que la vitrine classe, faute d une mesure dans le catalogue importe.
    Schematic::factory()->count(50)->create([
        'visibility' => 'public', 'produces' => ['graphite' => 40.0], 'blocks' => 10,
        'analysis' => ['potentialPerMinute' => ['graphite' => 40.0]],
    ]);

    $vus = [];
    foreach (range(1, 3) as $page) {
        foreach ($this->get("/schematiques?produit=graphite&tri=best&page={$page}")
            ->assertOk()->viewData('schematics')->items() as $row) {
            $vus[] = $row->id;
        }
    }

    expect($vus)->toHaveCount(50)
        ->and(array_unique($vus))->toHaveCount(50);
});

it('sait dire quatre choses differentes du meme objet', function () {
    /*
     * Deux axes independants, poses ensemble parce que trois chantiers arrivaient sur
     * cette table en meme temps. Ce qui sort et ce qui entre sont des questions opposees ;
     * un debit constate et un plafond sont deux reponses a la meme question, et melanger
     * les deux dans un classement est le mensonge qu on a passe la journee a reparer.
     */
    $schematic = ligne('Four a silicium', ['silicon' => 90.0], powerUsed: 600);

    /* Le plafond produit est deja ecrit par la fixture, comme l analyse l ecrit pour toute
       schematique reelle : `updateOrCreate` plutot que `create`, sinon la contrainte
       d unicite refuse la ligne et le test echoue sur sa propre mise en place. */
    foreach ([
        [SchematicItem::PRODUIT, SchematicItem::PLAFOND, 240.0],
        [SchematicItem::CONSOMME, SchematicItem::MESURE, 120.0],
        [SchematicItem::CONSOMME, SchematicItem::PLAFOND, 300.0],
    ] as [$sens, $kind, $rate]) {
        $schematic->items()->updateOrCreate(
            ['item' => 'silicon', 'sens' => $sens, 'kind' => $kind],
            ['rate' => $rate, 'rate_per_block' => $rate / $schematic->blocks],
        );
    }

    expect($schematic->items()->where('item', 'silicon')->count())->toBe(4);
});

it('classe sur le plafond, qui est la seule nature que tout le catalogue porte', function () {
    /*
     * Cette regle disait l inverse jusqu ici : seule une mesure etait cherchable, et un
     * plafond etait ecarte du classement comme de la liste. C etait defendable et ca rendait
     * le catalogue muet.
     *
     * Mesure en production : 117 schematiques portent une mesure contre 6 775 un plafond, et
     * ni le graphite ni le silicium n avaient un seul resultat alors que 844 et 1 700 plans
     * en produisent. Ce n est pas un retard qui se resorbe : une schematique arrachee d une
     * base n a pas la foreuse qui l alimentait, donc sa mesure vaut zero et le restera.
     *
     * Le plafond seul, et non « plafond ou mesure », parce qu un classement qui melange deux
     * natures est la faute reparee sur l energie nette. Et il n exclut personne : le plafond
     * se calcule avec une alimentation infinie, donc il est toujours superieur ou egal a la
     * mesure. Une seule nature dans un seul ordre, sans rien perdre.
     */
    $mesuree = ligne('Constatee', ['graphite' => 30.0], blocks: 10);

    $plafond = ligne('Au mieux', [], blocks: 10);
    $plafond->items()->create([
        'item' => 'graphite', 'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::PLAFOND, 'rate' => 900.0, 'rate_per_block' => 90.0,
    ]);

    // Les deux sont la, et celle qui promet le plus passe devant.
    $this->get('/schematiques?produit=graphite&tri=best')
        ->assertOk()
        ->assertSee('Au mieux')
        ->assertSee('Constatee');

    // Et un plafond peuple la liste deroulante, sans quoi le catalogue reste incherchable.
    $vide = ligne('Sans rien', [], blocks: 10);
    $vide->items()->create([
        'item' => 'thorium', 'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::PLAFOND, 'rate' => 5.0, 'rate_per_block' => 0.5,
    ]);

    expect($this->get('/schematiques')->assertOk()->viewData('items'))
        ->toContain('graphite')->toContain('thorium');

    // La mesure n est pas perdue pour autant : elle reste ecrite a cote de son plafond.
    expect($mesuree->items()->where('kind', SchematicItem::MESURE)->count())->toBe(1)
        ->and($mesuree->items()->where('kind', SchematicItem::PLAFOND)->count())->toBe(1);
});

it('ne jette pas le travail d une autre passe en enregistrant', function () {
    /*
     * Renommer une schematique reconstruit son index de production mesuree. Si cette
     * reconstruction balayait toute la table, elle emporterait les plafonds et les
     * consommations etablis ailleurs, et personne ne verrait qu ils ont disparu.
     */
    $schematic = ligne('Chaine', ['graphite' => 40.0], blocks: 20);
    $schematic->items()->create([
        'item' => 'coal', 'sens' => SchematicItem::CONSOMME,
        'kind' => SchematicItem::MESURE, 'rate' => 80.0, 'rate_per_block' => 4.0,
    ]);

    $schematic->update(['name' => 'Chaine renommee']);

    expect($schematic->items()->where('sens', SchematicItem::CONSOMME)->count())->toBe(1)
        ->and($schematic->items()->where('sens', SchematicItem::PRODUIT)
            ->where('kind', SchematicItem::MESURE)->count())->toBe(1);
});
