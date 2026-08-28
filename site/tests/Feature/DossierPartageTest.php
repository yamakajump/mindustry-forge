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
it('cache un schema prive et dit combien il en a retire', function () {
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

it('previent le proprietaire que son dossier partage est en partie invisible', function () {
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

it('dit au visiteur autre chose qu au proprietaire', function () {
    $folder = Folder::factory()->create(['visibility' => Schematic::PUBLIC]);
    $folder->schematics()->attach(
        Schematic::factory()->create(['visibility' => Schematic::PRIVATE])->id
    );

    $this->get("/d/{$folder->slug}")
        ->assertOk()
        ->assertSee(trans_choice('dossiers.page.retires-visiteur', 1))
        ->assertDontSee(trans_choice('dossiers.page.retires-proprietaire', 1));
});

it('ne dit rien quand il n y a rien a cacher', function () {
    $folder = Folder::factory()->create(['visibility' => Schematic::PUBLIC]);
    $folder->schematics()->attach(
        Schematic::factory()->create(['visibility' => Schematic::PUBLIC])->id
    );

    $this->get("/d/{$folder->slug}")
        ->assertOk()
        ->assertDontSee(trans_choice('dossiers.page.retires-visiteur', 1));
});

it('refuse un dossier prive a tout le monde sauf son proprietaire', function () {
    $folder = Folder::factory()->create(['visibility' => Schematic::PRIVATE]);

    $this->get("/d/{$folder->slug}")->assertNotFound();
    $this->actingAs(User::factory()->create())->get("/d/{$folder->slug}")->assertNotFound();
    $this->actingAs($folder->user)->get("/d/{$folder->slug}")->assertOk();
});

it('sert un dossier par lien a qui a l adresse', function () {
    $folder = Folder::factory()->create(['visibility' => Schematic::UNLISTED]);

    $this->get("/d/{$folder->slug}")->assertOk();
});

it('ne fait pas dependre un dossier public de la visibilite de son parent', function () {
    $owner = User::factory()->create();
    $prive = Folder::factory()->create(['user_id' => $owner->id, 'visibility' => Schematic::PRIVATE]);
    $public = Folder::factory()->create([
        'user_id' => $owner->id, 'parent_id' => $prive->id, 'visibility' => Schematic::PUBLIC,
    ]);

    /* Chaque dossier repond de lui-meme. Heriter du parent creerait une regle que personne
       ne peut deviner depuis l'ecran : « ton pack public ne marche pas, a cause d'un
       dossier que tu ne regardes pas ». */
    $this->get("/d/{$public->slug}")->assertOk();
    $this->get("/d/{$prive->slug}")->assertNotFound();
});

it('ne montre pas les sous-dossiers prives a un visiteur', function () {
    $owner = User::factory()->create();
    $parent = Folder::factory()->create(['user_id' => $owner->id, 'visibility' => Schematic::PUBLIC]);
    Folder::factory()->create([
        'user_id' => $owner->id, 'parent_id' => $parent->id,
        'visibility' => Schematic::PRIVATE, 'name' => 'Brouillon',
    ]);

    $this->get("/d/{$parent->slug}")->assertOk()->assertDontSee('Brouillon');
    $this->actingAs($owner)->get("/d/{$parent->slug}")->assertOk()->assertSee('Brouillon');
});

it('met un schema dans deux dossiers a la fois', function () {
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

it('ne met pas deux fois le meme schema', function () {
    $user = User::factory()->create();
    $folder = Folder::factory()->create(['user_id' => $user->id]);
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->actingAs($user)->postJson("/api/dossiers/{$folder->slug}/schemas/{$schema->slug}")->assertCreated();
    $this->actingAs($user)->postJson("/api/dossiers/{$folder->slug}/schemas/{$schema->slug}")->assertOk();

    expect($folder->refresh()->schematics)->toHaveCount(1);
});

it('ne laisse personne remplir le dossier d un autre', function () {
    $folder = Folder::factory()->create();
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->actingAs(User::factory()->create())
        ->postJson("/api/dossiers/{$folder->slug}/schemas/{$schema->slug}")
        ->assertForbidden();
});

it('refuse d y ranger le schema prive de quelqu un d autre', function () {
    $user = User::factory()->create();
    $folder = Folder::factory()->create(['user_id' => $user->id]);
    $secret = Schematic::factory()->create(['visibility' => Schematic::PRIVATE]);

    // Un 404 et non un 403 : un 403 confirmerait que la schematique existe.
    $this->actingAs($user)
        ->postJson("/api/dossiers/{$folder->slug}/schemas/{$secret->slug}")
        ->assertNotFound();
});

it('emporte le contenu quand le dossier disparait', function () {
    $user = User::factory()->create();
    $folder = Folder::factory()->create(['user_id' => $user->id]);
    $schema = Schematic::factory()->create();
    $folder->schematics()->attach($schema->id);

    $this->actingAs($user)->deleteJson("/api/dossiers/{$folder->slug}");

    expect(DB::table('folder_items')->count())->toBe(0)
        ->and(Schematic::find($schema->id))->not->toBeNull();
});
