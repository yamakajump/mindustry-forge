<?php

use App\Models\Space;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

$board = fn () => ['tiles' => [['x' => 0, 'y' => 0, 'block' => 'conveyor', 'rotation' => 0]], 'ground' => []];

it('cree un espace de travail avec un nom et un plateau', function () use ($board) {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/api/espaces', [
        'name' => 'Ligne de silicium',
        'board' => $board(),
    ])->assertCreated()->assertJsonStructure(['slug', 'name']);

    expect(Space::first())
        ->name->toBe('Ligne de silicium')
        ->user_id->toBe($user->id)
        ->board->toBe($board());
});

it('refuse un espace sans nom ni plateau', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/api/espaces', [])->assertStatus(422);

    expect(Space::count())->toBe(0);
});

it('refuse la creation a un visiteur non connecte', function () use ($board) {
    $this->postJson('/api/espaces', ['name' => 'X', 'board' => $board()])
        ->assertUnauthorized();
});

// --- Quota -------------------------------------------------------------------------

it('refuse de depasser le quota d espaces de travail', function () use ($board) {
    $user = User::factory()->create();
    Space::factory()->count(Space::MAX_SPACES)->create(['user_id' => $user->id]);

    $this->actingAs($user)->postJson('/api/espaces', [
        'name' => 'Un de trop',
        'board' => $board(),
    ])->assertStatus(422)->assertJsonValidationErrors('quota');

    expect(Space::where('user_id', $user->id)->count())->toBe(Space::MAX_SPACES);
});

it('laisse creer tant que le quota n est pas atteint', function () use ($board) {
    $user = User::factory()->create();
    Space::factory()->count(Space::MAX_SPACES - 1)->create(['user_id' => $user->id]);

    $this->actingAs($user)->postJson('/api/espaces', [
        'name' => 'Le dernier',
        'board' => $board(),
    ])->assertCreated();

    expect(Space::where('user_id', $user->id)->count())->toBe(Space::MAX_SPACES);
});

it('ne compte que les espaces de ce compte pour le quota', function () use ($board) {
    $user = User::factory()->create();
    Space::factory()->count(Space::MAX_SPACES)->create();

    $this->actingAs($user)->postJson('/api/espaces', [
        'name' => 'Premier chez moi',
        'board' => $board(),
    ])->assertCreated();
});

// --- Cadres ----------------------------------------------------------------------------

it('garde les cadres d un plateau, y compris apres une relecture', function () {
    $user = User::factory()->create();
    $avecCadres = [
        'tiles' => [['x' => 0, 'y' => 0, 'block' => 'conveyor', 'rotation' => 0]],
        'ground' => [],
        'frames' => [['id' => 'a', 'name' => 'fonderie', 'left' => 0, 'bottom' => 0, 'width' => 10, 'height' => 8]],
    ];

    $slug = $this->actingAs($user)->postJson('/api/espaces', [
        'name' => 'Avec cadres',
        'board' => $avecCadres,
    ])->assertCreated()->json('slug');

    expect(Space::first()->board)->toBe($avecCadres);

    $this->actingAs($user)->getJson("/api/espaces/{$slug}")
        ->assertOk()
        ->assertJsonPath('board.frames', $avecCadres['frames']);
});

it('garde les cadres d un plateau sauvegarde par dessus un espace existant', function () use ($board) {
    $user = User::factory()->create();
    $space = Space::factory()->create(['user_id' => $user->id, 'board' => $board()]);
    $avecCadres = [
        'tiles' => [],
        'ground' => [],
        'frames' => [['id' => 'b', 'name' => 'assemblage', 'left' => 2, 'bottom' => 2, 'width' => 5, 'height' => 5]],
    ];

    $this->actingAs($user)->patchJson("/api/espaces/{$space->slug}", ['board' => $avecCadres])
        ->assertOk();

    expect($space->refresh()->board)->toBe($avecCadres);
});

