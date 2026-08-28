<?php

use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * A hidden schematic has to be gone from every surface, not from the one it was reported on.
 *
 * The listing, the home page, the block pages, the comparison, the name search and the
 * social card each reach the catalogue by their own route. A hiding that only covers the
 * listing leaves the picture reachable through the card, which is the surface that put it
 * in somebody else's Discord thread in the first place.
 */
function hidden(array $extra = []): Schematic
{
    return Schematic::factory()->create(array_merge([
        'visibility' => Schematic::PUBLIC,
        'hidden_at' => now(),
        'hidden_reason' => 'signale',
    ], $extra));
}

it('drops a hidden schematic from the listing', function () {
    $shown = Schematic::factory()->create(['visibility' => Schematic::PUBLIC, 'name' => 'Visible']);
    hidden(['name' => 'Masquee']);

    $this->get('/schemas')
        ->assertSee('Visible')
        ->assertDontSee('Masquee');
});

it('answers 404 on the page of a hidden schematic', function () {
    $schematic = hidden();

    $this->get("/s/{$schematic->slug}")->assertNotFound();
});

it('answers 404 on the social card of a hidden schematic', function () {
    $schematic = hidden();

    $this->get("/s/{$schematic->slug}/carte.jpg")->assertNotFound();
});

it('keeps a hidden schematic out of the name search', function () {
    hidden(['name' => 'Masquee']);

    $this->getJson('/api/schematiques/recherche?q=Masquee')
        ->assertOk()
        ->assertJsonCount(0, 'results');
});

it('still shows a hidden schematic to a moderator', function () {
    $schematic = hidden();
    $moderator = User::factory()->create(['moderator' => true]);

    $this->actingAs($moderator)->get("/s/{$schematic->slug}")->assertOk();
});

it('does not hide anything by hiding nothing', function () {
    $schematic = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    expect($schematic->hidden_at)->toBeNull()
        ->and($schematic->visibleTo(null))->toBeTrue();
});
