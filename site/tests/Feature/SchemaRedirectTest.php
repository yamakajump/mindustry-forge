<?php

use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * The old catalogue addresses, and what they must carry with them.
 *
 * The site moved from `/schematiques` to `/schemas` because the game's own French bundle
 * says `Schema`. Links to the old address are already shared in Discord threads and already
 * indexed, so it answers a permanent redirect rather than a 404.
 *
 * WHAT THIS FILE IS ACTUALLY GUARDING is not the status code. `Route::redirect` would have
 * produced a 301 that passes any test asserting only the status, while dropping everything
 * after the `?`: its `RedirectController` rebuilds the target out of the route parameters,
 * and a query string is not one. A shared link to a filtered, sorted, paginated search would
 * then land on an unfiltered first page and answer 200, which is a plausible page that is
 * not the one the link asked for. That is the defect this repository has logged six times,
 * and a redirect is a very quiet place for it.
 *
 * So every case below asserts the destination, and the parameters are the point.
 */
it('sends the old catalogue address to the new one', function () {
    $this->get('/schematiques')->assertRedirect('/schemas');
});

/*
 * The parameters come back sorted, and that is Symfony's doing rather than a choice made
 * here: `Request::getQueryString()` runs `normalizeQueryString`, which parses, `ksort`s and
 * rebuilds with RFC 3986 encoding. The order of query parameters carries no meaning, so this
 * costs nothing and buys a canonical target: one address instead of one per permutation,
 * which is what a search engine has to deduplicate otherwise.
 *
 * The expectation is written sorted rather than loosened to "contains", because a test that
 * only checks presence would pass on a redirect that dropped a parameter and re-added a
 * default in its place.
 */
it('keeps every search parameter across the redirect', function () {
    $this->get('/schematiques?produit=silicon&tri=best&bloc=router&page=3')
        ->assertRedirect('/schemas?bloc=router&page=3&produit=silicon&tri=best');
});

/* A value the visitor typed, not one we chose. Percent-encoding has to survive intact:
   re-encoding it once more turns `%20` into `%2520` and the filter silently matches
   nothing. */
it('keeps a hyphenated value intact', function () {
    $this->get('/schematiques?bloc=thorium-reactor&produit=phase-fabric')
        ->assertRedirect('/schemas?bloc=thorium-reactor&produit=phase-fabric');
});

/* A name with a space in it, which is what a block search invites. The point is that the
   value survives the round trip and comes out meaning the same thing, not that its bytes
   are untouched: `+` and `%20` both decode to a space, and the destination has to use one
   the receiving end reads the same way. */
it('keeps a value that needs encoding', function () {
    $this->get('/schematiques?bloc=thorium+reactor')
        ->assertRedirect('/schemas?bloc=thorium%20reactor');
});

it('sends the old personal list to the new one', function () {
    $this->get('/mes-schematiques')->assertRedirect('/mes-schemas');
});

/* Outside the `auth` group on purpose, so this holds for somebody who is not signed in.
   Inside it, an old link would have sent them to Discord and returned them to the login's
   own destination, losing the address they asked for. */
it('redirects the personal list without asking who is asking', function () {
    $this->get('/mes-schematiques')->assertStatus(301);
});

/* The new addresses answer for themselves. Without this, a redirect could point at a 404
   and every test above would still be green. */
it('serves the new addresses', function () {
    $this->get('/schemas')->assertOk();
    $this->get('/mes-schemas')->assertRedirect('/auth/discord');
});
