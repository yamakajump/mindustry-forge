<?php

use App\Models\Folder;
use App\Models\FolderLike;
use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/** Puts n likes on a folder without going through the factory: `likes` is not fillable. */
function liked(int $count): Folder
{
    $folder = Folder::factory()->create(['visibility' => Schematic::PUBLIC]);
    Folder::whereKey($folder->id)->update(['likes' => $count]);

    return $folder;
}

it('counts only one like per person', function () {
    $user = User::factory()->create();
    $folder = Folder::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->actingAs($user)->postJson("/api/dossiers/{$folder->slug}/aime")->assertCreated();
    $this->actingAs($user)->postJson("/api/dossiers/{$folder->slug}/aime")->assertOk();

    expect(FolderLike::count())->toBe(1)
        ->and($folder->refresh()->likes)->toBe(1);
});

it('never goes below zero', function () {
    $user = User::factory()->create();
    $folder = Folder::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->actingAs($user)->postJson("/api/dossiers/{$folder->slug}/aime");
    $this->actingAs($user)->deleteJson("/api/dossiers/{$folder->slug}/aime");
    $this->actingAs($user)->deleteJson("/api/dossiers/{$folder->slug}/aime")->assertOk();

    expect($folder->refresh()->likes)->toBe(0);
});

it('refuses a like on a private folder', function () {
    $folder = Folder::factory()->create(['visibility' => Schematic::PRIVATE]);

    $this->actingAs(User::factory()->create())
        ->postJson("/api/dossiers/{$folder->slug}/aime")
        ->assertNotFound();
});

it('repairs both counters in a single pass', function () {
    $user = User::factory()->create();
    $folder = Folder::factory()->create(['visibility' => Schematic::PUBLIC]);
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->postJson("/api/dossiers/{$folder->slug}/aime");
    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime");

    Folder::whereKey($folder->id)->update(['likes' => 47]);
    Schematic::whereKey($schema->id)->update(['likes' => 47]);

    $this->artisan('forge:recount-likes')->assertSuccessful();

    expect($folder->refresh()->likes)->toBe(1)
        ->and($schema->refresh()->likes)->toBe(1);
});

it('takes the likes with it when the folder disappears', function () {
    $user = User::factory()->create();
    $folder = Folder::factory()->create(['visibility' => Schematic::PUBLIC]);
    $this->actingAs($user)->postJson("/api/dossiers/{$folder->slug}/aime");

    $folder->delete();

    expect(FolderLike::count())->toBe(0);
});

it('does not offer the ranking below the threshold', function () {
    foreach (range(1, 5) as $ignored) {
        liked(1);
    }

    $this->get('/dossiers')->assertOk()->assertDontSee('Les plus aimés');
});

it('offers the ranking once a page worth of folders has been liked', function () {
    foreach (range(1, 24) as $ignored) {
        liked(1);
    }

    $this->get('/dossiers')->assertOk()->assertSee('Les plus aimés');
});

it('answers and says so when there is no public folder', function () {
    $this->get('/dossiers')->assertOk()->assertSee(__('dossiers.page.galerie-vide'));
});

it('never shows a private folder nor an unlisted one', function () {
    Folder::factory()->create(['visibility' => Schematic::PRIVATE, 'name' => 'Prive']);
    Folder::factory()->create(['visibility' => Schematic::UNLISTED, 'name' => 'ParLien']);
    liked(1);

    $this->get('/dossiers')->assertOk()->assertDontSee('Prive')->assertDontSee('ParLien');
});

it('ranks on likes past the threshold', function () {
    foreach (range(1, 24) as $ignored) {
        liked(1);
    }
    $best = Folder::factory()->create(['visibility' => Schematic::PUBLIC, 'name' => 'Le meilleur']);
    Folder::whereKey($best->id)->update(['likes' => 99]);

    $page = $this->get('/dossiers?tri=aimes')->assertOk();

    expect($page->viewData('folders')->first()->id)->toBe($best->id);
});