// --- Taille --------------------------------------------------------------------------

it('refuse un plateau plus gros que la limite', function () {
    $user = User::factory()->create();
    // Une chaine largement au dela de Space::MAX_BOARD_BYTES, plutot qu un vrai plateau :
    // c est la taille encodee qui compte, pas sa forme.
    $trop = ['tiles' => [], 'ground' => ['bourrage' => str_repeat('x', Space::MAX_BOARD_BYTES + 1)]];

    $this->actingAs($user)->postJson('/api/espaces', [
        'name' => 'Trop gros',
        'board' => $trop,
    ])->assertStatus(422)->assertJsonValidationErrors('board');

    expect(Space::count())->toBe(0);
});

it('accepte un plateau juste sous la limite', function () {
    $user = User::factory()->create();
    // On vise juste en dessous : le reste du payload JSON (accolades, cles) compte aussi.
    $ok = ['tiles' => [], 'ground' => ['x' => str_repeat('x', Space::MAX_BOARD_BYTES - 200)]];

    $this->actingAs($user)->postJson('/api/espaces', [
        'name' => 'Juste assez',
        'board' => $ok,
    ])->assertCreated();
});

it('accepte un plateau avec cadres plus gros que l ancienne limite de 2 Mio', function () {
    // Les cadres font grandir un plateau reel de 64x64 (quelques centaines de kilo-octets)
    // jusqu a 256x256 rempli (environ 4,8 Mo mesures) : l ancienne limite de 2 Mio aurait
    // refuse un chantier multi-cadres pourtant legitime.
    $user = User::factory()->create();
    $ancienneLimite = 2 * 1024 * 1024;
    $grosChantier = [
        'tiles' => [],
        'ground' => ['bourrage' => str_repeat('x', $ancienneLimite + 500)],
        'frames' => [
            ['id' => 'a', 'name' => 'fonderie', 'left' => 0, 'bottom' => 0, 'width' => 64, 'height' => 64],
            ['id' => 'b', 'name' => 'assemblage', 'left' => 70, 'bottom' => 0, 'width' => 64, 'height' => 64],
        ],
    ];

    $this->actingAs($user)->postJson('/api/espaces', [
        'name' => 'Grand chantier',
        'board' => $grosChantier,
    ])->assertCreated();
});

it('refuse une sauvegarde qui ferait deborder la limite', function () use ($board) {
    $user = User::factory()->create();
    $space = Space::factory()->create(['user_id' => $user->id, 'board' => $board()]);
    $trop = ['tiles' => [], 'ground' => ['bourrage' => str_repeat('x', Space::MAX_BOARD_BYTES + 1)]];

    $this->actingAs($user)->patchJson("/api/espaces/{$space->slug}", ['board' => $trop])
        ->assertStatus(422);

    expect($space->refresh()->board)->toBe($board());
});

// --- Proprietaire, le morceau qui compte ----------------------------------------------

it('ne laisse personne lire l espace de travail d un autre', function () use ($board) {
    $space = Space::factory()->create(['board' => $board()]);

    $this->actingAs(User::factory()->create())
        ->getJson("/api/espaces/{$space->slug}")
        ->assertNotFound();
});

it('ne laisse personne renommer l espace de travail d un autre', function () {
    $space = Space::factory()->create(['name' => 'Original']);

    $this->actingAs(User::factory()->create())
        ->patchJson("/api/espaces/{$space->slug}", ['name' => 'Vole'])
        ->assertNotFound();

    expect($space->refresh()->name)->toBe('Original');
});

it('ne laisse personne ecraser le plateau d un autre', function () use ($board) {
    $space = Space::factory()->create(['board' => $board()]);
    $autre = ['tiles' => [['x' => 9, 'y' => 9, 'block' => 'wall', 'rotation' => 0]], 'ground' => []];

    $this->actingAs(User::factory()->create())
        ->patchJson("/api/espaces/{$space->slug}", ['board' => $autre])
        ->assertNotFound();

    expect($space->refresh()->board)->toBe($board());
});

