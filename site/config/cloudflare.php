<?php

/*
 * Cloudflare's own address ranges, and why this site has to know them.
 *
 * Cloudflare terminates TLS. `deployment/nginx/mindustryforge.conf` listens on port 80 and
 * nothing else, so PHP is handed a plain HTTP request and Laravel builds every absolute URL
 * it generates with the http scheme. Measured in production before this file existed:
 *
 *     GET https://mindustryforge.com/schematiques?produit=silicon
 *     301 -> http://mindustryforge.com/schemas?produit=silicon
 *
 *     <meta property="og:url" content="http://mindustryforge.com/schemas">
 *
 * That is not the redirect's fault and it was not new: the canonical URL of every page, the
 * login redirect and every share preview said http on a site served over https. Google
 * indexes the http address, a link pasted in a Discord thread makes its first hop in the
 * clear, and nothing anywhere reports it.
 *
 * The fix is for Laravel to believe `X-Forwarded-Proto`. The question is whose word to take,
 * and the answer is not "anybody's": the header is a plain string that any client able to
 * reach the origin can set. Trusted at `*`, a forged header would let a visitor decide what
 * scheme, host and port the site thinks it is on, which is a cache-poisoning and
 * password-reset-link problem, not a cosmetic one.
 *
 * So the trust is pinned to the addresses Cloudflare publishes, and only requests arriving
 * from one of them are believed.
 *
 * SOURCE: https://www.cloudflare.com/ips-v4 and /ips-v6, fetched 28/08/2026.
 *
 * WHAT BREAKS WHEN THIS LIST GOES STALE, because it will: Cloudflare adds a range, requests
 * arrive from it, Laravel stops believing the header for those visitors, and their pages go
 * back to carrying http URLs. Nothing errors. It is worth re-fetching the two files when
 * anything about absolute URLs looks wrong.
 */

return [

    'proxies' => [
        // ips-v4
        '173.245.48.0/20',
        '103.21.244.0/22',
        '103.22.200.0/22',
        '103.31.4.0/22',
        '141.101.64.0/18',
        '108.162.192.0/18',
        '190.93.240.0/20',
        '188.114.96.0/20',
        '197.234.240.0/22',
        '198.41.128.0/17',
        '162.158.0.0/15',
        '104.16.0.0/13',
        '104.24.0.0/14',
        '172.64.0.0/13',
        '131.0.72.0/22',

        // ips-v6
        '2400:cb00::/32',
        '2606:4700::/32',
        '2803:f800::/32',
        '2405:b500::/32',
        '2405:8100::/32',
        '2a06:98c0::/29',
        '2c0f:f248::/32',
    ],

];
