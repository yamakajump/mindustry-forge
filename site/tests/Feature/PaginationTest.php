<?php

use App\Models\Schematic;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * The pagination bar, which was broken in three ways at once and on a live page.
 *
 * Laravel's default view is written for Tailwind and this site has none, so its classes
 * did nothing: the chevron, deprived of the `w-5 h-5` meant to constrain it, drew at the
 * width of the page. It rendered `pagination.previous` as itself for want of a French
 * translation, and announced "Showing 1 to 24 of 884 results" in English.
 *
 * Every one of the three is visible at a glance and none was covered by a test, because
 * the suite asserted on figures and never on the sentence around them. These assertions
 * are deliberately about rendered output rather than about the view file.
 */
function aPageOfSchematics(int $howMany): void
{
    for ($i = 0; $i < $howMany; $i++) {
        Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    }
}

it('ne rend aucune cle de traduction brute', function () {
    aPageOfSchematics(30);

    $html = $this->get('/schemas')->assertOk()->getContent();

    expect($html)->not->toContain('pagination.');
    expect($html)->not->toContain('vitrine.pagination');
});

it('ne parle pas anglais', function () {
    aPageOfSchematics(30);

    $html = $this->get('/schemas')->assertOk()->getContent();

    foreach (['Showing', ' results', 'Previous', 'Next'] as $anglais) {
        expect($html)->not->toContain($anglais);
    }
});

/* The one that would have caught the page-wide chevron. An icon whose size lives in a
   stylesheet the site does not load has no size at all, so the bar carries no icon. */
it('ne pose pas d icone dans la barre de pages', function () {
    aPageOfSchematics(30);

    $html = $this->get('/schemas')->assertOk()->getContent();
    $barre = preg_match('#<nav class="pages".*?</nav>#s', $html, $m) ? $m[0] : '';

    expect($barre)->not->toBe('');
    expect($barre)->not->toContain('<svg');
});

/* The three numbers are written outside the translation, so a missing key loses a word
   and never a count. On a site that sells nothing but figures, that is the line. */
it('garde ses nombres quand la traduction manque', function () {
    aPageOfSchematics(30);

    app()->setLocale('xx');
    $html = $this->get('/schemas')->assertOk()->getContent();

    expect($html)->toContain('1 - 24');
    expect($html)->toContain('30');
});
