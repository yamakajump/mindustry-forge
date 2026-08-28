<?php

use App\Models\Schematic;
use App\Models\User;
use App\Services\BlockCatalogue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;

uses(RefreshDatabase::class);

/**
 * The file that tells a search engine the catalogue exists.
 *
 * What is checked here is what fails in silence. A sitemap listing a private schematic
 * hands a crawler a page the site itself declines to show, and nothing on the site would
 * ever reveal it. A sitemap that is well-formed but empty is indistinguishable from one
 * that works, until months later when nothing is indexed. Neither raises an error.
 */
function schemaListe(array $extra = []): Schematic
{
    return Schematic::create(array_merge([
        'user_id' => User::factory()->create()->id,
        'slug' => Schematic::freshSlug(),
        'name' => 'Ligne a graphite',
        'code' => 'bXNjaAF4nD',
        'visibility' => Schematic::PUBLIC,
        'width' => 11,
        'height' => 11,
        'blocks' => 33,
    ], $extra));
}

beforeEach(fn () => Cache::forget('sitemap'));

it('serves a well-formed sitemap', function () {
    $response = $this->get('/sitemap.xml');

    $response->assertOk();
    expect($response->headers->get('Content-Type'))->toContain('application/xml');

    $xml = simplexml_load_string($response->getContent());
    expect($xml)->not->toBeFalse();
    expect($xml->getName())->toBe('urlset');
});

it('lists a public schematic, with the date it changed', function () {
    $schematic = schemaListe();

    $body = $this->get('/sitemap.xml')->getContent();

    expect($body)->toContain('/s/'.$schematic->slug);
    expect($body)->toContain($schematic->updated_at->toAtomString());
});

it('never lists a private schematic', function () {
    $hidden = schemaListe(['visibility' => Schematic::PRIVATE]);

    expect($this->get('/sitemap.xml')->getContent())->not->toContain('/s/'.$hidden->slug);
});

it('never lists a schematic a moderator hid', function () {
    $hidden = schemaListe();
    $hidden->forceFill(['hidden_at' => now()])->save();

    expect($this->get('/sitemap.xml')->getContent())->not->toContain('/s/'.$hidden->slug);
});

it('lists every block that has a page, and no hidden one', function () {
    $body = $this->get('/sitemap.xml')->getContent();
    $names = array_keys(BlockCatalogue::all());

    expect(count($names))->toBeGreaterThan(200);
    foreach (array_slice($names, 0, 20) as $name) {
        expect($body)->toContain('/blocs/'.$name);
    }
    expect(substr_count($body, '<loc>'))->toBe(count($names) + 7);
});

it('lists the pages that exist whatever the database holds', function () {
    $body = $this->get('/sitemap.xml')->getContent();

    foreach (['/schemas', '/blocs', '/comparer', '/dossiers',
        '/outils/planificateur', '/outils/logique'] as $path) {
        expect($body)->toContain('<loc>'.url($path).'</loc>');
    }
});

it('writes no lastmod where there is no date to write', function () {
    $body = $this->get('/sitemap.xml')->getContent();

    $block = array_key_first(BlockCatalogue::all());
    expect($body)->toContain('<loc>'.url('/blocs/'.$block).'</loc></url>');
});

it('announces the sitemap in robots.txt', function () {
    $robots = file_get_contents(public_path('robots.txt'));

    expect($robots)->toContain('Sitemap: https://mindustryforge.com/sitemap.xml');
});
