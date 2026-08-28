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
it('garde un schema en favori une seule fois', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/favori")->assertCreated();
    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/favori")->assertOk();

    expect(Favorite::count())->toBe(1);
});

it('retire un favori', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/favori");
    $this->actingAs($user)->deleteJson("/api/schematiques/{$schema->slug}/favori")->assertOk();

    expect(Favorite::count())->toBe(0);
});

it('refuse un visiteur qui n est pas connecte', function () {
    $schema = Schematic::factory()->create();

    $this->postJson("/api/schematiques/{$schema->slug}/favori")->assertUnauthorized();

    expect(Favorite::count())->toBe(0);
});

it('garde chaque favori a son proprietaire', function () {
    $mine = User::factory()->create();
    $theirs = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($theirs)->postJson("/api/schematiques/{$schema->slug}/favori");

    /* Retirer ce qui n'est pas a soi ne retire rien, et ne se plaint pas non plus :
       l'absence d'un favori et l'absence du droit de le retirer sont le meme etat, et
       distinguer les deux dirait a qui demande que quelqu'un d'autre l'a garde. */
    $this->actingAs($mine)->deleteJson("/api/schematiques/{$schema->slug}/favori")->assertOk();

    expect(Favorite::where('user_id', $theirs->id)->count())->toBe(1);
});

it('laisse deux personnes garder le meme schema', function () {
    $schema = Schematic::factory()->create();

    foreach (User::factory()->count(2)->create() as $user) {
        $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/favori")->assertCreated();
    }

    expect(Favorite::count())->toBe(2);
});

it('emporte les favoris quand le schema disparait', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/favori");
    $schema->delete();

    expect(Favorite::count())->toBe(0);
});

it('emporte les favoris quand la personne disparait', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/favori");
    $user->delete();

    expect(Favorite::count())->toBe(0);
});
