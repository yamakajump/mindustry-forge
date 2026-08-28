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
        // The script that draws, and not `apercu.js`: the page loads `comparer.js`, which
        // imports the drawer. A single module on that line, and it is the one the page
        // would lose if somebody removed the `@push`.
        ->assertSee('/forge/comparer.js', escape: false)
        ->assertSee('data-code="bXNjaAF4nGAUCHE"', escape: false)
        ->assertSee('data-code="bXNjaAF4nDROITE"', escape: false);
});

it('carries a plan for each schematic it offers, not only for the two chosen', function () {
    // Eight lines of text all called "Silicon" are eight identical lines, and it is the
    // plan that tells them apart. A list of suggestions with no image is the page before.
    drawable('Une recente', 'bXNjaAF4nOFFERTE');

    $this->get('/comparer')
        ->assertOk()
        ->assertSee('data-code="bXNjaAF4nOFFERTE"', escape: false);
});

it('carries a plan for each search result the server rendered', function () {
    // Without JavaScript, this is the list that answers, and it has to show the same thing.
    drawable('Ligne a graphite', 'bXNjaAF4nCHERCHEE');

    $this->get('/comparer?a=graphite')
        ->assertOk()
        ->assertSee('data-code="bXNjaAF4nCHERCHEE"', escape: false);
});

it('has a big schematic ask for its own code rather than carrying it', function () {
    /*
     * The code travels inside the page as long as it is small. A single 512 kB schematic
     * in a page that shows ten of them would make it heavier than what it serves, for a
     * visitor who asked for none of the ten. Past the threshold the panel asks for it
     * itself, and only when it comes near the screen.
     */
    $big = drawable('Enorme', 'bXNjaAF4n'.str_repeat('A', 20000));
    $small = drawable('Petite', 'bXNjaAF4nPETITE');

    $this->get("/comparer?a={$big->slug}&b={$small->slug}")
        ->assertOk()
        ->assertSee('data-slug="'.$big->slug.'"', escape: false)
        ->assertDontSee('data-code="bXNjaAF4nAAAA', escape: false);
});

/*
 * Searching while typing, which is the other half of the gesture.
 *
 * Filling both sides took two full page loads, and the page showed neither one until both
 * had been chosen. The endpoint carries the code along with the result, which is its whole
 * reason to exist: a list of names is picked at random.
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
    // A comparison is a public page whose whole content is the work of two other people. A
    // schematic shared by link is reachable at its own address, which is not the same
    // thing as being offered in a search box.
    Schematic::factory()->create(['visibility' => Schematic::UNLISTED, 'name' => 'Par lien']);
    Schematic::factory()->create(['visibility' => Schematic::PRIVATE, 'name' => 'Par lien aussi']);

    expect($this->getJson('/api/schematiques/recherche?q=Par lien')->json('results'))->toBe([]);
});

it('leaves a big code out of the answer rather than sending it eight times', function () {
    drawable('Enorme', 'bXNjaAF4n'.str_repeat('A', 20000));

    // Null, and not absent: the field is still there, so the page knows it has to go and
    // ask for it rather than having to guess why it is missing.
    expect($this->getJson('/api/schematiques/recherche?q=Enorme')->json('results.0.code'))
        ->toBeNull();
});

it('answers nothing to nothing, without going to look', function () {
    drawable('Quelconque', 'bXNjaAF4nQUELCONQUE');

    expect($this->getJson('/api/schematiques/recherche')->json('results'))->toBe([]);
    expect($this->getJson('/api/schematiques/recherche?q=')->json('results'))->toBe([]);
    // `?q[]=1` gives an array, and casting it to a string is a fatal error and not an empty
    // field. A query parameter is whatever the caller felt like sending.
    $this->getJson('/api/schematiques/recherche?q[]=1')->assertOk();
});

it('reads the box as text here too, on the characters that broke production', function () {
    /*
     * The same escaping as the page, because it is literally the same code: both go through
     * `NameSearch`. A backslash in this field returned a 500 in production while passing
     * every local test, the local database being SQLite and the real one MySQL. Two copies
     * of an escape are two chances to get the escaping wrong, and that is why the query was
     * moved out of the controller the day a second caller appeared.
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
    // Fifteen thousand options are not a choice, they are kilometres. A list under a field
    // is read at a glance or it is not read at all.
    for ($i = 0; $i < 20; $i++) {
        drawable("Ligne {$i}", 'bXNjaAF4nLIGNE');
    }

    expect($this->getJson('/api/schematiques/recherche?q=Ligne')->json('results'))
        ->toHaveCount(8);
});
