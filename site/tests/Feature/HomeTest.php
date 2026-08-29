<?php

use App\Models\Schematic;
use App\Models\SchematicItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;

uses(RefreshDatabase::class);

/**
 * The home page, and the hole the server fills in it.
 *
 * The page stays a file. What the server adds is a `application/json` island, and what
 * matters about it is that it degrades to nothing: served by a static file server the
 * marker is an inert comment, and the page loses its showcase and keeps its analyser.
 */
/**
 * A schematic of the kind the catalogue holds.
 *
 * A ceiling, and a measurement only when one is asked for. That is the real shape: 14 847
 * ceiling rows against 419 measured ones, and those 419 carry nothing but power and gases,
 * a graphite schematic with a measurement does not exist.
 *
 * The first version of this file did the opposite, a measurement and no ceiling. It
 * described a catalogue that does not exist, and it kept green a piece of code that, in
 * production, could only show power and gases across fifteen thousand schematics.
 */
function produisant(string $nom, float $debit, string $item = 'silicon', ?float $mesure = null, ?int $blocs = null): Schematic
{
    /*
     * `blocs` is pinned as soon as a test compares two schematics against each other.
     *
     * The catalogue ranks on `rate_per_block`, not on `rate`, and the factory draws a block
     * count at random. A test that gives 900 to one and 100 to the other therefore asserts
     * a ranking by rate under code that ranks by yield: 100 over 5 blocks beats 900 over
     * 60. It passes most of the time and fails without warning, which is what happened.
     */
    /* And a block count the showcase will look at.
     *
     * It puts forward what a player would open, so it refuses anything under twenty blocks
     * and anything that fills less than a twentieth of its own frame - a tap of one block
     * and a 127-tile frame holding one were what it used to lead with. The factory draws
     * between 4 and 200 at random, so a test that did not pin this passed or failed on the
     * roll of a die. */
    $s = Schematic::factory()->create(array_filter([
        'visibility' => 'public',
        'name' => $nom,
        'blocks' => $blocs ?? 40,
        'width' => 12,
        'height' => 12,
    ], fn ($v) => $v !== null));
    $s->items()->delete();
    $s->items()->create([
        'item' => $item,
        'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::PLAFOND,
        'rate' => $debit,
        'rate_per_block' => $debit / max(1, $s->blocks),
    ]);

    if ($mesure !== null) {
        $s->items()->create([
            'item' => $item,
            'sens' => SchematicItem::PRODUIT,
            'kind' => SchematicItem::MESURE,
            'rate' => $mesure,
            'rate_per_block' => $mesure / max(1, $s->blocks),
        ]);
    }

    return $s;
}

/** What the island holds, decoded. */
function ilot(string $html): ?array
{
    if (! preg_match('~<script type="application/json" id="vitrine">(.*?)</script>~s', $html, $m)) {
        return null;
    }

    return json_decode($m[1], true);
}

it('puts its island in the page, with the real count', function () {
    produisant('Ligne de silicium', 3.0);
    produisant('Fonderie', 2.0);
    Schematic::factory()->create(['visibility' => 'private', 'name' => 'Privee']);

    $data = ilot($this->get('/')->getContent());

    expect($data)->not->toBeNull('no island in the page');
    expect($data['total'])->toBe(2, 'the count must ignore private ones and come from the database');
});

it('features only what produces a quantified amount', function () {
    produisant('Usine a graphite', 3.0, 'graphite');

    /* The sandbox makes nothing, so it cannot surface. That is a side effect of the
       criterion and not a blacklist to keep up to date. */
    Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Fps Droper',
        'blocks' => 40, 'width' => 12, 'height' => 12,
    ]);

    /* What it consumes is not what it produces. A schematic carrying input rows only moves
       nothing forward and has nothing to show in the catalogue. */
    $consomme = Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Ne fait que manger',
        'blocks' => 40, 'width' => 12, 'height' => 12,
    ]);
    $consomme->items()->delete();
    $consomme->items()->create([
        'item' => 'silicon', 'sens' => 'consomme',
        'kind' => SchematicItem::PLAFOND, 'rate' => 999, 'rate_per_block' => 999,
    ]);

    $noms = collect(ilot($this->get('/')->getContent())['schemas'])->pluck('nom');

    expect($noms)->toContain('Usine a graphite');
    expect($noms)->not->toContain('Fps Droper');
    expect($noms)->not->toContain('Ne fait que manger');
});

