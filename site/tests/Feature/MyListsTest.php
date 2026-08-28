<?php

use App\Models\Favorite;
use App\Models\Schematic;
use App\Models\SchematicLike;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * The three personal lists, and the ranking that waits for a crowd.
 *
 * This file exists for two rules no test of a value would see.
 *
 * The first: `ordinary()` is a rule of the CATALOGUE and not a rule of a LIST. The
 * catalogue sets aside what cannot be placed in a normal game, because it answers "what
 * exists and what works". A personal list answers "what did I keep", and that answer is
 * not up for debate. Applying the first rule to the second would make a favorite
 * disappear without a word, which reads as a site that loses things.
 *
 * The second: a ranking that cannot fill its first screen is not a ranking. "The most
 * liked" opened on day one over fifteen thousand schematics at zero would be an exact
 * figure shown in the place that asks another question.
 */

/** A published schematic, with enough on it to tell it from the others. */
function publie(string $name, array $held = []): Schematic
{
    return Schematic::factory()->create([
        'name' => $name,
        'visibility' => Schematic::PUBLIC,
        'width' => 10,
        'height' => 10,
        'blocks' => max(1, array_sum($held) ?: 12),
        'analysis' => $held === [] ? [] : ['held' => $held],
    ]);
}

/*
 * The threshold of the ranking.
 *
 * Twenty-three against twenty-four, and the value is not copied out here: it is a page's
 * own. If the pagination changes, this test changes with it rather than keeping a reason
 * that has stopped being true.
 */
it('never offers the most liked until a whole page of them exists', function () {
    $liked = collect(range(1, 23))->map(fn ($n) => publie("Aime {$n}"));
    Schematic::whereIn('id', $liked->pluck('id'))->update(['likes' => 3]);

    $this->get('/schemas')->assertOk()->assertDontSee('Les plus aimés');
});

it('offers the most liked as soon as a whole page carries them', function () {
    $liked = collect(range(1, 24))->map(fn ($n) => publie("Aime {$n}"));
    // Through the query builder and not through the factory: `likes` is not in
    // `$fillable`, deliberately, like `views`. A counter is not mass assigned, and a
    // factory that tries is ignored in silence and yields zero.
    Schematic::whereIn('id', $liked->pluck('id'))->update(['likes' => 3]);

    $this->get('/schemas')->assertOk()->assertSee('Les plus aimés');
});

it('falls back to the date when the most liked is asked for below the threshold', function () {
    publie('Le seul');

    $this->get('/schemas?tri=aimes')
        ->assertOk()
        ->assertSee('Les plus récents')
        ->assertDontSee('Les plus aimés');
});

it('sorts on the like count above the threshold', function () {
    $rows = collect(range(1, 24))->map(fn ($n) => publie("Plan {$n}"));
    Schematic::whereIn('id', $rows->pluck('id'))->update(['likes' => 1]);
    Schematic::whereKey($rows->last()->id)->update(['likes' => 99]);

    $html = $this->get('/schemas?tri=aimes')->content();
    $grid = substr($html, strpos($html, '<div class="grid">'));

    expect(strpos($grid, 'Plan 24'))->toBeLessThan(strpos($grid, 'Plan 1'));
});

/*
 * My favorites, which are not the catalogue.
 */
it('shows only what I have kept', function () {
    $me = User::factory()->create();
    $kept = publie('Garde');
    publie('Pas garde');
    Favorite::create(['user_id' => $me->id, 'schematic_id' => $kept->id]);

    $this->actingAs($me)->get('/schemas?favoris=oui')
        ->assertOk()
        ->assertSee('Garde')
        ->assertDontSee('Pas garde');
});

/*
 * The test that justifies this file.
 *
 * A sandbox schematic kept as a favorite has to come back. The wrong version would have
 * been silent: the list would simply have been shorter, with no error anywhere, and the
 * player would have concluded the site had lost their favorite.
 */
it('returns a sandbox favorite even though the catalogue sets it aside', function () {
    $me = User::factory()->create();
    $sandbox = publie('Bac a sable garde', ['item-source' => 2, 'conveyor' => 8]);
    Favorite::create(['user_id' => $me->id, 'schematic_id' => $sandbox->id]);

    // The catalogue leaves it out, and it is right to do so.
    $this->actingAs($me)->get('/schemas')->assertDontSee('Bac a sable garde');

    // My list returns it, and it is right too. The two answer two questions.
    $this->actingAs($me)->get('/schemas?favoris=oui')->assertSee('Bac a sable garde');
});

it('holds for what I have published too', function () {
    $me = User::factory()->create();
    $sandbox = publie('Mon bac a sable', ['power-source' => 1, 'conveyor' => 6]);
    $sandbox->update(['user_id' => $me->id]);

    $this->actingAs($me)->get('/schemas?miens=oui')->assertSee('Mon bac a sable');
});

