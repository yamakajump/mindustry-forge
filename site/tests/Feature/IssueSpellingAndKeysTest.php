<?php

use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * Three small regressions, filed as issues #115, #116 and #117: French that reaches a
 * player either misspelt or without going through the translation system at all.
 */

/** Issue #115: `energie` written without its accent in two places in schema.php. */
it('spells energie with its accent in the schema dictionary', function () {
    expect(__('schema.unite.energie'))->toBe('Énergie');
    expect(__('schema.comparer.energie'))->toBe('Énergie');
});

/** Issue #116: the power figure on a "my schematics" tile is a hardcoded string. */
it('prints the power figure on a tile through a translation key', function () {
    $user = User::factory()->create();
    Schematic::factory()->create([
        'user_id' => $user->id,
        'power_made' => 500,
        'power_used' => 100,
    ]);

    /* The accent is what separates the key from the string it replaced: the hardcoded text
       was `energie/s` without one, and the key is `énergie/s` with it. Asserting the accent
       proves the key is read, and proves the spelling at the same time. */
    $this->actingAs($user)->get('/mes-schemas')
        ->assertOk()
        ->assertSee('400 '.__('schema.unite.energie-seconde'), false)
        ->assertDontSee('energie/s', false);
});

it('says the unit in lower case and without a space inside it', function () {
    $user = User::factory()->create();
    Schematic::factory()->create([
        'user_id' => $user->id,
        'power_made' => 500,
        'power_used' => 100,
    ]);

    /* A first pass built this from `schema.unite.energie` and `schema.unite.par-seconde`
       and rendered `400 Énergie/ s`: a capital in the middle of a sentence and a space
       inside a unit. Both are wrong French and neither breaks anything, which is why the
       line is held here rather than left to a reader to notice. */
    $body = $this->actingAs($user)->get('/mes-schemas')->assertOk()->getContent();

    expect($body)->not->toContain('Énergie/');
    expect($body)->not->toContain('/ s');
});

/** Issue #117: the block count is a hardcoded "N blocs" on two schematic tiles. */
it('prints the block count through a translation key on both tile listings', function () {
    $user = User::factory()->create();
    Schematic::factory()->create(['user_id' => $user->id, 'blocks' => 37]);
    Schematic::factory()->create(['visibility' => Schematic::PUBLIC, 'blocks' => 41]);

    $this->actingAs($user)->get('/mes-schemas')
        ->assertOk()
        ->assertSee(trans_choice('schema.unite.bloc-compte', 2));

    $this->get('/schemas')
        ->assertOk()
        ->assertSee(trans_choice('schema.unite.bloc-compte', 2));
});
