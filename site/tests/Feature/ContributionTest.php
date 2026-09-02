<?php

use App\Models\Contribution;
use App\Models\Schematic;
use App\Models\SchematicItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

/** What a contributor's browser sends back once they have marked the belts. */
function marked(array $extra = []): array
{
    return array_merge([
        'perMinute' => ['graphite' => 90.0],
        'power' => ['made' => 0.0, 'spent' => 0.0],
    ], $extra);
}

function imported(array $extra = []): Schematic
{
    return Schematic::factory()->create(array_merge([
        'visibility' => Schematic::PUBLIC,
        'source' => 'mindustry-schematics',
        // Unique per call: the pair (source, source_id) is what makes collecting twice
        // harmless, so the table enforces it and a fixed value here fails on the second row.
        'source_id' => 'src-'.Str::random(8),
        'blocks' => 30,
    ], $extra));
}

function contributes(Schematic $schematic, User $who, ?array $analysis = null)
{
    return test()->actingAs($who)->postJson('/api/contributions', [
        'schematique' => $schematic->slug,
        'marques' => ['12,4' => ['side' => 'in', 'resource' => 'coal']],
        'analysis' => $analysis ?? marked(),
    ]);
}

it('publishes a marking from a trusted member straight away', function () {
    $schematic = imported();

    contributes($schematic, User::factory()->create(['upheld' => 1]))
        ->assertCreated()
        ->assertJson(['etat' => Contribution::APPLIED]);

    $row = $schematic->items()->where('kind', SchematicItem::DECLARE)->first();

    expect($row->item)->toBe('graphite')
        ->and($row->rate)->toBe(90.0)
        ->and($row->rate_per_block)->toBe(3.0)
        ->and($schematic->fresh()->contribution_id)->not->toBeNull();
});

it('never files a contributed throughput as a measurement', function () {
    $schematic = imported();

    contributes($schematic, User::factory()->create(['upheld' => 1]));

    expect($schematic->items()->where('kind', SchematicItem::MESURE)->count())->toBe(0)
        ->and($schematic->items()->where('kind', SchematicItem::DECLARE)->count())->toBe(1);
});

it('makes a new member wait for other people to agree', function () {
    $schematic = imported();

    contributes($schematic, User::factory()->create())
        ->assertCreated()
        ->assertJson(['etat' => Contribution::PENDING]);

    expect($schematic->items()->where('kind', SchematicItem::DECLARE)->count())->toBe(0);
});

it('publishes a waiting marking once enough weight agrees', function () {
    $schematic = imported();
    contributes($schematic, User::factory()->create());
    $contribution = Contribution::first();

    $contribution->weigh(User::factory()->create(['upheld' => 1]), true);
    expect($contribution->fresh()->state)->toBe(Contribution::PENDING);

    $contribution->weigh(User::factory()->create(['upheld' => 5]), true);

    expect($contribution->fresh()->state)->toBe(Contribution::APPLIED)
        ->and($schematic->items()->where('kind', SchematicItem::DECLARE)->count())->toBe(1);
});

it('throws out a waiting marking that enough weight disagrees with', function () {
    $schematic = imported();
    contributes($schematic, User::factory()->create());
    $contribution = Contribution::first();

    $contribution->weigh(User::factory()->create(['upheld' => 5]), false);

    expect($contribution->fresh()->state)->toBe(Contribution::REJECTED)
        ->and($schematic->items()->where('kind', SchematicItem::DECLARE)->count())->toBe(0);
});

it('does not let somebody vote for their own marking', function () {
    $schematic = imported();
    $author = User::factory()->create(['upheld' => 5]);
    $waiting = Contribution::create([
        'schematic_id' => $schematic->id, 'user_id' => $author->id,
        'marks' => [], 'analysis' => marked(), 'state' => Contribution::PENDING,
    ]);

    $waiting->weigh($author, true);

    expect($waiting->fresh()->state)->toBe(Contribution::PENDING)
        ->and($waiting->votes()->count())->toBe(0);
});

it('counts one vote per person however many times they send it', function () {
    $schematic = imported();
    contributes($schematic, User::factory()->create());
    $contribution = Contribution::first();
    $voter = User::factory()->create(['upheld' => 5]);

    $contribution->weigh($voter, true);
    $contribution->weigh($voter, true);
    $contribution->weigh($voter, true);

    expect($contribution->fresh()->votes()->count())->toBe(1);
});

