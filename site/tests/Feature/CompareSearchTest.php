<?php

use App\Models\Schematic;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * The half of the comparison page that shows something.
 *
 * `CompareTest` guards what the page refuses to say. This guards what it shows: the plans,
 * and the search that puts them under the field while somebody types. Both break in
 * silence. A panel with no code renders a black rectangle, and a page that ships the script
 * without the code looks exactly like a page that works until somebody opens it.
 *
 * The page it replaces was two text boxes over a list of names. Corentin's words for it:
 * "tu ne vois pas les schemas, c'est pas du tout intuitif".
 */

/** A public schematic with a code to draw, which is what these tests are about. */
function drawable(string $name, string $code, array $extra = []): Schematic
{
    return Schematic::factory()->create(array_merge([
        'visibility' => Schematic::PUBLIC,
        'name' => $name,
        'code' => $code,
    ], $extra));
}

it('carries the code each panel needs to draw its plan', function () {
    $left = drawable('Gauche', 'bXNjaAF4nGAUCHE');
    $right = drawable('Droite', 'bXNjaAF4nDROITE');

    $this->get("/comparer?a={$left->slug}&b={$right->slug}")
        ->assertOk()
        // Le script qui dessine, et pas `apercu.js` : la page charge `comparer.js`, qui
        // importe le dessinateur. Un seul module a la ligne, et c'est celui-la que la page
        // perdrait si quelqu'un retirait le `@push`.
        ->assertSee('/forge/comparer.js', escape: false)
        ->assertSee('data-code="bXNjaAF4nGAUCHE"', escape: false)
        ->assertSee('data-code="bXNjaAF4nDROITE"', escape: false);
});

it('carries a plan for each schematic it offers, not only for the two chosen', function () {
    // Huit lignes de texte appelees « Silicon » sont huit lignes identiques, et c'est le
    // plan qui les distingue. Une liste de propositions sans image est la page d'avant.
    drawable('Une recente', 'bXNjaAF4nOFFERTE');

    $this->get('/comparer')
        ->assertOk()
        ->assertSee('data-code="bXNjaAF4nOFFERTE"', escape: false);
});

it('carries a plan for each search result the server rendered', function () {
    // Sans JavaScript, c'est cette liste-la qui repond, et elle doit montrer la meme chose.
    drawable('Ligne a graphite', 'bXNjaAF4nCHERCHEE');

    $this->get('/comparer?a=graphite')
        ->assertOk()
        ->assertSee('data-code="bXNjaAF4nCHERCHEE"', escape: false);
});

it('has a big schematic ask for its own code rather than carrying it', function () {
    /*
     * Le code voyage dans la page tant qu'il est petit. Un seul schema de 512 ko dans une
     * page qui en montre dix la rendrait plus lourde que ce qu'elle sert, pour un visiteur
     * qui n'a demande aucun des dix. Au-dela du seuil le panneau le demande lui-meme, et
     * seulement quand il approche de l'ecran.
     */
    $big = drawable('Enorme', 'bXNjaAF4n'.str_repeat('A', 20000));
    $small = drawable('Petite', 'bXNjaAF4nPETITE');

    $this->get("/comparer?a={$big->slug}&b={$small->slug}")
        ->assertOk()
        ->assertSee('data-slug="'.$big->slug.'"', escape: false)
        ->assertDontSee('data-code="bXNjaAF4nAAAA', escape: false);
});

/*
 * Chercher pendant qu'on tape, qui est l'autre moitie du geste.
 *
 * Remplir les deux cotes demandait deux chargements de page complets, et la page ne montrait
 * ni l'un ni l'autre tant que les deux n'etaient pas choisis. L'endpoint porte le code avec
 * le resultat, ce qui est toute sa raison d'etre : une liste de noms se choisit au hasard.
 */

