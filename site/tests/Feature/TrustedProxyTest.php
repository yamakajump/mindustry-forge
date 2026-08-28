<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;

uses(RefreshDatabase::class);

/**
 * Cloudflare terminates TLS in front of this app, and nginx receives the forwarded
 * request in the clear. Without `trustProxies` configured, Laravel never reads
 * `X-Forwarded-Proto` and builds every absolute URL as `http`, on a domain that only
 * serves `https`. `og:url` on the browse page is a real, user-facing instance of that bug.
 *
 * The second assertion is the one that proves the header, not a blanket rewrite, does the
 * work: the same route, hit without the header, must still answer `http`. A fix that
 * forces the scheme everywhere would pass the first case and silently break the second.
 */
it('builds an https og:url when the request carries a trusted forwarded proto', function () {
    $html = $this->get('/schemas', ['X-Forwarded-Proto' => 'https'])->getContent();

    expect($html)->toContain('<meta property="og:url" content="https://');
});

it('still builds an http og:url without the forwarded proto header', function () {
    $html = $this->get('/schemas')->getContent();

    expect($html)->toContain('<meta property="og:url" content="http://');
});

/*
 * The property that would silently disappear if the trusted header set were ever widened
 * to include X-Forwarded-For. Whether port 80 answers a request that skips the Cloudflare
 * Tunnel is unmeasured, not ruled out, so trusting '*' must not also hand a visiting
 * request control over what the application believes its own client IP is: that would
 * poison rate limiting and anything that logs the IP with a spoofable one, on the strength
 * of a header anyone reaching the port directly can set.
 *
 * This is a deliberate current limit, not a permanent one: a feature that needs a real
 * client IP (a moderation feature hashing them is already planned) can widen the trusted
 * headers to include HEADER_X_FORWARDED_FOR once that port-80 reachability question has
 * actually been checked on the server, and this test should be updated alongside that,
 * not treated as a rule that forbids it.
 */
it('does not let a forwarded-for header change the client ip the app sees', function () {
    Route::get('/__test/client-ip', fn () => request()->ip());

    $real = $this->get('/__test/client-ip')->getContent();
    $spoofed = $this->get('/__test/client-ip', ['X-Forwarded-For' => '203.0.113.9'])->getContent();

    expect($spoofed)->toBe($real)->not->toBe('203.0.113.9');
});
