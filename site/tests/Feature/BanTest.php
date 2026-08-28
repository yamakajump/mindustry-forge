<?php

use App\Models\Ban;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

/**
 * A ban that a deleted account undoes is not a ban.
 *
 * Every test here is the same property seen from a different side: the memory of a refusal
 * lives outside the table the refusal empties, which is the shape `withdrawals` already
 * took on this repository, for the same failure.
 */
it('refuses a discord id that has been banned', function () {
    Ban::place('4242', 'vandalism');

    expect(Ban::refuses('4242'))->toBeTrue()
        ->and(Ban::refuses('9999'))->toBeFalse();
});

it('stops refusing once a temporary ban has run out', function () {
    Ban::place('4242', 'a week off', now()->subDay());

    expect(Ban::refuses('4242'))->toBeFalse();
});

it('keeps refusing while a temporary ban is still running', function () {
    Ban::place('4242', 'a week off', now()->addDay());

    expect(Ban::refuses('4242'))->toBeTrue();
});

it('does not stack two rows for the same account', function () {
    Ban::place('4242', 'first reason');
    Ban::place('4242', 'second reason');

    expect(Ban::where('discord_id', '4242')->count())->toBe(1)
        ->and(Ban::where('discord_id', '4242')->first()->reason)->toBe('second reason');
});

/**
 * Answer Discord's two endpoints without leaving the test suite.
 *
 * Both have to be faked or the controller stops at the first one and the test passes for
 * the wrong reason.
 */
function signInWith(string $id)
{
    Http::fake([
        'discord.com/api/oauth2/token' => Http::response(['access_token' => 'tok']),
        'discord.com/api/users/@me' => Http::response([
            'id' => $id, 'username' => 'Vandale', 'avatar' => null,
        ]),
    ]);
    config(['services.discord.client_id' => 'x', 'services.discord.client_secret' => 'y']);

    return test()->withSession(['discord_state' => 'st'])
        ->get('/auth/discord/callback?code=c&state=st');
}

it('refuses to sign in a banned discord account', function () {
    Ban::place('4242', 'vandalism');

    signInWith('4242');

    expect(auth()->check())->toBeFalse()
        ->and(User::where('discord_id', '4242')->exists())->toBeFalse();
});

it('refuses an account that still exists, without touching its row', function () {
    $kept = User::factory()->create(['discord_id' => '4242', 'name' => 'Ancien nom']);
    Ban::place('4242', 'vandalism');

    signInWith('4242');

    // updateOrCreate would have rewritten the name from the Discord profile. The guard
    // runs before it, so the row is exactly as the moderator last saw it.
    expect(auth()->check())->toBeFalse()
        ->and($kept->fresh()->name)->toBe('Ancien nom');
});

it('still signs in an account that is not banned', function () {
    signInWith('777');

    expect(auth()->check())->toBeTrue()
        ->and(auth()->user()->discord_id)->toBe('777');
});

it('ends a session that was already open when the ban landed', function () {
    $user = User::factory()->create(['discord_id' => '4242']);

    $this->actingAs($user)->get('/mes-schemas')->assertOk();

    Ban::place('4242', 'vandalism');

    $this->actingAs($user)->get('/mes-schemas')->assertRedirect('/');
    expect(auth()->check())->toBeFalse();
});

it('leaves an unbanned session alone', function () {
    $user = User::factory()->create(['discord_id' => '777']);

    $this->actingAs($user)->get('/mes-schemas')->assertOk();
});

it('bans by name, because that is what a moderator has in front of them', function () {
    User::factory()->create(['discord_id' => '4242', 'name' => 'Vandale']);

    $this->artisan('forge:bannir', ['who' => 'Vandale', '--raison' => 'murs obscenes'])
        ->assertSuccessful();

    expect(Ban::refuses('4242'))->toBeTrue();
});

it('bans by discord id, for an account that no longer exists', function () {
    $this->artisan('forge:bannir', ['who' => '4242'])->assertSuccessful();

    expect(Ban::refuses('4242'))->toBeTrue();
});

it('keeps the account and its schematics, because a ban is not a deletion', function () {
    $user = User::factory()->create(['discord_id' => '4242', 'name' => 'Vandale']);

    $this->artisan('forge:bannir', ['who' => 'Vandale'])->assertSuccessful();

    expect(User::find($user->id))->not->toBeNull();
});

it('refuses a name it cannot find rather than banning a typo', function () {
    $this->artisan('forge:bannir', ['who' => 'Personne'])->assertFailed();

    expect(Ban::count())->toBe(0);
});

it('lifts a temporary ban on its own', function () {
    $this->artisan('forge:bannir', ['who' => '4242', '--jusqu-au' => '2026-08-27'])
        ->assertSuccessful();

    expect(Ban::refuses('4242'))->toBeFalse();
});

it('records when the discord account was created, on the way in', function () {
    signInWith('175928847299117063');

    // To the second: the column is a timestamp, and the milliseconds the snowflake carries
    // do not survive the round trip. Nothing here needs them, the gate is thirty days wide.
    expect(auth()->user()->discord_created_at->getTimestamp())->toBe(1462015105);
});
