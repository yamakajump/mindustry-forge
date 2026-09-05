<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;

uses(RefreshDatabase::class);

/**
 * The header, declared once in `config/nav.php` and rendered by two engines that cannot
 * see each other.
 *
 * Blade renders it for the pages a server answers. `public/index.html` carries it written
 * by hand, because the analyser is served as a file and never meets PHP. Nothing in either
 * one knows about the other, so this is what keeps them from drifting -- and drifting is
 * what a duplicated header does, quietly, until a link exists on one page and not the next.
 *
 * The other half is `ready`. Half the entries point at pages other branches are still
 * building, so they are declared in the shape they will have and rendered by nobody. A
 * live link to a 404 is worse than an absent link.
 */

/** What the header should contain, from the config, as `cle => adresse`. */
function expectedNav(bool $signedIn): array
{
    $flat = [];
    foreach (config('nav') as $entry) {
        if (isset($entry['menu'])) {
            $children = [];
            foreach ($entry['menu'] as $child) {
                if (! $child['ready'] || (($child['auth'] ?? false) && ! $signedIn)) {
                    continue;
                }
                $children[$child['key']] = $child['href'];
            }
            if ($children !== []) {
                $flat[$entry['key']] = $children;
            }
        } elseif ($entry['ready']) {
            $flat[$entry['key']] = $entry['href'];
        }
    }

    return $flat;
}

/**
 * The same shape, read back out of a rendered header.
 *
 * Blade translates on the server and writes no keys at all, while the static page carries
 * the key beside the French. So the two are read by different attributes and held against
 * the same config: `$by` is `data-i18n` for the static page, `text` for a rendered view.
 */
function navIn(string $html, string $by = 'data-i18n'): array
{
    preg_match('~<nav id="nav".*?</nav>~s', $html, $found);
    expect($found)->not->toBeEmpty('no <nav id="nav"> in this page');

    $document = new DOMDocument;
    $previous = libxml_use_internal_errors(true);
    $document->loadHTML('<?xml encoding="utf-8"?>'.$found[0]);
    libxml_use_internal_errors($previous);

    $xpath = new DOMXPath($document);
    $label = fn (?DOMNode $node) => $node === null ? null
        : ($by === 'text' ? trim($node->textContent) : $node->getAttribute($by));

    $flat = [];
    foreach ($xpath->query('//nav/*') as $node) {
        /* The Discord button is a link too, but it carries a class and does not come from
           the config: it is the account, which stays on the right whatever the nav does. */
        if ($node->nodeName === 'a' && ! $node->getAttribute('class')) {
            $flat[$label($node)] = $node->getAttribute('href');
        }
        if ($node->nodeName === 'details') {
            $children = [];
            foreach ($xpath->query('.//div[@class="menu-list"]/a', $node) as $link) {
                $children[$label($link)] = $link->getAttribute('href');
            }
            $flat[$label($xpath->query('.//summary', $node)->item(0))] = $children;
        }
    }

    return $flat;
}

/** The config as a rendered view reads it: keys swapped for the words a reader sees. */
function expectedLabels(bool $signedIn): array
{
    $flat = [];
    foreach (expectedNav($signedIn) as $key => $value) {
        $flat[__($key)] = is_array($value)
            ? collect($value)->mapWithKeys(fn ($href, $child) => [__($child) => $href])->all()
            : $value;
    }

    return $flat;
}

it('declares `ready` on every entry, so that flipping one is unambiguous', function () {
    $undeclared = [];
    foreach (config('nav') as $entry) {
        foreach (array_merge([$entry], $entry['menu'] ?? []) as $node) {
            if (isset($node['menu'])) {
                continue;
            }
            if (! array_key_exists('ready', $node)) {
                $undeclared[] = $node['key'];
            }
        }
    }

    expect($undeclared)->toBe([], 'the branch that ships this tool must not have to guess');
});

it('never links to a page that does not exist yet', function () {
    $routes = collect(Route::getRoutes())->map(fn ($route) => '/'.ltrim($route->uri(), '/'));

    $dead = [];
    foreach (config('nav') as $entry) {
        foreach (array_merge([$entry], $entry['menu'] ?? []) as $node) {
            if (isset($node['menu']) || ! ($node['ready'] ?? false)) {
                continue;
            }
            if (! $routes->contains($node['href'])) {
                $dead[] = "{$node['key']} -> {$node['href']}";
            }
        }
    }

    expect($dead)->toBe([], 'an entry switched on whose route does not exist is a 404 in production');
});

