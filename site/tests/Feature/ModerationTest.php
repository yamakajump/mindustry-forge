<?php

use App\Models\Decision;
use App\Models\Report;
use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function moderator(): User
{
    return User::factory()->create(['moderator' => true]);
}

function reportedBy(Schematic $schematic, User $member): Report
{
    return Report::file($member, Report::SCHEMATIC, $schematic->id, 'obscene', null, null);
}

it('hides the queue from anybody who is not a moderator', function () {
    $this->actingAs(User::factory()->create())->get('/moderation')->assertNotFound();
});

it('shows a moderator what is waiting', function () {
    $schematic = Schematic::factory()->create([
        'visibility' => Schematic::PUBLIC, 'name' => 'A relire',
    ]);
    reportedBy($schematic, User::factory()->create(['upheld' => 1]));

    $this->actingAs(moderator())->get('/moderation')->assertOk()->assertSee('A relire');
});

it('credits the reporters when it agrees with them', function () {
    $schematic = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $reporter = User::factory()->create(['upheld' => 1]);
    reportedBy($schematic, $reporter);

    Decision::settle(moderator(), Report::SCHEMATIC, $schematic->id, Decision::UPHELD);

    expect($reporter->fresh()->upheld)->toBe(2)
        ->and($schematic->fresh()->hidden_at)->not->toBeNull();
});

it('charges the reporters double when it disagrees, and puts the plan back', function () {
    $schematic = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $reporter = User::factory()->create(['upheld' => 3]);
    reportedBy($schematic, $reporter);
    reportedBy($schematic, User::factory()->create(['upheld' => 5]));

    expect($schematic->fresh()->hidden_at)->not->toBeNull();

    Decision::settle(moderator(), Report::SCHEMATIC, $schematic->id, Decision::OVERTURNED);

    // Score was 3, one overturned costs two, so it lands on 1: still level 1, no longer
    // able to hide anything on its own. That is the asymmetry doing its work.
    expect($reporter->fresh()->overturned)->toBe(1)
        ->and($reporter->fresh()->overturned_at)->not->toBeNull()
        ->and($reporter->fresh()->standing()->weight)->toBe(1)
        ->and($schematic->fresh()->hidden_at)->toBeNull();
});

it('drops a settled thing out of the queue', function () {
    $schematic = Schematic::factory()->create([
        'visibility' => Schematic::PUBLIC, 'name' => 'Deja tranche',
    ]);
    reportedBy($schematic, User::factory()->create(['upheld' => 1]));

    Decision::settle(moderator(), Report::SCHEMATIC, $schematic->id, Decision::OVERTURNED);

    $this->actingAs(moderator())->get('/moderation')->assertDontSee('Deja tranche');
});

it('settles from the page, not only from the model', function () {
    $schematic = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $reporter = User::factory()->create(['upheld' => 1]);
    reportedBy($schematic, $reporter);

    $this->actingAs(moderator())->post('/moderation/decision', [
        'cible' => Report::SCHEMATIC,
        'id' => $schematic->id,
        'verdict' => Decision::UPHELD,
        'motif' => 'Murs obscenes.',
    ])->assertRedirect('/moderation');

    expect($schematic->fresh()->hidden_reason)->toBe('Murs obscenes.')
        ->and($reporter->fresh()->upheld)->toBe(2);
});

it('refuses a decision from somebody who is not a moderator', function () {
    $schematic = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->actingAs(User::factory()->create())->post('/moderation/decision', [
        'cible' => Report::SCHEMATIC, 'id' => $schematic->id, 'verdict' => Decision::UPHELD,
    ])->assertNotFound();

    expect(Decision::count())->toBe(0);
});

it('upholds a report on something that was never hidden, and hides it then', function () {
    $schematic = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    reportedBy($schematic, User::factory()->create());

    // Weight zero, so nothing was hidden automatically. The moderator agrees anyway.
    expect($schematic->fresh()->hidden_at)->toBeNull();

    Decision::settle(moderator(), Report::SCHEMATIC, $schematic->id, Decision::UPHELD);

    expect($schematic->fresh()->hidden_at)->not->toBeNull();
});

it('puts a drifted counter back to what the ledger says', function () {
    $schematic = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $reporter = User::factory()->create();
    reportedBy($schematic, $reporter);
    Decision::settle(moderator(), Report::SCHEMATIC, $schematic->id, Decision::UPHELD);

    // Somebody edited the row by hand, or a future bug incremented twice.
    $reporter->update(['upheld' => 97]);

    $this->artisan('forge:recount-trust')->assertSuccessful();

    expect($reporter->fresh()->upheld)->toBe(1);
});

it('changes nothing on a dry run, and says so', function () {
    $schematic = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $reporter = User::factory()->create();
    reportedBy($schematic, $reporter);
    Decision::settle(moderator(), Report::SCHEMATIC, $schematic->id, Decision::UPHELD);
    $reporter->update(['upheld' => 97]);

    $this->artisan('forge:recount-trust', ['--dry-run' => true])->assertSuccessful();

    expect($reporter->fresh()->upheld)->toBe(97);
});

it('is idempotent when nothing has drifted', function () {
    $schematic = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $reporter = User::factory()->create();
    reportedBy($schematic, $reporter);
    Decision::settle(moderator(), Report::SCHEMATIC, $schematic->id, Decision::UPHELD);

    $this->artisan('forge:recount-trust')->assertSuccessful();
    $this->artisan('forge:recount-trust')->assertSuccessful();

    expect($reporter->fresh()->upheld)->toBe(1);
});

it('hands somebody the keys to the queue', function () {
    $corentin = User::factory()->create(['name' => 'yamakajump']);

    $this->artisan('forge:moderateur', ['who' => 'yamakajump'])->assertSuccessful();

    // La preuve qui compte n'est pas la colonne, c'est la page : le flag est un moyen, et
    // c'est l'acces a la file qui est la chose demandee.
    expect($corentin->fresh()->moderator)->toBeTrue();
    $this->actingAs($corentin->fresh())->get('/moderation')->assertOk();
});

it('takes the keys back', function () {
    $someone = User::factory()->create(['name' => 'Ancien', 'moderator' => true]);

    $this->artisan('forge:moderateur', ['who' => 'Ancien', '--retirer' => true])
        ->assertSuccessful();

    expect($someone->fresh()->moderator)->toBeFalse();
    $this->actingAs($someone->fresh())->get('/moderation')->assertNotFound();
});

it('refuses a name it cannot find rather than flagging nobody', function () {
    $this->artisan('forge:moderateur', ['who' => 'yamakajumpp'])->assertFailed();

    expect(User::where('moderator', true)->count())->toBe(0);
});
