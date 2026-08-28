# The `<head>` of the two pages, and what the server still owes it

The tags are in place, in `layout.blade.php` and in `index.html`. This page records what
they are for and what has not been done yet, so nobody has to work it out again from the
markup.

## Why each tag is there

Three icon formats, because three families of client ask for one differently: the `.ico` for
whatever hits `/favicon.ico` without reading the head, the SVG for any current browser, the
square PNG for the iOS home screen. Then the manifest and `theme-color`.

The Open Graph block in `layout.blade.php` holds **defaults**, and a page with something
better to say overrides them with its own `@section`. It used to be defaults here plus a
`@push('head')` on the page, and that put two `og:image` tags in the same head: a repeated
`og:image` is an array, and an unfurler takes the first, so a page could never actually
substitute the generic card. `@yield`/`@section` replaces rather than appends, which is
what lets a schematic page substitute its own title, description and card today.

**`asset('og.jpg')` only produces an absolute address when `APP_URL` is right.** A relative
`og:image` is resolved by nobody: the thumbnail is simply missing, with no error anywhere to
say so. Production wants `APP_URL=https://mindustryforge.com`.

**The description is written out rather than pulled from `site/lang/`.** The convention
there is `<domain>.<screen>.<element>` with a fixed list of domains, and a description that
holds for the whole site belongs to no screen; dropping it into an unrelated domain file is
what that directory's README asks nobody to do. One language ships, so this costs nothing
today and moves the day a second one does.

### One trap left in on purpose

`index.html` is served at **two** addresses, `/` and `/editer`, and it is static, so its
`og:url` says `/` even when `/editer` is the link being shared. An editor link pasted into
Discord unfurls with the analyser's thumbnail. One line to fix the day the editor deserves a
thumbnail of its own, and worth knowing before discovering it.

## What the vhost still owes these files

**The brand assets carry no cache lifetime.** The vhost gives `expires 7d` to `/forge/` and
to nothing else, so `og.jpg`, the six icons, the manifest and everything under `/brand/` are
revalidated on every visit, when they only change at deploy time.

```nginx
# The visual identity: files that only move at deploy time, and that every service which
# unfurls a link downloads again. The vhost gave them no lifetime, so a browser revalidated
# them on every visit.
location ~* ^/(favicon\.(ico|svg)|apple-touch-icon\.png|icon-\d+\.png|icon-maskable-\d+\.png|og(-[a-z]+)?\.jpg|site\.webmanifest)$ {
    expires 7d;
    add_header Cache-Control "public";
    try_files $uri =404;
}

location ^~ /brand/ {
    expires 30d;
    add_header Cache-Control "public";
    try_files $uri =404;
}
```

Seven days and no more for the icons: they are referenced by an address with no fingerprint,
so a long lifetime would make a logo change invisible for weeks to anyone who has already
visited. `/brand/` can go further, nothing loads it inside a page.

**The MIME type of `.webmanifest` is not guaranteed.** Worth checking on the server rather
than assuming:

```bash
grep -r "webmanifest" /etc/nginx/mime.types
```

If the line is missing, nginx serves the file as `application/octet-stream`. Browsers are
tolerant about that today, but it is one block to close:

```nginx
types { application/manifest+json webmanifest; }
```

## What is deliberately not in these blocks

No `<meta name="msapplication-*">`, no `browserconfig.xml`, no `mstile-*.png`: the Windows
tiles died with Internet Explorer and old Edge's pinned thumbnails.

No `<link rel="mask-icon">` either: that was Safari's pinned-tab icon, which Safari 15
replaced with the ordinary SVG.

No `apple-touch-icon-precomposed`, and no per-size variants: iOS picks the single
`apple-touch-icon` and resizes it, and nothing has asked for 76, 120 or 152 separately since
iOS 8.
