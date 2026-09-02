<?php

use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * What a filtered listing calls itself.
 *
 * Every listing answered to "Schémas - Mindustry Forge", so three genuinely different sets
 * of schematics were indistinguishable in a list of search results. Nothing about that
 * fails: the pages render, the filters work, and only the reader who never clicks pays.
 */
function schemaTitre(array $extra = []): Schematic
{
    return Schematic::create(array_merge([
        'user_id' => User::factory()->create()->id,
        'slug' => Schematic::freshSlug(),
        'name' => 'Ligne a graphite',
        'code' => 'bXNjaAF4nD',
        'visibility' => Schematic::PUBLIC,
        'width' => 11, 'height' => 11, 'blocks' => 33,
    ], $extra));
}

it('keeps its plain title when nothing is filtered', function () {
    schemaTitre();

    $this->get('/schemas')->assertOk()->assertSee('<title>Schémas - Mindustry Forge</title>', false);
});

it('names the item a listing is filtered on', function () {
    schemaTitre();

    $this->get('/schemas?produit=graphite')->assertOk()
        ->assertSee('<title>Graphite : schémas Mindustry qui en produisent - Mindustry Forge</title>', false);
});

it('says consuming rather than producing when that is the filter', function () {
    /* The filter only accepts an item some schematic actually needs, so the fixture has to
       need one: with nothing needing coal, `consomme=coal` is dropped before it is read and
       the page keeps its plain title. */
    schemaTitre(['needs' => ['coal' => 60.0]]);

    $this->get('/schemas?consomme=coal')->assertOk()
        ->assertSee('qui en consomment - Mindustry Forge', false);
});

it('names the planet a listing is filtered on', function () {
    schemaTitre();

    $this->get('/schemas?planete=erekir')->assertOk()
        ->assertSee('<title>Erekir : schémas Mindustry - Mindustry Forge</title>', false);
});

it('describes a filtered listing by its own count', function () {
    schemaTitre();

    $this->get('/schemas?produit=graphite')->assertOk()
        ->assertSee('name="description" content="Graphite : ', false);
});

it('never calls a listing measured, since it may hold declared figures', function () {
    schemaTitre();

    /* ContributionTest holds the same line for the body of the page. The description is
       read in a search result, where the distinction matters just as much and no context
       repairs it. */
    $body = $this->get('/schemas?produit=graphite')->assertOk()->getContent();
    $description = preg_match('/name="description" content="([^"]*)"/', $body, $m) ? $m[1] : '';

    expect($description)->not->toContain('mesur');
});

it('puts the name outside the phrase, so a missing key cannot swallow it', function () {
    schemaTitre();

    /* The title reads "<name> : <phrase>", never "<phrase> <name>". If the key ever goes
       missing the reader still sees Graphite next to a key that reports itself. */
    $body = $this->get('/schemas?produit=graphite')->assertOk()->getContent();

    expect($body)->toContain('<title>Graphite : ');
});

it('names one filter and not all of them at once', function () {
    schemaTitre();

    $this->get('/schemas?produit=graphite&planete=erekir')->assertOk()
        ->assertSee('<title>Graphite : schémas Mindustry qui en produisent - Mindustry Forge</title>', false);
});

/*
 * The pickers that replaced two dropdowns.
 *
 * A `<select name="consomme">` posts its value on its own. What replaced it has to as well,
 * or the filter silently stops existing for a reader with no JavaScript and for anything
 * that crawls the page. That is the whole reason it is radio buttons and not the grid of
 * links the product filter uses.
 */
it('keeps the ingredient filter a form control that posts', function () {
    schemaTitre(['needs' => ['coal' => 60.0]]);

    $page = $this->get('/schemas?consomme=coal')->assertOk();

    $page->assertSee('name="consomme" value="coal"', escape: false)
        ->assertDontSee('<select name="consomme"', escape: false)
        // The summary names what is chosen, which only happens when it is.
        ->assertSee('<b>Charbon</b>', escape: false)
        // And it shows the thing, which is what the dropdown could not do.
        ->assertSee('/icone/objet/coal.png', escape: false);
});

it('keeps the planet filter a form control that posts', function () {
    schemaTitre();

    $this->get('/schemas?planete=erekir')->assertOk()
        ->assertSee('name="planete" value="erekir"', escape: false)
        ->assertSee('<b>Erekir</b>', escape: false)
        ->assertDontSee('<select name="planete"', escape: false);
});

it('offers no ingredient nothing in the catalogue needs', function () {
    // The picker lists what `Vitrine::eatsOnOffer()` allows, so a filter it offers can
    // always come back with something. Offering the whole item table would not.
    schemaTitre(['needs' => ['coal' => 60.0]]);

    $this->get('/schemas')->assertOk()
        ->assertSee('name="consomme" value="coal"', escape: false)
        ->assertDontSee('name="consomme" value="graphite"', escape: false);
});

it('clears every constraint, including the ones added later', function () {
    /* "Tout effacer" carried its own hand-written list of what to clear, beside the chips
       that already knew. It had drifted: `consomme`, `favoris`, `aimes` and `miens` were
       missing, so pressing it left the ingredient filter on and took away the chip that
       said so. It is read off the chips now, which is why this test can be written at all. */
    schemaTitre(['needs' => ['coal' => 60.0]]);

    $page = $this->get('/schemas?consomme=coal&planete=erekir&blocs=40')->assertOk();

    $lien = [];
    preg_match('/class="puce vide" href="([^"]+)"/', $page->getContent(), $lien);
    expect($lien[1] ?? '')->not->toContain('consomme=coal')
        ->and($lien[1] ?? '')->not->toContain('planete=erekir')
        ->and($lien[1] ?? '')->not->toContain('blocs=40');
});
