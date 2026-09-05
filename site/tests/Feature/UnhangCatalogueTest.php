<?php

use App\Models\Schematic;
use App\Models\User;
use App\Models\Withdrawal;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * Taking the collected catalogue off the wall, and being able to put it back.
 *
 * Two things this has to keep apart, and both of them are one word away from each other in
 * the database. It is not a deletion: fifteen thousand rows survive a run of this and every
 * one of their pages still answers for a moderator. And it is not a takedown: writing a
 * `Withdrawal` would tell the collector never to fetch those schematics again, which is a
 * promise made to an author and not a decision about a showcase.
 */
function collected(array $extra = []): Schematic
{
    return Schematic::factory()->create(array_merge([
        'visibility' => Schematic::PUBLIC,
        'user_id' => null,
        'source' => 'mindustry-tool',
    ], $extra));
}

it('takes down everything nobody here put up', function () {
    collected(['name' => 'Ramassee']);
    collected(['name' => 'Ramassee aussi']);

    $this->artisan('forge:decrocher', ['--raison' => 'catalogue remis a zero'])
        ->assertSuccessful();

    expect(Schematic::whereNotNull('hidden_at')->count())->toBe(2);
    expect(Schematic::listed()->count())->toBe(0);
    expect(Schematic::first()->hidden_reason)->toBe('catalogue remis a zero');
});

it('leaves alone what somebody here chose to publish', function () {
    $mine = Schematic::factory()->create([
        'visibility' => Schematic::PUBLIC,
        'user_id' => User::factory()->create()->id,
    ]);
    collected();

    $this->artisan('forge:decrocher')->assertSuccessful();

    expect($mine->fresh()->hidden_at)->toBeNull();
    expect(Schematic::listed()->count())->toBe(1);
});

it('keeps every row, because this is a shelf and not a bin', function () {
    collected();
    collected();

    $this->artisan('forge:decrocher')->assertSuccessful();

    expect(Schematic::count())->toBe(2);
});

/**
 * The distinction that costs the most if it is lost.
 *
 * `forge:retirer` answers a takedown: it deletes and it records a refusal, so the collector
 * never asks for that schematic again. Recording one here would turn an editorial choice
 * into fifteen thousand permanent refusals, and there is no command that undoes those.
 */
it('records no withdrawal, because none of this was asked for', function () {
    collected();

    $this->artisan('forge:decrocher')->assertSuccessful();

    expect(Withdrawal::count())->toBe(0);
});

it('puts one back by name', function () {
    $one = collected(['slug' => 'abcdefghij']);
    $this->artisan('forge:decrocher')->assertSuccessful();

    $this->artisan('forge:decrocher', ['slug' => 'abcdefghij', '--rendre' => true])
        ->assertSuccessful();

    expect($one->fresh()->hidden_at)->toBeNull();
    expect($one->fresh()->hidden_reason)->toBeNull();
});

it('refuses to put a whole catalogue back without saying which one', function () {
    collected();
    $this->artisan('forge:decrocher', ['--raison' => 'catalogue remis a zero'])->assertSuccessful();

    $this->artisan('forge:decrocher', ['--rendre' => true])->assertFailed();

    expect(Schematic::listed()->count())->toBe(0);
});

/**
 * A bulk restore must not sweep up a schematic hidden on request.
 *
 * `SECURITY.md` promises an author that theirs comes down without argument. That promise is
 * kept by a row carrying its own reason, and a `--rendre` that matched on anything hidden
 * would break it silently, at the exact moment nobody is looking.
 */
it('puts back only what was taken down for the reason given', function () {
    collected(['name' => 'Ramassee']);
    $asked = collected(['name' => 'Retiree sur demande']);

    $this->artisan('forge:decrocher', ['--raison' => 'catalogue remis a zero'])->assertSuccessful();
    $asked->update(['hidden_reason' => "demande de l'auteur"]);

    $this->artisan('forge:decrocher', ['--rendre' => true, '--raison' => 'catalogue remis a zero'])
        ->assertSuccessful();

    expect(Schematic::listed()->count())->toBe(1);
    expect($asked->fresh()->hidden_at)->not->toBeNull();
});

it('says what it would do and does nothing', function () {
    collected();

    $this->artisan('forge:decrocher', ['--dry-run' => true])->assertSuccessful();

    expect(Schematic::whereNotNull('hidden_at')->count())->toBe(0);
});
