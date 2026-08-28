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
 * Measured, not assumed: the origin only answers through the Cloudflare Tunnel (ufw
 * denies everything inbound except 22/tcp, and a direct curl to the origin's IP on 80
 * and 443 times out from outside, see bootstrap/app.php for the exact commands and
 * their output). That means the '*' peer trustProxies sees is always cloudflared, so
 * trusting X-Forwarded-For from it is safe, and a real client IP is exactly what a
 * moderation feature hashing IPs to spot rings of fake accounts needs. A build that
 * left X-Forwarded-For untrusted would have every request in the country resolve to
 * 127.0.0.1: a table that fills with identical hashes and looks like it is working.
 */
it('uses the forwarded-for header as the client ip from a trusted proxy', function () {
    Route::get('/__test/client-ip', fn () => request()->ip());

    $seen = $this->get('/__test/client-ip', ['X-Forwarded-For' => '203.0.113.9'])->getContent();

    expect($seen)->toBe('203.0.113.9');
});
