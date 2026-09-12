<?php

use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

/**
 * Keeping, publishing and reading back a schematic.
 *
 * The analysis arrives from a browser, so every test here is about not believing it: the
 * figures are bounded, the picture is checked for being a picture, and somebody else's
 * schematic stays somebody else's.
 */
function analysis(array $extra = []): array
{
    return array_merge([
        'width' => 10, 'height' => 16, 'blocks' => 90,
        'perMinute' => ['graphite' => 40.0],
        'needs' => [['resource' => 'coal', 'perMinute' => 80.0]],
        'potential' => ['made' => 2970.0, 'spent' => 568.0],
    ], $extra);
}

it('keeps a schematic and pulls the searchable figures out of it', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->postJson('/api/schematiques', [
            'name' => 'Ligne a graphite',
            'code' => 'bXNjaAF4nD',
            'analysis' => analysis(),
        ])
        ->assertCreated()
        ->assertJsonStructure(['slug', 'url']);

    $kept = Schematic::first();
    expect($kept->blocks)->toBe(90)
        ->and($kept->power_made)->toBe(2970.0)
        ->and($kept->produces)->toEqual(['graphite' => 40])
        ->and($kept->needs)->toEqual(['coal' => 80])
        ->and($kept->visibility)->toBe('private')
        ->and($kept->verified)->toBeFalse();
});

it('bounds what comes in from the browser', function () {
    // The analysis is computed on a machine nobody controls, so a figure that cannot be
    // true is dropped rather than stored for whatever reads it next to trip over.
    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/api/schematiques', [
        'name' => 'Truque',
        'code' => 'bXNjaAF4nD',
        'analysis' => analysis([
            'blocks' => 99999999,
            'width' => -40,
            'potential' => ['made' => -1000.0, 'spent' => 'beaucoup'],
            'perMinute' => ['graphite' => 'plein', 'coal' => 12.0],
        ]),
    ])->assertCreated();

    $kept = Schematic::first();
    expect($kept->blocks)->toBe(65535)
        ->and($kept->width)->toBe(0)
        ->and($kept->power_made)->toBe(0.0)
        ->and($kept->produces)->toEqual(['coal' => 12]);
});

it('refuses an image that is not one', function () {
    Storage::fake('public');
    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/api/schematiques', [
        'name' => 'Avec piece jointe',
        'code' => 'bXNjaAF4nD',
        'analysis' => analysis(),
        'thumbnail' => 'data:image/png;base64,'.base64_encode('<?php echo "bonjour";'),
    ])->assertCreated();

    Storage::disk('public')->assertDirectoryEmpty('apercus');
});

it('keeps a private schematic private', function () {
    $owner = User::factory()->create();
    $someoneElse = User::factory()->create();
    $schematic = Schematic::factory()->for($owner)->create(['visibility' => 'private']);

    $this->get("/s/{$schematic->slug}")->assertNotFound();
    $this->actingAs($someoneElse)->get("/s/{$schematic->slug}")->assertNotFound();
    $this->actingAs($owner)->get("/s/{$schematic->slug}")->assertOk();
});

it('shows a public schematic to everybody', function () {
    $schematic = Schematic::factory()->create(['visibility' => 'public', 'name' => 'Presse a graphite']);

    $this->get("/s/{$schematic->slug}")
        ->assertOk()
        ->assertSee('Presse a graphite')
        ->assertSee('og:title', escape: false);
});

it('refuses to let anyone edit a schematic that is not theirs', function () {
    $schematic = Schematic::factory()->create(['visibility' => 'private']);

    $this->actingAs(User::factory()->create())
        ->patchJson("/api/schematiques/{$schematic->slug}", ['visibility' => 'public'])
        ->assertForbidden();

    expect($schematic->fresh()->visibility)->toBe('private');
});

it('gives every schematic an unpredictable address', function () {
    // A sequential url says how many schematics the site has and lets anyone walk every
    // private one that ever slipped through.
    $first = Schematic::factory()->create();
    $second = Schematic::factory()->create();

    expect($first->slug)->not->toBe($second->slug)
        ->and($first->slug)->toMatch('/^[a-z0-9]{10}$/')
        ->and($first->slug)->not->toBe((string) $first->id)
        ->and($second->slug)->not->toBe((string) $second->id);
});

it('finds a schematic by what it produces', function () {
    // The thing no other Mindustry site can do: they search names and hand-typed tags,
    // because that is all they hold.
    // The ceiling as much as the measurement: the analysis always returns both, and it is
    // the ceiling the catalogue searches on, for want of a measurement in what was imported.
    Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Presse a graphite',
        'produces' => ['graphite' => 40.0],
        'analysis' => ['potentialPerMinute' => ['graphite' => 40.0]],
    ]);
    Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Four a silicium',
        'produces' => ['silicon' => 25.0],
        'analysis' => ['potentialPerMinute' => ['silicon' => 25.0]],
    ]);

    $this->get('/schemas?produit=graphite')
        ->assertOk()
        ->assertSee('Presse a graphite')
        ->assertDontSee('Four a silicium');
});