it('orders my favorites the way I kept them', function () {
    $me = User::factory()->create();
    $vieux = publie('Garde en premier');
    $neuf = publie('Garde en dernier');

    Favorite::create(['user_id' => $me->id, 'schematic_id' => $vieux->id,
        'created_at' => now()->subDay()]);
    Favorite::create(['user_id' => $me->id, 'schematic_id' => $neuf->id,
        'created_at' => now()]);

    $html = $this->actingAs($me)->get('/schemas?favoris=oui')->content();
    $grid = substr($html, strpos($html, '<div class="grid">'));

    expect(strpos($grid, 'Garde en dernier'))->toBeLessThan(strpos($grid, 'Garde en premier'));
});

it('shows only what I have liked', function () {
    $me = User::factory()->create();
    $liked = publie('Aime');
    publie('Pas aime');
    SchematicLike::create(['user_id' => $me->id, 'schematic_id' => $liked->id]);

    $this->actingAs($me)->get('/schemas?aimes=oui')
        ->assertOk()
        ->assertSee('Aime')
        ->assertDontSee('Pas aime');
});

/*
 * The visitor with no account.
 *
 * An address gets typed and shared: `favoris=oui` can arrive with no session. Filtering on
 * a null identifier would return an empty page without saying why, which reads as an empty
 * catalogue rather than as a filter that cannot apply.
 */
it('ignores the personal filters for whoever is not signed in', function () {
    publie('Visible');

    $this->get('/schemas?favoris=oui&aimes=oui&miens=oui')
        ->assertOk()
        ->assertSee('Visible');
});

it('never offers the personal checkboxes to a visitor with no account', function () {
    publie('Visible');

    $this->get('/schemas')->assertOk()->assertDontSee('mes favoris');
});

/*
 * The dedicated address, which is the same page with the filter already set.
 *
 * A page of its own would have had its own query, so a second implementation of "list
 * schematics". The cost shows up the day the catalogue can filter by footprint and by
 * planet and the favorites list can do none of it.
 */
it('serves my favorites at their own address, with the same filters', function () {
    $me = User::factory()->create();
    $kept = publie('Garde');
    publie('Pas garde');
    Favorite::create(['user_id' => $me->id, 'schematic_id' => $kept->id]);

    $this->actingAs($me)->get('/mes-favoris')
        ->assertOk()
        ->assertSee('Garde')
        ->assertDontSee('Pas garde');
});

it('lets my favorites be filtered like the rest of the catalogue', function () {
    $me = User::factory()->create();
    $grand = publie('Trop grand');
    $petit = publie('Rentre');
    $grand->update(['width' => 40, 'height' => 40]);
    $petit->update(['width' => 8, 'height' => 8]);

    foreach ([$grand, $petit] as $one) {
        Favorite::create(['user_id' => $me->id, 'schematic_id' => $one->id]);
    }

    $this->actingAs($me)->get('/mes-favoris?large=10&haut=10')
        ->assertOk()
        ->assertSee('Rentre')
        ->assertDontSee('Trop grand');
});

it('sends a visitor with no account to sign in rather than to an empty list', function () {
    $this->get('/mes-favoris')->assertRedirect('/auth/discord');
});

/*
 * What the page says when the personal list is empty, and when it is filtered.
 *
 * Two exact sentences placed where something else was asked for, found by opening the page
 * and not by reading the output of a command.
 */
it('says I have kept nothing, rather than sending me off to publish', function () {
    $me = User::factory()->create();
    publie('Existe ailleurs');

    $page = $this->actingAs($me)->get('/mes-favoris')->assertOk();

    // Without the apostrophe: Blade renders it as `&#039;`, so an assertion carrying it
    // would fail on the escaping and not on the sentence.
    $page->assertSee('encore rien gardé')
        // The catalogue sentence would be exact and beside the point: there is nothing to
        // publish, there is nothing kept, and it sent the reader off to analyse a
        // schematic to fix that.
        ->assertDontSee('Rien de publié qui corresponde');
});

it('says in a chip that the list is filtered on my favorites', function () {
    $me = User::factory()->create();
    $kept = publie('Garde');
    Favorite::create(['user_id' => $me->id, 'schematic_id' => $kept->id]);

    // Without this chip, the panel that carries the checkboxes is folded shut and the title
    // is the catalogue's: a reader sees an oddly short catalogue, not their favorites.
    $this->actingAs($me)->get('/mes-favoris')
        ->assertOk()
        ->assertSee('Recherche en cours')
        ->assertSee('mes favoris');
});

it('keeps the catalogue sentence when the search is the catalogue search', function () {
    $this->get('/schemas?produit=silicon')
        ->assertOk()
        ->assertSee('Rien de publié qui corresponde');
});
