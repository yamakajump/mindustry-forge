<?php

use App\Models\Folder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('creates a folder with a name and an icon from the catalogue', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/api/dossiers', [
        'name' => 'Chaine silicium',
        'icon' => 'objet/silicon',
    ])->assertCreated()->assertJsonStructure(['slug', 'url']);

    expect(Folder::first()->icon)->toBe('objet/silicon');
});

it('refuses an icon that is not in the catalogue', function () {
    $this->actingAs(User::factory()->create())
        ->postJson('/api/dossiers', ['name' => 'Truc', 'icon' => 'objet/inexistant'])
        ->assertStatus(422);

    expect(Folder::count())->toBe(0);
});

it('accepts a folder with no icon', function () {
    $this->actingAs(User::factory()->create())
        ->postJson('/api/dossiers', ['name' => 'Sans image'])
        ->assertCreated();

    expect(Folder::first()->icon)->toBeNull();
});

it('refuses to go past the maximum depth', function () {
    $user = User::factory()->create();
    $parent = null;
    foreach (range(1, Folder::MAX_DEPTH) as $ignored) {
        $parent = Folder::factory()->create(['user_id' => $user->id, 'parent_id' => $parent?->id]);
    }

    $this->actingAs($user)
        ->postJson('/api/dossiers', ['name' => 'Un de trop', 'parent' => $parent->slug])
        ->assertStatus(422);
});

it('refuses a move that would make a ring', function () {
    $user = User::factory()->create();
    $root = Folder::factory()->create(['user_id' => $user->id]);
    $child = Folder::factory()->create(['user_id' => $user->id, 'parent_id' => $root->id]);

    $this->actingAs($user)
        ->patchJson("/api/dossiers/{$root->slug}", ['parent' => $child->slug])
        ->assertStatus(422);

    expect($root->refresh()->parent_id)->toBeNull();
});

it('renames a folder', function () {
    $user = User::factory()->create();
    $folder = Folder::factory()->create(['user_id' => $user->id, 'name' => 'Avant']);

    $this->actingAs($user)
        ->patchJson("/api/dossiers/{$folder->slug}", ['name' => 'Apres'])
        ->assertOk();

    expect($folder->refresh()->name)->toBe('Apres');
});

it('lets nobody touch a folder that belongs to somebody else', function () {
    $folder = Folder::factory()->create();

    $this->actingAs(User::factory()->create())
        ->patchJson("/api/dossiers/{$folder->slug}", ['name' => 'Vole'])
        ->assertForbidden();

    expect($folder->refresh()->name)->not->toBe('Vole');
});

it('promotes the children instead of deleting them', function () {
    $user = User::factory()->create();
    $grandparent = Folder::factory()->create(['user_id' => $user->id]);
    $parent = Folder::factory()->create(['user_id' => $user->id, 'parent_id' => $grandparent->id]);
    $child = Folder::factory()->create(['user_id' => $user->id, 'parent_id' => $parent->id]);

    $this->actingAs($user)->deleteJson("/api/dossiers/{$parent->slug}")->assertOk();

    expect(Folder::find($child->id)->parent_id)->toBe($grandparent->id)
        ->and(Folder::find($parent->id))->toBeNull();
});

it('promotes to the root when the deleted folder was there', function () {
    $user = User::factory()->create();
    $parent = Folder::factory()->create(['user_id' => $user->id]);
    $child = Folder::factory()->create(['user_id' => $user->id, 'parent_id' => $parent->id]);

    $this->actingAs($user)->deleteJson("/api/dossiers/{$parent->slug}");

    expect(Folder::find($child->id)->parent_id)->toBeNull();
});

it('shows each member their root folders and not those of others', function () {
    $mine = User::factory()->create();
    Folder::factory()->create(['user_id' => $mine->id, 'name' => 'Le mien']);
    Folder::factory()->create(['name' => 'Celui d un autre']);

    $this->actingAs($mine)->get('/mes-dossiers')
        ->assertOk()
        ->assertSee('Le mien')
        ->assertDontSee('Celui d un autre');
});

it('refuses the page to a visitor who is not signed in', function () {
    $this->get('/mes-dossiers')->assertRedirect('/auth/discord');
});

it('offers the icons as their own sprites, not as their names', function () {
    /* The icon list was a native `<select>` of item identifiers, which is the same defect
       filed against the catalogue's filters: a player recognises copper by its sprite
       before they read the word. It is the shared picker now, and it is still a form
       control, so the folder is created without a line of JavaScript. */
    $mine = User::factory()->create();

    $page = $this->actingAs($mine)->get('/mes-dossiers')->assertOk();

    $page->assertSee('name="icone" value="objet/copper"', escape: false)
        ->assertSee('/icone/objet/copper.png', escape: false)
        ->assertDontSee('<select id="icone"', escape: false)
        // Named as a player names it, not as the game files it.
        ->assertSee('Cuivre');
});
