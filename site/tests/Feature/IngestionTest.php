<?php

use App\Console\Commands\Sources\PoliteClient;
use App\Models\Schematic;
use App\Models\SchematicItem;
use App\Models\Withdrawal;
use App\Services\EngineVersion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

/*
 * Bringing fifteen thousand schematics back from other people's sites, and measuring them.
 *
 * Two things are tested here and only one of them is code: the second is a promise made to
 * the server on the other end. A collector that asks again for what it already holds, that
 * loops forever on a last page, or that passes itself off as a browser, is a collector that
 * gets cut off, and there will be no second chance, because these two catalogues are run by
 * lone maintainers who will see the traffic.
 *
 * The analysis tests run the real Node on the real `bilan.js`. That is the point: this
 * repository has one implementation of the analysis, so the only thing worth checking is
 * that the command runs it as it stands.
 */

/** Four solar panels, written by `tests/js/helpers.js`. Two by two, 28.8 power. */
const PANNEAUX = 'bXNjaAF4nGNgYmBiZGDJS8xNZeAvLE0sKUpVKEjMy0tNLK1gZOAuzs9JLNItSMxLzWFgYGBhgAFGFAYjiAIAYa8MPg==';

/** The mindustry-tool catalogue, cut down to what the collector actually reads from it. */
function toolFake(array $ids = ['aaa', 'bbb']): void
{
    $listing = array_map(fn ($id) => ['id' => $id, 'name' => "listee {$id}"], $ids);

    $routes = [
        'api.mindustry-tool.com/api/v4/schematics/count' => Http::response('12584'),
        'api.mindustry-tool.com/api/v4/schematics?page=0*' => Http::response($listing),
        'api.mindustry-tool.com/api/v4/schematics?page=*' => Http::response([]),
        'api.mindustry-tool.com/api/v4/users/*' => Http::response(['name' => 'sharrlotte']),
    ];

    foreach ($ids as $id) {
        $routes["api.mindustry-tool.com/api/v4/schematics/{$id}"] = Http::response([
            'id' => $id,
            'name' => "Ligne {$id}",
            'description' => '',
            'createdBy' => 'un-uuid',
            'meta' => ['powerConsumption' => 0, 'powerProduction' => 15],
        ]);
        $routes["api.mindustry-tool.com/api/v4/schematics/{$id}/data"]
            = Http::response(base64_decode(PANNEAUX));
    }

    Http::fake($routes);
}

/** The mindustryschematics catalogue, whose listing already carries the base64. */
function otherFake(int $pages = 1, int $perPage = 2): void
{
    Http::fake([
        'mindustryschematics.com/schematics.json*' => function ($request) use ($pages, $perPage) {
            // Like the real one: a page number past the last one is **clamped**, not
            // refused. That is the trap `pages()` has to work around.
            $asked = min($pages, max(1, (int) ($request->data()['page'] ?? 1)));

            return Http::response([
                'page' => $asked, 'pages' => $pages, 'documents' => $pages * $perPage,
                'schematics' => array_map(fn ($n) => [
                    '_id' => "p{$asked}n{$n}", 'name' => "entree {$asked}-{$n}",
                    'text' => PANNEAUX,
                ], range(1, $perPage)),
            ]);
        },
        'mindustryschematics.com/schematics/*.json*' => Http::response([
            'name' => 'Detaillee', 'description' => 'ce que fait le truc',
            'creator_id' => 'un-id', 'powerConsumption' => 366, 'text' => PANNEAUX,
        ]),
        'mindustryschematics.com/user/*' => Http::response(['username' => 'klim']),
    ]);
}

function collecte(array $options = []): void
{
    test()->artisan('forge:collecter', ['--pause' => 0] + $options)->assertSuccessful();
}

it('ingests as private, with no owner, and says where it came from', function () {
    toolFake(['aaa']);

    collecte(['source' => Schematic::MINDUSTRY_TOOL]);

    $kept = Schematic::sole();

    expect($kept->visibility)->toBe(Schematic::PRIVATE)
        // Collecting and publishing are two separate gestures. The second waits on a message
        // to the maintainer on the other end, and this line is what keeps it from going out
        // on its own.
        ->and($kept->user_id)->toBeNull()
        ->and($kept->source)->toBe(Schematic::MINDUSTRY_TOOL)
        ->and($kept->source_id)->toBe('aaa')
        ->and($kept->author)->toBe('sharrlotte')
        ->and($kept->name)->toBe('Ligne aaa')
        ->and($kept->code)->toBe(PANNEAUX)
        ->and($kept->fetched_at)->not->toBeNull()
        // Their whole response, including their own power figures: wherever the two engines
        // disagree, one of them is wrong, and this repository can say which.
        ->and($kept->source_meta['meta']['powerProduction'])->toBe(15)
        // The collection analyses nothing, so the row is stale by construction.
        ->and($kept->engine_version)->toBeNull()
        ->and($kept->analysisIsStale())->toBeTrue();
});

