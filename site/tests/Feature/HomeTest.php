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
 * Une schematique comme le catalogue en contient.
 *
 * Un plafond, et une mesure seulement si on le demande. C'est la forme reelle : 14 847
 * lignes de plafond contre 419 de mesure, et sur ces 419 il n'y a que de l'energie et des
 * gaz -- une schematique a graphite avec une mesure n'existe pas.
 *
 * Le premier montage de ce fichier faisait l'inverse, une mesure et pas de plafond. Il
 * decrivait un catalogue qui n'existe pas, et il a rendu vert un code qui, en production,
 * ne pouvait montrer que de l'energie et des gaz sur quinze mille schematiques.
 */
function produisant(string $nom, float $debit, string $item = 'silicon', ?float $mesure = null, ?int $blocs = null): Schematic
{
    /*
     * `blocs` est fixe des qu'un test compare deux schematiques entre elles.
     *
     * La vitrine classe sur `rate_per_block`, pas sur `rate`, et la factory tire un nombre
     * de blocs au hasard. Un test qui donne 900 a l'une et 100 a l'autre affirme donc un
     * classement au debit sous un code qui classe au rendement : 100 sur 5 blocs bat 900 sur
     * 60. Il passe la plupart du temps et tombe sans prevenir, ce qui est arrive.
     */
    $s = Schematic::factory()->create(array_filter([
        'visibility' => 'public',
        'name' => $nom,
        'blocks' => $blocs,
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

/** Ce que l'ilot contient, decode. */
function ilot(string $html): ?array
{
    if (! preg_match('~<script type="application/json" id="vitrine">(.*?)</script>~s', $html, $m)) {
        return null;
    }

    return json_decode($m[1], true);
}

it('pose son ilot dans la page, avec le compte reel', function () {
    produisant('Ligne de silicium', 3.0);
    produisant('Fonderie', 2.0);
    Schematic::factory()->create(['visibility' => 'private', 'name' => 'Privee']);

    $data = ilot($this->get('/')->getContent());

    expect($data)->not->toBeNull('aucun ilot dans la page');
    expect($data['total'])->toBe(2, 'le compte doit ignorer les privees et venir de la base');
});

it('ne met en avant que ce qui produit une quantite mesuree', function () {
    produisant('Usine a graphite', 3.0, 'graphite');

    /* Le bac a sable ne produit rien, donc il ne peut pas remonter. C'est un effet de bord
       du critere et pas une liste noire a tenir a jour. */
    Schematic::factory()->create(['visibility' => 'public', 'name' => 'Fps Droper']);

    /* Ce qu'elle consomme n'est pas ce qu'elle produit. Une schematique qui n'a que des
       lignes d'entree ne fait rien avancer et n'a rien a montrer en vitrine. */
    $consomme = Schematic::factory()->create(['visibility' => 'public', 'name' => 'Ne fait que manger']);
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

it('ne laisse pas un nom collecte fermer la balise', function () {
    /* Ces noms viennent de catalogues collectes ailleurs : ce sont des chaines que personne
       ici n'a ecrites, et il en existe deja qui portent du balisage. Un `</script>` dedans
       fermerait l'ilot et le reste de la page deviendrait du HTML. */
    produisant('</script><img src=x onerror=alert(1)>', 3.0);

    $html = $this->get('/')->getContent();

    expect($html)->not->toContain('</script><img');
    /* Le nom doit survivre au voyage, seulement encode dans le transport. */
    expect(ilot($html)['schemas'][0]['nom'])->toContain('</script>');
});

it('rend une page qui marche meme sans rien a montrer', function () {
    $html = $this->get('/')->getContent();

    expect(ilot($html)['schemas'])->toBe([]);
    /* L'analyseur doit rester la, catalogue ou pas. */
    expect($html)->toContain('id="text"');
});

it('laisse le fichier lisible tel quel par un serveur de fichiers', function () {
    /* Le README documente `python -m http.server` sur `public/`. Le marqueur doit donc
       rester un commentaire inerte dans le fichier, pas un fragment de gabarit. */
    $fichier = file_get_contents(public_path('index.html'));

    expect($fichier)->toContain('<!--VITRINE-->');
    expect($fichier)->not->toContain('id="vitrine"');
    expect($fichier)->toContain('id="text"');
});

it('sert encore l analyseur quand la base ne repond pas', function () {
    /* L'analyseur est le produit et il calcule dans le navigateur. Le laisser tomber avec
       la base, pour une liste de six noms, echangerait ce qui marche contre ce qui est
       agreable. Prouve en cassant la connexion plutot qu'en l'affirmant.

       La panne passe par une connexion jetable et par `database.default`, pas par un
       `DB::purge` de la connexion en cours. Purger detruit la base `:memory:` que
       `RefreshDatabase` tient pour toute la suite : la premiere version de ce test passait
       seule et faisait echouer quatre-vingt-douze tests en groupe.

       Et la connexion rendue est celle qu'on a prise, relevee et pas nommee. La deuxieme
       version remettait `sqlite` en dur : verte en local ou la suite tourne sur SQLite, et
       rouge sur le job MySQL, qui existe precisement pour attraper un test qui choisit sa
       base au lieu d'utiliser celle de la suite. Un tel test ne prouve rien sur la
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

it('annonce le meme chiffre que la place de marche, pour la meme schematique', function () {
    /* Ni le test de l'accueil ni celui de la vitrine ne pouvait voir ce defaut : chacun
       verifiait sa page, et c'est l'ecart entre les deux qui etait faux. Un visiteur qui
       clique depuis l'accueil arrive sur la fiche, et lisait deux nombres differents pour
       la meme schematique -- sur un site dont l'argument est que ses chiffres se prouvent. */
    $s = Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Turbine', 'produces' => ['water' => 39700],
    ]);
    $s->items()->delete();
    $s->items()->create([
        'item' => 'water', 'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::PLAFOND, 'rate' => 39700, 'rate_per_block' => 500,
    ]);

    $accueil = collect(ilot($this->get('/')->getContent())['schemas'])
        ->firstWhere('nom', 'Turbine');
    $vitrine = $this->get('/schemas')->getContent();

    /* Deja par minute : rien a convertir. */
    expect((float) $accueil['debit'])->toBe(39700.0);
    expect($accueil['unite'])->toBe('/ min');
    expect($vitrine)->toContain('39 700');
});

it('dit l energie par seconde, comme partout ailleurs sur le site', function () {
    /* `rate` porte des energies par seconde et des objets par minute dans la meme colonne.
       Multiplier les deux par soixante donnait une energie qui contredisait toutes les
       autres pages, et une eau soixante fois trop rapide. */
    $s = Schematic::factory()->create(['visibility' => 'public', 'name' => 'Centrale']);
    $s->items()->delete();
    $s->items()->create([
        'item' => SchematicItem::POWER, 'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::PLAFOND, 'rate' => 56562, 'rate_per_block' => 900,
    ]);

    $mis = collect(ilot($this->get('/')->getContent())['schemas'])->firstWhere('nom', 'Centrale');

    expect((float) $mis['debit'])->toBe(56562.0);
    expect($mis['unite'])->toBe('/ s');
    expect($mis['produit'])->toBe('energie');
});

it('dit que ce qu il montre est un plafond, chaque fois', function () {
    /* Un plafond annonce sans le dire est un chiffre qui ment : c'est ce que les machines
       sortiraient alimentees a fond, pas ce que la schematique fait. La tuile de la vitrine
       porte la meme mention, et les deux surfaces doivent la porter ou aucune.

       Sans ce test, retirer la mention passait inapercu : la premiere version de ce fichier
       verifiait le chiffre et pas ce qu'il annonce etre. */
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
it('montre un schema par produit, pas six fois le meilleur', function () {
    /* Meme taille pour les deux silicium, sinon c'est le rendement qui tranche et le test
       dirait autre chose que ce qu'il annonce. */
    produisant('Silicium fort', 900, 'silicon', null, 40);
    produisant('Silicium faible', 100, 'silicon', null, 40);
    produisant('Graphite', 400, 'graphite');
    produisant('Plastanium', 200, 'plastanium');

    $tuiles = collect(ilot($this->get('/')->getContent())['schemas']);

    expect($tuiles->pluck('produit')->duplicates())->toBeEmpty()
        ->and($tuiles->pluck('slug')->duplicates())->toBeEmpty()
        ->and($tuiles->pluck('nom'))->toContain('Graphite', 'Plastanium')
        /* Le meilleur de son produit, pas le meilleur tout court : sans ca la tuile
           silicium serait la faible ou n'existerait pas. */
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
it('ne melange pas une mesure dans une vitrine de plafonds', function () {
    $mesure = Schematic::factory()->create(['visibility' => 'public', 'name' => 'Mesuree seule']);
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
it('donne a la tuile de quoi dessiner son plan', function () {
    produisant('Dessinable', 50, 'silicon');

    $tuile = ilot($this->get('/')->getContent())['schemas'][0];

    expect($tuile['code'])->not->toBeNull()
        ->and($tuile['largeur'])->not->toBeNull()
        ->and($tuile['hauteur'])->not->toBeNull()
        /* L'image du produit vient du meme atlas que le plan, decoupee par /icone. */
        ->and($tuile['icone'])->toContain('/icone/objet/silicon.png');
});

/* L'energie n'est ni un objet ni un liquide : elle n'a pas de sprite, et lui en inventer un
   serait dessiner ce que le jeu ne dessine pas. La tuile le dit par un null, pas par une
   image cassee. */
it('ne promet pas une icone a ce que le jeu ne dessine pas', function () {
    produisant('Centrale', 60, SchematicItem::POWER);

    expect(ilot($this->get('/')->getContent())['schemas'][0]['icone'])->toBeNull();
});

/*
 * The case the first version of this file did not have, and the page did.
 *
 * `it montre un schema par produit` gave every product a schematic of its own, so it agreed
 * with a design that promised "no duplicate possible". Opening the page showed `sand to
 * crucible 3.5` twice and `17PhaseMD` twice: a schematic that makes several things comes
 * first for several of them.
 *
 * Distinct products are not distinct schematics, and only a schematic that makes two things
 * says so.
 */
it('ne montre pas deux fois le meme plan sous deux produits', function () {
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
        /* Le plus fort garde sa place, et l'autre produit prend le suivant plutot que de
           disparaitre : une case vide couterait un produit du catalogue. */
        ->and($tuiles->pluck('nom'))->toContain('Fait les deux')
        ->and($tuiles->pluck('produit')->duplicates())->toBeEmpty();
});
