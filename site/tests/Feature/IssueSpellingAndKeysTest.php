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
it('prints the power figure on a tile through translation keys, not a raw string', function () {
    $user = User::factory()->create();
    Schematic::factory()->create([
        'user_id' => $user->id,
        'power_made' => 500,
        'power_used' => 100,
    ]);

    $this->actingAs($user)->get('/mes-schemas')
        ->assertOk()
        // `schema.unite.par-seconde` is `/ s`, a space the hardcoded `energie/s` never had:
        // only a page built through the key can show it.
        ->assertSee(__('schema.unite.par-seconde'), false)
        ->assertDontSee('energie/s', false);
});

/** Issue #117: the block count is a hardcoded "N blocs" on two schematic tiles. */
it('prints the block count through a translation key on both tile listings', function () {
    $user = User::factory()->create();
    Schematic::factory()->create(['user_id' => $user->id, 'blocks' => 37]);
    Schematic::factory()->create(['visibility' => Schematic::PUBLIC, 'blocks' => 41]);

    $this->actingAs($user)->get('/mes-schemas')
        ->assertOk()
        ->assertSee(__('schema.unite.blocs'));

    $this->get('/schemas')
        ->assertOk()
        ->assertSee(__('schema.unite.blocs'));
});