it('does not ask again for what it already holds', function () {
    /*
     * The whole of the collector's resuming is in this test. There is no cursor and no
     * position file: the question asked before paying the two calls an entry costs is "does
     * the database hold it?". If this test falls, restarting a collection cut off at the ten
     * thousandth entry makes ten thousand times two calls on somebody else's server.
     */
    toolFake(['aaa', 'bbb']);

    collecte(['source' => Schematic::MINDUSTRY_TOOL]);
    collecte(['source' => Schematic::MINDUSTRY_TOOL]);

    $details = Http::recorded(fn ($request) => str_ends_with($request->url(), '/schematics/aaa'));

    expect(Schematic::count())->toBe(2)
        ->and($details)->toHaveCount(1);
});

it('resumes a collection cut off halfway', function () {
    toolFake(['aaa', 'bbb']);

    collecte(['source' => Schematic::MINDUSTRY_TOOL, '--limite' => 1]);
    expect(Schematic::count())->toBe(1);

    collecte(['source' => Schematic::MINDUSTRY_TOOL]);

    expect(Schematic::pluck('source_id')->sort()->values()->all())->toBe(['aaa', 'bbb']);
});

it('announces itself under its own name, not under a browser name', function () {
    /*
     * Dressing up as Chrome would work better, and would be worth exactly what it looks like
     * it is worth the day we write to the maintainer on the other end. An agent that can be
     * named is also an agent they can block cleanly, which is their right.
     */
    toolFake(['aaa']);

    collecte(['source' => Schematic::MINDUSTRY_TOOL]);

    Http::assertSent(fn ($request) => $request->header('User-Agent')[0] === PoliteClient::AGENT);
    Http::assertNotSent(fn ($request) => str_contains($request->header('User-Agent')[0] ?? '', 'Chrome'));
});

it('does not loop forever on a last page that repeats itself', function () {
    /*
     * mindustryschematics clamps the page number instead of refusing it: asking for page two
     * hundred returns page one hundred and forty-eight, with an HTTP 200 and twenty
     * perfectly valid entries. A collector waiting for an empty page would spin forever
     * without a single error to report it.
     */
    otherFake(pages: 2, perPage: 2);

    collecte(['source' => Schematic::MINDUSTRY_SCHEMATICS]);

    expect(Schematic::count())->toBe(4);
    Http::assertNotSent(fn ($request) => ($request->data()['page'] ?? null) == 3);
});

it('does not inflate the download counter of the source', function () {
    // Their own page calls its detail endpoint with `?increment=true`. The collector reads
    // the same address; it has no reason to push their statistics up for that.
    otherFake();

    collecte(['source' => Schematic::MINDUSTRY_SCHEMATICS]);

    Http::assertNotSent(fn ($request) => str_contains($request->url(), 'increment'));
});

it('keeps the base64 from the listing and drops the duplicate in the metadata', function () {
    otherFake();

    collecte(['source' => Schematic::MINDUSTRY_SCHEMATICS]);

    $kept = Schematic::first();

    expect($kept->code)->toBe(PANNEAUX)
        ->and($kept->description)->toBe('ce que fait le truc')
        ->and($kept->author)->toBe('klim')
        ->and($kept->source_meta)->toHaveKey('powerConsumption')
        // Already whole in `code`: keeping it twice is the same space wasted twice over.
        ->and($kept->source_meta)->not->toHaveKey('text');
});

it('waits and tries again when the source asks it to slow down', function () {
    // A 429 is cured by waiting, not by giving up on the entry: dropping it would leave a
    // hole in the catalogue that no later pass would come and fill.
    Http::fake([
        'api.mindustry-tool.com/api/v4/schematics/count' => Http::response('1'),
        'api.mindustry-tool.com/api/v4/schematics?page=0*' => Http::response([['id' => 'aaa']]),
        'api.mindustry-tool.com/api/v4/schematics?page=*' => Http::response([]),
        'api.mindustry-tool.com/api/v4/schematics/aaa' => Http::sequence()
            ->push('trop vite', 429)
            ->push(['id' => 'aaa', 'name' => 'Enfin'], 200),
        'api.mindustry-tool.com/api/v4/schematics/aaa/data' => Http::response(base64_decode(PANNEAUX)),
        'api.mindustry-tool.com/api/v4/users/*' => Http::response(['name' => 'quelqu un']),
    ]);

    collecte(['source' => Schematic::MINDUSTRY_TOOL]);

    expect(Schematic::sole()->name)->toBe('Enfin');
});

