<?php

use Illuminate\Support\Facades\File;

/**
 * The server half of the dictionary, held to the same promise as the browser half.
 *
 * A missing translation key is not an exception. Laravel prints the key and carries on, so
 * `vitrine.tri.best` reaches a reader's screen and nothing anywhere says it went wrong.
 * That is a failure you find by looking, in a language you may not read, which is why it
 * is found here instead.
 *
 * The two dictionaries also have to agree where they overlap. They overlap in exactly one
 * way today: a button Blade writes and `manage.js` puts back after it has flashed.
 */

/** The domains the naming convention allows, from the conventions in CLAUDE.md. */
const DOMAINS = ['nav', 'vitrine', 'schema', 'analyse', 'edition', 'outils', 'blocs', 'compte', 'dossiers', 'erreurs'];

/**
 * `<domaine>.<ecran>.<element>` wherever it appears, quoted or not.
 *
 * Not tied to `__(` on purpose: `partials/manage.blade.php` lists three whole keys in an
 * array and passes them to `__($key)` one at a time, which is the readable way to write it
 * and still leaves every key written out in full where something can check it.
 */
function keyPattern(): string
{
    $domains = implode('|', DOMAINS);

    return "~(?<![a-z0-9._-])(?:{$domains})(?:[.][a-z0-9-]+){2,}(?![a-z0-9-])~";
}

/**
 * Everything a server-rendered string could be named in.
 *
 * `config` is in there for `config/nav.php`, which names every header entry including the
 * ones no page renders yet. Without it the entries waiting on another branch would read as
 * keys nobody asks for, and the next person would tidy them away.
 */
function translatableSources(): array
{
    return collect(['resources/views', 'app', 'routes', 'config'])
        ->flatMap(fn ($dir) => File::allFiles(base_path($dir)))
        ->filter(fn ($file) => in_array($file->getExtension(), ['php'], true))
        ->map(fn ($file) => $file->getPathname())
        ->values()
        ->all();
}

/** Every key `lang/fr/` defines, flattened the way `__()` asks for it. */
function definedKeys(): array
{
    $flat = [];
    $walk = function (array $node, string $prefix) use (&$walk, &$flat) {
        foreach ($node as $key => $value) {
            $path = "{$prefix}.{$key}";
            if (is_array($value)) {
                $walk($value, $path);
            } else {
                $flat[$path] = $value;
            }
        }
    };

    foreach (File::files(lang_path('fr')) as $file) {
        if ($file->getExtension() === 'php') {
            $walk(require $file->getPathname(), $file->getFilenameWithoutExtension());
        }
    }

    return $flat;
}

/** Every key the sources ask for, and where. */
function askedKeys(): array
{
    $asked = [];
    foreach (translatableSources() as $path) {
        preg_match_all(keyPattern(), File::get($path), $found);
        foreach (array_unique($found[0]) as $key) {
            $asked[$key][] = str_replace(base_path().DIRECTORY_SEPARATOR, '', $path);
        }
    }

    return $asked;
}

/** The holes in a line, the way Laravel writes them. */
function placeholdersIn(string $line): array
{
    preg_match_all('~:[a-z][a-zA-Z0-9_]*~', $line, $found);
    sort($found[0]);

    return array_values(array_unique($found[0]));
}

/**
 * What a translated dictionary is missing next to the one the site is written in.
 *
 * Two failures, and the second is the one nobody expects. A key a translation does not
 * define falls back to the key itself. A key it does define but whose holes it dropped is
 * worse: Laravel substitutes nothing, and the number that was going into the hole is gone
 * from the page without a trace.
 */
function localeGaps(array $reference, array $other): array
{
    $gaps = [];
    foreach ($reference as $key => $line) {
        if (! array_key_exists($key, $other)) {
            $gaps[] = "{$key} : missing";

            continue;
        }
        if (placeholdersIn($line) !== placeholdersIn($other[$key])) {
            $gaps[] = "{$key} : different holes, ".implode(' ', placeholdersIn($line))
                .' against '.implode(' ', placeholdersIn($other[$key]));
        }
    }
    foreach (array_diff_key($other, $reference) as $key => $line) {
        $gaps[] = "{$key} : extra";
    }

    return $gaps;
}

/** Every key a locale defines, flattened, whichever locale it is. */
function keysOf(string $locale): array
{
    $flat = [];
    $walk = function (array $node, string $prefix) use (&$walk, &$flat) {
        foreach ($node as $key => $value) {
            $path = "{$prefix}.{$key}";
            is_array($value) ? $walk($value, $path) : $flat[$path] = $value;
        }
    };

    foreach (File::files(lang_path($locale)) as $file) {
        if ($file->getExtension() === 'php') {
            $walk(require $file->getPathname(), $file->getFilenameWithoutExtension());
        }
    }

    return $flat;
}

it('has a key for every string the views ask for', function () {
    $defined = definedKeys();

    $missing = [];
    foreach (askedKeys() as $key => $where) {
        if (! array_key_exists($key, $defined)) {
            $missing[] = $key.' ('.implode(', ', $where).')';
        }
    }

    expect($missing)->toBe([], 'these keys would be printed as they are on the page');
});

it('keeps no key nobody asks for any more', function () {
    $asked = askedKeys();
    $orphans = array_values(array_filter(
        array_keys(definedKeys()),
        fn ($key) => ! array_key_exists($key, $asked),
    ));

    expect($orphans)->toBe([], 'a line to have translated for a screen that no longer exists');
});

