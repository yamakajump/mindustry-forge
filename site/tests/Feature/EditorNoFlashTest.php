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

it('serves the guard on both / and /editer', function () {
    /* `/editer` answers with `response()->file()`, whose `getContent()` returns `false` in
       a test (Symfony serves it as a stream rather than a buffer): the response itself
       therefore says nothing about its content here, only its HTTP status counts. What it
       serves is the content of the static file, checked further down. */
    $this->get('/')->assertOk();
    $this->get('/editer')->assertOk();

    /* `/` goes through HomeController, which replaces `<!--VITRINE-->` with its data island
       (see HomeTest) without touching the rest of the document: the guard has to survive
       that replacement. */
    expect($this->get('/')->getContent())->toContain('classList.add("route-editeur")');
    expect(pageIndex())->toContain('classList.add("route-editeur")');
});

it('puts the guard before any stylesheet, in the head of the document', function () {
    $html = pageIndex();

    $tete = strpos($html, '</head>');
    $garde = strpos($html, 'classList.add("route-editeur")');
    $feuille = strpos($html, '<link rel="stylesheet" href="./forge/forge.css">');

    expect($garde)->not->toBeFalse('the guard has disappeared from the document')
        ->and($feuille)->not->toBeFalse('the stylesheet has disappeared from the document')
        ->and($garde)->toBeLessThan($feuille, 'the guard must run before the stylesheet')
        ->and($garde)->toBeLessThan($tete, 'the guard must stay inside <head>');
});

it('hides <main> while the guard is set', function () {
    $css = file_get_contents(public_path('forge/forge.css'));

    expect($css)->toMatch('/\.route-editeur\s+main\s*\{[^}]*display:\s*none/');
});

it('removes the guard when leaving the editor, not only when setting it', function () {
    /* Without that removal, going back to the analysis from the editor's button would leave
       <main> hidden for the rest of the visit: the guard only survives a navigation because
       /editer reloads the document, and nothing removes it in that case. */
    $html = pageIndex();

    expect($html)->toContain('classList.remove("route-editeur")');
});

it('does not show the editor placeholder on a page where it is not mounted', function () {
    /* Found in round 3: the placeholder's markup and skeleton were in the document on every
       page, `/` included, with no rule hiding them outside /editer. `.skeleton` already
       carries a height (`height: 260px`) for the report's skeleton, so nothing stopped the
       editor's own from showing at the bottom of the home page, entirely unrelated to what
       the page was saying. */
    $css = file_get_contents(public_path('forge/forge.css'));

    expect($css)->toMatch('/#editor:not\(\.editor\)\s*\{[^}]*display:\s*none/');
});

it('gives the editor skeleton a size, not only a rule', function () {
    /* An `#editor` in `display: flex` with no size of its own let a flex child with no
       basis collapse to zero height: the rule existed, nothing showed. `flex: 1` on a
       column parent gives it a real size as soon as that parent has one (here full
       screen), which a test outside a browser can only check through the rule and not
       through the rendering; see the report for the measurement in a browser. */
    $css = file_get_contents(public_path('forge/forge.css'));

    expect($css)->toMatch('/\.route-editeur #editor:not\(\.editor\) \.skeleton\s*\{[^}]*flex:\s*1/');
});
