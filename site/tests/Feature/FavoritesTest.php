<?php

use App\Models\Favorite;
use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * The private gesture.
 *
 * Reading the list is the catalogue's job, under `favoris=oui`, so that there is one
 * implementation of "list some schematics". What is tested here is filling and emptying it,
 * and that neither reaches into somebody else's.
 */
it('keeps a schematic as a favorite only once', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/favori")->assertCreated();
    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/favori")->assertOk();

    expect(Favorite::count())->toBe(1);
});

it('removes a favorite', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/favori");
    $this->actingAs($user)->deleteJson("/api/schematiques/{$schema->slug}/favori")->assertOk();

    expect(Favorite::count())->toBe(0);
});

it('refuses a visitor who is not signed in', function () {
    $schema = Schematic::factory()->create();

    $this->postJson("/api/schematiques/{$schema->slug}/favori")->assertUnauthorized();

    expect(Favorite::count())->toBe(0);
});

it('keeps each favorite to its owner', function () {
    $mine = User::factory()->create();
    $theirs = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($theirs)->postJson("/api/schematiques/{$schema->slug}/favori");

    /* Removing what is not yours removes nothing, and does not complain either: a favorite
       that is absent and a favorite you have no right to remove are the same state, and
       telling the two apart would tell whoever asks that somebody else kept it. */
    $this->actingAs($mine)->deleteJson("/api/schematiques/{$schema->slug}/favori")->assertOk();

    expect(Favorite::where('user_id', $theirs->id)->count())->toBe(1);
});

it('lets two people keep the same schematic', function () {
    $schema = Schematic::factory()->create();

    foreach (User::factory()->count(2)->create() as $user) {
        $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/favori")->assertCreated();
    }

    expect(Favorite::count())->toBe(2);
});

it('takes the favorites with it when the schematic disappears', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/favori");
    $schema->delete();

    expect(Favorite::count())->toBe(0);
});

it('takes the favorites with it when the person disappears', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/favori");
    $user->delete();

    expect(Favorite::count())->toBe(0);
});
