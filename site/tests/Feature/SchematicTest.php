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

it('laisse le moderateur retirer de la vitrine ce qui ne va pas', function () {
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

it('ne fait de personne un moderateur par defaut', function () {
    $someone = User::factory()->create();
    $schematic = Schematic::factory()->create(['visibility' => 'public']);

    $this->actingAs($someone)
        ->deleteJson("/api/schematiques/{$schematic->slug}")
        ->assertForbidden();

    // Relu depuis la base : c'est la valeur par defaut de la colonne qu'on teste.
    expect($someone->fresh()->moderator)->toBeFalse();
});

it('rend une schematique gardee telle qu\'on l\'a laissee', function () {
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

it('laisse corriger le nom, la description et le code', function () {
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
        // Les colonnes cherchables sont refaites depuis la nouvelle analyse.
        ->and($fresh->blocks)->toBe(12)
        ->and($fresh->analysis['marked'])->toBe(['0,0' => 'in']);
});

it('ne laisse pas un inconnu reecrire une schematique', function () {
    $schematic = Schematic::factory()->create(['name' => 'Pas la tienne']);

    $this->actingAs(User::factory()->create())
        ->patchJson("/api/schematiques/{$schematic->slug}", ['name' => 'Volee'])
        ->assertForbidden();

    expect($schematic->fresh()->name)->toBe('Pas la tienne');
});

/**
 * Le sol survit a l enregistrement.
 *
 * Sans lui, une schematique gardee puis rouverte perdait son terrain, et ses foreuses
 * repassaient a « au mieux, sur une tache pleine », ce qui est l aveu que l outil ne sait
 * pas sur quoi elles sont. L auteur avait pourtant pris la peine de le peindre.
 */
it('garde le sol avec la schematique et le rend en la rouvrant', function () {
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
    /* `toEqual` et non `toBe` : MySQL range les cles d un objet JSON par longueur puis par
       octets, donc `wall` ressort avant `floor` alors qu on les avait ecrites dans l autre
       sens. L ordre des cles d un objet JSON ne veut rien dire, et l exiger faisait passer
       ce test sur SQLite et echouer en production. */
    expect($kept->ground)->toEqual($sol);

    $this->actingAs($user)
        ->getJson("/api/schematiques/{$kept->slug}")
        ->assertOk()
        ->assertJsonPath('ground.0,0.overlay', 'ore-copper')
        ->assertJsonPath('ground.2,0.wall', 'stone-wall');
});

it('refuse un sol plus grand que la limite du jeu', function () {
    /* 64 x 64 fait 4 096 cases. Une de plus est soit un bug, soit quelqu un qui essaie de
       remplir la base de donnees par la porte de derriere. */
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

it('modifie le sol d une schematique sans toucher au reste', function () {
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