it('does not confuse producing with costing', function () {
    // "graphite" must not match a schematic that merely needs graphite to be built, which
    // is what a LIKE over the whole analysis would have done.
    Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Coute du graphite',
        'produces' => ['silicon' => 10.0], 'needs' => ['graphite' => 90.0],
    ]);

    $this->get('/schemas?produit=graphite')
        ->assertOk()
        ->assertDontSee('Coute du graphite');
});

it('puts the best made ones in front, not the most recent', function () {
    // A list sorted by date is a list of whoever posted last; a list sorted by output per
    // block is a list of the good ones.
    Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Grosse et molle',
        'blocks' => 200, 'power_made' => 400, 'power_used' => 0,
    ]);
    Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Petite et vive',
        'blocks' => 10, 'power_made' => 300, 'power_used' => 0,
    ]);

    $page = $this->get('/schemas?tri=best')->assertOk()->getContent();
    expect(strpos($page, 'Petite et vive'))->toBeLessThan(strpos($page, 'Grosse et molle'));
});

it('does not show private schematics in the catalogue', function () {
    Schematic::factory()->create(['visibility' => 'private', 'name' => 'Gardee pour moi']);

    $this->get('/schemas')->assertOk()->assertDontSee('Gardee pour moi');
});

it('keeps an unlisted schematic reachable by link', function () {
    /* The state a boolean could not express: reachable by anybody given the link, absent
       from the public list. It is what a draft posted in a Discord thread wants. */
    $schematic = Schematic::factory()->create([
        'visibility' => 'unlisted', 'name' => 'Brouillon partage',
    ]);

    $this->get("/s/{$schematic->slug}")->assertOk()->assertSee('Brouillon partage');
    $this->get('/schemas')->assertOk()->assertDontSee('Brouillon partage');
});

it('lets its author change who sees it', function () {
    $owner = User::factory()->create();
    $schematic = Schematic::factory()->for($owner)->create(['visibility' => 'private']);

    $this->actingAs($owner)
        ->patchJson("/api/schematiques/{$schematic->slug}", ['visibility' => 'public'])
        ->assertOk();

    expect($schematic->fresh()->visibility)->toBe('public');
});

it('refuses a made-up visibility', function () {
    $owner = User::factory()->create();
    $schematic = Schematic::factory()->for($owner)->create(['visibility' => 'private']);

    $this->actingAs($owner)
        ->patchJson("/api/schematiques/{$schematic->slug}", ['visibility' => 'tout le monde'])
        ->assertStatus(422);

    expect($schematic->fresh()->visibility)->toBe('private');
});

it('lets its author delete it, and nobody else', function () {
    $owner = User::factory()->create();
    $other = User::factory()->create();
    $schematic = Schematic::factory()->for($owner)->create();

    $this->actingAs($other)
        ->deleteJson("/api/schematiques/{$schematic->slug}")
        ->assertForbidden();
    expect(Schematic::whereKey($schematic->id)->exists())->toBeTrue();

    $this->actingAs($owner)
        ->deleteJson("/api/schematiques/{$schematic->slug}")
        ->assertOk();
    expect(Schematic::whereKey($schematic->id)->exists())->toBeFalse();
});

it('lets a moderator take what is wrong out of the catalogue', function () {
    /* A public list anyone can post to needs somebody able to take something out of it,
       and the alternative was opening the database by hand. */
    $moderator = User::factory()->create(['moderator' => true]);
    $schematic = Schematic::factory()->create(['visibility' => 'public']);

    $this->actingAs($moderator)
        ->patchJson("/api/schematiques/{$schematic->slug}", ['visibility' => 'private'])
        ->assertOk();

    expect($schematic->fresh()->visibility)->toBe('private');

    $this->actingAs($moderator)
        ->deleteJson("/api/schematiques/{$schematic->slug}")
        ->assertOk();
});

it('makes nobody a moderator by default', function () {
    $someone = User::factory()->create();
    $schematic = Schematic::factory()->create(['visibility' => 'public']);

    $this->actingAs($someone)
        ->deleteJson("/api/schematiques/{$schematic->slug}")
        ->assertForbidden();

    // Read back from the database: what is under test here is the column default.
    expect($someone->fresh()->moderator)->toBeFalse();
});

