<?php

use App\Models\Ban;
use Illuminate\Foundation\Testing\RefreshDatabase;

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
