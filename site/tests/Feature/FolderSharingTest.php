<?php

use App\Models\Folder;
use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * What a folder shows to somebody who is not its owner.
 *
 * The hard case is not the private folder, it is the public folder holding schematics the
 * visitor cannot see: listing them leaks names and figures, hiding them silently makes a
 * folder of twelve read as a folder of four with no explanation.
 */
it('hides a private schematic and says how many it withheld', function () {
    $owner = User::factory()->create();
    $folder = Folder::factory()->create([
        'user_id' => $owner->id, 'visibility' => Schematic::PUBLIC,
    ]);
    $folder->schematics()->attach([
        Schematic::factory()->create(['visibility' => Schematic::PUBLIC, 'name' => 'Visible'])->id,
        Schematic::factory()->create(['visibility' => Schematic::PRIVATE, 'name' => 'Cachee'])->id,
    ]);

    $page = $this->get("/d/{$folder->slug}")->assertOk();

    $page->assertSee('Visible')->assertDontSee('Cachee');
    expect($page->viewData('withheld'))->toBe(1);
});

it('warns the owner that part of their shared folder is invisible', function () {
    $owner = User::factory()->create();
    $folder = Folder::factory()->create([
        'user_id' => $owner->id, 'visibility' => Schematic::PUBLIC,
    ]);
    $folder->schematics()->attach(
        Schematic::factory()->create(['visibility' => Schematic::PRIVATE])->id
    );

    $this->actingAs($owner)->get("/d/{$folder->slug}")
        ->assertOk()
        ->assertSee(trans_choice('dossiers.page.retires-proprietaire', 1));
});

it('tells a visitor something other than what it tells the owner', function () {
    $folder = Folder::factory()->create(['visibility' => Schematic::PUBLIC]);
    $folder->schematics()->attach(
        Schematic::factory()->create(['visibility' => Schematic::PRIVATE])->id
    );

    $this->get("/d/{$folder->slug}")
        ->assertOk()
        ->assertSee(trans_choice('dossiers.page.retires-visiteur', 1))
        ->assertDontSee(trans_choice('dossiers.page.retires-proprietaire', 1));
});

it('says nothing when there is nothing to hide', function () {
    $folder = Folder::factory()->create(['visibility' => Schematic::PUBLIC]);
    $folder->schematics()->attach(
        Schematic::factory()->create(['visibility' => Schematic::PUBLIC])->id
    );

    $this->get("/d/{$folder->slug}")
        ->assertOk()
        ->assertDontSee(trans_choice('dossiers.page.retires-visiteur', 1));
});

it('refuses a private folder to everybody but its owner', function () {
    $folder = Folder::factory()->create(['visibility' => Schematic::PRIVATE]);

    $this->get("/d/{$folder->slug}")->assertNotFound();
    $this->actingAs(User::factory()->create())->get("/d/{$folder->slug}")->assertNotFound();
    $this->actingAs($folder->user)->get("/d/{$folder->slug}")->assertOk();
});

it('serves an unlisted folder to whoever has the address', function () {
    $folder = Folder::factory()->create(['visibility' => Schematic::UNLISTED]);

    $this->get("/d/{$folder->slug}")->assertOk();
});

it('never makes a public folder depend on the visibility of its parent', function () {
    $owner = User::factory()->create();
    $prive = Folder::factory()->create(['user_id' => $owner->id, 'visibility' => Schematic::PRIVATE]);
    $public = Folder::factory()->create([
        'user_id' => $owner->id, 'parent_id' => $prive->id, 'visibility' => Schematic::PUBLIC,
    ]);

    /* Each folder answers for itself. Inheriting from the parent would create a rule nobody
       can guess from the screen: "your public pack does not work, because of a folder you
       are not looking at". */
    $this->get("/d/{$public->slug}")->assertOk();
    $this->get("/d/{$prive->slug}")->assertNotFound();
});

it('never shows private subfolders to a visitor', function () {
    $owner = User::factory()->create();
    $parent = Folder::factory()->create(['user_id' => $owner->id, 'visibility' => Schematic::PUBLIC]);
    Folder::factory()->create([
        'user_id' => $owner->id, 'parent_id' => $parent->id,
        'visibility' => Schematic::PRIVATE, 'name' => 'Brouillon',
    ]);

    $this->get("/d/{$parent->slug}")->assertOk()->assertDontSee('Brouillon');
    $this->actingAs($owner)->get("/d/{$parent->slug}")->assertOk()->assertSee('Brouillon');
});

it('puts a schematic in two folders at once', function () {
    $user = User::factory()->create();
    $one = Folder::factory()->create(['user_id' => $user->id]);
    $two = Folder::factory()->create(['user_id' => $user->id]);
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    foreach ([$one, $two] as $folder) {
        $this->actingAs($user)
            ->postJson("/api/dossiers/{$folder->slug}/schemas/{$schema->slug}")
            ->assertCreated();
    }

    $this->actingAs($user)->deleteJson("/api/dossiers/{$one->slug}/schemas/{$schema->slug}");

    expect($one->refresh()->schematics)->toHaveCount(0)
        ->and($two->refresh()->schematics)->toHaveCount(1);
});

it('never puts the same schematic in twice', function () {
    $user = User::factory()->create();
    $folder = Folder::factory()->create(['user_id' => $user->id]);
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->actingAs($user)->postJson("/api/dossiers/{$folder->slug}/schemas/{$schema->slug}")->assertCreated();
    $this->actingAs($user)->postJson("/api/dossiers/{$folder->slug}/schemas/{$schema->slug}")->assertOk();

    expect($folder->refresh()->schematics)->toHaveCount(1);
});

it('lets nobody fill a folder that is not theirs', function () {
    $folder = Folder::factory()->create();
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->actingAs(User::factory()->create())
        ->postJson("/api/dossiers/{$folder->slug}/schemas/{$schema->slug}")
        ->assertForbidden();
});

it('refuses to file a private schematic belonging to somebody else', function () {
    $user = User::factory()->create();
    $folder = Folder::factory()->create(['user_id' => $user->id]);
    $secret = Schematic::factory()->create(['visibility' => Schematic::PRIVATE]);

    // A 404 and not a 403: a 403 would confirm that the schematic exists.
    $this->actingAs($user)
        ->postJson("/api/dossiers/{$folder->slug}/schemas/{$secret->slug}")
        ->assertNotFound();
});

it('takes the contents with it when the folder disappears', function () {
    $user = User::factory()->create();
    $folder = Folder::factory()->create(['user_id' => $user->id]);
    $schema = Schematic::factory()->create();
    $folder->schematics()->attach($schema->id);

    $this->actingAs($user)->deleteJson("/api/dossiers/{$folder->slug}");

    expect(DB::table('folder_items')->count())->toBe(0)
        ->and(Schematic::find($schema->id))->not->toBeNull();
});
