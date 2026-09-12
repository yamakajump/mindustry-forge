<?php

use App\Models\Schematic;
use App\Models\SchematicItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * The same schematic, published twice.
 *
 * Publishing is the default gesture in the analyser, and the commonest thing a player does
 * there is paste a schematic somebody gave them. Without this, every one of those pastes
 * would have become a second public page for a schematic the catalogue already carries,
 * indexed beside the first and crediting whoever pasted it.
 *
 * The refusal is deliberately narrow, and most of what is asserted here is what it does
 * NOT refuse: a private copy, an unlisted one, a schematic that is only a twin of
 * something hidden, and the author's own row when they edit it.
 */
function paste(array $extra = []): array
{
    return array_merge([
        'name' => 'Ligne a graphite',
        'code' => 'bXNjaAF4nGNgZmBmYWRkZGRiYmJmYWZkBQAVoAK8',
        'analysis' => [
            'width' => 10, 'height' => 16, 'blocks' => 90,
            'perMinute' => ['graphite' => 40.0],
            'needs' => [['resource' => 'coal', 'perMinute' => 80.0]],
            'potential' => ['made' => 2970.0, 'spent' => 568.0],
        ],
    ], $extra);
}

/** A schematic already on the wall, posted by somebody else. */
function onTheWall(string $code, array $extra = []): Schematic
{
    return Schematic::factory()->create(array_merge([
        'user_id' => User::factory()->create(['name' => 'pierre'])->id,
        'name' => 'Graphite compact',
        'code' => $code,
        'code_hash' => Schematic::hashOf($code),
        'visibility' => Schematic::PUBLIC,
    ], $extra));
}

it('refuses to publish a schematic the catalogue already shows, and says where it is', function () {
    $twin = onTheWall(paste()['code']);

    $this->actingAs(User::factory()->create())
        ->postJson('/api/schematiques', paste(['visibility' => 'public']))
        ->assertStatus(409)
        ->assertJsonPath('twin.slug', $twin->slug)
        // The name, because it is almost never the one in hand: what is refused is a
        // string, and the reader has no way of knowing they are holding the schematic
        // somebody else posted under another title.
        ->assertJsonPath('twin.name', 'Graphite compact')
        ->assertJsonPath('twin.contribuable', true);

    expect(Schematic::count())->toBe(1);
});

it('reads the same string through whatever whitespace a copy-paste added', function () {
    // The one difference a Discord message introduces on its own. Somebody who pasted a
    // wrapped string has not made a different schematic.
    $twin = onTheWall(paste()['code']);
    $wrapped = wordwrap(paste()['code'], 8, "\n", true);

    $this->actingAs(User::factory()->create())
        ->postJson('/api/schematiques', paste(['code' => $wrapped, 'visibility' => 'public']))
        ->assertStatus(409)
        ->assertJsonPath('twin.slug', $twin->slug);
});

it('lets anybody keep a private copy of a schematic that is already published', function () {
    // Somebody's own library is their business, and two players are allowed to keep the
    // same design. Only the public catalogue is being protected.
    onTheWall(paste()['code']);

    $this->actingAs(User::factory()->create())
        ->postJson('/api/schematiques', paste(['visibility' => 'private']))
        ->assertCreated();

    $this->actingAs(User::factory()->create())
        ->postJson('/api/schematiques', paste(['visibility' => 'unlisted']))
        ->assertCreated();

    expect(Schematic::count())->toBe(3);
});

it('does not count a private, an unlisted or a hidden schematic as a twin', function () {
    onTheWall(paste()['code'], ['visibility' => Schematic::PRIVATE]);
    onTheWall(paste()['code'], ['visibility' => Schematic::UNLISTED]);
    onTheWall(paste()['code'], ['hidden_at' => now()]);

    $this->actingAs(User::factory()->create())
        ->postJson('/api/schematiques', paste(['visibility' => 'public']))
        ->assertCreated();
});

it('refuses the same duplicate arriving by the back door, which is an edit', function () {
    /* Keeping it private is never refused, so without this the guard is a screen door:
       keep it private, then flip it to public from its own page. */
    $twin = onTheWall(paste()['code']);
    $mine = User::factory()->create();

    $slug = $this->actingAs($mine)
        ->postJson('/api/schematiques', paste(['visibility' => 'private']))
        ->assertCreated()->json('slug');

    $this->actingAs($mine)
        ->patchJson("/api/schematiques/{$slug}", ['visibility' => 'public'])
        ->assertStatus(409)
        ->assertJsonPath('twin.slug', $twin->slug);

    expect(Schematic::where('slug', $slug)->first()->visibility)
        ->toBe(Schematic::PRIVATE);
});

it('refuses an edit that pastes a published schematic over a public row', function () {
    // Both the string and the visibility can move in one call, so what is weighed is where
    // the row would end up and not where it came from.
    $twin = onTheWall(paste()['code']);
    $mine = User::factory()->create();

    $slug = $this->actingAs($mine)
        ->postJson('/api/schematiques', paste([
            'code' => 'bXNjaAF4nAAAAAAA', 'visibility' => 'public',
        ]))
        ->assertCreated()->json('slug');

    $this->actingAs($mine)
        ->patchJson("/api/schematiques/{$slug}", ['code' => paste()['code']])
        ->assertStatus(409)
        ->assertJsonPath('twin.slug', $twin->slug);
});

it('lets an author edit their own published schematic without tripping on itself', function () {
    // The row being edited is excluded from the search, or renaming a public schematic
    // would be refused on the grounds that it already exists, which it does.
    $mine = User::factory()->create();

    $slug = $this->actingAs($mine)
        ->postJson('/api/schematiques', paste(['visibility' => 'public']))
        ->assertCreated()->json('slug');

    $this->actingAs($mine)
        ->patchJson("/api/schematiques/{$slug}", ['name' => 'Ligne a graphite v2'])
        ->assertOk();
});

it('stops offering a contribution on a twin that has already been measured', function () {
    $twin = onTheWall(paste()['code']);
    SchematicItem::create([
        'schematic_id' => $twin->id,
        'item' => 'graphite',
        'sens' => 'sortie',
        'kind' => SchematicItem::MESURE,
        'rate' => 40.0,
        'rate_per_block' => 0.44,
    ]);

    $this->actingAs(User::factory()->create())
        ->postJson('/api/schematiques', paste(['visibility' => 'public']))
        ->assertStatus(409)
        ->assertJsonPath('twin.contribuable', false);
});

it('fingerprints every schematic it keeps, so the next one can be compared to it', function () {
    $this->actingAs(User::factory()->create())
        ->postJson('/api/schematiques', paste())
        ->assertCreated();

    expect(Schematic::first()->code_hash)
        ->toBe(hash('sha256', paste()['code']));
});
