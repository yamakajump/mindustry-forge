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
const DOMAINS = ['nav', 'vitrine', 'schema', 'analyse', 'edition', 'outils', 'blocs', 'compte'];

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
            $gaps[] = "{$key} : absente";

            continue;
        }
        if (placeholdersIn($line) !== placeholdersIn($other[$key])) {
            $gaps[] = "{$key} : trous differents, ".implode(' ', placeholdersIn($line))
                .' contre '.implode(' ', placeholdersIn($other[$key]));
        }
    }
    foreach (array_diff_key($other, $reference) as $key => $line) {
        $gaps[] = "{$key} : en trop";
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

it('a une cle pour chaque chaine que les vues demandent', function () {
    $defined = definedKeys();

    $missing = [];
    foreach (askedKeys() as $key => $where) {
        if (! array_key_exists($key, $defined)) {
            $missing[] = $key.' ('.implode(', ', $where).')';
        }
    }

    expect($missing)->toBe([], 'ces cles seraient imprimees telles quelles sur la page');
});

it('ne garde aucune cle que plus personne ne demande', function () {
    $asked = askedKeys();
    $orphans = array_values(array_filter(
        array_keys(definedKeys()),
        fn ($key) => ! array_key_exists($key, $asked),
    ));

    expect($orphans)->toBe([], 'une ligne a faire traduire pour un ecran qui n existe plus');
});

it('refuse une cle assemblee a l execution, que rien ne peut verifier', function () {
    $domains = implode('|', DOMAINS);
    $pattern = "~(?:{$domains})(?:[.][a-z0-9-]*)+(?:[{][$]|[$][a-z_])~";

    $built = [];
    foreach (translatableSources() as $path) {
        if (preg_match($pattern, File::get($path))) {
            $built[] = str_replace(base_path().DIRECTORY_SEPARATOR, '', $path);
        }
    }

    expect($built)->toBe([], 'une cle construite au vol echappe a tous les controles');
});

it('nomme ses cles <domaine>.<ecran>.<element>', function () {
    $domains = implode('|', DOMAINS);
    $shape = "~^(?:{$domains})(?:[.][a-z0-9-]+){2,}$~";

    $wrong = array_values(array_filter(
        array_keys(definedKeys()),
        fn ($key) => ! preg_match($shape, $key),
    ));

    expect($wrong)->toBe([], 'la convention est publiee aux quatre voies, elle vaut aussi ici');
});

it('dit la meme chose que le dictionnaire du navigateur la ou les deux parlent', function () {
    $browser = json_decode(File::get(public_path('forge/lang/fr.json')), true);
    expect($browser)->toBeArray();

    $server = definedKeys();
    $shared = array_intersect_key($server, $browser);

    /* Verifie qu il y a bien un recouvrement : le jour ou la derniere cle partagee
       disparait, ce test cesserait de prouver quoi que ce soit en silence. */
    expect($shared)->not->toBeEmpty('plus aucune cle partagee, ce test ne verifie plus rien');

    foreach ($shared as $key => $value) {
        expect($browser[$key])->toBe($value, "{$key} ne dit pas la meme chose des deux cotes");
    }
});

it('tourne en francais ici et maintenant', function () {
    /* La valeur effective, celle qui decide de ce qu un lecteur voit. Elle a deja servi :
       le script qui monte les worktrees recopiait un `.env` anterieur au socle, et les sept
       dossiers travaillaient en `en` sans que personne le sache. */
    expect(config('app.locale'))->toBe('fr');
    expect(config('app.fallback_locale'))->toBe('fr');
});

it('tomberait sur le francais meme sans fichier .env', function () {
    /* L autre moitie, et celle que le nom du test ci-dessus promettait sans la tenir. Un
       `.env` present impose sa valeur, donc lire `config()` ne dit rien du defaut ecrit
       dans le fichier. Or c est ce defaut, et lui seul, qui protege la CI et le serveur de
       production, ou aucun `.env` de developpement ne traine.

       La variable est donc retiree des trois endroits ou `env()` va la chercher, le temps
       de relire le fichier de configuration. */
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

    expect($bare['locale'])->toBe('fr', 'config/app.php doit porter le francais lui-meme');
    expect($bare['fallback_locale'])->toBe('fr');
});

it('remet la variable d environnement comme elle etait', function () {
    /* Le test precedent demonte l environnement du processus. S il le remontait mal, il
       laisserait les tests suivants dans une autre langue, et le rapport designerait
       n importe qui sauf lui. */
    expect(config('app.locale'))->toBe('fr');
});

it('garde les unites en mots nus, pour qu un chiffre ne disparaisse jamais', function () {
    /* Une cle manquante rend la cle, sans rien substituer. Une unite ecrite `:n cases`
       ferait donc disparaitre le 160, pas le mot : la page dirait `blocs.unite.cases` et
       le lecteur aurait perdu la seule chose qu il etait venu chercher. Ecrites en mots
       nus et accolees au nombre par la vue, la page degradee dit `160 blocs.unite.cases`,
       ce qui est illisible mais pas faux.

       La regle vaut pour les quantites, pas pour toute interpolation : `{{ $n }} {{ __() }}`
       fige l ordre nombre-puis-mot, ce qui est faux dans beaucoup de langues. Ce sont les
       unites qui sont des suffixes, et elles vivent sous l ecran `unite`. */
    $wrong = [];
    foreach (definedKeys() as $key => $line) {
        if (str_contains($key, '.unite.') && placeholdersIn($line) !== []) {
            $wrong[] = $key;
        }
    }

    expect($wrong)->toBe([], 'une unite est un mot nu que la vue accole au nombre');
});

it('sait reconnaitre une traduction trouee, sur un exemple fabrique', function () {
    /* Le test ci-dessous ne peut rien prouver tant qu une seule langue est livree. Celui-ci
       montre que la comparaison mord, pour que le jour ou une deuxieme arrive on sache
       qu elle est surveillee par autre chose qu une boucle vide. */
    $reference = ['blocs.page.debit' => ':n par seconde', 'blocs.page.cout' => 'Cout'];

    expect(localeGaps($reference, $reference))->toBe([]);
    expect(localeGaps($reference, ['blocs.page.cout' => 'Cost']))
        ->toBe(['blocs.page.debit : absente']);
    expect(localeGaps($reference, ['blocs.page.debit' => 'per second', 'blocs.page.cout' => 'Cost']))
        ->toBe(['blocs.page.debit : trous differents, :n contre ']);
    expect(localeGaps($reference, $reference + ['blocs.page.orpheline' => 'x']))
        ->toBe(['blocs.page.orpheline : en trop']);
});

it('livre chaque langue avec les memes cles et les memes trous que le francais', function () {
    $reference = keysOf('fr');
    expect($reference)->not->toBeEmpty();

    $others = collect(File::directories(lang_path()))
        ->map(fn ($path) => basename($path))
        ->reject(fn ($locale) => $locale === 'fr');

    foreach ($others as $locale) {
        expect(localeGaps($reference, keysOf($locale)))->toBe([], "la langue {$locale} a derive");
    }
})->skip(fn () => count(File::directories(lang_path())) < 2,
    'une seule langue livree, il n y a rien a comparer');
