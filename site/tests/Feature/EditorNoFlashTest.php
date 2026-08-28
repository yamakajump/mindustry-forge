<?php

/**
 * The wait before /editer can paint anything of its own.
 *
 * `enterEditor()` fetches the block catalogue and the sprite atlas before it can mount,
 * so both `/` and `/editer` serve the same static document and briefly leave the
 * analyser's markup as the only thing on screen while that fetch is in flight. Whether
 * anything actually paints during that stretch is a question for a browser under
 * throttling, which this suite cannot ask. What it can check is that the guard which
 * stops it from painting is still wired the way it has to be to work at all: inline, in
 * the head, ahead of the stylesheet, and matched by a rule that hides <main>.
 */
function pageIndex(): string
{
    return file_get_contents(public_path('index.html'));
}

it('sert la garde a la fois sur / et sur /editer', function () {
    /* `/editer` repond par `response()->file()`, dont `getContent()` rend `false` en
       test (Symfony la sert par flux plutot que par tampon) : la reponse elle-meme ne
       dit donc rien de son contenu ici, seul son code HTTP compte. Le contenu qu'elle
       sert est celui du fichier statique, verifie plus bas. */
    $this->get('/')->assertOk();
    $this->get('/editer')->assertOk();

    /* `/` passe par HomeController, qui remplace `<!--VITRINE-->` par son ilot de donnees
       (voir HomeTest) sans toucher au reste du document : la garde, elle, doit survivre
       a ce remplacement. */
    expect($this->get('/')->getContent())->toContain('classList.add("route-editeur")');
    expect(pageIndex())->toContain('classList.add("route-editeur")');
});

it('pose la garde avant toute feuille de style, dans la tete du document', function () {
    $html = pageIndex();

    $tete = strpos($html, '</head>');
    $garde = strpos($html, 'classList.add("route-editeur")');
    $feuille = strpos($html, '<link rel="stylesheet" href="./forge/forge.css">');

    expect($garde)->not->toBeFalse('la garde a disparu du document')
        ->and($feuille)->not->toBeFalse('la feuille de style a disparu du document')
        ->and($garde)->toBeLessThan($feuille, 'la garde doit s executer avant la feuille de style')
        ->and($garde)->toBeLessThan($tete, 'la garde doit rester dans <head>');
});

it('cache <main> pendant que la garde est posee', function () {
    $css = file_get_contents(public_path('forge/forge.css'));

    expect($css)->toMatch('/\.route-editeur\s+main\s*\{[^}]*display:\s*none/');
});

it('retire la garde en quittant l editeur, pas seulement en le posant', function () {
    /* Sans ce retrait, revenir sur l'analyse depuis le bouton de l'editeur laisserait
       <main> cache pour le reste de la visite : la garde ne survit a une navigation que
       parce que /editer recharge le document, et rien ne la retire dans ce cas-la. */
    $html = pageIndex();

    expect($html)->toContain('classList.remove("route-editeur")');
});
