<?php

use App\Models\Schematic;
use App\Models\User;
use App\Support\Canonical;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;

uses(RefreshDatabase::class);

/**
 * The address each page declares as its own.
 *
 * This is the half of the site that fails without ever erroring. `/schemas` answers 200 to
 * every combination of sixteen query parameters, so a wrong rule here does not break a page,
 * it quietly multiplies one page into thousands that compete for the same words. The tests
 * are therefore about which parameters survive and which do not, one per reason.
 */
function canonique(string $uri): string
{
    return Canonical::of(Request::create($uri));
}

it('names the page itself when nothing is asked of it', function () {
    expect(canonique('https://mindustryforge.com/schemas'))
        ->toBe('https://mindustryforge.com/schemas');
});

it('keeps a parameter that names a different set of schematics', function () {
    expect(canonique('https://mindustryforge.com/schemas?produit=graphite'))
        ->toBe('https://mindustryforge.com/schemas?produit=graphite');
});

it('drops an ordering that changes no set', function () {
    expect(canonique('https://mindustryforge.com/schemas?tri=dense'))
        ->toBe('https://mindustryforge.com/schemas');
});

it('drops the schematic held for comparison, which is interface state', function () {
    expect(canonique('https://mindustryforge.com/schemas?comparer=abc123'))
        ->toBe('https://mindustryforge.com/schemas');
});

it('drops a view that needs a reader, since a crawler is never signed in', function () {
    foreach (['miens', 'favoris', 'aimes'] as $personal) {
        expect(canonique("https://mindustryforge.com/schemas?{$personal}=oui"))
            ->toBe('https://mindustryforge.com/schemas');
    }
});

it('writes the same address whichever order the filters arrive in', function () {
    $one = canonique('https://mindustryforge.com/schemas?produit=graphite&planete=serpulo');
    $two = canonique('https://mindustryforge.com/schemas?planete=serpulo&produit=graphite');

    expect($one)->toBe($two);
});

it('keeps a page beyond the first and drops the first', function () {
    expect(canonique('https://mindustryforge.com/schemas?page=3'))
        ->toBe('https://mindustryforge.com/schemas?page=3');
    expect(canonique('https://mindustryforge.com/schemas?page=1'))
        ->toBe('https://mindustryforge.com/schemas');
});

it('drops a parameter left empty by a submitted form', function () {
    expect(canonique('https://mindustryforge.com/schemas?produit='))
        ->toBe('https://mindustryforge.com/schemas');
});

it('drops a parameter nobody has classified', function () {
    expect(canonique('https://mindustryforge.com/schemas?utm_source=discord'))
        ->toBe('https://mindustryforge.com/schemas');
});

it('puts the tag on a real page, once', function () {
    $schematic = Schematic::create([
        'user_id' => User::factory()->create()->id,
        'slug' => Schematic::freshSlug(),
        'name' => 'Ligne a graphite',
        'code' => 'bXNjaAF4nD',
        'visibility' => Schematic::PUBLIC,
        'width' => 11, 'height' => 11, 'blocks' => 33,
    ]);

    $body = $this->get('/s/'.$schematic->slug)->assertOk()->getContent();

    expect(substr_count($body, 'rel="canonical"'))->toBe(1);
    expect($body)->toContain('<link rel="canonical" href="'.url('/s/'.$schematic->slug).'">');
});

it('puts a stripped tag on a filtered listing', function () {
    $body = $this->get('/schemas?produit=graphite&tri=dense&page=1')->assertOk()->getContent();

    expect($body)->toContain('<link rel="canonical" href="'.url('/schemas').'?produit=graphite">');
});
