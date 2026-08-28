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
it('ecrit une note et la remplace au lieu d en empiler deux', function () {
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

it('supprime la note quand le corps est vide', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->putJson("/api/schematiques/{$schema->slug}/note", ['body' => 'Quelque chose']);
    $this->actingAs($user)->putJson("/api/schematiques/{$schema->slug}/note", ['body' => '   '])->assertOk();

    // Vide veut dire pas de note, pas une note vide : sinon « a une note » a deux reponses.
    expect(SchematicNote::count())->toBe(0);
});

it('refuse mille un caracteres et accepte mille', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)
        ->putJson("/api/schematiques/{$schema->slug}/note", ['body' => str_repeat('a', 1001)])
        ->assertStatus(422);

    $this->actingAs($user)
        ->putJson("/api/schematiques/{$schema->slug}/note", ['body' => str_repeat('a', 1000)])
        ->assertOk();
});

it('ne montre pas la note d un autre sur la meme page', function () {
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

it('remontre sa note a qui l a ecrite', function () {
    $author = User::factory()->create();
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->actingAs($author)->putJson("/api/schematiques/{$schema->slug}/note", [
        'body' => 'Mon aide-memoire',
    ]);

    $this->actingAs($author)->get("/s/{$schema->slug}")->assertOk()->assertSee('Mon aide-memoire');
});

it('ne propose aucun champ a un visiteur qui n est pas connecte', function () {
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->get("/s/{$schema->slug}")->assertOk()->assertDontSee(__('schema.note.titre'));
});

it('emporte les notes quand le schema disparait', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();
    $this->actingAs($user)->putJson("/api/schematiques/{$schema->slug}/note", ['body' => 'Note']);

    $schema->delete();

    expect(SchematicNote::count())->toBe(0);
});

it('refuse un visiteur qui n est pas connecte', function () {
    $schema = Schematic::factory()->create();

    $this->putJson("/api/schematiques/{$schema->slug}/note", ['body' => 'Note'])
        ->assertUnauthorized();
});
