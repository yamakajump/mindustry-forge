<?php

use App\Models\Report;
use App\Models\Schematic;
use App\Models\Standing;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/** Somebody whose word carries the given weight, built from what actually earns it. */
function memberWorth(int $weight): User
{
    return match ($weight) {
        0 => User::factory()->create(),
        1 => User::factory()->create(['upheld' => 1]),
        3 => User::factory()->create(['upheld' => 5]),
    };
}

function reported(Schematic $schematic, User $by, string $reason = 'obscene')
{
    return test()->actingAs($by)->postJson('/api/signalements', [
        'schematique' => $schematic->slug,
        'motif' => $reason,
    ]);
}

it('takes a report from a brand new account', function () {
    $schematic = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    reported($schematic, memberWorth(0))->assertCreated();

    expect(Report::count())->toBe(1);
});

/*
 * The negative and the positive, together.
 *
 * The first alone would pass against a threshold that never fires, which is exactly what a
 * threshold reading weights of zero does. It has to be paired with the case that proves the
 * mechanism runs, or it measures a constant.
 */
it('does not hide anything on the word of accounts worth nothing', function () {
    $schematic = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    reported($schematic, memberWorth(0));
    reported($schematic, memberWorth(0));
    reported($schematic, memberWorth(0));
    reported($schematic, memberWorth(0));

    expect($schematic->fresh()->hidden_at)->toBeNull();
});

it('hides once enough weight has landed', function () {
    $schematic = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    reported($schematic, memberWorth(1));
    reported($schematic, memberWorth(1));
    expect($schematic->fresh()->hidden_at)->toBeNull();

    reported($schematic, memberWorth(1));

    expect($schematic->fresh()->hidden_at)->not->toBeNull()
        ->and(Report::weightOn(Report::SCHEMATIC, $schematic->id))->toBe(Standing::ACTS);
});

it('lets one trusted member hide on their own', function () {
    $schematic = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    reported($schematic, memberWorth(3));

    expect($schematic->fresh()->hidden_at)->not->toBeNull();
});

it('counts one report per person however many times they send it', function () {
    $schematic = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $keen = memberWorth(1);

    reported($schematic, $keen)->assertCreated();
    reported($schematic, $keen)->assertCreated();
    reported($schematic, $keen)->assertCreated();

    expect(Report::count())->toBe(1)
        ->and($schematic->fresh()->hidden_at)->toBeNull();
});

it('says the same thing whether or not the report hid anything', function () {
    $quiet = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $doomed = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    $first = reported($quiet, memberWorth(0));
    $second = reported($doomed, memberWorth(3));

    expect($first->json('message'))->toBe($second->json('message'));
});

it('turns away a report from somebody signed out', function () {
    $schematic = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->postJson('/api/signalements', [
        'schematique' => $schematic->slug, 'motif' => 'obscene',
    ])->assertUnauthorized();
});

it('refuses a reason that is not on the list', function () {
    $schematic = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    reported($schematic, memberWorth(1), 'parce que')->assertJsonValidationErrorFor('motif');
});

it('stops somebody working through the catalogue', function () {
    $member = memberWorth(0);
    $quota = $member->standing()->reportsPerDay();

    for ($i = 0; $i < $quota; $i++) {
        reported(Schematic::factory()->create(['visibility' => Schematic::PUBLIC]), $member)
            ->assertCreated();
    }

    reported(Schematic::factory()->create(['visibility' => Schematic::PUBLIC]), $member)
        ->assertStatus(429);
});

it('weighs a report at what it was worth on the day it was filed', function () {
    $schematic = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $member = memberWorth(0);

    reported($schematic, $member);

    // They earn their standing afterwards. The report they already filed does not
    // retroactively gain weight, or thresholds crossed long ago would re-decide themselves.
    $member->update(['upheld' => 5]);

    // Asserted first, because the rest of this test passes just as well when the update
    // above silently does nothing, which is what happens when a column is left out of the
    // fillable list. Without this line the test proves that a change nobody made changed
    // nothing.
    expect($member->fresh()->standing()->weight)->toBe(3)
        ->and(Report::first()->weight)->toBe(0)
        ->and($schematic->fresh()->hidden_at)->toBeNull();
});

it('gives a young discord account no weight whatever it has done', function () {
    $veteran = User::factory()->create(['upheld' => 5]);
    $fresh = User::factory()->create(['upheld' => 5, 'discord_created_at' => now()->subDays(3)]);

    expect($veteran->standing()->weight)->toBe(3)
        ->and($fresh->standing()->weight)->toBe(0);
});

it('reads a discord account age out of its snowflake', function () {
    /*
     * The example in Discord's own reference: snowflake 175928847299117063 carries the
     * timestamp 1462015105796, which is 2016-04-30T11:18:25.796Z.
     *
     * Asserted to the millisecond rather than to the day. A day is wide enough that an
     * arithmetic slip of a few hours passes, and the whole value of reading the id is that
     * it is exact.
     */
    expect(User::discordCreatedAt('175928847299117063')->getTimestampMs())->toBe(1462015105796)
        ->and(User::discordCreatedAt('pas-un-nombre'))->toBeNull();
});
