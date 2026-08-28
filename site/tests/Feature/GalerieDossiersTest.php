<?php

use App\Models\Folder;
use App\Models\FolderLike;
use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/** Poser n j'aime sur un dossier sans passer par la factory : `likes` n'est pas fillable. */
function liked(int $count): Folder
{
    $folder = Folder::factory()->create(['visibility' => Schematic::PUBLIC]);
    Folder::whereKey($folder->id)->update(['likes' => $count]);

    return $folder;
}

it('ne compte qu un seul j aime par personne', function () {
    $user = User::factory()->create();
    $folder = Folder::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->actingAs($user)->postJson("/api/dossiers/{$folder->slug}/aime")->assertCreated();
    $this->actingAs($user)->postJson("/api/dossiers/{$folder->slug}/aime")->assertOk();

    expect(FolderLike::count())->toBe(1)
        ->and($folder->refresh()->likes)->toBe(1);
});

it('ne descend jamais sous zero', function () {
    $user = User::factory()->create();
    $folder = Folder::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->actingAs($user)->postJson("/api/dossiers/{$folder->slug}/aime");
    $this->actingAs($user)->deleteJson("/api/dossiers/{$folder->slug}/aime");
    $this->actingAs($user)->deleteJson("/api/dossiers/{$folder->slug}/aime")->assertOk();

    expect($folder->refresh()->likes)->toBe(0);
});

it('refuse d aimer un dossier prive', function () {
    $folder = Folder::factory()->create(['visibility' => Schematic::PRIVATE]);

    $this->actingAs(User::factory()->create())
        ->postJson("/api/dossiers/{$folder->slug}/aime")
        ->assertNotFound();
});

it('repare les deux compteurs en une seule passe', function () {
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

it('emporte les j aime quand le dossier disparait', function () {
    $user = User::factory()->create();
    $folder = Folder::factory()->create(['visibility' => Schematic::PUBLIC]);
    $this->actingAs($user)->postJson("/api/dossiers/{$folder->slug}/aime");

    $folder->delete();

    expect(FolderLike::count())->toBe(0);
});

it('n offre pas le classement sous le seuil', function () {
    foreach (range(1, 5) as $ignored) {
        liked(1);
    }

    $this->get('/dossiers')->assertOk()->assertDontSee('Les plus aimés');
});

it('offre le classement une fois une page de dossiers aimes', function () {
    foreach (range(1, 24) as $ignored) {
        liked(1);
    }

    $this->get('/dossiers')->assertOk()->assertSee('Les plus aimés');
});

it('repond et le dit quand il n y a aucun dossier public', function () {
    $this->get('/dossiers')->assertOk()->assertSee(__('dossiers.page.galerie-vide'));
});

it('ne montre jamais un dossier prive ni un dossier par lien', function () {
    Folder::factory()->create(['visibility' => Schematic::PRIVATE, 'name' => 'Prive']);
    Folder::factory()->create(['visibility' => Schematic::UNLISTED, 'name' => 'ParLien']);
    liked(1);

    $this->get('/dossiers')->assertOk()->assertDontSee('Prive')->assertDontSee('ParLien');
});

it('classe sur les j aime au dela du seuil', function () {
    foreach (range(1, 24) as $ignored) {
        liked(1);
    }
    $best = Folder::factory()->create(['visibility' => Schematic::PUBLIC, 'name' => 'Le meilleur']);
    Folder::whereKey($best->id)->update(['likes' => 99]);

    $page = $this->get('/dossiers?tri=aimes')->assertOk();

    expect($page->viewData('folders')->first()->id)->toBe($best->id);
});
