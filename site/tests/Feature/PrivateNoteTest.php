<?php

use App\Models\Schematic;
use App\Models\SchematicNote;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * The one thing on this site that is nobody else's business.
 *
 * So the test that matters is not that it saves, it is that somebody else's note is
 * invisible on the same page.
 */
it('writes a note and replaces it instead of stacking two', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->putJson("/api/schematiques/{$schema->slug}/note", [
        'body' => 'Chauffe si on le nourrit a fond',
    ])->assertOk();

    $this->actingAs($user)->putJson("/api/schematiques/{$schema->slug}/note", [
        'body' => 'Remplace les convoyeurs par des titanes',
    ])->assertOk();

    expect(SchematicNote::count())->toBe(1)
        ->and(SchematicNote::first()->body)->toBe('Remplace les convoyeurs par des titanes');
});

it('deletes the note when the body is empty', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->putJson("/api/schematiques/{$schema->slug}/note", ['body' => 'Quelque chose']);
    $this->actingAs($user)->putJson("/api/schematiques/{$schema->slug}/note", ['body' => '   '])->assertOk();

    // Empty means no note, not an empty note: otherwise "has a note" has two answers.
    expect(SchematicNote::count())->toBe(0);
});

it('refuses a thousand and one characters and accepts a thousand', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)
        ->putJson("/api/schematiques/{$schema->slug}/note", ['body' => str_repeat('a', 1001)])
        ->assertStatus(422);

    $this->actingAs($user)
        ->putJson("/api/schematiques/{$schema->slug}/note", ['body' => str_repeat('a', 1000)])
        ->assertOk();
});

it('never shows one reader the note of another, on the same page', function () {
    $author = User::factory()->create();
    $other = User::factory()->create();
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->actingAs($author)->putJson("/api/schematiques/{$schema->slug}/note", [
        'body' => 'Secret de fabrication',
    ]);

    $this->actingAs($other)->get("/s/{$schema->slug}")
        ->assertOk()
        ->assertDontSee('Secret de fabrication');
});

it('shows the note again to whoever wrote it', function () {
    $author = User::factory()->create();
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->actingAs($author)->putJson("/api/schematiques/{$schema->slug}/note", [
        'body' => 'Mon aide-memoire',
    ]);

    $this->actingAs($author)->get("/s/{$schema->slug}")->assertOk()->assertSee('Mon aide-memoire');
});

it('offers no field to a visitor who is not signed in', function () {
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->get("/s/{$schema->slug}")->assertOk()->assertDontSee(__('schema.note.titre'));
});

it('takes the notes away when the schematic disappears', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();
    $this->actingAs($user)->putJson("/api/schematiques/{$schema->slug}/note", ['body' => 'Note']);

    $schema->delete();

    expect(SchematicNote::count())->toBe(0);
});

it('refuses a visitor who is not signed in', function () {
    $schema = Schematic::factory()->create();

    $this->putJson("/api/schematiques/{$schema->slug}/note", ['body' => 'Note'])
        ->assertUnauthorized();
});
