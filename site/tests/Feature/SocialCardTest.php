<?php

use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

/**
 * The thumbnail a link to a schematic shows once it is pasted somewhere.
 *
 * What is checked here is what breaks in silence: a card that leaks a private schematic, a
 * card that keeps the old name after a rename, and a card that is simply not an image. None
 * of those three defects raises an error; they are found in a Discord thread.
 */
function schematique(array $extra = []): Schematic
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
        'power_made' => 60,
        'power_used' => 60,
        'produces' => ['silicon' => 180.0],
    ], $extra));
}

it('composes a card in the format the unfurlers expect', function () {
    Storage::fake('public');
    $schematic = schematique();

    $response = $this->get("/s/{$schematic->slug}/carte.jpg");

    $response->assertOk()->assertHeader('Content-Type', 'image/jpeg');

    $image = imagecreatefromstring($response->getContent());
    expect($image)->not->toBeFalse();
    expect(imagesx($image))->toBe(1200);
    expect(imagesy($image))->toBe(630);
});

it('composes without a preview when the schematic has none', function () {
    Storage::fake('public');
    $schematic = schematique();

    /* The ordinary case, not the rare one: a schematic imported from another catalogue
       arrives with no image, and it is exactly the one whose link still has to show
       something. */
    expect(Storage::disk('public')->exists("apercus/{$schematic->slug}.png"))->toBeFalse();

    $this->get("/s/{$schematic->slug}/carte.jpg")->assertOk();
});

it('refuses the card of a private schematic', function () {
    Storage::fake('public');
    $schematic = schematique(['visibility' => Schematic::PRIVATE]);

    $this->get("/s/{$schematic->slug}/carte.jpg")->assertNotFound();
});

it('serves the card of an unlisted schematic', function () {
    Storage::fake('public');
    $schematic = schematique(['visibility' => Schematic::UNLISTED]);

    /* Unlisted means "whoever has the link sees it". An unfurler arrives with the link and
       no account: refusing it the thumbnail would empty link sharing of its point. */
    $this->get("/s/{$schematic->slug}/carte.jpg")->assertOk();
});

it('redraws the card when the schematic has changed', function () {
    Storage::fake('public');
    $schematic = schematique();

    $this->get("/s/{$schematic->slug}/carte.jpg")->assertOk();
    $premiere = Storage::disk('public')->get("cartes/{$schematic->slug}.jpg");

    $schematic->forceFill([
        'name' => 'Un nom beaucoup plus long qu avant',
        'updated_at' => now()->addMinute(),
    ])->save();

    $this->get("/s/{$schematic->slug}/carte.jpg")->assertOk();

    expect(Storage::disk('public')->get("cartes/{$schematic->slug}.jpg"))->not->toBe($premiere);
});

it('puts exactly one og:image in the head, and it is the schematic one', function () {
    Storage::fake('public');
    $schematic = schematique();

    $html = $this->get("/s/{$schematic->slug}")->assertOk()->getContent();

    expect(substr_count($html, 'property="og:image"'))->toBe(1);
    expect($html)->toContain("/s/{$schematic->slug}/carte.jpg");
    expect($html)->not->toContain('@yield');
});
