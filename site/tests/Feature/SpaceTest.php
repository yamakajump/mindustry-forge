<?php

use App\Models\Space;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

$board = fn () => ['tiles' => [['x' => 0, 'y' => 0, 'block' => 'conveyor', 'rotation' => 0]], 'ground' => []];

/**
 * The same board, with every object's keys in a settled order.
 *
 * A board goes to MySQL in a `json` column, and MySQL does not store the text it was given:
 * it parses the value and writes back a normalised one, with each object's keys sorted by
 * length and then by bytes. SQLite keeps the text as it arrived. So the same round trip
 * returns `{tiles, ground, frames}` under SQLite and `{tiles, frames, ground}` under MySQL,
 * and a comparison that asserts identity asserts the storage engine's key order along with
 * the content.
 *
 * Three of these assertions passed under MySQL by accident before frames existed: `tiles`
 * is five letters and `ground` is six, which is already the order MySQL sorts them into.
 * Adding `frames`, also six letters and sorting before `ground`, is what made the accident
 * visible. Renaming any key could have done the same at any time.
 *
 * Sorting both sides rather than comparing loosely: a board that came back with the string
 * "5" where an integer 5 went in would be a real defect, and `==` would not see it.
 */
function settled(array $value): array
{
    foreach ($value as $key => $item) {
        if (is_array($item)) {
            $value[$key] = settled($item);
        }
    }
    // Lists keep their order: the order of `tiles` is the order the blocks were placed.
    if (array_is_list($value)) {
        return $value;
    }
    ksort($value);

    return $value;
}

it('creates a work space with a name and a board', function () use ($board) {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/api/espaces', [
        'name' => 'Ligne de silicium',
        'board' => $board(),
    ])->assertCreated()->assertJsonStructure(['slug', 'name']);

    expect(Space::first())
        ->name->toBe('Ligne de silicium')
        ->user_id->toBe($user->id);
    expect(settled(Space::first()->board))->toBe(settled($board()));
});

it('refuses a space with neither name nor board', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/api/espaces', [])->assertStatus(422);

    expect(Space::count())->toBe(0);
});

it('refuses creation to a visitor who is not signed in', function () use ($board) {
    $this->postJson('/api/espaces', ['name' => 'X', 'board' => $board()])
        ->assertUnauthorized();
});

// --- Quota -------------------------------------------------------------------------

it('refuses to go past the work space quota', function () use ($board) {
    $user = User::factory()->create();
    Space::factory()->count(Space::MAX_SPACES)->create(['user_id' => $user->id]);

    $this->actingAs($user)->postJson('/api/espaces', [
        'name' => 'Un de trop',
        'board' => $board(),
    ])->assertStatus(422)->assertJsonValidationErrors('quota');

    expect(Space::where('user_id', $user->id)->count())->toBe(Space::MAX_SPACES);
});

it('allows creating as long as the quota is not reached', function () use ($board) {
    $user = User::factory()->create();
    Space::factory()->count(Space::MAX_SPACES - 1)->create(['user_id' => $user->id]);

    $this->actingAs($user)->postJson('/api/espaces', [
        'name' => 'Le dernier',
        'board' => $board(),
    ])->assertCreated();

    expect(Space::where('user_id', $user->id)->count())->toBe(Space::MAX_SPACES);
});

it('counts only the spaces of this account towards the quota', function () use ($board) {
    $user = User::factory()->create();
    Space::factory()->count(Space::MAX_SPACES)->create();

    $this->actingAs($user)->postJson('/api/espaces', [
        'name' => 'Premier chez moi',
        'board' => $board(),
    ])->assertCreated();
});

// --- Frames ----------------------------------------------------------------------------

