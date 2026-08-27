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
function produisant(string $nom, float $debit, float $parBloc = 0.5): Schematic
{
    $s = Schematic::factory()->create(['visibility' => 'public', 'name' => $nom]);
    $s->items()->delete();
    $s->items()->create([
        'item' => 'silicon',
        'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::MESURE,
        'rate' => $debit,
        'rate_per_block' => $parBloc,
    ]);

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
    produisant('Usine a graphite', 3.0);

    /* Le bac a sable ne produit rien, donc il ne peut pas remonter. C'est un effet de bord
       du critere et pas une liste noire a tenir a jour. */
    Schematic::factory()->create(['visibility' => 'public', 'name' => 'Fps Droper']);

    /* Un plafond n'est pas une mesure : c'est ce que les machines sortiraient si on les
       nourrissait, et le classement de la vitrine l'exclut pour la meme raison. */
    $plafond = Schematic::factory()->create(['visibility' => 'public', 'name' => 'Plafond seul']);
    $plafond->items()->delete();
    $plafond->items()->create([
        'item' => 'silicon', 'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::PLAFOND, 'rate' => 999, 'rate_per_block' => 999,
    ]);

    $noms = collect(ilot($this->get('/')->getContent())['schematiques'])->pluck('nom');

    expect($noms)->toContain('Usine a graphite');
    expect($noms)->not->toContain('Fps Droper');
    expect($noms)->not->toContain('Plafond seul');
});

it('ne laisse pas un nom collecte fermer la balise', function () {
    /* Ces noms viennent de catalogues collectes ailleurs : ce sont des chaines que personne
       ici n'a ecrites, et il en existe deja qui portent du balisage. Un `</script>` dedans
       fermerait l'ilot et le reste de la page deviendrait du HTML. */
    produisant('</script><img src=x onerror=alert(1)>', 3.0);

    $html = $this->get('/')->getContent();

    expect($html)->not->toContain('</script><img');
    /* Le nom doit survivre au voyage, seulement encode dans le transport. */
    expect(ilot($html)['schematiques'][0]['nom'])->toContain('</script>');
});

it('rend une page qui marche meme sans rien a montrer', function () {
    $html = $this->get('/')->getContent();

    expect(ilot($html)['schematiques'])->toBe([]);
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
    expect(ilot($reponse->getContent()))->toBe(['total' => 0, 'schematiques' => []]);
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
        'kind' => SchematicItem::MESURE, 'rate' => 39700, 'rate_per_block' => 500,
    ]);

    $accueil = collect(ilot($this->get('/')->getContent())['schematiques'])
        ->firstWhere('nom', 'Turbine');
    $vitrine = $this->get('/schematiques')->getContent();

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
        'kind' => SchematicItem::MESURE, 'rate' => 56562, 'rate_per_block' => 900,
    ]);

    $mis = collect(ilot($this->get('/')->getContent())['schematiques'])->firstWhere('nom', 'Centrale');

    expect((float) $mis['debit'])->toBe(56562.0);
    expect($mis['unite'])->toBe('/ s');
    expect($mis['produit'])->toBe('energie');
});
