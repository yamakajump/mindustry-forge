<?php

/*
 * Who this site believes about the scheme it is being served on.
 *
 * THE FIRST ANSWER HERE WAS WRONG, and the wrong version shipped, so the reasoning is kept
 * rather than replaced. It said Cloudflare talks to nginx, so it trusted the ranges
 * Cloudflare publishes. Deployed, measured, and nothing changed: the pages still carried
 * http URLs.
 *
 * What the origin actually sees:
 *
 *     ::1 - - [28/Aug/2026] "GET /blocs HTTP/1.1" 200
 *
 * `::1`. The request comes from the machine itself. Nothing listens on 443 at all, and
 * `cloudflared` is running: this is a Cloudflare Tunnel. The daemon holds an outbound
 * connection to Cloudflare and hands requests to nginx over the loopback, so the address
 * nginx reports is never a Cloudflare edge address and the published ranges could not match
 * a single request.
 *
 * The lesson is the repository's own: the fix was correct arithmetic against a question
 * nobody had asked. One line of the access log would have settled it before the code was
 * written, and reading it took less time than writing the list did.
 *
 * WHY THE LOOPBACK IS SAFE TO TRUST, and safer than the ranges it replaces: a source address
 * of `127.0.0.1` or `::1` cannot be presented from off the machine. The kernel will not
 * route it. Where a forged `X-Forwarded-Proto` from an arbitrary internet host was the risk
 * that made `*` unacceptable, here the only sender that can qualify is a process already on
 * the host, and one of those is `cloudflared` itself.
 *
 * WHAT BREAKS IF THE TUNNEL IS EVER REPLACED by Cloudflare talking straight to an exposed
 * origin: requests would arrive from Cloudflare's ranges instead, stop being believed, and
 * every absolute URL would quietly go back to http. Nothing would error. The ranges are at
 * https://www.cloudflare.com/ips-v4 and /ips-v6 if that day comes.
 */

return [

    'trusted' => [
        '127.0.0.1',
        '::1',
    ],

];
