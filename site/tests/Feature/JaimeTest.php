<?php

use App\Models\Schematic;
use App\Models\SchematicLike;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * The public gesture, and the counter that caches it.
 *
 * The counter is denormalised, so every test here is about the two never disagreeing:
 * a double click, a removal that would go below zero, and a row deleted underneath.
 */
it('ne compte qu un seul j aime quand on clique deux fois', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime")->assertCreated();
    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime")->assertOk();

    expect(SchematicLike::count())->toBe(1)
        ->and($schema->refresh()->likes)->toBe(1);
});

it('compte une fois par personne', function () {
    $schema = Schematic::factory()->create();

    foreach (User::factory()->count(3)->create() as $user) {
        $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime")->assertCreated();
    }

    expect($schema->refresh()->likes)->toBe(3);
});

it('retire le j aime et ne descend jamais sous zero', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime");
    $this->actingAs($user)->deleteJson("/api/schematiques/{$schema->slug}/aime")->assertOk();
    $this->actingAs($user)->deleteJson("/api/schematiques/{$schema->slug}/aime")->assertOk();

    expect(SchematicLike::count())->toBe(0)
        ->and($schema->refresh()->likes)->toBe(0);
});

it('refuse un visiteur qui n est pas connecte', function () {
    $schema = Schematic::factory()->create();

    $this->postJson("/api/schematiques/{$schema->slug}/aime")->assertUnauthorized();

    expect(SchematicLike::count())->toBe(0);
});

it('emporte les j aime quand le schema disparait', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime");
    $schema->delete();

    expect(SchematicLike::count())->toBe(0);
});

it('aime une schematique importee, qui n a pas de proprietaire', function () {
    /* Ninety-nine percent of this catalogue was collected elsewhere and has a null
       `user_id`. A like that only worked on schematics somebody uploaded here would be a
       feature nobody could use. */
    $schema = Schematic::factory()->imported()->create();

    $this->actingAs(User::factory()->create())
        ->postJson("/api/schematiques/{$schema->slug}/aime")
        ->assertCreated();

    expect($schema->refresh()->likes)->toBe(1);
});

it('repare un compteur qui a derive', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();
    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime");

    // Ce qu'une panne entre l'insertion et l'increment laisse derriere elle : la ligne
    // existe, le cache ment.
    Schematic::whereKey($schema->id)->update(['likes' => 47]);

    $this->artisan('forge:recount-likes')->assertSuccessful();

    expect($schema->refresh()->likes)->toBe(1);
});

it('remet a zero un compteur dont les lignes ont disparu', function () {
    $schema = Schematic::factory()->create();
    Schematic::whereKey($schema->id)->update(['likes' => 12]);

    $this->artisan('forge:recount-likes')->assertSuccessful();

    expect($schema->refresh()->likes)->toBe(0);
});
