<?php

use App\Services\GameNames;
use App\Support\Block;
use Illuminate\Foundation\Testing\RefreshDatabase;

/**
 * The names the game itself states, in the reader's language.
 *
 * Four hundred and eleven of them, generated from the bundle inside the jar rather than
 * written by hand. What is checked here is what would break silently: a name that comes out
 * mis-encoded, a family that stops resolving, and a fallback that stops falling back.
 */
uses(RefreshDatabase::class);

it('gives the game its own French, accents included', function () {
    expect(GameNames::of('block', 'silicon-smelter'))->toBe('Fonderie de Silicium');
    expect(GameNames::of('block', 'mechanical-drill'))->toBe('Foreuse Mécanique');
    expect(GameNames::of('item', 'sand'))->toBe('Sable');
    expect(GameNames::of('liquid', 'water'))->toBe('Eau');
});

it('carries no mis-encoded accent anywhere in the file', function () {
    $names = json_decode(file_get_contents(public_path('forge/noms/fr.json')), true);

    /* The one defect a generator can produce four hundred times over. A `.properties` file
       is latin-1 by the Java specification, so latin-1 was the natural guess, and it is the
       wrong one here: it turns `Créé` into `CrÃ©Ã©`. Measured on all 3 038 lines of the
       bundle before choosing, and checked again here so a future locale cannot slip. */
    expect($names)->toHaveCount(411);

    foreach ($names as $key => $name) {
        expect($name)->not->toContain('Ã', "{$key} is mis-encoded: {$name}");
        expect($name)->not->toContain("\u{FFFD}", "{$key} carries a replacement character");
        expect($name)->not->toMatch('/\\\\u[0-9a-fA-F]{4}/', "{$key} carries a raw escape");
    }

    $accented = array_filter($names, fn ($n) => preg_match('/[À-ÿ]/u', $n));
    expect(count($accented))->toBeGreaterThan(150);
});

it('falls back to the identifier for what the game never names', function () {
    /* `air`, three removed unit factories and thirteen ore floors have no name in any of the
       game's thirty-seven bundles. None of them is reachable through the wiki, which only
       exposes what a player can place, so the block is built directly here: the fallback is
       worth a test precisely because nothing else exercises it. */
    expect(GameNames::of('block', 'air'))->toBeNull();
    expect(GameNames::of('block', 'ore-copper'))->toBeNull();

    expect((new Block('legacy-unit-factory', []))->title())->toBe('Legacy unit factory');
});

it('names the block wiki pages in French', function () {
    $this->get('/blocs/silicon-smelter')
        ->assertOk()
        ->assertSee('Fonderie de Silicium')
        ->assertDontSee('Silicon smelter');
});