it('lets no collected name close the tag', function () {
    /* These names come from catalogues collected elsewhere: they are strings nobody here
       wrote, and some of them already carry markup. A `</script>` inside one would close
       the island and the rest of the page would turn into HTML. */
    produisant('</script><img src=x onerror=alert(1)>', 3.0);

    $html = $this->get('/')->getContent();

    expect($html)->not->toContain('</script><img');
    /* The name must survive the trip, only encoded in transport. */
    expect(ilot($html)['schemas'][0]['nom'])->toContain('</script>');
});

it('renders a working page even with nothing to show', function () {
    $html = $this->get('/')->getContent();

    expect(ilot($html)['schemas'])->toBe([]);
    /* The analyser must still be there, catalogue or not. */
    expect($html)->toContain('id="text"');
});

it('leaves the file readable as is by a static file server', function () {
    /* The README documents `python -m http.server` on `public/`. The marker must therefore
       stay an inert comment in the file, not a template fragment. */
    $fichier = file_get_contents(public_path('index.html'));

    expect($fichier)->toContain('<!--VITRINE-->');
    expect($fichier)->not->toContain('id="vitrine"');
    expect($fichier)->toContain('id="text"');
});

it('still serves the analyser when the database does not answer', function () {
    /* The analyser is the product and it computes in the browser. Dropping it along with
       the database, for a list of six names, would trade what works for what is pleasant.
       Proved by breaking the connection rather than by asserting it.

       The failure goes through a throwaway connection and through `database.default`, not
       through a `DB::purge` of the connection in use. Purging destroys the `:memory:`
       database that `RefreshDatabase` holds for the whole suite: the first version of this
       test passed alone and made ninety-two tests fail as a group.

       And the connection put back is the one that was taken, read rather than named. The
       second version hardcoded `sqlite` back: green locally where the suite runs on SQLite,
       and red on the MySQL job, which exists precisely to catch a test that picks its own
       database instead of using the suite's. Such a test proves nothing about
       production. */
    Log::spy();
    $connexion = config('database.default');

    config([
        'database.connections.casse' => ['driver' => 'sqlite', 'database' => '/inexistant/aucune.sqlite'],
        'database.default' => 'casse',
    ]);

    try {
        $reponse = $this->get('/');
    } finally {
        config(['database.default' => $connexion]);
    }

    $reponse->assertOk();
    expect($reponse->getContent())->toContain('id="text"');
    expect(ilot($reponse->getContent()))->toBe(['total' => 0, 'schemas' => []]);
    Log::shouldHaveReceived('warning');
});

it('states the same figure as the catalogue, for the same schematic', function () {
    /* Neither the home page test nor the catalogue one could see this defect: each checked
       its own page, and it was the gap between the two that was wrong. A visitor clicking
       from the home page lands on the schematic page, and was reading two different numbers
       for the same schematic, on a site whose argument is that its figures are provable. */
    $s = Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Turbine', 'produces' => ['water' => 39700],
        'blocks' => 40, 'width' => 12, 'height' => 12,
    ]);
    $s->items()->delete();
    $s->items()->create([
        'item' => 'water', 'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::PLAFOND, 'rate' => 39700, 'rate_per_block' => 500,
    ]);

    $accueil = collect(ilot($this->get('/')->getContent())['schemas'])
        ->firstWhere('nom', 'Turbine');
    $vitrine = $this->get('/schemas')->getContent();

    /* Already per minute: nothing to convert. */
    expect((float) $accueil['debit'])->toBe(39700.0);
    expect($accueil['unite'])->toBe('/ min');
    expect($vitrine)->toContain('39 700');
});

