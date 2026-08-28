<?php

use Illuminate\Http\Request;

/**
 * Whose word this site takes about the scheme it is served on.
 *
 * Cloudflare terminates TLS and the origin listens on port 80 only, so PHP is handed a plain
 * HTTP request. Before this, every absolute URL Laravel generated said http on a site served
 * over https. Measured in production:
 *
 *     GET https://mindustryforge.com/schematiques?produit=silicon
 *     301 -> http://mindustryforge.com/schemas?produit=silicon
 *
 * THE FIRST VERSION OF THIS FILE TESTED THE WRONG PROXY. It asserted that a request from
 * Cloudflare's published ranges is believed, which was true of the code and false of the
 * deployment: the origin is behind a Cloudflare Tunnel, `cloudflared` runs on the machine,
 * and every request reaches nginx from `::1`. Eight green tests and a production that had
 * not moved. A test can only check the question it was given.
 *
 * So the cases below are the loopback, and the refusal is still the half that matters.
 */
function depuis(string $ip, array $entetes = []): Request
{
    return Request::create(
        'http://mindustryforge.com/schemas', 'GET', [], [], [],
        ['REMOTE_ADDR' => $ip] + collect($entetes)
            ->mapWithKeys(fn ($v, $k) => ['HTTP_'.str_replace('-', '_', strtoupper($k)) => $v])
            ->all()
    );
}

/** One address of each family, taken from the ranges in the configuration file. */
it('believes the tunnel about the scheme', function (string $ip) {
    $request = depuis($ip, ['X-Forwarded-Proto' => 'https']);
    app()->handle($request);

    expect($request->isSecure())->toBeTrue()
        ->and($request->getSchemeAndHttpHost())->toStartWith('https://');
})->with([
    'loopback v4' => '127.0.0.1',
    'loopback v6' => '::1',
]);

/*
 * The test that justifies the list.
 *
 * With `at: '*'`, this one would pass as well, and anyone reaching the origin would pick
 * the scheme, the host and the port the site believes it has. This is not a matter of
 * cosmetics: it is what poisons a cache and what builds a password reset link pointing at
 * a domain the attacker chose.
 */
it('believes nobody else', function (string $ip) {
    $request = depuis($ip, ['X-Forwarded-Proto' => 'https']);
    app()->handle($request);

    expect($request->isSecure())->toBeFalse();
})->with([
    'any public address' => '8.8.8.8',
    /* Cloudflare's own ranges, because the first version trusted them: were they to come
       back into the list, it would be with no measurement behind them. */
    'a Cloudflare address' => '162.158.1.1',
    'the machine private network' => '10.0.0.4',
]);

/* Without the header, even coming from Cloudflare, nothing is assumed: a request in the
   clear stays in the clear. */
it('does not guess the scheme when the header is absent', function () {
    $request = depuis('::1');
    app()->handle($request);

    expect($request->isSecure())->toBeFalse();
});

/* The list itself, because a range copied wrong is invisible: it silently takes visitors
   out of the trusted set, and their pages go back out in http. */
it('carries only well formed addresses', function () {
    $plages = (require __DIR__.'/../../config/proxies.php')['trusted'];

    expect($plages)->not->toBeEmpty();

    foreach ($plages as $plage) {
        [$adresse, $masque] = array_pad(explode('/', $plage, 2), 2, null);

        expect(filter_var($adresse, FILTER_VALIDATE_IP))->not->toBeFalse("address: {$plage}");

        if ($masque !== null) {
            expect($masque)->toMatch('/^\d{1,3}$/', "mask: {$plage}");
        }
    }
});
