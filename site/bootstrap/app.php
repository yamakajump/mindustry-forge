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
        /*
         * Cloudflare terminates TLS, so the origin is handed a plain HTTP request and every
         * absolute URL this application generated came out with the http scheme: the
         * canonical of every page, the login redirect, the share previews and the two
         * permanent redirects the catalogue rename left behind.
         *
         * Trusted only at Cloudflare's published ranges, listed with their source and their
         * failure mode in `config/cloudflare.php`. Not at `*`: `X-Forwarded-Proto` is a
         * string any client reaching the origin can set, and believing everybody hands a
         * visitor the scheme, host and port the site thinks it is on.
         *
         * The config is required rather than read through `config()`, which is not resolved
         * yet at this point in the bootstrap.
         */
        $middleware->trustProxies(
            at: (require __DIR__.'/../config/cloudflare.php')['proxies'],
            headers: Request::HEADER_X_FORWARDED_FOR
                | Request::HEADER_X_FORWARDED_HOST
                | Request::HEADER_X_FORWARDED_PORT
                | Request::HEADER_X_FORWARDED_PROTO,
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