it('writes the same header in the static pages as in the views', function () {
    /* The static page does not know who is reading: the `les-miennes` entry is added to it
       by `whoAmI` once `/api/moi` has answered, so it is compared against the header of a
       visitor.

       The tool pages have been in this list since their drift was noticed: they carried a
       header of two entries, frozen on the day the first one was written, and nobody saw it
       because this test only looked at `index.html`. A hand-written copy no test watches
       always ends up lying. */
    foreach (['index.html', 'outils/logique.html', 'outils/planificateur.html'] as $page) {
        expect(navIn(File::get(public_path($page))))->toBe(expectedNav(signedIn: false),
            "config/nav.php and public/{$page} no longer say the same thing");
    }
});

it('serves the same favicon on every page', function () {
    /* The two tool pages carried an inline icon, in `data:`, different from the one on the
       rest of the site: the tab icon therefore changed on the way to the planner. Reported
       by Corentin before this test existed. */
    $reference = ['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png'];

    foreach (['index.html', 'outils/logique.html', 'outils/planificateur.html'] as $page) {
        $html = File::get(public_path($page));
        preg_match_all('~<link rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"~', $html, $m);

        expect($m[1])->toBe($reference, "public/{$page} does not serve the same icons");
    }
});

it('renders in Blade exactly what the config declares, for a visitor', function () {
    expect(navIn($this->get('/schemas')->getContent(), by: 'text'))
        ->toBe(expectedLabels(signedIn: false));
});

it('opens my own schematics to whoever is signed in, and to nobody else', function () {
    $guest = $this->get('/schemas')->getContent();
    expect($guest)->not->toContain('/mes-schemas');

    $member = $this->actingAs(User::factory()->create())->get('/schemas')->getContent();
    expect($member)->toContain('/mes-schemas');
    expect(navIn($member, by: 'text'))->toBe(expectedLabels(signedIn: true));
});

it('hides the switched-off entries rather than showing them dead', function () {
    /* Derived from the configuration rather than from a list written out here. A list of
       names is a list that goes stale the day a branch switches its entry on, and it goes
       stale by going red on an entry that has become legitimate: the next reflex is to take
       it out of the list, which takes the check out with it. */
    $rendered = $this->get('/schemas')->getContent();

    $eteintes = collect(config('nav'))
        ->flatMap(fn ($entree) => $entree['menu'] ?? [$entree])
        ->reject(fn ($entree) => $entree['ready'])
        ->pluck('href');

    expect($eteintes)->not->toBeEmpty('nothing is switched off any more, this test checks nothing');

    foreach ($eteintes as $href) {
        expect($rendered)->not->toContain($href);
    }
});

it('says the same thing as the browser about the header labels', function () {
    $browser = json_decode(File::get(public_path('forge/lang/fr.json')), true);

    /* Both engines write this header, so every label the static page names has to exist on
       both sides and say the same thing. The reverse does not hold: an entry still switched
       off is in no HTML, so its key has no business in the browser's dictionary. */
    foreach ($browser as $key => $value) {
        if (! str_starts_with($key, 'nav.') && ! str_starts_with($key, 'compte.')) {
            continue;
        }
        expect(__($key))->toBe($value, "{$key} differs between the two dictionaries");
    }
});

it('draws the brand mark like its source, in all three places', function () {
    /* The geometry is copied inline into both headers, and `docs/direction-artistique.md`
       forbids copying it anywhere else: a second drawing ends up differing from the first
       without anything saying so. It is copied anyway, for two reasons that hold: an `<img>`
       does not let `currentColor` through, so the mark would follow neither the colour nor
       the size of its neighbour, and the editor bar drops back to 17px; and a geometry laid
       out inline cannot fail to show up.

       This test is what makes the copy safe. It replaces the ban with a check, which is the
       same answer as for the two navs. */
    $source = File::get(public_path('brand/mark-plain.svg'));
    preg_match_all('~<path d="([^"]+)"~', $source, $attendu);
    expect($attendu[1])->not->toBeEmpty('brand/mark-plain.svg no longer holds a path');

    $copies = [
        'resources/views/layout.blade.php',
        'public/index.html',
        /* The editor bar writes its own mark, in JavaScript. That is the third copy, and it
           is the one the size in `em` was thought out for: it drops back to 17px, and a mark
           in pixels would be at the wrong ratio there without anything saying so before
           somebody opens the editor. */
        'public/forge/editor/mount.js',
    ];

    foreach ($copies as $chemin) {
        $texte = File::get(base_path($chemin));
        preg_match('~<svg class="signe".*?</svg>~s', $texte, $bloc);
        expect($bloc)->not->toBeEmpty("no mark in {$chemin}");

        preg_match_all('~<path d="([^"]+)"~', $bloc[0], $trouve);
        expect($trouve[1])->toBe($attendu[1], "the mark in {$chemin} has drifted from its source");
    }
});