it('replaces the marking in force rather than stacking a second one', function () {
    $schematic = imported();
    contributes($schematic, User::factory()->create(['upheld' => 1]));
    $first = Contribution::first();

    contributes($schematic, User::factory()->create(['upheld' => 1]),
        marked(['perMinute' => ['silicon' => 30.0]]));

    $rows = $schematic->items()->where('kind', SchematicItem::DECLARE)->get();

    expect($rows)->toHaveCount(1)
        ->and($rows->first()->item)->toBe('silicon')
        ->and($first->fresh()->state)->toBe(Contribution::REVERTED)
        ->and($schematic->fresh()->contribution_id)->toBe(Contribution::latest('id')->first()->id);
});

it('refuses a schematic whose author already said where it is fed', function () {
    $schematic = imported();
    $schematic->items()->create([
        'item' => 'graphite', 'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::MESURE, 'rate' => 40.0, 'rate_per_block' => 1.0,
    ]);

    contributes($schematic, User::factory()->create(['upheld' => 1]))->assertStatus(409);

    expect(Contribution::count())->toBe(0);
});

it('files nothing for a plan fed by a sandbox tap', function () {
    $schematic = imported(['analysis' => ['blocks' => [['block' => 'item-source']]]]);

    contributes($schematic, User::factory()->create(['upheld' => 1]));

    // Marking the belts of a layout a tap pours into does not change where the material
    // came from. The rule that keeps 36 million water a minute out of the rankings is not
    // suspended because a human did the marking.
    expect($schematic->items()->where('kind', SchematicItem::DECLARE)->count())
        ->toBe($schematic->fedBySandbox() ? 0 : 1);
});

it('stops somebody marking the whole catalogue in an afternoon', function () {
    $member = User::factory()->create();
    $quota = $member->standing()->contributionsPerDay();

    for ($i = 0; $i < $quota; $i++) {
        contributes(imported(), $member)->assertCreated();
    }

    contributes(imported(), $member)->assertStatus(429);
});

it('turns away a contribution from somebody signed out', function () {
    $schematic = imported();

    $this->postJson('/api/contributions', [
        'schematique' => $schematic->slug,
        'marques' => ['12,4' => ['side' => 'in', 'resource' => 'coal']],
        'analysis' => marked(),
    ])->assertUnauthorized();
});

it('does not offer the declared sort before it can fill a page', function () {
    $this->get('/schemas')->assertDontSee('débit déclaré');
});

it('offers the declared sort once a page of them exists', function () {
    for ($i = 0; $i < 24; $i++) {
        $schematic = imported();
        $schematic->items()->create([
            'item' => 'graphite', 'sens' => SchematicItem::PRODUIT,
            'kind' => SchematicItem::DECLARE, 'rate' => 90.0, 'rate_per_block' => 3.0,
        ]);
    }

    $this->get('/schemas')->assertSee('débit déclaré');
});

it('names a declared figure as declared, never as measured', function () {
    for ($i = 0; $i < 24; $i++) {
        $schematic = imported();
        $schematic->items()->create([
            'item' => 'graphite', 'sens' => SchematicItem::PRODUIT,
            'kind' => SchematicItem::DECLARE, 'rate' => 90.0, 'rate_per_block' => 3.0,
        ]);
    }

    $page = $this->get('/schemas?produit=graphite&tri=declare');

    $page->assertOk()->assertSee(__('schema.page.declaree'), false)
        ->assertDontSee(__('schema.page.mesuree'), false);
});

it('keeps a declared throughput out of the ceiling ranking', function () {
    $schematic = imported(['name' => 'Declaree seulement']);
    $schematic->items()->create([
        'item' => 'graphite', 'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::DECLARE, 'rate' => 9000.0, 'rate_per_block' => 300.0,
    ]);

    // The ceiling ranking asks a different question, so a schematic that only carries a
    // declared figure has no answer to it and does not appear, however large its number.
    $this->get('/schemas?produit=graphite&tri=output')
        ->assertOk()
        ->assertDontSee('Declaree seulement');
});

