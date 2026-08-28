<?php

use App\Models\Contribution;
use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

function documenting(User $member, int $howMany, string $item = 'graphite'): void
{
    for ($i = 0; $i < $howMany; $i++) {
        $schematic = Schematic::factory()->create([
            'visibility' => Schematic::PUBLIC,
            'source' => 'mindustry-schematics',
            'source_id' => 'src-'.Str::random(8),
            'blocks' => 30,
        ]);

        Contribution::offer($member, $schematic, ['12,4' => ['side' => 'in']], [
            'perMinute' => [$item => 90.0],
            'power' => ['made' => 0.0, 'spent' => 0.0],
        ]);
    }
}

it('gives every member an address, however they were created', function () {
    expect(User::factory()->create()->slug)->toMatch('/^[a-z0-9]{10}$/');
});

it('does not hand two members the same address', function () {
    $slugs = collect(range(1, 20))->map(fn () => User::factory()->create()->slug);

    expect($slugs->unique())->toHaveCount(20);
});

it('shows what somebody documented, in front of what they posted', function () {
    $member = User::factory()->create(['name' => 'Marqueuse', 'upheld' => 1]);
    documenting($member, 3);

    $page = $this->get("/u/{$member->slug}");

    $page->assertOk()
        ->assertSee('Marqueuse')
        ->assertSee('3 plafonds transformés en débit déclaré', false);
});

it('breaks the documented work down by resource', function () {
    $member = User::factory()->create(['upheld' => 1]);
    documenting($member, 2, 'silicon');

    $this->get("/u/{$member->slug}")->assertOk()->assertSee('Silicium', false);
});

it('counts only markings that are actually in force', function () {
    $waiting = User::factory()->create();
    documenting($waiting, 2);

    // A new account's markings are queued, not published. Counting them on a public page
    // would credit somebody for work the site has not accepted.
    expect(Contribution::where('state', Contribution::APPLIED)->count())->toBe(0);

    $this->get("/u/{$waiting->slug}")->assertOk()
        ->assertSee('0 plafonds transformés en débit déclaré', false);
});

it('keeps a hidden schematic off its author page', function () {
    $member = User::factory()->create();
    Schematic::factory()->create([
        'user_id' => $member->id, 'visibility' => Schematic::PUBLIC, 'name' => 'Visible',
    ]);
    Schematic::factory()->create([
        'user_id' => $member->id, 'visibility' => Schematic::PUBLIC,
        'name' => 'Masquee', 'hidden_at' => now(),
    ]);

    $this->get("/u/{$member->slug}")->assertOk()
        ->assertSee('Visible')->assertDontSee('Masquee');
});

it('keeps a private schematic off its author page', function () {
    $member = User::factory()->create();
    Schematic::factory()->create([
        'user_id' => $member->id, 'visibility' => Schematic::PRIVATE, 'name' => 'Brouillon',
    ]);

    $this->actingAs($member)->get("/u/{$member->slug}")->assertOk()
        ->assertDontSee('Brouillon');
});

it('shows a member their own level and nobody else theirs', function () {
    $member = User::factory()->create(['upheld' => 5]);

    $this->actingAs($member)->get("/u/{$member->slug}")->assertOk()->assertSee('Ton niveau');

    $this->actingAs(User::factory()->create())->get("/u/{$member->slug}")
        ->assertOk()->assertDontSee('Ton niveau');

    $this->get("/u/{$member->slug}")->assertOk()->assertDontSee('Ton niveau');
});

it('answers 404 for an address nobody holds', function () {
    $this->get('/u/personne123')->assertNotFound();
});

it('has no page for an imported author, who has no account', function () {
    Schematic::factory()->create([
        'user_id' => null, 'visibility' => Schematic::PUBLIC,
        'source' => 'mindustry-schematics', 'source_id' => 'x1', 'author' => 'Nikita',
    ]);

    $this->get('/u/Nikita')->assertNotFound();
});
