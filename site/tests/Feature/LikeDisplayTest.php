<?php

use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * What the two gestures look like on a page, which no test of the counter can tell us.
 *
 * The rule this repository keeps paying for is that a correct number shown where it answers
 * another question is wrong there. A "0 j'aime" under a schematic nobody has seen is one of
 * those: it answers "how many people liked it" on a page where the reader is asking whether
 * it is any good, and it reads as a verdict.
 */
/* The assertions let Laravel escape the expected string rather than passing `false`. A
   raw "j'aime" never appears in HTML, where the apostrophe is `&#039;`, so an
   `assertDontSee("j'aime", false)` finds nothing whatever happens: it passed without
   proving anything, including when the counter was on screen. */
it('does not show a counter at zero', function () {
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->get("/s/{$schema->slug}")
        ->assertOk()
        ->assertDontSee(__('schema.unite.jaime'));
});

it('shows the counter as soon as it is worth something', function () {
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    Schematic::whereKey($schema->id)->update(['likes' => 12]);

    $this->get("/s/{$schema->slug}")
        ->assertOk()
        ->assertSee('12')
        ->assertSee(__('schema.unite.jaime'));
});

it('sends a signed-out visitor to sign in rather than hiding the button', function () {
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    /* Shown rather than hidden: a button a visitor never sees is a feature they never
       learn exists. */
    $this->get("/s/{$schema->slug}")
        ->assertOk()
        ->assertSee('/auth/discord', false)
        ->assertSee(__('schema.aime.bouton'));
});

it('shows the button pressed to somebody who already liked', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime");

    $this->actingAs($user)->get("/s/{$schema->slug}")
        ->assertOk()
        ->assertSee('data-aime aria-pressed="true"', false);
});

it('shows the button released to somebody who has not liked', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->actingAs($user)->get("/s/{$schema->slug}")
        ->assertOk()
        ->assertSee('data-aime aria-pressed="false"', false);
});

it('shows the favorite pressed to somebody who kept it', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/favori");

    $this->actingAs($user)->get("/s/{$schema->slug}")
        ->assertOk()
        ->assertSee('data-favori aria-pressed="true"', false);
});

it('never gives one member the button state of another', function () {
    $theirs = User::factory()->create();
    $mine = User::factory()->create();
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $this->actingAs($theirs)->postJson("/api/schematiques/{$schema->slug}/aime");

    $this->actingAs($mine)->get("/s/{$schema->slug}")
        ->assertOk()
        // The counter is public and reads one for everybody; the button is mine alone.
        ->assertSee('data-aime aria-pressed="false"', false)
        ->assertSee('1');
});

it('shows the count on the tile in my schematics', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create(['user_id' => $user->id]);
    Schematic::whereKey($schema->id)->update(['likes' => 7]);

    $this->actingAs($user)->get('/mes-schemas')
        ->assertOk()
        ->assertSee('7')
        ->assertSee(__('schema.unite.jaime'));
});

it('adds not one query per tile', function () {
    $user = User::factory()->create();
    Schematic::factory()->count(10)->create(['user_id' => $user->id]);

    /* The count is read from the column the listing already selects. A `withCount` or a read
       per tile would add ten queries, which BrowsePerformanceTest exists to catch on the
       catalogue and which nothing watches here. */
    DB::enableQueryLog();
    $this->actingAs($user)->get('/mes-schemas')->assertOk();
    $queries = count(DB::getQueryLog());
    DB::disableQueryLog();

    expect($queries)->toBeLessThan(15);
});

it('keeps a zero counter hidden, not absent, for a signed-in reader', function () {
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    /* Signed in, the counter is in the page but `hidden`: keep.js reveals it on the first
       like without having to build the element. Showing it at zero would be the fault this
       file watches for, and taking it out of the document would force the module to create
       it. */
    $this->actingAs(User::factory()->create())
        ->get("/s/{$schema->slug}")
        ->assertOk()
        ->assertSee('class="compte" hidden', false);
});

it('reveals the counter as soon as it is worth something, for a signed-in reader', function () {
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    Schematic::whereKey($schema->id)->update(['likes' => 3]);

    $this->actingAs(User::factory()->create())
        ->get("/s/{$schema->slug}")
        ->assertOk()
        ->assertDontSee('class="compte" hidden', false)
        ->assertSee('3');
});