it('refuses a source that does not exist rather than doing nothing', function () {
    Http::fake();

    $this->artisan('forge:collecter', ['source' => 'wikipedia', '--pause' => 0])
        ->assertExitCode(2);

    expect(Schematic::count())->toBe(0);
    Http::assertNothingSent();
});

it('analyses what was collected with the browser engine', function () {
    /*
     * The real Node on the real `bilan.js`. This repository has one implementation of the
     * analysis and the command does nothing but launch it: faking Node here would no longer
     * test anything at all, beyond the command knowing how to talk to a ghost.
     */
    $imported = Schematic::factory()->imported()->create(['code' => PANNEAUX]);

    $this->artisan('forge:analyser')->assertSuccessful();

    $imported->refresh();

    expect($imported->engine_version)->toBe(EngineVersion::current())
        ->and($imported->analysisIsStale())->toBeFalse()
        ->and($imported->width)->toBe(2)
        ->and($imported->height)->toBe(2)
        ->and($imported->blocks)->toBe(4)
        ->and($imported->power_made)->toBe(28.8)
        // What the `saved` hook rebuilds behind it: four panels are a power plant, so the
        // schematic is findable under power the way another one is findable under graphite.
        ->and($imported->items()->where('item', SchematicItem::POWER)->exists())->toBeTrue();
});

it('keeps from the analysis only what can be read back', function () {
    // The answer from `analyse()` carries the graph, where the nodes point at one another.
    // Keeping all of it would not merely be huge: it is not serialisable.
    $imported = Schematic::factory()->imported()->create(['code' => PANNEAUX]);

    $this->artisan('forge:analyser')->assertSuccessful();

    expect($imported->refresh()->analysis)
        ->toHaveKeys(['perMinute', 'potential', 'cost', 'needs'])
        ->not->toHaveKey('graph')
        ->not->toHaveKey('offers')
        ->not->toHaveKey('detail');
});

it('stamps a schematic the engine cannot read all the same', function () {
    /*
     * Otherwise the queue never empties. An unreadable row stays stale, the command picks it
     * up again on the next pass, and a collection of fifteen thousand holding fifty twisted
     * `.msch` files spins forever. It **has** been analysed: the answer is that this engine
     * cannot manage it, and that is an answer worth keeping.
     */
    $broken = Schematic::factory()->imported()->create(['code' => 'ceci n est pas du base64']);

    $this->artisan('forge:analyser')->assertSuccessful();

    $broken->refresh();

    expect($broken->engine_version)->toBe(EngineVersion::current())
        ->and($broken->analysis)->toHaveKey('erreur')
        ->and(Schematic::stale()->count())->toBe(0);
});

it('does not pick up again what the current engine has already measured', function () {
    Schematic::factory()->imported()->create([
        'code' => PANNEAUX, 'engine_version' => EngineVersion::current(), 'analysed_at' => now(),
    ]);

    $this->artisan('forge:analyser')
        ->expectsOutputToContain('0 analysed')
        ->assertSuccessful();
});

it('keeps exactly the same rows whether it asks one by one or in flight', function () {
    /*
     * The batched path is an optimisation, and an optimisation that changes the answer is
     * a bug wearing a stopwatch. Same fixture, both settings, same rows.
     */
    toolFake(['aaa', 'bbb']);
    collecte(['source' => Schematic::MINDUSTRY_TOOL]);
    $oneByOne = Schematic::orderBy('source_id')->get(['source_id', 'name', 'author', 'code']);

    Schematic::query()->delete();

    toolFake(['aaa', 'bbb']);
    collecte(['source' => Schematic::MINDUSTRY_TOOL, '--paralleles' => 8]);
    $inFlight = Schematic::orderBy('source_id')->get(['source_id', 'name', 'author', 'code']);

    expect($inFlight->toArray())->toBe($oneByOne->toArray());
});

it('does not lose a whole page to one duplicate inside it', function () {
    /*
     * A page is written in one transaction, and a duplicate id inside it raises a
     * constraint violation mid-way. If that aborted the batch, one repeated entry on their
     * side would silently cost us the ninety-nine others, page after page.
     */
    toolFake(['aaa', 'aaa', 'bbb']);

    collecte(['source' => Schematic::MINDUSTRY_TOOL]);

    expect(Schematic::pluck('source_id')->sort()->values()->all())->toBe(['aaa', 'bbb']);
});

