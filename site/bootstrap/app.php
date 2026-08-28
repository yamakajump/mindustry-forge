<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // deployment/nginx/mindustryforge.conf line 3 says this site is
        // exposed by a Cloudflare Tunnel onto http://localhost: cloudflared
        // runs on the origin and forwards each request in over loopback, so
        // the peer nginx actually sees is always 127.0.0.1, never one of
        // Cloudflare's published edge IPs. A hardcoded allowlist of those
        // edge ranges would therefore match nothing and leave every
        // absolute URL silently stuck on http while looking fixed, which is
        // why this trusts every peer address ('*') instead.
        //
        // The vhost still binds every interface (listen 80; listen [::]:80;
        // in that same file), which used to leave open whether a request
        // could reach nginx without going through the tunnel at all. That
        // is now measured, not assumed: on 28/08/2026, with cloudflared
        // active, `ufw status verbose` showed the firewall active with a
        // default-deny on incoming and the only allowed rule being 22/tcp,
        // and a curl to the origin's IP on port 80 and on port 443 from a
        // separate outside machine timed out on both, while the same
        // request through mindustryforge.com answered 200. Nothing reaches
        // this vhost except through the tunnel, so trusting the full
        // forwarded header set, X-Forwarded-For included, is safe: the
        // `at: '*'` peer is always cloudflared, never an attacker.
        //
        // That safety rests on the firewall, not on anything this
        // repository can enforce. If ufw ever opens port 80 or 443, or this
        // vhost is reused on a host without the same deny-by-default rule,
        // X-Forwarded-For becomes attacker-controlled the moment that
        // happens, silently: every client IP the app records, and every
        // rate limit keyed on it, would then be whatever a request chooses
        // to claim. `listen 127.0.0.1:80;` would make that impossible by
        // construction instead of by firewall, but that change was not
        // made here: it is a production decision on a machine that also
        // carries other sites, and it belongs to Corentin.
        //
        // No single Symfony constant covers the whole forwarded header set
        // (checked vendor/symfony/http-foundation/Request.php: HEADER_FORWARDED
        // and the six HEADER_X_FORWARDED_* bits are separate, and the only
        // composites are AWS_ELB and TRAEFIK, neither of which is this
        // proxy). Omitting the `headers:` argument reuses
        // Illuminate\Http\Middleware\TrustProxies's own default, which is
        // already that full bitwise-OR: one fewer place to keep in sync by
        // hand than re-listing the bits here would be.
        $middleware->trustProxies(at: '*');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