it('says the list is on declared throughputs when it is', function () {
    for ($i = 0; $i < 24; $i++) {
        imported()->items()->create([
            'item' => 'graphite', 'sens' => SchematicItem::PRODUIT,
            'kind' => SchematicItem::DECLARE, 'rate' => 90.0, 'rate_per_block' => 3.0,
        ]);
    }

    // The sentence that heads the list answers the same question as the ranking. Leaving
    // "these are ceilings" above a sort on declared rates would be a correct line of text
    // sitting above figures that say something else.
    $this->get('/schemas?produit=graphite&tri=declare')->assertOk()
        ->assertSee('débits déclarés', false)
        ->assertDontSee('Ce sont des plafonds', false);

    $this->get('/schemas?produit=graphite&tri=output')->assertOk()
        ->assertSee('Ce sont des plafonds', false);
});

/*
 * The interface, which did not exist.
 *
 * The endpoints were written, routed and reachable only with curl: grepping the whole of
 * `public/` and `resources/views/` for `api/contributions` returned nothing. So the site
 * held the machinery for turning its imported half from a catalogue of ceilings into a
 * catalogue of measurements, and never offered it to anybody.
 */
it('tells the analyser whether this reader could complete a schematic', function () {
    $author = User::factory()->create();
    $passant = User::factory()->create();
    $imported = imported();

    // Signed out: no.
    $this->getJson("/api/schematiques/{$imported->slug}")
        ->assertOk()->assertJsonPath('contribuable', false);

    // Somebody else, and nothing measured yet: yes.
    $this->actingAs($passant)->getJson("/api/schematiques/{$imported->slug}")
        ->assertOk()->assertJsonPath('contribuable', true);

    // Its own manager has the edit form instead, and `store` would refuse them anyway.
    $mine = Schematic::factory()->for($author)->create(['visibility' => 'public']);
    $this->actingAs($author)->getJson("/api/schematiques/{$mine->slug}")
        ->assertOk()->assertJsonPath('contribuable', false);
});

it('says nothing to complete once a measurement is on it', function () {
    $passant = User::factory()->create();
    $imported = imported();
    $imported->items()->create([
        'item' => 'graphite', 'sens' => SchematicItem::PRODUIT,
        'kind' => SchematicItem::MESURE, 'rate' => 90.0, 'rate_per_block' => 3.0,
    ]);

    // The same 409 `store` answers, asked before the button is drawn rather than after it
    // is pressed: a button refused half the time is a button nobody presses twice.
    $this->actingAs($passant)->getJson("/api/schematiques/{$imported->slug}")
        ->assertOk()->assertJsonPath('contribuable', false);
});

it('puts a waiting marking on the page, with a way to weigh it', function () {
    $offrant = User::factory()->create();
    $lecteur = User::factory()->create();
    $imported = imported();

    $this->actingAs($offrant)->postJson('/api/contributions', [
        'schematique' => $imported->slug,
        'marques' => ['3,4' => ['side' => 'in', 'resource' => 'coal']],
        'analysis' => ['perMinute' => ['graphite' => 90.0]],
        'note' => 'Le charbon entre par la gauche.',
    ])->assertCreated();

    $page = $this->actingAs($lecteur)->get("/s/{$imported->slug}")->assertOk();

    $page->assertSee('Des branchements proposés')
        ->assertSee('Le charbon entre par la gauche.')
        ->assertSee('data-accord="oui"', escape: false);
});

it('offers the offerer no vote on their own', function () {
    $offrant = User::factory()->create();
    $imported = imported();

    $this->actingAs($offrant)->postJson('/api/contributions', [
        'schematique' => $imported->slug,
        'marques' => ['3,4' => ['side' => 'in', 'resource' => 'coal']],
        'analysis' => ['perMinute' => ['graphite' => 90.0]],
    ])->assertCreated();

    // Listed, so they can see it arrived, and without the buttons `weigh` would ignore.
    $this->actingAs($offrant)->get("/s/{$imported->slug}")->assertOk()
        ->assertSee('Ta proposition')
        ->assertDontSee('data-accord="oui"', escape: false);
});

it('shows a signed-out reader no waiting markings at all', function () {
    $offrant = User::factory()->create();
    $imported = imported();

    $this->actingAs($offrant)->postJson('/api/contributions', [
        'schematique' => $imported->slug,
        'marques' => ['3,4' => ['side' => 'in', 'resource' => 'coal']],
        'analysis' => ['perMinute' => ['graphite' => 90.0]],
    ])->assertCreated();

    $this->post('/deconnexion');
    $this->get("/s/{$imported->slug}")->assertOk()->assertDontSee('Des branchements proposés');
});