/** A graphite press on its own: nothing feeds it, so it measures zero and its ceiling is 40. */
const PRESSE = 'bXNjaAF4nGNgYmBiZGDJS8xNZWArKEotLk5lZOBLL0osyMgsSdUFizAwMDAyQAAA/NAKAQ==';

it('carries the ceiling all the way from Node to the search index', function () {
    /*
     * The chain this test walks is exactly the one that was broken, and it was broken by a
     * single missing word. `bilan.js` computed the ceiling, the model was wired to index
     * it, and `tools/ingest.mjs` dropped it in between because its whitelist did not name
     * it. Nothing failed, nothing warned: 317 of 15 533 published schematics carried a
     * production figure, two per cent, on a site whose promise is finding one by what it
     * makes.
     *
     * Every unit on that path passed on its own. Only running the whole of it fails, which
     * is why this test spends the two hundred milliseconds it takes to start Node.
     */
    $imported = Schematic::factory()->imported()->create(['code' => PRESSE]);

    $this->artisan('forge:analyser')->assertSuccessful();

    $imported->refresh();

    // Nothing feeds it, so there is nothing to measure and the honest answer is silence.
    expect($imported->items()->where('kind', SchematicItem::MESURE)->count())->toBe(0)
        ->and($imported->analysis)->toHaveKey('potentialPerMinute');

    // What it would make if it were fed, which is what makes it findable at all.
    $ceiling = $imported->items()
        ->where('kind', SchematicItem::PLAFOND)
        ->where('item', 'graphite')
        ->sole();

    expect(round($ceiling->rate))->toBe(40.0);
});

/*
 * Takedowns.
 *
 * `SECURITY.md` promises an author's schematic will be removed without argument. Before
 * these tests it could not be: deleting the row was the whole gesture, and the next
 * collection put it back, counted as a new entry. The failure was silent from both ends -
 * nothing logged it, and the author had been told it was done.
 */

it('does not bring back a schematic somebody asked us to take down', function () {
    toolFake(['aaa', 'bbb']);
    collecte(['source' => Schematic::MINDUSTRY_TOOL]);

    $this->artisan('forge:retirer', [
        'slug' => Schematic::where('source_id', 'aaa')->value('slug'),
        '--raison' => 'demande de l auteur',
    ])->assertSuccessful();

    expect(Schematic::where('source_id', 'aaa')->exists())->toBeFalse();

    // The whole point: a second collection sees it in the listing and leaves it alone.
    toolFake(['aaa', 'bbb']);
    collecte(['source' => Schematic::MINDUSTRY_TOOL]);

    expect(Schematic::where('source_id', 'aaa')->exists())->toBeFalse()
        ->and(Schematic::where('source_id', 'bbb')->exists())->toBeTrue();
});

it('never even asks the source about a withdrawn schematic', function () {
    /*
     * Stronger than "does not store it": we stop before the request. Fetching a schematic
     * an author asked us to forget, then throwing it away, is still going and getting it,
     * and their download counter would say so.
     */
    Withdrawal::create(['source' => Schematic::MINDUSTRY_TOOL, 'source_id' => 'aaa']);

    toolFake(['aaa', 'bbb']);
    collecte(['source' => Schematic::MINDUSTRY_TOOL]);

    Http::assertNotSent(fn ($request) => str_contains($request->url(), '/schematics/aaa'));
});

it('keeps the reason, so the request can be answered later', function () {
    toolFake(['aaa']);
    collecte(['source' => Schematic::MINDUSTRY_TOOL]);

    $this->artisan('forge:retirer', [
        'slug' => Schematic::sole()->slug,
        '--raison' => 'courriel du 28/08',
    ])->assertSuccessful();

    $kept = Withdrawal::sole();
    expect($kept->source)->toBe(Schematic::MINDUSTRY_TOOL)
        ->and($kept->source_id)->toBe('aaa')
        ->and($kept->reason)->toBe('courriel du 28/08');
});

it('removes an uploaded schematic without recording a takedown', function () {
    // Nothing collected it, so nothing brings it back and there is nothing to remember.
    // Recording it anyway would put a source-less row in a table keyed on the source.
    $mine = Schematic::factory()->create();

    $this->artisan('forge:retirer', ['slug' => $mine->slug])->assertSuccessful();

    expect(Schematic::count())->toBe(0)
        ->and(Withdrawal::count())->toBe(0);
});

it('says so rather than pretending when the address is wrong', function () {
    $this->artisan('forge:retirer', ['slug' => 'jamaisvu123'])->assertFailed();
});