it('ne laisse personne supprimer l espace de travail d un autre', function () {
    $space = Space::factory()->create();

    $this->actingAs(User::factory()->create())
        ->deleteJson("/api/espaces/{$space->slug}")
        ->assertNotFound();

    expect(Space::find($space->id))->not->toBeNull();
});

it('refuse a un visiteur non connecte de lister, lire, modifier ou supprimer', function () {
    $space = Space::factory()->create();

    $this->getJson('/api/espaces')->assertUnauthorized();
    $this->getJson("/api/espaces/{$space->slug}")->assertUnauthorized();
    $this->patchJson("/api/espaces/{$space->slug}", ['name' => 'X'])->assertUnauthorized();
    $this->deleteJson("/api/espaces/{$space->slug}")->assertUnauthorized();
});

// --- Le proprietaire peut tout faire chez lui -----------------------------------------

it('laisse le proprietaire lire, renommer, sauvegarder et supprimer son espace', function () use ($board) {
    $user = User::factory()->create();
    $space = Space::factory()->create(['user_id' => $user->id, 'name' => 'Avant', 'board' => $board()]);

    $this->actingAs($user)->getJson("/api/espaces/{$space->slug}")
        ->assertOk()->assertJsonPath('board', $board());

    $nouveau = ['tiles' => [], 'ground' => ['0,0' => 'sand']];
    $this->actingAs($user)->patchJson("/api/espaces/{$space->slug}", [
        'name' => 'Apres', 'board' => $nouveau,
    ])->assertOk();

    expect($space->refresh())->name->toBe('Apres')->board->toBe($nouveau);

    $this->actingAs($user)->deleteJson("/api/espaces/{$space->slug}")->assertOk();
    expect(Space::find($space->id))->toBeNull();
});

// --- Le tri « mes plans » --------------------------------------------------------------

it('liste les espaces du compte, les plus recemment ouverts en tete', function () {
    $user = User::factory()->create();
    $vieux = Space::factory()->create(['user_id' => $user->id, 'name' => 'Vieux', 'opened_at' => now()->subDays(3)]);
    $recent = Space::factory()->create(['user_id' => $user->id, 'name' => 'Recent', 'opened_at' => now()]);
    Space::factory()->create(['name' => 'Pas le mien']);

    $reponse = $this->actingAs($user)->getJson('/api/espaces')->assertOk()->json('spaces');

    expect(array_column($reponse, 'name'))->toBe(['Recent', 'Vieux']);
});

it('remonte un espace en tete de liste quand on le rouvre', function () {
    $user = User::factory()->create();
    $ancien = Space::factory()->create(['user_id' => $user->id, 'name' => 'Ancien', 'opened_at' => now()->subDays(5)]);
    Space::factory()->create(['user_id' => $user->id, 'name' => 'Autre', 'opened_at' => now()->subDay()]);

    $this->actingAs($user)->getJson("/api/espaces/{$ancien->slug}")->assertOk();

    $reponse = $this->actingAs($user)->getJson('/api/espaces')->assertOk()->json('spaces');
    expect($reponse[0]['name'])->toBe('Ancien');
});

it('remonte un espace en tete de liste quand on le sauvegarde', function () use ($board) {
    $user = User::factory()->create();
    $ancien = Space::factory()->create(['user_id' => $user->id, 'name' => 'Ancien', 'board' => $board(), 'opened_at' => now()->subDays(5)]);
    Space::factory()->create(['user_id' => $user->id, 'name' => 'Autre', 'opened_at' => now()->subDay()]);

    $this->actingAs($user)->patchJson("/api/espaces/{$ancien->slug}", ['board' => $board()])->assertOk();

    $reponse = $this->actingAs($user)->getJson('/api/espaces')->assertOk()->json('spaces');
    expect($reponse[0]['name'])->toBe('Ancien');
});