it('states power per second, as everywhere else on the site', function () {
    /* `rate` carries power per second and items per minute in the same column. Multiplying
       both by sixty gave a power figure that contradicted every other page, and a water
       rate sixty times too fast. */
    $s = Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Centrale',
        'blocks' => 40, 'width' => 12, 'height' => 12,
    ]);
    $s->items()->delete();
    $s->items()->create([
        'item' => SchematicItem::POWER, 'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::PLAFOND, 'rate' => 56562, 'rate_per_block' => 900,
    ]);

    $mis = collect(ilot($this->get('/')->getContent())['schemas'])->firstWhere('nom', 'Centrale');

    expect((float) $mis['debit'])->toBe(56562.0);
    expect($mis['unite'])->toBe('/ s');
    expect($mis['produit'])->toBe('Énergie');
});

it('says what it shows is a ceiling, every time', function () {
    /* A ceiling stated without saying so is a figure that lies: it is what the machines
       would put out fed at full rate, not what the schematic does. The catalogue tile
       carries the same wording, and both surfaces must carry it or neither.

       Without this test, dropping the wording went unnoticed: the first version of this
       file checked the figure and not what it claims to be. */
    produisant('Usine a graphite', 3.0, 'graphite');

    $mis = ilot($this->get('/')->getContent())['schemas'][0];

    expect($mis['au-mieux'])->toBe(__('schema.page.au-mieux'))->not->toBeEmpty();
    expect($this->get('/schemas')->getContent())->toContain(__('schema.page.au-mieux'));
});

/*
 * The spread, which is the whole reason the showcase was rewritten.
 *
 * It used to rank on `rate_per_block` across the catalogue and return the same answer six
 * times: two identical "Safe Reactor" rows, a schematic named "a", and six figures all
 * reading 6300 energy per second. Nothing was miscalculated. It answered "what is the very
 * best" on a page asking "what is in here", while 844 graphite schematics could never
 * appear.
 */
it('shows one schematic per product, not the best one six times', function () {
    /* Same size for both silicon ones, otherwise yield decides and the test would say
       something other than what it claims. */
    produisant('Silicium fort', 900, 'silicon', null, 40);
    produisant('Silicium faible', 100, 'silicon', null, 40);
    produisant('Graphite', 400, 'graphite');
    produisant('Plastanium', 200, 'plastanium');

    $tuiles = collect(ilot($this->get('/')->getContent())['schemas']);

    expect($tuiles->pluck('produit')->duplicates())->toBeEmpty()
        ->and($tuiles->pluck('slug')->duplicates())->toBeEmpty()
        ->and($tuiles->pluck('nom'))->toContain('Graphite', 'Plastanium')
        /* The best of its product, not the best outright: without that the silicon tile
           would be the weak one or would not exist. */
        ->and($tuiles->firstWhere('produit', 'Silicium')['nom'])->toBe('Silicium fort');
});

/*
 * The second query has to carry the nature of the first.
 *
 * The list of products is built on ceilings, because that is what the site can rank. A
 * schematic whose only row is a measurement must therefore not surface here: it would be a
 * figure of the other kind sitting under a heading built from ceilings, and there are
 * enough measured rows in the real catalogue to fill a page plausibly rather than to leave
 * it visibly empty.
 */
it('mixes no measurement into a catalogue of ceilings', function () {
    $mesure = Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Mesuree seule',
        'blocks' => 40, 'width' => 12, 'height' => 12,
    ]);
    $mesure->items()->delete();
    $mesure->items()->create([
        'item' => 'titanium',
        'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::MESURE,
        'rate' => 9999,
        'rate_per_block' => 9999,
    ]);
    produisant('Plafond', 10, 'silicon');

    $tuiles = collect(ilot($this->get('/')->getContent())['schemas']);

    expect($tuiles->pluck('nom'))->not->toContain('Mesuree seule')
        ->and($tuiles->pluck('nom'))->toContain('Plafond');
});

/*
 * What the tile needs to be drawn.
 *
 * The plan is drawn in the browser from the schematic's own code, so a tile without one is
 * a grey rectangle. Nothing imported has a stored picture, which is fifteen thousand of
 * them, so this is the only path that draws anything at all here.
 */