it('keeps the frames of a board, including after reading it back', function () {
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

    expect(settled(Space::first()->board))->toBe(settled($avecCadres));

    /* `assertJsonPath` compares arrays with identity too, so it carries the same MySQL key
       order that `settled` exists to ignore. Read the value and compare it settled. */
    $lu = $this->actingAs($user)->getJson("/api/espaces/{$slug}")->assertOk();
    expect(settled($lu->json('board.frames')))->toBe(settled($avecCadres['frames']));
});

it('keeps the frames of a board saved over an existing space', function () use ($board) {
    $user = User::factory()->create();
    $space = Space::factory()->create(['user_id' => $user->id, 'board' => $board()]);
    $avecCadres = [
        'tiles' => [],
        'ground' => [],
        'frames' => [['id' => 'b', 'name' => 'assemblage', 'left' => 2, 'bottom' => 2, 'width' => 5, 'height' => 5]],
    ];

    $this->actingAs($user)->patchJson("/api/espaces/{$space->slug}", ['board' => $avecCadres])
        ->assertOk();

    expect(settled($space->refresh()->board))->toBe(settled($avecCadres));
});

// --- Size ----------------------------------------------------------------------------

it('refuses a board bigger than the limit', function () {
    $user = User::factory()->create();
    // A string well past Space::MAX_BOARD_BYTES rather than a real board: what counts is
    // the encoded size, not its shape.
    $trop = ['tiles' => [], 'ground' => ['bourrage' => str_repeat('x', Space::MAX_BOARD_BYTES + 1)]];

    $this->actingAs($user)->postJson('/api/espaces', [
        'name' => 'Trop gros',
        'board' => $trop,
    ])->assertStatus(422)->assertJsonValidationErrors('board');

    expect(Space::count())->toBe(0);
});

it('accepts a board just under the limit', function () {
    $user = User::factory()->create();
    // Aiming just below it: the rest of the JSON payload (braces, keys) counts too.
    $ok = ['tiles' => [], 'ground' => ['x' => str_repeat('x', Space::MAX_BOARD_BYTES - 200)]];

    $this->actingAs($user)->postJson('/api/espaces', [
        'name' => 'Juste assez',
        'board' => $ok,
    ])->assertCreated();
});

