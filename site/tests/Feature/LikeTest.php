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
it('counts a single like when the button is clicked twice', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime")->assertCreated();
    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime")->assertOk();

    expect(SchematicLike::count())->toBe(1)
        ->and($schema->refresh()->likes)->toBe(1);
});

it('counts once per person', function () {
    $schema = Schematic::factory()->create();

    foreach (User::factory()->count(3)->create() as $user) {
        $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime")->assertCreated();
    }

    expect($schema->refresh()->likes)->toBe(3);
});

it('removes the like and never goes below zero', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime");
    $this->actingAs($user)->deleteJson("/api/schematiques/{$schema->slug}/aime")->assertOk();
    $this->actingAs($user)->deleteJson("/api/schematiques/{$schema->slug}/aime")->assertOk();

    expect(SchematicLike::count())->toBe(0)
        ->and($schema->refresh()->likes)->toBe(0);
});

it('refuses a visitor who is not signed in', function () {
    $schema = Schematic::factory()->create();

    $this->postJson("/api/schematiques/{$schema->slug}/aime")->assertUnauthorized();

    expect(SchematicLike::count())->toBe(0);
});

it('takes the likes away when the schematic disappears', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime");
    $schema->delete();

    expect(SchematicLike::count())->toBe(0);
});

it('likes an imported schematic, which has no owner', function () {
    /* Ninety-nine percent of this catalogue was collected elsewhere and has a null
       `user_id`. A like that only worked on schematics somebody uploaded here would be a
       feature nobody could use. */
    $schema = Schematic::factory()->imported()->create();

    $this->actingAs(User::factory()->create())
        ->postJson("/api/schematiques/{$schema->slug}/aime")
        ->assertCreated();

    expect($schema->refresh()->likes)->toBe(1);
});

it('repairs a counter that has drifted', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();
    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime");

    // What a failure between the insert and the increment leaves behind: the row exists,
    // the cache lies.
    Schematic::whereKey($schema->id)->update(['likes' => 47]);

    $this->artisan('forge:recount-likes')->assertSuccessful();

    expect($schema->refresh()->likes)->toBe(1);
});

it('resets to zero a counter whose rows are gone', function () {
    $schema = Schematic::factory()->create();
    Schematic::whereKey($schema->id)->update(['likes' => 12]);

    $this->artisan('forge:recount-likes')->assertSuccessful();

    expect($schema->refresh()->likes)->toBe(0);
});
