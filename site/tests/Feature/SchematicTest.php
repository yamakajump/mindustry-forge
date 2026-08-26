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

it('garde une schematique et en tire les chiffres cherchables', function () {
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

it('borne ce qui arrive du navigateur', function () {
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

it('refuse une image qui n en est pas une', function () {
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

it('garde une schematique privee privee', function () {
    $owner = User::factory()->create();
    $someoneElse = User::factory()->create();
    $schematic = Schematic::factory()->for($owner)->create(['visibility' => 'private']);

    $this->get("/s/{$schematic->slug}")->assertNotFound();
    $this->actingAs($someoneElse)->get("/s/{$schematic->slug}")->assertNotFound();
    $this->actingAs($owner)->get("/s/{$schematic->slug}")->assertOk();
});

it('montre une schematique publique a tout le monde', function () {
    $schematic = Schematic::factory()->create(['visibility' => 'public', 'name' => 'Presse a graphite']);

    $this->get("/s/{$schematic->slug}")
        ->assertOk()
        ->assertSee('Presse a graphite')
        ->assertSee('og:title', escape: false);
});

it('ne laisse personne modifier la schematique d un autre', function () {
    $schematic = Schematic::factory()->create(['visibility' => 'private']);

    $this->actingAs(User::factory()->create())
        ->patchJson("/api/schematiques/{$schematic->slug}", ['visibility' => 'public'])
        ->assertForbidden();

    expect($schematic->fresh()->visibility)->toBe('private');
});

it('donne a chaque schematique une adresse imprevisible', function () {
    // A sequential url says how many schematics the site has and lets anyone walk every
    // private one that ever slipped through.
    $first = Schematic::factory()->create();
    $second = Schematic::factory()->create();

    expect($first->slug)->not->toBe($second->slug)
        ->and($first->slug)->toMatch('/^[a-z0-9]{10}$/')
        ->and($first->slug)->not->toBe((string) $first->id)
        ->and($second->slug)->not->toBe((string) $second->id);
});

it('trouve une schematique par ce qu elle produit', function () {
    // The thing no other Mindustry site can do: they search names and hand-typed tags,
    // because that is all they hold.
    Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Presse a graphite',
        'produces' => ['graphite' => 40.0],
    ]);
    Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Four a silicium',
        'produces' => ['silicon' => 25.0],
    ]);

    $this->get('/schematiques?produit=graphite')
        ->assertOk()
        ->assertSee('Presse a graphite')
        ->assertDontSee('Four a silicium');
});

it('ne confond pas produire et couter', function () {
    // "graphite" must not match a schematic that merely needs graphite to be built, which
    // is what a LIKE over the whole analysis would have done.
    Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Coute du graphite',
        'produces' => ['silicon' => 10.0], 'needs' => ['graphite' => 90.0],
    ]);

    $this->get('/schematiques?produit=graphite')
        ->assertOk()
        ->assertDontSee('Coute du graphite');
});

it('met les mieux faites devant, pas les plus recentes', function () {
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

    $page = $this->get('/schematiques?tri=best')->assertOk()->getContent();
    expect(strpos($page, 'Petite et vive'))->toBeLessThan(strpos($page, 'Grosse et molle'));
});

it('ne montre pas les schematiques privees dans la vitrine', function () {
    Schematic::factory()->create(['visibility' => 'private', 'name' => 'Gardee pour moi']);

    $this->get('/schematiques')->assertOk()->assertDontSee('Gardee pour moi');
});

it('garde une schematique non repertoriee accessible par lien', function () {
    /* The state a boolean could not express: reachable by anybody given the link, absent
       from the public list. It is what a draft posted in a Discord thread wants. */
    $schematic = Schematic::factory()->create([
        'visibility' => 'unlisted', 'name' => 'Brouillon partage',
    ]);

    $this->get("/s/{$schematic->slug}")->assertOk()->assertSee('Brouillon partage');
    $this->get('/schematiques')->assertOk()->assertDontSee('Brouillon partage');
});

it('laisse son auteur changer qui la voit', function () {
    $owner = User::factory()->create();
    $schematic = Schematic::factory()->for($owner)->create(['visibility' => 'private']);

    $this->actingAs($owner)
        ->patchJson("/api/schematiques/{$schematic->slug}", ['visibility' => 'public'])
        ->assertOk();

    expect($schematic->fresh()->visibility)->toBe('public');
});

it('refuse une visibilite inventee', function () {
    $owner = User::factory()->create();
    $schematic = Schematic::factory()->for($owner)->create(['visibility' => 'private']);

    $this->actingAs($owner)
        ->patchJson("/api/schematiques/{$schematic->slug}", ['visibility' => 'tout le monde'])
        ->assertStatus(422);

    expect($schematic->fresh()->visibility)->toBe('private');
});

it('laisse son auteur la supprimer, et personne d\'autre', function () {
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
