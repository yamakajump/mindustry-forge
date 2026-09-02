<?php

use App\Models\Schematic;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * What the site says when it cannot answer.
 *
 * It said nothing of its own: Laravel's white page, "404 | Not Found", in English, with no
 * navigation and no way back, on a site that is French everywhere else. And it is not a
 * rare page: a link pasted into a thread pointing at a schematic since taken private lands
 * exactly here.
 */
it('answers a dead schematic link in French, inside the site', function () {
    $this->get('/s/nexistepas')
        ->assertNotFound()
        ->assertSee('Cette page n&#039;existe pas', escape: false)
        // The nav bar, which is the way out the white page did not have.
        ->assertSee('Parcourir')
        ->assertSee('Analyser');
});

it('gives the three reasons, since taken private is the commonest', function () {
    /* A schematic out of the showcase is still on the server and simply not visible any
       more. Saying only "deleted" would be wrong about half of these. */
    $this->get('/s/nexistepas')
        ->assertNotFound()
        ->assertSee('remis en privé', escape: false)
        ->assertSee('supprimé', escape: false);
});

it('says the same for any address that leads nowhere', function () {
    foreach (['/nimportequoi', '/blocs/nexistepas', '/d/nexistepas'] as $adresse) {
        $this->get($adresse)->assertNotFound()->assertSee('Cette page n&#039;existe pas', escape: false);
    }
});

it('keeps a private schematic behind the same page as a missing one', function () {
    // A 404 rather than a 403: the two must read alike, or the difference between them
    // tells anybody who asks which identifiers exist.
    $prive = Schematic::factory()->create(['visibility' => 'private']);

    $this->get("/s/{$prive->slug}")
        ->assertNotFound()
        ->assertSee('Cette page n&#039;existe pas', escape: false);
});
