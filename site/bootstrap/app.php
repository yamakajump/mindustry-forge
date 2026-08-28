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
        // in that same file), so whether port 80 answers a request that
        // skips the tunnel entirely is not something this repository can
        // settle; it is a measurement on the server, not made here. Trusting
        // '*' would normally also trust X-Forwarded-For from that same
        // untested peer, so the headers are narrowed to proto/host/port
        // only: the application keeps forming its own opinion of the client
        // IP from the raw connection, which is correct whichever way that
        // unmeasured question turns out. Widen it to include
        // HEADER_X_FORWARDED_FOR only once that port-80 reachability has
        // actually been checked on the server, not assumed here again.
        $middleware->trustProxies(at: '*', headers: Request::HEADER_X_FORWARDED_PROTO
            | Request::HEADER_X_FORWARDED_HOST
            | Request::HEADER_X_FORWARDED_PORT);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