it('gives the tile what it needs to draw its plan', function () {
    produisant('Dessinable', 50, 'silicon');

    $tuile = ilot($this->get('/')->getContent())['schemas'][0];

    expect($tuile['code'])->not->toBeNull()
        ->and($tuile['largeur'])->not->toBeNull()
        ->and($tuile['hauteur'])->not->toBeNull()
        /* The product image comes from the same atlas as the plan, cut out by /icone. */
        ->and($tuile['icone'])->toContain('/icone/objet/silicon.png');
});

/* Power is neither an item nor a liquid: it has no sprite, and inventing one for it would
   be drawing what the game does not draw. The tile says so with a null, not with a broken
   image. */
it('promises no icon for what the game does not draw', function () {
    produisant('Centrale', 60, SchematicItem::POWER);

    expect(ilot($this->get('/')->getContent())['schemas'][0]['icone'])->toBeNull();
});

/*
 * The case the first version of this file did not have, and the page did.
 *
 * `it shows one schematic per product` gave every product a schematic of its own, so it
 * agreed with a design that promised "no duplicate possible". Opening the page showed `sand
 * to crucible 3.5` twice and `17PhaseMD` twice: a schematic that makes several things comes
 * first for several of them.
 *
 * Distinct products are not distinct schematics, and only a schematic that makes two things
 * says so.
 */
it('never shows the same plan twice under two products', function () {
    $double = Schematic::factory()->create(['visibility' => 'public', 'name' => 'Fait les deux']);
    $double->items()->delete();
    foreach (['silicon' => 9000, 'graphite' => 9000] as $item => $debit) {
        $double->items()->create([
            'item' => $item,
            'sens' => SchematicItem::PRODUIT,
            'kind' => SchematicItem::PLAFOND,
            'rate' => $debit,
            'rate_per_block' => $debit,
        ]);
    }
    produisant('Second graphite', 10, 'graphite');
    produisant('Second silicium', 10, 'silicon');

    $tuiles = collect(ilot($this->get('/')->getContent())['schemas']);

    expect($tuiles->pluck('slug')->duplicates())->toBeEmpty()
        ->and($tuiles->pluck('nom'))->toHaveCount(2)
        /* The strongest keeps its place, and the other product takes the next one rather
           than disappearing: an empty slot would cost the catalogue a product. */
        ->and($tuiles->pluck('nom'))->toContain('Fait les deux')
        ->and($tuiles->pluck('produit')->duplicates())->toBeEmpty();
});

it('keeps a tap and a copy accident out of the showcase', function () {
    /* Ranking on rate per block put the worst possible tiles at the top: the fewer blocks,
       the better the ratio, so the front door led with "6 300 energie/s, 127 x 127, 1 blocs"
       and "190 800 cryofluide/min". Both are real schematics in the catalogue and neither is
       a factory. */
    $tap = Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Une seule source',
        'blocks' => 1, 'width' => 1, 'height' => 1,
    ]);
    $tap->items()->delete();
    $tap->items()->create([
        'item' => 'silicon', 'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::PLAFOND, 'rate' => 190800, 'rate_per_block' => 190800,
    ]);

    // Mindustry caps a schematic at 128 tiles a side, so this shape really does arrive.
    $vide = Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Un bloc dans un desert',
        'blocks' => 25, 'width' => 127, 'height' => 127,
    ]);
    $vide->items()->delete();
    $vide->items()->create([
        'item' => 'silicon', 'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::PLAFOND, 'rate' => 99999, 'rate_per_block' => 4000,
    ]);

    // Both out-rank it on the figure the showcase sorts by, and it is the one shown.
    produisant('Vraie usine', 800.0, 'silicon');

    $noms = collect(ilot($this->get('/')->getContent())['schemas'])->pluck('nom');

    expect($noms)->not->toContain('Une seule source');
    expect($noms)->not->toContain('Un bloc dans un desert');
    expect($noms)->toContain('Vraie usine');
});