it('refuses a key assembled at runtime, which nothing can check', function () {
    $domains = implode('|', DOMAINS);
    $pattern = "~(?:{$domains})(?:[.][a-z0-9-]*)+(?:[{][$]|[$][a-z_])~";

    $built = [];
    foreach (translatableSources() as $path) {
        if (preg_match($pattern, File::get($path))) {
            $built[] = str_replace(base_path().DIRECTORY_SEPARATOR, '', $path);
        }
    }

    expect($built)->toBe([], 'a key built on the fly escapes every check');
});

it('names its keys <domain>.<screen>.<element>', function () {
    $domains = implode('|', DOMAINS);
    $shape = "~^(?:{$domains})(?:[.][a-z0-9-]+){2,}$~";

    $wrong = array_values(array_filter(
        array_keys(definedKeys()),
        fn ($key) => ! preg_match($shape, $key),
    ));

    expect($wrong)->toBe([], 'the convention is published for everyone to read, it holds here too');
});

it('says the same thing as the browser dictionary wherever both speak', function () {
    $browser = json_decode(File::get(public_path('forge/lang/fr.json')), true);
    expect($browser)->toBeArray();

    $server = definedKeys();
    $shared = array_intersect_key($server, $browser);

    /* Check that there is an overlap at all: the day the last shared key disappears, this
       test would silently stop proving anything. */
    expect($shared)->not->toBeEmpty('no shared key left, this test checks nothing any more');

    foreach ($shared as $key => $value) {
        expect($browser[$key])->toBe($value, "{$key} does not say the same thing on both sides");
    }
});

it('runs in French here and now', function () {
    /* The effective value, the one that decides what a reader sees. It has already earned
       its keep: the script that sets the worktrees up was copying a `.env` older than the
       foundation, and the seven directories were working in `en` with nobody the wiser. */
    expect(config('app.locale'))->toBe('fr');
    expect(config('app.fallback_locale'))->toBe('fr');
});

it('would fall back to French even without a .env file', function () {
    /* The other half, and the one the test above promised by its name without keeping it.
       A `.env` that is present imposes its value, so reading `config()` says nothing about
       the default written in the file. And that default, alone, is what protects CI and the
       production server, where no development `.env` is lying around.

       So the variable is taken out of the three places `env()` looks for it, long enough to
       read the configuration file again. */
    $before = [$_ENV['APP_LOCALE'] ?? null, $_SERVER['APP_LOCALE'] ?? null, getenv('APP_LOCALE')];
    unset($_ENV['APP_LOCALE'], $_SERVER['APP_LOCALE']);
    putenv('APP_LOCALE');

    try {
        $bare = require config_path('app.php');
    } finally {
        [$env, $server, $put] = $before;
        if ($env !== null) {
            $_ENV['APP_LOCALE'] = $env;
        }
        if ($server !== null) {
            $_SERVER['APP_LOCALE'] = $server;
        }
        if ($put !== false) {
            putenv("APP_LOCALE={$put}");
        }
    }

    expect($bare['locale'])->toBe('fr', 'config/app.php must carry French itself');
    expect($bare['fallback_locale'])->toBe('fr');
});

it('puts the environment variable back the way it was', function () {
    /* The test above takes the process environment apart. If it put it back wrong, it would
       leave the tests after it in another language, and the report would point at anybody
       but itself. */
    expect(config('app.locale'))->toBe('fr');
});

it('keeps units as bare words, so that a number never disappears', function () {
    /* A missing key renders the key, substituting nothing. A unit written `:n cases` would
       therefore make the 160 disappear, not the word: the page would say
       `blocs.unite.cases` and the reader would have lost the one thing he came for. Written
       as bare words and put against the number by the view, the degraded page says
       `160 blocs.unite.cases`, which is unreadable but not wrong.

       The rule holds for quantities, not for every interpolation: `{{ $n }} {{ __() }}`
       freezes the number-then-word order, which is wrong in many languages. It is units
       that are suffixes, and they live under the `unite` screen. */
    $wrong = [];
    foreach (definedKeys() as $key => $line) {
        if (str_contains($key, '.unite.') && placeholdersIn($line) !== []) {
            $wrong[] = $key;
        }
    }

    expect($wrong)->toBe([], 'a unit is a bare word the view puts against the number');
});

it('recognises a translation whose holes were dropped, on a made-up example', function () {
    /* The test below can prove nothing while a single language is shipped. This one shows
       that the comparison bites, so that the day a second one arrives we know it is watched
       by something other than an empty loop. */
    $reference = ['blocs.page.debit' => ':n par seconde', 'blocs.page.cout' => 'Cout'];

    expect(localeGaps($reference, $reference))->toBe([]);
    expect(localeGaps($reference, ['blocs.page.cout' => 'Cost']))
        ->toBe(['blocs.page.debit : missing']);
    expect(localeGaps($reference, ['blocs.page.debit' => 'per second', 'blocs.page.cout' => 'Cost']))
        ->toBe(['blocs.page.debit : different holes, :n against ']);
    expect(localeGaps($reference, $reference + ['blocs.page.orpheline' => 'x']))
        ->toBe(['blocs.page.orpheline : extra']);
});

it('ships every language with the same keys and the same holes as French', function () {
    $reference = keysOf('fr');
    expect($reference)->not->toBeEmpty();

    $others = collect(File::directories(lang_path()))
        ->map(fn ($path) => basename($path))
        ->reject(fn ($locale) => $locale === 'fr');

    foreach ($others as $locale) {
        expect(localeGaps($reference, keysOf($locale)))->toBe([], "the {$locale} language has drifted");
    }
})->skip(fn () => count(File::directories(lang_path())) < 2,
    'only one language shipped, there is nothing to compare');
