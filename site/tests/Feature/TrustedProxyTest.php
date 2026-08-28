<?php

use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * Production sits behind a Cloudflare Tunnel: TLS ends at Cloudflare, and the request
 * reaches nginx over plain HTTP from the local cloudflared daemon carrying an
 * `X-Forwarded-Proto: https` header. Without `trustProxies` configured, Laravel never
 * reads that header and builds every absolute URL as `http`, on a domain that only serves
 * `https`. `og:url` on the browse page is a real, user-facing instance of that bug.
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
