<?php

use App\Models\Schematic;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * Comparing two schematics from the list, in two clicks and without a line of JavaScript.
 *
 * `/comparer` had existed for a long time and the catalogue did not feed it: putting two
 * results against each other meant two tabs and two addresses copied out by hand.
 *
 * Checkboxes would have needed a script, and without it they would have done nothing at all,
 * which is worse than their absence: a control that does not answer reads as a broken site.
 * A query parameter does the same work and keeps what this site means to keep, one address
 * per step, so a link that shares and a back button that works.
 */

function listee(string $name): Schematic
{
    return Schematic::factory()->create([
        'name' => $name,
        'visibility' => Schematic::PUBLIC,
        'width' => 10, 'height' => 10, 'blocks' => 12,
    ]);
}

it('offers to hold a schematic when nothing is held yet', function () {
    listee('Premier');

    $this->get('/schemas')->assertOk()->assertSee('Comparer');
});

it('names what is held instead of leaving it to be guessed', function () {
    $first = listee('Le premier');
    listee('Le second');

    $this->get("/schemas?comparer={$first->slug}")
        ->assertOk()
        ->assertSee('À comparer avec')
        ->assertSee('Le premier');
});

it('leads to the comparison of the two on the second click', function () {
    $first = listee('Le premier');
    $second = listee('Le second');

    $this->get("/schemas?comparer={$first->slug}")
        ->assertOk()
        ->assertSee("/comparer?a={$first->slug}&amp;b={$second->slug}", false);
});

/*
 * The held schematic is never offered against itself.
 *
 * `/comparer?a=x&b=x` would render a page comparing a schematic with itself: exact, empty of
 * meaning, and with nothing to tell the reader why the two columns are identical.
 */
it('never offers to compare a schematic with itself', function () {
    $only = listee('Tout seul');

    $this->get("/schemas?comparer={$only->slug}")
        ->assertOk()
        ->assertDontSee("/comparer?a={$only->slug}&amp;b={$only->slug}", false)
        ->assertSee('retenu');
});

/*
 * An invented slug holds nothing.
 *
 * An address gets typed and shared. Holding an identifier that does not exist would show a
 * banner naming a schematic that is not there, and every tile would point at an impossible
 * comparison: a page both plausible and false.
 */
it('ignores an identifier that names no listed schematic', function () {
    listee('Visible');

    $this->get('/schemas?comparer=nexistepas')
        ->assertOk()
        ->assertSee('Visible')
        ->assertDontSee('À comparer avec');
});

it('does not hold a private schematic, which the list never shows', function () {
    $hidden = Schematic::factory()->create([
        'name' => 'Cache', 'visibility' => 'private', 'width' => 10, 'height' => 10,
    ]);
    listee('Visible');

    $this->get("/schemas?comparer={$hidden->slug}")
        ->assertOk()
        ->assertDontSee('À comparer avec');
});

/*
 * Holding a schematic does not undo the search in progress.
 *
 * That is the whole point of going through the address rather than through browser state:
 * each tile's link starts from the current address, so the filters survive the click.
 */
it('keeps the filters while holding a schematic', function () {
    $first = listee('Le premier');
    listee('Le second');

    $this->get("/schemas?large=12&haut=12&comparer={$first->slug}")
        ->assertOk()
        ->assertSee('À comparer avec')
        // The constraint is still there, stated by its chip.
        ->assertSee('Tient dans');
});
