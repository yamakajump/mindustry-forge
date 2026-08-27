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

/** The domains the naming convention allows, from docs/fonctionnalites.md. */
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

/** Everything a server-rendered string could be written in. */
function translatableSources(): array
{
    return collect(['resources/views', 'app', 'routes'])
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
        $walk(require $file->getPathname(), $file->getFilenameWithoutExtension());
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

it('tourne en francais meme sans fichier .env', function () {
    /* Le .env n est pas versionne. Si la valeur par defaut de config/app.php restait `en`,
       la CI et les tests tourneraient dans une langue sans dictionnaire, et tout le monde
       verrait des cles brutes en integration sans comprendre pourquoi. */
    expect(config('app.locale'))->toBe('fr');
    expect(config('app.fallback_locale'))->toBe('fr');
});