it('gives a kept schematic back the way it was left', function () {
    /* What its author marked by hand was stored from the first day and never read back:
       reopening one threw away the one answer the tool cannot work out for itself. */
    $owner = User::factory()->create();
    $schematic = Schematic::factory()->for($owner)->create([
        'name' => 'Ma presse',
        'analysis' => ['marked' => ['3,7' => 'in']],
    ]);

    $this->actingAs($owner)
        ->getJson("/api/schematiques/{$schematic->slug}")
        ->assertOk()
        ->assertJson([
            'name' => 'Ma presse',
            'mine' => true,
            'marked' => ['3,7' => 'in'],
        ]);
});

it('allows the name, the description and the code to be corrected', function () {
    $owner = User::factory()->create();
    $schematic = Schematic::factory()->for($owner)->create(['name' => 'Faute de frappe']);

    $this->actingAs($owner)
        ->patchJson("/api/schematiques/{$schematic->slug}", [
            'name' => 'Presse a graphite',
            'description' => 'Deux presses, une bande.',
            'code' => 'bXNjaAF4nA==',
            'analysis' => ['blocks' => 12, 'marked' => ['0,0' => 'in']],
        ])
        ->assertOk();

    $fresh = $schematic->fresh();
    expect($fresh->name)->toBe('Presse a graphite')
        ->and($fresh->description)->toBe('Deux presses, une bande.')
        ->and($fresh->code)->toBe('bXNjaAF4nA==')
        // The searchable columns are rebuilt from the new analysis.
        ->and($fresh->blocks)->toBe(12)
        ->and($fresh->analysis['marked'])->toBe(['0,0' => 'in']);
});

it('does not let a stranger rewrite a schematic', function () {
    $schematic = Schematic::factory()->create(['name' => 'Pas la tienne']);

    $this->actingAs(User::factory()->create())
        ->patchJson("/api/schematiques/{$schematic->slug}", ['name' => 'Volee'])
        ->assertForbidden();

    expect($schematic->fresh()->name)->toBe('Pas la tienne');
});

/**
 * The ground survives being saved.
 *
 * Without it, a schematic kept and then reopened lost its terrain, and its drills fell back
 * to "at best, on a full patch", which is the tool admitting it does not know what they are
 * standing on. The author had taken the trouble to paint it.
 */
it('keeps the ground with the schematic and gives it back on reopening', function () {
    $user = User::factory()->create();
    $sol = [
        '0,0' => ['floor' => 'stone', 'overlay' => 'ore-copper'],
        '1,0' => ['floor' => 'sand'],
        '2,0' => ['floor' => 'stone', 'wall' => 'stone-wall'],
    ];

    $this->actingAs($user)
        ->postJson('/api/schematiques', [
            'name' => 'Foreuse sur cuivre',
            'code' => 'bXNjaAF4nD',
            'analysis' => analysis(),
            'ground' => $sol,
        ])
        ->assertCreated();

    $kept = Schematic::first();
    /* `toEqual` and not `toBe`: MySQL orders the keys of a JSON object by length then by
       bytes, so `wall` comes back before `floor` although they were written the other way
       round. The key order of a JSON object means nothing, and demanding it made this test
       pass on SQLite and fail in production. */
    expect($kept->ground)->toEqual($sol);

    $this->actingAs($user)
        ->getJson("/api/schematiques/{$kept->slug}")
        ->assertOk()
        ->assertJsonPath('ground.0,0.overlay', 'ore-copper')
        ->assertJsonPath('ground.2,0.wall', 'stone-wall');
});

it('refuses a ground larger than the game limit', function () {
    /* 64 x 64 makes 4 096 tiles. One more is either a bug or somebody trying to fill the
       database through the back door. */
    $user = User::factory()->create();
    $trop = [];
    for ($i = 0; $i <= 4096; $i++) {
        $trop["{$i},0"] = ['floor' => 'stone'];
    }

    $this->actingAs($user)
        ->postJson('/api/schematiques', [
            'name' => 'Trop de sol',
            'code' => 'bXNjaAF4nD',
            'analysis' => analysis(),
            'ground' => $trop,
        ])
        ->assertStatus(422);
});

it('changes the ground of a schematic without touching the rest', function () {
    $user = User::factory()->create();
    $kept = Schematic::factory()->for($user)->create([
        'ground' => ['0,0' => ['floor' => 'stone']],
        'name' => 'Avant',
    ]);

    $this->actingAs($user)
        ->patchJson("/api/schematiques/{$kept->slug}", [
            'ground' => ['5,5' => ['floor' => 'sand', 'overlay' => 'ore-lead']],
        ])
        ->assertOk();

    $kept->refresh();
    expect($kept->ground)->toEqual(['5,5' => ['floor' => 'sand', 'overlay' => 'ore-lead']])
        ->and($kept->name)->toBe('Avant');
});

