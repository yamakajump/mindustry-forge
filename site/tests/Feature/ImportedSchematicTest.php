<?php

use App\Models\Schematic;
use App\Models\User;
use App\Services\EngineVersion;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * Schematics this site collected rather than schematics its members posted.
 *
 * Most of what the catalogue will hold came from somewhere else, and every test here is
 * about that being true out loud: the origin is on the page, the credit points at a real
 * author, and nothing collected is quietly presented as if it had been made here or
 * checked by anybody.
 *
 * The first test is the important one. Making `user_id` nullable so an imported schematic
 * could exist at all opened a hole big enough to publish the whole unreleased catalogue
 * through, and it did not look like a hole.
 */
it('ne montre pas le catalogue non publie aux visiteurs deconnectes', function () {
    /*
     * The regression this whole file exists for.
     *
     * `visibleTo()` used to ask `$this->user_id === $user?->id`. An imported schematic has
     * no owner, and a signed-out visitor has no id, so null matched null and every private
     * import answered "yes, you may read this". The catalogue is ingested private on
     * purpose, because collecting and publishing are two separate acts, and that one
     * comparison would have published all of it on the day of the first import.
     */
    $imported = Schematic::factory()->imported()->create([
        'visibility' => 'private', 'name' => 'Pas encore publiee',
    ]);

    $this->get("/s/{$imported->slug}")->assertNotFound();
    $this->actingAs(User::factory()->create())->get("/s/{$imported->slug}")->assertNotFound();
    $this->get('/schematiques')->assertOk()->assertDontSee('Pas encore publiee');

    expect($imported->visibleTo(null))->toBeFalse();
});

it('laisse un moderateur ouvrir un import non publie', function () {
    // Somebody has to be able to look at what was collected before deciding to publish it.
    $imported = Schematic::factory()->imported()->create(['visibility' => 'private']);

    $this->actingAs(User::factory()->create(['moderator' => true]))
        ->get("/s/{$imported->slug}")
        ->assertOk();
});

it('dit sur la page d ou vient une schematique importee', function () {
    $imported = Schematic::factory()->imported()->create([
        'visibility' => 'public', 'name' => 'Venue d ailleurs', 'author' => 'quelqu un',
    ]);

    $this->get("/s/{$imported->slug}")
        ->assertOk()
        ->assertSee('Schematique importee')
        ->assertSee('mindustry-tool.com')
        ->assertSee('quelqu un')
        // The honest part: nobody read it, and it may simply not work.
        ->assertSee('personne ne l\'a relue', escape: false)
        ->assertSee($imported->sourceUrl(), escape: false);
});

it('ne colle pas cette mention sur ce qui a ete poste ici', function () {
    $mine = Schematic::factory()->create(['visibility' => 'public', 'name' => 'Faite ici']);

    $this->get("/s/{$mine->slug}")
        ->assertOk()
        ->assertDontSee('Schematique importee');
});

it('signale les imports dans la vitrine aussi', function () {
    // A hundred tiles deep, the origin still has to be readable without opening anything.
    Schematic::factory()->imported()->create([
        'visibility' => 'public', 'name' => 'Prise ailleurs',
    ]);

    $this->get('/schematiques')->assertOk()->assertSee('importee');
});

it('renvoie vers la page d origine plutot que de citer sans lier', function () {
    $tool = Schematic::factory()->imported(Schematic::MINDUSTRY_TOOL)
        ->create(['source_id' => '01a040db-26af-74be-9db7-ef304ddf13f4']);
    $other = Schematic::factory()->imported(Schematic::MINDUSTRY_SCHEMATICS)
        ->create(['source_id' => '6a83091bcf5ff632109c365a']);
    $mine = Schematic::factory()->create();

    expect($tool->sourceUrl())
        ->toBe('https://mindustry-tool.com/schematics/01a040db-26af-74be-9db7-ef304ddf13f4')
        ->and($other->sourceUrl())
        ->toBe('https://mindustryschematics.com/schematics/6a83091bcf5ff632109c365a')
        ->and($mine->sourceUrl())->toBeNull()
        ->and($mine->imported())->toBeFalse();
});

