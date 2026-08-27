<?php

use App\Models\Schematic;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

/**
 * What the listing costs, and what it must keep answering while costing less.
 *
 * The marketplace is heading for fifteen thousand rows, and two things on this page were
 * priced for forty. Measured on a seeded catalogue that size, a single view of the listing
 * spent 141 ms reading the `produces` blob of every public schematic to fill a dropdown of
 * twenty, and sorted the entire catalogue in a temporary B-tree because its default order
 * was an expression no index could serve. Together they were most of the page.
 *
 * These tests hold the two fixes in place, and hold the behaviour they were not allowed to
 * change: the ranking has to mean exactly what it meant before it was stored.
 */
it('classe exactement comme l ancienne expression le faisait', function () {
    /*
     * The one thing the optimisation was not allowed to touch. `power_per_block` replaced
     * `(power_made - power_used) / blocks` computed in the ORDER BY, so it has to agree
     * with it on every row, or the listing quietly reorders itself the day it is deployed.
     */
    foreach ([[2970.0, 568.0, 90], [400.0, 0.0, 200], [300.0, 0.0, 10],
        [0.0, 120.0, 40], [50.0, 50.0, 7]] as [$made, $used, $blocks]) {
        Schematic::factory()->create([
            'visibility' => 'public',
            'power_made' => $made, 'power_used' => $used, 'blocks' => $blocks,
        ]);
    }

    $ancien = Schematic::query()->orderByRaw(
        '(power_made - power_used) / CASE WHEN blocks = 0 THEN 1 ELSE blocks END DESC'
    )->orderByDesc('power_made')->orderByDesc('id')->pluck('id')->all();

    $nouveau = Schematic::query()->orderByDesc('power_per_block')
        ->orderByDesc('power_made')->orderByDesc('id')->pluck('id')->all();

    expect($nouveau)->toBe($ancien);
});

it('tient la colonne de classement a jour quel que soit le chemin d ecriture', function () {
    // Derived on save, so a moderator renaming a schematic cannot leave the site sorting
    // by a figure that no longer matches the one on the page.
    $schematic = Schematic::factory()->create([
        'power_made' => 1000.0, 'power_used' => 200.0, 'blocks' => 40,
    ]);
    expect($schematic->fresh()->power_per_block)->toBe(20.0);

    $schematic->update(['power_made' => 2000.0]);
    expect($schematic->fresh()->power_per_block)->toBe(45.0);

    // A schematic that parsed into nothing must not divide by zero.
    $vide = Schematic::factory()->create([
        'power_made' => 10.0, 'power_used' => 0.0, 'blocks' => 0,
    ]);
    expect($vide->fresh()->power_per_block)->toBe(10.0);
});

it('met bien les mieux faites devant, en lisant la colonne', function () {
    Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Grosse et molle',
        'blocks' => 200, 'power_made' => 400, 'power_used' => 0,
    ]);
    Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Petite et vive',
        'blocks' => 10, 'power_made' => 300, 'power_used' => 0,
    ]);

    $page = $this->get('/schematiques?tri=best')->assertOk()->getContent();
    expect(strpos($page, 'Petite et vive'))->toBeLessThan(strpos($page, 'Grosse et molle'));
});

it('ne relit pas tout le catalogue a chaque affichage de la liste', function () {
    /*
     * The 141 ms. Filling the "qui produit" dropdown meant pulling every public row's
     * `produces` into PHP and counting keys, on every single view, for twenty entries.
     */
    Schematic::factory()->count(30)->create([
        'visibility' => 'public', 'produces' => ['graphite' => 40.0],
    ]);

    $this->get('/schematiques')->assertOk();

    DB::flushQueryLog();
    DB::enableQueryLog();
    $this->get('/schematiques')->assertOk();
    $requetes = collect(DB::getQueryLog())->pluck('query');

    // Nothing may select `produces` across the whole table a second time.
    expect($requetes->filter(fn ($sql) => str_contains($sql, 'produces')
        && ! str_contains($sql, 'limit'))->all())->toBeEmpty();
});

it('propose quand meme les items, une fois le cache chaud', function () {
    Cache::flush();
    Schematic::factory()->create(['visibility' => 'public', 'produces' => ['silicon' => 25.0]]);

    $this->get('/schematiques')->assertOk()->assertSee('silicon');
});

it('ne construit pas un chemin json avec ce que le visiteur tape', function () {
    /*
     * The item name is interpolated into a JSON path rather than bound as a parameter.
     * Laravel escapes the quotes, so this is not an injection; it is that an unchecked
     * three hundred character path is a full scan of the catalogue that cannot match
     * anything, requested by whoever felt like requesting it.
     */
    Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Presse a graphite',
        'produces' => ['graphite' => 40.0],
    ]);

    foreach (["graphite' or '1'='1", str_repeat('x', 300), 'GRAPHITE"', '../etc'] as $bidon) {
        $this->get('/schematiques?produit='.urlencode($bidon))
            ->assertOk()
            // Rejected, so the filter falls away and the listing is simply unfiltered.
            ->assertSee('Presse a graphite');
    }

    $this->get('/schematiques?produit=silicon')->assertOk()->assertDontSee('Presse a graphite');
});

it('donne un ordre total, pour que la pagination ne perde rien', function () {
    /*
     * Every sort here has ties, and rows that compare equal come back in whatever order
     * the database found convenient, which it has no reason to repeat between two pages.
     * The result would be a schematic shown on page two and again on page three while
     * another is never shown at all, and it would read as the site losing things.
     */
    Schematic::factory()->count(50)->create([
        'visibility' => 'public', 'power_made' => 100, 'power_used' => 0, 'blocks' => 10,
    ]);

    $vus = [];
    foreach (range(1, 3) as $page) {
        foreach ($this->get("/schematiques?page={$page}")->assertOk()
            ->viewData('schematics')->items() as $row) {
            $vus[] = $row->id;
        }
    }

    expect($vus)->toHaveCount(50)
        ->and(array_unique($vus))->toHaveCount(50);
});
