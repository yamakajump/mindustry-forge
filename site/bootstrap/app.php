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
        // Cloudflare terminates TLS in front of this app and nginx listens
        // on plain port 80 (deployment/nginx/mindustryforge.conf). Nothing
        // in this repository establishes how nginx is reached: there is no
        // cloudflared unit, no tunnel config, nothing under deployment/
        // that restricts inbound traffic to Cloudflare. The listener binds
        // every interface, so a request could in principle arrive directly.
        //
        // Trusting every peer address ('*') would normally make the client
        // IP spoofable through X-Forwarded-For, which is exactly the wrong
        // default to reach for while that reachability question is open.
        // Narrowing the trusted headers to proto/host/port avoids that: the
        // application still forms its own opinion of the client IP from the
        // raw connection, so nothing here becomes spoofable regardless of
        // who can reach port 80. Only the scheme, host and port Laravel
        // reports for building URLs come from the proxy, which is the one
        // fact this fix needs and the one Cloudflare is always in a
        // position to set correctly for a request it actually forwarded.
        $middleware->trustProxies(at: '*', headers: Request::HEADER_X_FORWARDED_PROTO
            | Request::HEADER_X_FORWARDED_HOST
            | Request::HEADER_X_FORWARDED_PORT);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
