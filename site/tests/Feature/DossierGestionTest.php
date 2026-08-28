<?php

use App\Models\Folder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('cree un dossier avec un nom et une icone du catalogue', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/api/dossiers', [
        'name' => 'Chaine silicium',
        'icon' => 'objet/silicon',
    ])->assertCreated()->assertJsonStructure(['slug', 'url']);

    expect(Folder::first()->icon)->toBe('objet/silicon');
});

it('refuse une icone qui n est pas au catalogue', function () {
    $this->actingAs(User::factory()->create())
        ->postJson('/api/dossiers', ['name' => 'Truc', 'icon' => 'objet/inexistant'])
        ->assertStatus(422);

    expect(Folder::count())->toBe(0);
});

it('accepte un dossier sans icone', function () {
    $this->actingAs(User::factory()->create())
        ->postJson('/api/dossiers', ['name' => 'Sans image'])
        ->assertCreated();

    expect(Folder::first()->icon)->toBeNull();
});

it('refuse de depasser la profondeur maximale', function () {
    $user = User::factory()->create();
    $parent = null;
    foreach (range(1, Folder::MAX_DEPTH) as $ignored) {
        $parent = Folder::factory()->create(['user_id' => $user->id, 'parent_id' => $parent?->id]);
    }

    $this->actingAs($user)
        ->postJson('/api/dossiers', ['name' => 'Un de trop', 'parent' => $parent->slug])
        ->assertStatus(422);
});

it('refuse un deplacement qui ferait une boucle', function () {
    $user = User::factory()->create();
    $root = Folder::factory()->create(['user_id' => $user->id]);
    $child = Folder::factory()->create(['user_id' => $user->id, 'parent_id' => $root->id]);

    $this->actingAs($user)
        ->patchJson("/api/dossiers/{$root->slug}", ['parent' => $child->slug])
        ->assertStatus(422);

    expect($root->refresh()->parent_id)->toBeNull();
});

it('renomme un dossier', function () {
    $user = User::factory()->create();
    $folder = Folder::factory()->create(['user_id' => $user->id, 'name' => 'Avant']);

    $this->actingAs($user)
        ->patchJson("/api/dossiers/{$folder->slug}", ['name' => 'Apres'])
        ->assertOk();

    expect($folder->refresh()->name)->toBe('Apres');
});

it('ne laisse personne toucher au dossier d un autre', function () {
    $folder = Folder::factory()->create();

    $this->actingAs(User::factory()->create())
        ->patchJson("/api/dossiers/{$folder->slug}", ['name' => 'Vole'])
        ->assertForbidden();

    expect($folder->refresh()->name)->not->toBe('Vole');
});

it('promeut les enfants au lieu de les supprimer', function () {
    $user = User::factory()->create();
    $grandparent = Folder::factory()->create(['user_id' => $user->id]);
    $parent = Folder::factory()->create(['user_id' => $user->id, 'parent_id' => $grandparent->id]);
    $child = Folder::factory()->create(['user_id' => $user->id, 'parent_id' => $parent->id]);

    $this->actingAs($user)->deleteJson("/api/dossiers/{$parent->slug}")->assertOk();

    expect(Folder::find($child->id)->parent_id)->toBe($grandparent->id)
        ->and(Folder::find($parent->id))->toBeNull();
});

it('promeut a la racine quand le dossier supprime y etait', function () {
    $user = User::factory()->create();
    $parent = Folder::factory()->create(['user_id' => $user->id]);
    $child = Folder::factory()->create(['user_id' => $user->id, 'parent_id' => $parent->id]);

    $this->actingAs($user)->deleteJson("/api/dossiers/{$parent->slug}");

    expect(Folder::find($child->id)->parent_id)->toBeNull();
});

it('montre a chacun ses dossiers racine et pas ceux des autres', function () {
    $mine = User::factory()->create();
    Folder::factory()->create(['user_id' => $mine->id, 'name' => 'Le mien']);
    Folder::factory()->create(['name' => 'Celui d un autre']);

    $this->actingAs($mine)->get('/mes-dossiers')
        ->assertOk()
        ->assertSee('Le mien')
        ->assertDontSee('Celui d un autre');
});

it('refuse la page a un visiteur qui n est pas connecte', function () {
    $this->get('/mes-dossiers')->assertRedirect('/auth/discord');
});