/*
 * A schematic's address, which serves the analyser.
 *
 * It had a page of its own until 12/09/2026. One schematic described by two screens, calling
 * the same facts different names a click apart, was the complaint; the analyser is the one
 * that survived, because it is the one that does something. What the other page had and it
 * lacked - the head a crawler reads, and the cards about the schematic as an object somebody
 * keeps - is injected into it.
 *
 * So what is asserted here is the seam. The body is the analyser's and is drawn by the
 * browser, which no test here runs, so there is nothing to assert about the figures: those
 * are `tests/js`. What a server can be held to is that the right head went in, that the
 * cards went in, and that neither hole was left as a comment.
 */
it('serves the analyser, not a page of its own', function () {
    $mine = Schematic::factory()->create(['visibility' => 'public']);

    $this->get("/s/{$mine->slug}")
        ->assertOk()
        // The analyser's own body, which is what the reader lands in.
        ->assertSee('id="out"', false)
        ->assertSee('id="text"', false)
        // And neither hole left showing.
        ->assertDontSee('<!--TETE-->', false)
        ->assertDontSee('<!--FICHE-->', false);
});

it('puts the schematic in the head, where an unfurler and a crawler read', function () {
    /* Neither ever runs a line of the body, so this is the whole of what they see, and it is
       why one screen can be both the tool and the thing a link points at. */
    $mine = Schematic::factory()->create([
        'visibility' => 'public',
        'name' => 'Ligne a graphite',
        'blocks' => 40,
        'produces' => ['graphite' => 240.0],
    ]);

    $this->get("/s/{$mine->slug}")
        ->assertOk()
        ->assertSee('<title>Ligne a graphite - Mindustry Forge</title>', false)
        ->assertSee('rel="canonical" href="'.url("/s/{$mine->slug}").'"', false)
        ->assertSee('property="og:title" content="Ligne a graphite"', false)
        ->assertSee('property="og:url" content="'.url("/s/{$mine->slug}").'"', false)
        // The card, never the raw preview: an unfurler crops a plan without saying so.
        ->assertSee(url("/s/{$mine->slug}/carte.jpg"), false)
        // The figure travels in the description, which is most of why a link gets clicked.
        ->assertSee('4,00 graphite/s - 40 blocs', false)
        /* And the analyser's own head is gone rather than sitting beside it: a page that
           kept it would unfurl every schematic as the home page. */
        ->assertDontSee('content="https://mindustryforge.com/"', false);
});

it('keeps out of the index what is not on the wall', function () {
    // A schematic shared by link is meant for whoever was given the link. A crawler that
    // finds it anyway must not file it.
    $parLien = Schematic::factory()->create(['visibility' => 'unlisted']);
    $public = Schematic::factory()->create(['visibility' => 'public']);

    $this->get("/s/{$parLien->slug}")->assertSee('name="robots" content="noindex"', false);
    $this->get("/s/{$public->slug}")->assertDontSee('name="robots" content="noindex"', false);
});

it('carries the cards that belong to the schematic rather than to its plan', function () {
    /* The ones that have nowhere else to be: who may see it, the code to take away, and the
       note. What the plan does is the analyser's, and saying it twice under two headings is
       what made one schematic read as two screens. */
    $user = User::factory()->create();
    $mine = Schematic::factory()->create(['user_id' => $user->id, 'visibility' => 'public']);

    $this->actingAs($user)->get("/s/{$mine->slug}")
        ->assertOk()
        ->assertSee('Prendre le schéma', false)
        ->assertSee('data-visibility="public"', false)
        ->assertSee('data-schema="'.$mine->slug.'"', false);
});

it('sends the address it used to have to the one it has', function () {
    /* `/?s=<slug>` opened a stored schematic while there were two screens, and it is in
       Discord threads and bookmarks. Two live addresses for one page is the duplication that
       was complained about, made real in the index, so it is a permanent redirect and not a
       second answer. */
    $mine = Schematic::factory()->create(['visibility' => 'public']);

    $this->get("/?s={$mine->slug}")->assertRedirect("/s/{$mine->slug}");
});

it('still answers the home page when nothing is asked for', function () {
    // The guard on that redirect: `/` is the analyser and must not be swallowed by it.
    $this->get('/')->assertOk()->assertSee('id="out"', false);
    $this->get('/?s=')->assertOk();
});

it('puts a figure in the line that travels furthest, even when nothing leaves', function () {
    /* A jammed plan delivers nothing, so `produces` is empty and the description read
       "20 blocs" and no figure: a Discord link with nothing in it to click for. What it
       makes is still the answer to "what is this", said with the word that says it is
       stuck. */
    $jammed = Schematic::factory()->create([
        'visibility' => 'public',
        'blocks' => 20,
        'produces' => [],
        'analysis' => ['bloque' => ['metaglass' => 480.0]],
    ]);

    $this->get("/s/{$jammed->slug}")
        ->assertOk()
        ->assertSee('8,00 metaglass/s '.__('schema.page.coince-court').' - 20 blocs', false);
});