it('cite le membre, sinon l auteur d origine, sinon personne', function () {
    $member = User::factory()->create(['name' => 'Corentin']);

    expect(Schematic::factory()->for($member)->create()->credit())->toBe('Corentin')
        ->and(Schematic::factory()->imported()->create(['author' => 'sharrlotte'])->credit())
        ->toBe('sharrlotte')
        // Some entries on both catalogues record no author at all. Saying so beats
        // printing nothing, which reads like the site taking the credit.
        ->and(Schematic::factory()->imported()->create(['author' => null])->credit())
        ->toBe('auteur inconnu')
        ->and(Schematic::factory()->imported()->create(['author' => '  '])->credit())
        ->toBe('auteur inconnu');
});

it('refuse d ingerer deux fois la meme schematique', function () {
    // What lets the collector die halfway through twelve thousand and simply start again.
    Schematic::factory()->imported()->create(['source_id' => 'meme-id']);

    expect(fn () => Schematic::factory()->imported()->create(['source_id' => 'meme-id']))
        ->toThrow(QueryException::class);
});

it('laisse coexister les schematiques postees ici, qui n ont pas d id d origine', function () {
    // Nulls do not collide in SQL, so the unique constraint sits entirely outside uploads.
    Schematic::factory()->count(3)->create();

    expect(Schematic::where('source', Schematic::UPLOAD)->count())->toBe(3);
});

it('distingue le meme identifiant chez deux sources differentes', function () {
    Schematic::factory()->imported(Schematic::MINDUSTRY_TOOL)->create(['source_id' => '42']);
    Schematic::factory()->imported(Schematic::MINDUSTRY_SCHEMATICS)->create(['source_id' => '42']);

    expect(Schematic::count())->toBe(2);
});

it('retient quel moteur a produit les chiffres', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/api/schematiques', [
        'name' => 'Ligne a graphite',
        'code' => 'bXNjaAF4nD',
        'analysis' => ['width' => 10, 'height' => 16, 'blocks' => 90],
    ])->assertCreated();

    $kept = Schematic::first();
    expect($kept->engine_version)->toBe(EngineVersion::current())
        ->and($kept->analysed_at)->not->toBeNull()
        ->and($kept->analysisIsStale())->toBeFalse();
});

it('sait dire quelles analyses sont a refaire', function () {
    /*
     * The engine changes every week, and a stored figure has no way of knowing. Without
     * this the site keeps presenting last month's numbers as measurements, and the only
     * way to find the stale ones is to redo all fifteen thousand.
     */
    $fresh = Schematic::factory()->create(['engine_version' => EngineVersion::current()]);
    $old = Schematic::factory()->create(['engine_version' => 'aaaaaaaaaaaa']);
    $never = Schematic::factory()->create(['engine_version' => null]);

    $stale = Schematic::stale()->pluck('id');

    expect($stale)->toContain($old->id, $never->id)
        ->and($stale)->not->toContain($fresh->id)
        ->and($old->analysisIsStale())->toBeTrue()
        // Analysed before anything recorded which engine did it: unknown, so not trusted.
        ->and($never->analysisIsStale())->toBeTrue();
});

it('change de version des qu une source du moteur change', function () {
    /*
     * Run against a throwaway copy of the engine rather than the real one. A test that
     * edits `power.js` and puts it back is a test that loses somebody's work the day two
     * people have the repository open, and on this repository they usually do.
     */
    $fake = sys_get_temp_dir().'/forge-version-'.bin2hex(random_bytes(6));
    mkdir($fake.'/forge/engine', 0777, true);
    foreach (['analyse.js', 'schematic.js', 'needs.js', 'marks.js', 'ground.js',
        'maxflow.js', 'blocks.json'] as $file) {
        file_put_contents("{$fake}/forge/{$file}", "// {$file}");
    }
    foreach (['core.js', 'carriers.js', 'liquids.js', 'machines.js', 'massdriver.js',
        'payloads.js', 'power.js', 'run.js'] as $file) {
        file_put_contents("{$fake}/forge/engine/{$file}", "// {$file}");
    }

    $this->app->usePublicPath($fake);

    $before = EngineVersion::compute();
    expect($before)->toMatch('/^[0-9a-f]{12}$/')
        ->and(EngineVersion::compute())->toBe($before);

    // A corrected power calculation is exactly the case this exists for.
    file_put_contents("{$fake}/forge/engine/power.js", '// corrige');
    $after = EngineVersion::compute();

    // So is the catalogue: a block whose numbers were wrong changes every answer it is in.
    file_put_contents("{$fake}/forge/blocks.json", '{"corrige": true}');

    expect($after)->not->toBe($before)
        ->and(EngineVersion::compute())->not->toBe($after);
});
