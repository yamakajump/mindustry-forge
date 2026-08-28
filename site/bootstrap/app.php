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
        // Production sits behind a Cloudflare Tunnel: nginx never receives a
        // request from a public IP at all, cloudflared forwards everything
        // from localhost (see deployment/nginx/mindustryforge.conf). That
        // means the immediate peer nginx sees is always the local tunnel
        // daemon, never one of Cloudflare's published edge ranges, so a
        // hardcoded IP allowlist would never match and would leave every
        // absolute URL built as http. Trusting '*' matches the actual
        // topology (tunnel-only ingress, no other route to this origin) and
        // accepts the risk that a direct request reaching this origin some
        // other way could spoof its own scheme; that risk is judged smaller
        // than an IP list that goes stale and silently stops working.
        $middleware->trustProxies(at: '*');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
