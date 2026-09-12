<?php

use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

/**
 * Whether a listing carries what it needs to draw its plans.
 *
 * The drawing itself is the renderer's job and is tested where the renderer is. What is
 * checked here is the wiring, which is where this breaks silently: a page that ships the
 * script without the code, or the code without the script, looks exactly like a page that
 * works until somebody opens it.
 *
 * A schematic's own page used to be checked here too and no longer is. It serves the
 * analyser since 12/09/2026, which draws the plan from the string it fetches rather than
 * from an attribute the server wrote, so there is no wiring left on it to come apart. The
 * drawing there is covered by `tests/js`.
 */
function schema(array $extra = []): Schematic
{
    return Schematic::create(array_merge([
        'user_id' => User::factory()->create()->id,
        'slug' => Schematic::freshSlug(),
        'name' => 'Ligne a graphite',
        'code' => 'bXNjaAF4nD',
        'visibility' => Schematic::PUBLIC,
        'width' => 5, 'height' => 13, 'blocks' => 23,
    ], $extra));
}

it('hands the list its codes so the grid stops being grey rectangles', function () {
    Storage::fake('public');
    $one = schema(['name' => 'Une']);
    $two = schema(['name' => 'Deux']);

    $html = $this->get('/schemas')->assertOk()->getContent();

    expect($html)->toContain('data-code="'.$one->code.'"');
    expect($html)->toContain('data-code="'.$two->code.'"');
    expect($html)->toContain('/forge/apercu.js');
});

it('asks for a big code instead of carrying it, and still draws the tile', function () {
    Storage::fake('public');
    $gros = schema(['name' => 'Enorme', 'code' => str_repeat('A', 16385)]);

    $html = $this->get('/schemas')->assertOk()->getContent();

    /* Measured on the live catalogue, a page of 24 carries 44 kB of codes, median 1 kB and
       largest 8.7 kB. The cap guards the shape the column allows, not the shapes it holds:
       one 512 kB schematic would otherwise land in a list nobody asked it from.

       Keeping the bound is not the same as leaving a hole in the grid. Past the cap the
       tile carries its slug and fetches its own code, once it comes into view. */
    expect($html)->not->toContain($gros->code);
    expect($html)->toContain('data-slug="'.$gros->slug.'"');
});

it('serves a code to a tile that asks for one', function () {
    Storage::fake('public');
    $gros = schema(['name' => 'Enorme', 'code' => str_repeat('A', 16385)]);

    /* The endpoint the tile calls. It already existed for the analyser, which is why the
       cap costs nothing to keep: no new route, no new permission, and a private schematic
       stays as unreachable here as it is everywhere else. */
    $this->get("/api/schematiques/{$gros->slug}/code")
        ->assertOk()
        ->assertSee($gros->code);
});

it('draws the plans on the member own list too', function () {
    Storage::fake('public');
    $owner = User::factory()->create();
    $mine = schema(['user_id' => $owner->id, 'visibility' => Schematic::PRIVATE]);

    $html = $this->actingAs($owner)->get('/mes-schemas')->assertOk()->getContent();

    /* Nothing imported carries a stored preview, and a member's own list is exactly where
       they look for a schematic by its shape. It showed an empty black panel for every one
       of them: the page carried neither the drawer nor the code it draws from. */
    expect($html)->toContain('/forge/apercu.js');
    expect($html)->toContain('data-code="'.$mine->code.'"');
});
