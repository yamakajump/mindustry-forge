<?php

use App\Services\BlockCatalogue;
use App\Services\Cards\BlockCard;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;

/**
 * The thumbnail a link to a block's page unfurls into.
 *
 * What is checked here is what breaks quietly: a card that is not an image, a card that
 * carries no figure and is therefore only a prettier wiki entry, and a name that reaches
 * the filesystem. None of the three raises anything; they are found in a conversation.
 */
uses(RefreshDatabase::class);

it('composes a card in the shape every unfurler expects', function () {
    Storage::fake('public');

    $response = $this->get('/blocs/silicon-smelter/carte.jpg');

    $response->assertOk()->assertHeader('Content-Type', 'image/jpeg');

    $image = imagecreatefromstring($response->getContent());
    expect($image)->not->toBeFalse();
    expect(imagesx($image))->toBe(1200);
    expect(imagesy($image))->toBe(630);
});

it('keeps the card under the game version it was drawn from', function () {
    Storage::fake('public');

    $this->get('/blocs/silicon-smelter/carte.jpg')->assertOk();

    /* The version belongs in the path, not in a date comparison: a rebuilt catalogue serves
       a different address, so a card drawn from the previous jar cannot survive an upgrade
       and quote rates the game no longer has. */
    $version = BlockCatalogue::gameVersion();
    expect(Storage::disk('public')->exists("cartes-blocs/{$version}/silicon-smelter.jpg"))->toBeTrue();
});

it('serves the kept card again without composing it twice', function () {
    Storage::fake('public');
    $version = BlockCatalogue::gameVersion();
    $path = "cartes-blocs/{$version}/silicon-smelter.jpg";

    $this->get('/blocs/silicon-smelter/carte.jpg')->assertOk();
    $first = Storage::disk('public')->get($path);

    $this->get('/blocs/silicon-smelter/carte.jpg')->assertOk();

    expect(Storage::disk('public')->get($path))->toBe($first);
});

it('calls a rate a ceiling and a cost a cost', function () {
    $card = new BlockCard(resource_path('fonts/forge.ttf'), resource_path('brand/mark-96.png'));

    /* The first version of this card printed "au mieux" over a build cost. A cost is exact,
       so calling it a nominal ceiling is a lie, and it is the kind of lie this site exists
       to not tell. The label has to follow the figure. */
    [$rates, $rateLabel] = $card->figures(BlockCatalogue::find('silicon-smelter'));
    [$cost, $costLabel] = $card->figures(BlockCatalogue::find('copper-wall-large'));

    expect($rates)->not->toBeEmpty();
    expect($rateLabel)->toBe(__('blocs.page.au-mieux'));

    expect($cost)->not->toBeEmpty();
    expect($costLabel)->toBe(__('blocs.page.cout'));
    expect($costLabel)->not->toBe(__('blocs.page.au-mieux'));
});

it('never lets a quantity travel through a translation placeholder', function () {
    $card = new BlockCard(resource_path('fonts/forge.ttf'), resource_path('brand/mark-96.png'));

    /* A missing key renders as the key itself, without substituting, so the number would
       vanish and nothing would say so. Every figure is composed number-first in PHP, which
       degrades to "10 blocs.unite.par-seconde" rather than to nothing at all. */
    foreach (['silicon-smelter', 'titanium-conveyor', 'thermal-generator'] as $name) {
        [$lines] = $card->figures(BlockCatalogue::find($name));
        foreach ($lines as [$text]) {
            expect($text)->toMatch('/^[+\-]?[0-9]/', "{$name} : « {$text} » ne commence pas par un chiffre");
        }
    }
});

it('refuses a name that is not a block', function () {
    Storage::fake('public');

    $this->get('/blocs/pas-un-bloc/carte.jpg')->assertNotFound();
});

it('refuses a name that tries to leave the catalogue', function () {
    Storage::fake('public');

    /* The pattern is checked before the catalogue is asked, so a traversal never becomes a
       path. It is the same guard the wiki page uses, and it is worth a test of its own
       because the card writes a file where the page only reads one. */
    $this->get('/blocs/..%2F..%2Fetc%2Fpasswd/carte.jpg')->assertNotFound();
});

it('draws a different card for two different blocks', function () {
    Storage::fake('public');

    /* The cheapest way to catch a card that ignores the block it was given: two blocks with
       different sprites and different rates cannot produce the same bytes.  */
    $smelter = $this->get('/blocs/silicon-smelter/carte.jpg')->getContent();
    $conveyor = $this->get('/blocs/conveyor/carte.jpg')->getContent();

    expect($smelter)->not->toBe($conveyor);
});

it('puts exactly one og:image in the head, and it is the block one', function () {
    $response = $this->get('/blocs/silicon-smelter');

    $response->assertOk();
    $html = $response->getContent();

    /* Repeated og:image is an array and consumers take the first, so a default in the layout
       plus a push on the page meant the generic card won and this whole feature was wasted
       work. The layout yields, the page declares, and there is one of each. */
    expect(substr_count($html, 'property="og:image"'))->toBe(1);
    expect($html)->toContain('/blocs/silicon-smelter/carte.jpg');
    expect($html)->not->toContain('content="'.asset('og.jpg').'"');

    foreach (['og:title', 'og:description', 'og:type', 'og:url', 'og:image:alt'] as $tag) {
        expect(substr_count($html, 'property="'.$tag.'"'))->toBe(1, "{$tag} apparait plusieurs fois");
    }
});

it('still compiles the layout, which one escaped apostrophe is enough to stop', function () {
    $html = $this->get('/blocs/silicon-smelter')->getContent();

    /* An apostrophe escaped inside a Blade directive stops the compiler mid-file. The layout
       then renders as literal text, @stack and @include included, and the page still answers
       200 while showing its own source. Nothing else in the suite catches that. */
    expect($html)->not->toContain('@yield');
    expect($html)->not->toContain('@stack');
    expect($html)->not->toContain('@include');
});
