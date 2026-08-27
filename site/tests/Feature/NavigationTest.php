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
    expect($found)->not->toBeEmpty('aucun <nav id="nav"> dans cette page');

    $document = new DOMDocument;
    $previous = libxml_use_internal_errors(true);
    $document->loadHTML('<?xml encoding="utf-8"?>'.$found[0]);
    libxml_use_internal_errors($previous);

    $xpath = new DOMXPath($document);
    $label = fn (?DOMNode $node) => $node === null ? null
        : ($by === 'text' ? trim($node->textContent) : $node->getAttribute($by));

    $flat = [];
    foreach ($xpath->query('//nav/*') as $node) {
        /* Le bouton Discord est un lien lui aussi, mais il porte une classe et ne vient pas
           de la config : c est le compte, qui reste a droite quoi qu il arrive a la nav. */
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

it('declare `ready` sur chaque entree, pour que la basculer soit sans ambiguite', function () {
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

    expect($undeclared)->toBe([], 'la voie qui livre cet outil ne doit pas avoir a deviner');
});

it('ne mene nulle part vers une page qui n existe pas encore', function () {
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

    expect($dead)->toBe([], 'une entree allumee dont la route n existe pas est un 404 en production');
});

it('ecrit le meme entete dans la page statique que dans les vues', function () {
    /* La page statique ne sait pas qui lit : « Les miennes » y est ajoutee par `whoAmI`
       une fois `/api/moi` repondu, donc elle est comparee a l entete d un visiteur. */
    expect(navIn(File::get(public_path('index.html'))))->toBe(expectedNav(signedIn: false),
        'config/nav.php et public/index.html ne disent plus la meme chose');
});

it('rend dans Blade exactement ce que la config declare, pour un visiteur', function () {
    expect(navIn($this->get('/schematiques')->getContent(), by: 'text'))
        ->toBe(expectedLabels(signedIn: false));
});

it('ouvre `Les miennes` a qui est connecte, et a personne d autre', function () {
    $guest = $this->get('/schematiques')->getContent();
    expect($guest)->not->toContain('/mes-schematiques');

    $member = $this->actingAs(User::factory()->create())->get('/schematiques')->getContent();
    expect($member)->toContain('/mes-schematiques');
    expect(navIn($member, by: 'text'))->toBe(expectedLabels(signedIn: true));
});

it('cache les entrees eteintes plutot que de les afficher mortes', function () {
    /* Deduit de la configuration plutot que d une liste ecrite ici. Une liste nommee est
       une liste qui perime le jour ou une voie allume son entree, et elle perime en
       rougissant sur une entree devenue legitime : le prochain reflexe est de la retirer
       de la liste, ce qui retire aussi la verification. */
    $rendered = $this->get('/schematiques')->getContent();

    $eteintes = collect(config('nav'))
        ->flatMap(fn ($entree) => $entree['menu'] ?? [$entree])
        ->reject(fn ($entree) => $entree['ready'])
        ->pluck('href');

    expect($eteintes)->not->toBeEmpty('plus rien n est eteint, ce test ne verifie plus rien');

    foreach ($eteintes as $href) {
        expect($rendered)->not->toContain($href);
    }
});

it('dit la meme chose que le navigateur sur les libelles de l entete', function () {
    $browser = json_decode(File::get(public_path('forge/lang/fr.json')), true);

    /* Les deux moteurs ecrivent cet entete, donc chaque libelle que la page statique nomme
       doit exister des deux cotes et dire la meme chose. L inverse n est pas vrai : une
       entree encore eteinte n est dans aucun HTML, donc sa cle n a rien a faire dans le
       dictionnaire du navigateur. */
    foreach ($browser as $key => $value) {
        if (! str_starts_with($key, 'nav.') && ! str_starts_with($key, 'compte.')) {
            continue;
        }
        expect(__($key))->toBe($value, "{$key} differe entre les deux dictionnaires");
    }
});
