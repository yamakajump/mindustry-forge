<?php

use App\Models\Folder;
use App\Models\Schematic;
use App\Models\SchematicNote;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * The caption, which is the other note and behaves differently on purpose.
 *
 * It is the one place in this work where user content is shown to other people, so the
 * escaping is tested rather than assumed.
 */
it('montre la legende a qui voit le dossier', function () {
    $owner = User::factory()->create();
    $folder = Folder::factory()->create(['user_id' => $owner->id, 'visibility' => Schematic::PUBLIC]);
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $folder->schematics()->attach($schema->id);

    $this->actingAs($owner)->patchJson(
        "/api/dossiers/{$folder->slug}/schemas/{$schema->slug}",
        ['note' => 'Commence par celui-la']
    )->assertOk();

    $this->get("/d/{$folder->slug}")->assertOk()->assertSee('Commence par celui-la');
});

it('n autorise que le proprietaire du dossier a legender', function () {
    $folder = Folder::factory()->create(['visibility' => Schematic::PUBLIC]);
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $folder->schematics()->attach($schema->id);

    $this->actingAs(User::factory()->create())->patchJson(
        "/api/dossiers/{$folder->slug}/schemas/{$schema->slug}",
        ['note' => 'Pas chez moi']
    )->assertForbidden();
});

it('refuse deux cent quatre vingt un caracteres', function () {
    $owner = User::factory()->create();
    $folder = Folder::factory()->create(['user_id' => $owner->id]);
    $schema = Schematic::factory()->create();
    $folder->schematics()->attach($schema->id);

    $this->actingAs($owner)->patchJson(
        "/api/dossiers/{$folder->slug}/schemas/{$schema->slug}",
        ['note' => str_repeat('a', 281)]
    )->assertStatus(422);
});

it('echappe une legende qui contient du html', function () {
    $owner = User::factory()->create();
    $folder = Folder::factory()->create(['user_id' => $owner->id, 'visibility' => Schematic::PUBLIC]);
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $folder->schematics()->attach($schema->id);

    $this->actingAs($owner)->patchJson(
        "/api/dossiers/{$folder->slug}/schemas/{$schema->slug}",
        ['note' => '<script>alert(1)</script>']
    );

    $this->get("/d/{$folder->slug}")
        ->assertOk()
        ->assertDontSee('<script>alert(1)</script>', false)
        ->assertSee('&lt;script&gt;', false);
});

it('oublie la legende quand le schema sort du dossier, et garde la note privee', function () {
    $owner = User::factory()->create();
    $folder = Folder::factory()->create(['user_id' => $owner->id]);
    $schema = Schematic::factory()->create();
    $folder->schematics()->attach($schema->id, ['note' => 'Une legende']);
    $this->actingAs($owner)->putJson("/api/schematiques/{$schema->slug}/note", ['body' => 'Ma note']);

    $this->actingAs($owner)->deleteJson("/api/dossiers/{$folder->slug}/schemas/{$schema->slug}");

    expect(SchematicNote::count())->toBe(1)
        ->and($folder->refresh()->schematics)->toHaveCount(0);
});

it('efface la legende quand on l envoie vide', function () {
    $owner = User::factory()->create();
    $folder = Folder::factory()->create(['user_id' => $owner->id]);
    $schema = Schematic::factory()->create();
    $folder->schematics()->attach($schema->id, ['note' => 'Une legende']);

    $this->actingAs($owner)->patchJson(
        "/api/dossiers/{$folder->slug}/schemas/{$schema->slug}",
        ['note' => '  ']
    )->assertOk();

    expect($folder->refresh()->schematics->first()->pivot->note)->toBeNull();
});