it('paints only Forge in amber, not the whole brand', function () {
    /* `.brand span` carries the accent colour. Wrapping "Mindustry" in a span, which is
       tempting so that it can be hidden on a small screen, would paint it amber too. */
    foreach (['resources/views/layout.blade.php', 'public/index.html'] as $chemin) {
        preg_match('~<a class="brand".*?</a>~s', File::get(base_path($chemin)), $bloc);
        expect(substr_count($bloc[0], '<span'))->toBe(1, "too many spans in the brand of {$chemin}");
        expect($bloc[0])->toContain('<span>Forge</span>');
    }
});

it('draws power with one mark, not two', function () {
    /* The bolt exists twice: `partials/eclair.blade.php` for the pages a server renders and
       `BOLT` in `public/index.html`, which is served as a file and never meets Blade. Same
       reason as the header above, and the same failure mode: a hand-kept copy nobody
       watches ends up drifting, and the site shows power one way here and another there.

       Compared on the path, which is the geometry. The rest of the tag - the size, the
       class, whether the style is an attribute - is each engine's own business. */
    $path = fn (string $svg) => preg_match('/<path d="([^"]+)"/', $svg, $m) ? $m[1] : null;

    $blade = $path(File::get(resource_path('views/partials/eclair.blade.php')));
    $page = File::get(public_path('index.html'));
    $inline = preg_match('/const BOLT = .*?<path d="([^"]+)"/s', $page, $m) ? $m[1] : null;

    expect($blade)->not->toBeNull('the partial no longer holds a path');
    expect($inline)->not->toBeNull('index.html no longer holds a BOLT path');
    expect($inline)->toBe($blade, 'the two copies of the power mark have drifted apart');
});

it("wears Discord's own mark, in one shape", function () {
    /* Same duplication as the bolt above, same reason: the header is rendered by Blade on
       the server's pages and written out in `public/index.html`, which is served as a file.

       What is checked here is not only that the two agree, but that they agree on the
       official mark. The site drew a hand-made approximation of it for a long while, on a
       square 24 by 24 grid where Clyde is a third wider than it is tall, with the two
       notches at the top of the head reduced to a hairline and the eyes half their size. It
       read as a blob with two dots, and a player said so: nobody recognises a login button
       by its label, they recognise it by the mark, and a wrong mark on a sign-in button is
       the one place a visitor is entitled to be suspicious.

       Recognised by the viewBox, which is Discord's own and is what a hand-drawn one will
       not have: the proportions are the whole difference. */
    $mark = function (string $svg) {
        preg_match('~<svg[^>]*viewBox="([^"]+)"[^>]*>\s*<path d="([^"]+)"~', $svg, $m);

        return $m ? ['box' => $m[1], 'path' => $m[2]] : null;
    };

    $blade = File::get(resource_path('views/partials/nav.blade.php'));
    $page = File::get(public_path('index.html'));

    preg_match('~<a class="discord".*?</a>~s', $blade, $one);
    preg_match('~class="discord" href="/auth/discord">.*?</a>~s', $page, $two);

    expect($one)->not->toBeEmpty('the header no longer holds a Discord button');
    expect($two)->not->toBeEmpty('index.html no longer holds a Discord button');

    $rendered = $mark($one[0]);
    $inline = $mark($two[0]);

    expect($rendered)->not->toBeNull('the header button holds no mark');
    expect($inline)->not->toBeNull('the page button holds no mark');
    expect($inline)->toBe($rendered, 'the two Discord marks have drifted apart');
    expect($rendered['box'])->toBe('0 0 127.14 96.36',
        "this is not Discord's own mark: its viewBox is 127.14 by 96.36, and a square one "
        .'is a redrawing');
});