it('accepts a board with frames bigger than the old 2 MiB limit', function () {
    // Frames grow a real 64x64 board (a few hundred kilobytes) up to a filled 256x256
    // (about 4.8 MB measured): the old 2 MiB limit would have refused a multi frame build
    // that was perfectly legitimate.
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

it('refuses a save that would overflow the limit', function () use ($board) {
    $user = User::factory()->create();
    $space = Space::factory()->create(['user_id' => $user->id, 'board' => $board()]);
    $trop = ['tiles' => [], 'ground' => ['bourrage' => str_repeat('x', Space::MAX_BOARD_BYTES + 1)]];

    $this->actingAs($user)->patchJson("/api/espaces/{$space->slug}", ['board' => $trop])
        ->assertStatus(422);

    expect(settled($space->refresh()->board))->toBe(settled($board()));
});

// --- Ownership, the part that matters -------------------------------------------------

it('never lets anyone read the work space of another account', function () use ($board) {
    $space = Space::factory()->create(['board' => $board()]);

    $this->actingAs(User::factory()->create())
        ->getJson("/api/espaces/{$space->slug}")
        ->assertNotFound();
});

it('never lets anyone rename the work space of another account', function () {
    $space = Space::factory()->create(['name' => 'Original']);

    $this->actingAs(User::factory()->create())
        ->patchJson("/api/espaces/{$space->slug}", ['name' => 'Vole'])
        ->assertNotFound();

    expect($space->refresh()->name)->toBe('Original');
});

it('never lets anyone overwrite the board of another account', function () use ($board) {
    $space = Space::factory()->create(['board' => $board()]);
    $autre = ['tiles' => [['x' => 9, 'y' => 9, 'block' => 'wall', 'rotation' => 0]], 'ground' => []];

    $this->actingAs(User::factory()->create())
        ->patchJson("/api/espaces/{$space->slug}", ['board' => $autre])
        ->assertNotFound();

    expect(settled($space->refresh()->board))->toBe(settled($board()));
});

it('never lets anyone delete the work space of another account', function () {
    $space = Space::factory()->create();

    $this->actingAs(User::factory()->create())
        ->deleteJson("/api/espaces/{$space->slug}")
        ->assertNotFound();

    expect(Space::find($space->id))->not->toBeNull();
});

it('refuses listing, reading, changing and deleting to a signed out visitor', function () {
    $space = Space::factory()->create();

    $this->getJson('/api/espaces')->assertUnauthorized();
    $this->getJson("/api/espaces/{$space->slug}")->assertUnauthorized();
    $this->patchJson("/api/espaces/{$space->slug}", ['name' => 'X'])->assertUnauthorized();
    $this->deleteJson("/api/espaces/{$space->slug}")->assertUnauthorized();
});

// --- The owner can do anything in their own space -------------------------------------

it('lets the owner read, rename, save and delete their own space', function () use ($board) {
    $user = User::factory()->create();
    $space = Space::factory()->create(['user_id' => $user->id, 'name' => 'Avant', 'board' => $board()]);

    $lu = $this->actingAs($user)->getJson("/api/espaces/{$space->slug}")->assertOk();
    expect(settled($lu->json('board')))->toBe(settled($board()));

    $nouveau = ['tiles' => [], 'ground' => ['0,0' => 'sand']];
    $this->actingAs($user)->patchJson("/api/espaces/{$space->slug}", [
        'name' => 'Apres', 'board' => $nouveau,
    ])->assertOk();

    expect($space->refresh())->name->toBe('Apres')->board->toBe($nouveau);

    $this->actingAs($user)->deleteJson("/api/espaces/{$space->slug}")->assertOk();
    expect(Space::find($space->id))->toBeNull();
});

// --- The order of the list of spaces ---------------------------------------------------

it('lists the spaces of the account, most recently opened first', function () {
    $user = User::factory()->create();
    $vieux = Space::factory()->create(['user_id' => $user->id, 'name' => 'Vieux', 'opened_at' => now()->subDays(3)]);
    $recent = Space::factory()->create(['user_id' => $user->id, 'name' => 'Recent', 'opened_at' => now()]);
    Space::factory()->create(['name' => 'Pas le mien']);

    $reponse = $this->actingAs($user)->getJson('/api/espaces')->assertOk()->json('spaces');

    expect(array_column($reponse, 'name'))->toBe(['Recent', 'Vieux']);
});

it('moves a space back to the top of the list when it is reopened', function () {
    $user = User::factory()->create();
    $ancien = Space::factory()->create(['user_id' => $user->id, 'name' => 'Ancien', 'opened_at' => now()->subDays(5)]);
    Space::factory()->create(['user_id' => $user->id, 'name' => 'Autre', 'opened_at' => now()->subDay()]);

    $this->actingAs($user)->getJson("/api/espaces/{$ancien->slug}")->assertOk();

    $reponse = $this->actingAs($user)->getJson('/api/espaces')->assertOk()->json('spaces');
    expect($reponse[0]['name'])->toBe('Ancien');
});

it('moves a space back to the top of the list when it is saved', function () use ($board) {
    $user = User::factory()->create();
    $ancien = Space::factory()->create(['user_id' => $user->id, 'name' => 'Ancien', 'board' => $board(), 'opened_at' => now()->subDays(5)]);
    Space::factory()->create(['user_id' => $user->id, 'name' => 'Autre', 'opened_at' => now()->subDay()]);

    $this->actingAs($user)->patchJson("/api/espaces/{$ancien->slug}", ['board' => $board()])->assertOk();

    $reponse = $this->actingAs($user)->getJson('/api/espaces')->assertOk()->json('spaces');
    expect($reponse[0]['name'])->toBe('Ancien');
});
