<?php

use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

/**
 * Whether a schematic page carries what it needs to draw its own plan.
 *
 * The drawing itself is the renderer's job and is tested where the renderer is. What is
 * checked here is the wiring, which is where this breaks silently: a page that ships the
 * script without the code, or the code without the script, looks exactly like a page that
 * works until somebody opens it.
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

it('hands the page its own code when no preview was ever stored', function () {
    Storage::fake('public');
    $schematic = schema();

    $html = $this->get("/s/{$schematic->slug}")->assertOk()->getContent();

    /* Both, or neither. The fifteen thousand imported schematics have no stored preview,
       and this pair is the only thing standing between them and an empty black panel. */
    expect($html)->toContain('data-code="'.$schematic->code.'"');
    expect($html)->toContain('/forge/apercu.js');
});

it('does not pay for a drawing when a preview is already stored', function () {
    Storage::fake('public');
    $schematic = schema();
    Storage::disk('public')->put("apercus/{$schematic->slug}.png", 'pas vraiment un png');

    $html = $this->get("/s/{$schematic->slug}")->assertOk()->getContent();

    /* The sprite sheet is 1.28 MB. A page that already has its picture has no reason to
       fetch it, so the script and the code both stay out. */
    expect($html)->not->toContain('data-code=');
    expect($html)->not->toContain('/forge/apercu.js');
    expect($html)->toContain("apercus/{$schematic->slug}.png");
});

it('never leaves the panel claiming it is still drawing', function () {
    Storage::fake('public');
    $schematic = schema();

    $html = $this->get("/s/{$schematic->slug}")->assertOk()->getContent();

    /* The placeholder is only honest while the script is on its way. Shipping it without
       the script would leave "drawing the plan..." on screen for ever, which is worse than
       the empty panel it replaced: it is an empty panel that lies about why. */
    expect($html)->toContain('Dessin du plan');
    expect($html)->toContain('/forge/apercu.js');
});

it('hands the list its codes so the grid stops being grey rectangles', function () {
    Storage::fake('public');
    $one = schema(['name' => 'Une']);
    $two = schema(['name' => 'Deux']);

    $html = $this->get('/schematiques')->assertOk()->getContent();

    expect($html)->toContain('data-code="'.$one->code.'"');
    expect($html)->toContain('data-code="'.$two->code.'"');
    expect($html)->toContain('/forge/apercu.js');
});

it('asks for a big code instead of carrying it, and still draws the tile', function () {
    Storage::fake('public');
    $gros = schema(['name' => 'Enorme', 'code' => str_repeat('A', 16385)]);

    $html = $this->get('/schematiques')->assertOk()->getContent();

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
