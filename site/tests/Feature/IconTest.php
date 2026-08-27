<?php

use App\Services\BlockCatalogue;
use Illuminate\Support\Facades\Storage;

/**
 * One block's or one item's picture, served on its own.
 *
 * The sheet the analyser draws with weighs 1.28 MB and the same ten icons cut out weigh 8 kB,
 * which is the whole reason this exists. What is checked here is what would break quietly:
 * a name reaching the filesystem, a size nobody asked for being honoured, and a picture that
 * is not a picture.
 */
it('serves a block and an item, at the sizes a page may ask for', function () {
    Storage::fake('public');

    foreach ([['bloc', 'silicon-smelter', 64], ['objet', 'sand', 32]] as [$family, $name, $size]) {
        $response = $this->get("/icone/{$family}/{$name}.png?t={$size}");

        $response->assertOk()->assertHeader('Content-Type', 'image/png');

        $image = imagecreatefromstring($response->getContent());
        expect($image)->not->toBeFalse();
        expect(imagesx($image))->toBe($size);
        expect(imagesy($image))->toBe($size);
    }
});

it('says nothing rather than drawing a grey square for a liquid', function () {
    Storage::fake('public');

    /* The sheet carries no `liquid/` prefix at all, so not one of the game's eleven liquids
       has a picture in it. Serving a placeholder would hide that, and a page that names a
       liquid is meant to show its name alone until the sprite builder exports them. */
    $this->get('/icone/liquide/water.png')->assertNotFound();
});

it('refuses a name that is not in the sheet', function () {
    Storage::fake('public');

    $this->get('/icone/bloc/pas-un-bloc.png')->assertNotFound();
});

it('refuses a name that tries to leave the sheet', function () {
    Storage::fake('public');

    /* The shape is checked before the sheet is asked, so a traversal never becomes a path.
       It matters more here than on a page: this route writes a file. */
    $this->get('/icone/bloc/..%2F..%2Fetc%2Fpasswd.png')->assertNotFound();
});

it('serves only the two sizes a page has a use for', function () {
    Storage::fake('public');

    $this->get('/icone/bloc/silicon-smelter.png?t=32')->assertOk();
    $this->get('/icone/bloc/silicon-smelter.png?t=64')->assertOk();

    /* Anything else is somebody probing, not a page, and each accepted size is a file this
       route agrees to write and keep. */
    foreach ([1, 31, 63, 512, 4096] as $size) {
        $this->get("/icone/bloc/silicon-smelter.png?t={$size}")->assertNotFound();
    }
});

it('keeps the icon under the game version it was cut from', function () {
    Storage::fake('public');

    $this->get('/icone/bloc/silicon-smelter.png?t=64')->assertOk();

    /* The version belongs in the path, not in a date comparison: a rebuilt catalogue serves
       a different address, so a picture cut from the previous jar cannot outlive it. */
    $version = BlockCatalogue::gameVersion();
    expect(Storage::disk('public')->exists("icones/{$version}/bloc-silicon-smelter-64.png"))
        ->toBeTrue();
});

it('cuts an icon once and serves the same bytes after', function () {
    Storage::fake('public');
    $version = BlockCatalogue::gameVersion();
    $path = "icones/{$version}/objet-coal-32.png";

    $first = $this->get('/icone/objet/coal.png?t=32')->assertOk()->getContent();
    $kept = Storage::disk('public')->get($path);

    expect($this->get('/icone/objet/coal.png?t=32')->getContent())->toBe($first);
    expect(Storage::disk('public')->get($path))->toBe($kept);
});
