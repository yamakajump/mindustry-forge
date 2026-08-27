<?php

use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

/**
 * La vignette qu'un lien vers une schematique affiche quand on le colle quelque part.
 *
 * Ce qui est verifie ici est ce qui casse en silence : une carte qui fuit une schematique
 * privee, une carte qui garde l'ancien nom apres un renommage, et une carte qui n'est
 * simplement pas une image. Aucun de ces trois defauts ne leve d'erreur ; on les decouvre
 * dans un fil Discord.
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

it('compose une carte au format que les deplieurs attendent', function () {
    Storage::fake('public');
    $schematic = schematique();

    $response = $this->get("/s/{$schematic->slug}/carte.jpg");

    $response->assertOk()->assertHeader('Content-Type', 'image/jpeg');

    $image = imagecreatefromstring($response->getContent());
    expect($image)->not->toBeFalse();
    expect(imagesx($image))->toBe(1200);
    expect(imagesy($image))->toBe(630);
});

it('compose sans apercu quand la schematique n en a pas', function () {
    Storage::fake('public');
    $schematic = schematique();

    /* Le cas ordinaire, pas le cas rare : une schematique importee d'un autre catalogue
       arrive sans image, et c'est justement celle dont le lien doit quand meme montrer
       quelque chose. */
    expect(Storage::disk('public')->exists("apercus/{$schematic->slug}.png"))->toBeFalse();

    $this->get("/s/{$schematic->slug}/carte.jpg")->assertOk();
});

it('refuse la carte d une schematique privee', function () {
    Storage::fake('public');
    $schematic = schematique(['visibility' => Schematic::PRIVATE]);

    $this->get("/s/{$schematic->slug}/carte.jpg")->assertNotFound();
});

it('sert la carte d une schematique non listee', function () {
    Storage::fake('public');
    $schematic = schematique(['visibility' => Schematic::UNLISTED]);

    /* Non listee veut dire « qui a le lien le voit ». Un deplieur arrive avec le lien et
       sans compte : lui refuser la vignette viderait le partage par lien de son sens. */
    $this->get("/s/{$schematic->slug}/carte.jpg")->assertOk();
});

it('refait la carte quand la schematique a change', function () {
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