it('answers a name with what it found, plan included', function () {
    $wanted = drawable('Ligne a graphite', 'bXNjaAF4nTROUVEE', ['blocks' => 42]);
    drawable('Reacteur', 'bXNjaAF4nAUTRE');

    $answer = $this->getJson('/api/schematiques/recherche?q=graphite')->assertOk();

    expect($answer->json('results'))->toHaveCount(1);
    expect($answer->json('results.0.slug'))->toBe($wanted->slug);
    expect($answer->json('results.0.name'))->toBe('Ligne a graphite');
    expect($answer->json('results.0.blocks'))->toBe(42);
    expect($answer->json('results.0.code'))->toBe('bXNjaAF4nTROUVEE');
});

it('answers an address as itself, because links get pasted into the box too', function () {
    $kept = drawable('Collee', 'bXNjaAF4nCOLLEE');

    $answer = $this->getJson("/api/schematiques/recherche?q={$kept->slug}")->assertOk();

    expect($answer->json('results'))->toHaveCount(1)
        ->and($answer->json('results.0.slug'))->toBe($kept->slug);
});

it('never hands back something nobody else can see', function () {
    // Une comparaison est une page publique dont tout le contenu est le travail de deux
    // autres personnes. Un schema par lien est joignable par son adresse a lui, ce qui
    // n'est pas la meme chose qu'etre propose dans une boite de recherche.
    Schematic::factory()->create(['visibility' => Schematic::UNLISTED, 'name' => 'Par lien']);
    Schematic::factory()->create(['visibility' => Schematic::PRIVATE, 'name' => 'Par lien aussi']);

    expect($this->getJson('/api/schematiques/recherche?q=Par lien')->json('results'))->toBe([]);
});

it('leaves a big code out of the answer rather than sending it eight times', function () {
    drawable('Enorme', 'bXNjaAF4n'.str_repeat('A', 20000));

    // Nul, et pas absent : le champ existe toujours, donc la page sait qu'il faut aller le
    // demander plutot que d'avoir a deviner pourquoi il manque.
    expect($this->getJson('/api/schematiques/recherche?q=Enorme')->json('results.0.code'))
        ->toBeNull();
});

it('answers nothing to nothing, without going to look', function () {
    drawable('Quelconque', 'bXNjaAF4nQUELCONQUE');

    expect($this->getJson('/api/schematiques/recherche')->json('results'))->toBe([]);
    expect($this->getJson('/api/schematiques/recherche?q=')->json('results'))->toBe([]);
    // `?q[]=1` rend un tableau, et le convertir en chaine est une erreur fatale et non un
    // champ vide. Un parametre de requete est ce que l'appelant a bien voulu envoyer.
    $this->getJson('/api/schematiques/recherche?q[]=1')->assertOk();
});

it('reads the box as text here too, on the characters that broke production', function () {
    /*
     * Le meme escape que la page, parce que c'est litteralement le meme code : les deux
     * passent par `NameSearch`. Un antislash dans ce champ a rendu un 500 en production en
     * passant tous les tests locaux, la base locale etant SQLite et la vraie MySQL. Deux
     * copies d'un escape, ce sont deux chances de se tromper d'escape, et c'est pour ca que
     * la requete a ete sortie du controleur le jour ou un deuxieme appelant est apparu.
     */
    drawable('Rendement 100%', 'bXNjaAF4nCENT');
    drawable('Autre chose', 'bXNjaAF4nAUTRE');

    $answer = $this->getJson('/api/schematiques/recherche?q=%25')->assertOk();
    expect($answer->json('results'))->toHaveCount(1)
        ->and($answer->json('results.0.name'))->toBe('Rendement 100%');

    foreach (['\\', '_', '=', "'", '"', '\\\\', '%_\\', '=%'] as $typed) {
        $this->getJson('/api/schematiques/recherche?q='.rawurlencode($typed))->assertOk();
    }
});

it('refuses to be a list of the whole catalogue', function () {
    // Quinze mille options ne sont pas un choix, ce sont des kilometres. Une liste sous un
    // champ se lit d'un coup d'oeil ou ne se lit pas.
    for ($i = 0; $i < 20; $i++) {
        drawable("Ligne {$i}", 'bXNjaAF4nLIGNE');
    }

    expect($this->getJson('/api/schematiques/recherche?q=Ligne')->json('results'))
        ->toHaveCount(8);
});
