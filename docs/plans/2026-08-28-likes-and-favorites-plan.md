# Likes and favorites: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public "j'aime" and a private favorite on a schematic, plus the catalogue ordering that follows from the first one.

**Architecture:** Two flat join tables and one denormalised counter column, on the pattern `schematics.views` already sets. Four API verbs behind `auth`, one page for the favorites, one browser module on the pattern of `manage.js`. No new dependency, server side or browser side.

**Tech Stack:** Laravel 12, Pest, SQLite in memory for tests, Blade, vanilla ES modules, Pint for style.

The design this implements: `docs/plans/2026-08-28-likes-and-favorites-design.md`. Read it first; it carries the reasoning, this file carries the steps.

## Global Constraints

- **Do not start Task 1 until `fix/mot-schema` is merged into `main`, and branch from the merged state.** That branch renames "schematique" to "schema" across 115 strings in the language files, the views and the routes, which is nearly every file this plan touches. A narrow feature written under a wide rename conflicts on every line. Session `mindustry-forge-7b` owns it and will say when it lands.
- **`compare.blade.php` and the `schema.comparer` block of `lang/fr/schema.php` belong to a third session (`d3`) right now.** Nothing in this plan touches them. If that changes, wait for `d3` rather than for `mindustry-forge-7b`.
- **"Schema" is masculine.** The game's own `bundle_fr.properties` says `schematic = Schema`. Every string added here agrees with that: "Les plus aimes" and not "aimees", "un schema" and not "une schematique". The translation key is `vitrine.tri.aimes`.
- **Only the player-facing address is renamed, not the API.** `/schematiques` becomes `/schemas` with a 301; `/api/schematiques/{schematic}` stays as it is, because a machine address carries no word a player reads and the Laravel model binding hangs off that segment. So the new verbs read `/api/schematiques/{schematic}/aime`, and the controller parameter is `$schematic`, spelled exactly like the route segment or the binding silently hands you nothing. Read `site/routes/web.php` before writing any of them.
- **No npm dependency.** The repository has none and this is not the feature that introduces one.
- **Conventional commits in English**, imperative subject, 50 characters maximum. The body says why, not what.
- **No em dash anywhere.**
- **Commit with `git commit -m "..." -- <paths>`, never a bare `git commit`.** Several sessions share this working tree and a single HEAD. A targeted `git add` does not protect you: anything another session left in the index rides along. Run `git rev-parse --abbrev-ref HEAD` immediately before every commit; the branch can move under you between two commands. Better still, take a `git worktree` of your own.
- **Nothing here enters `EngineVersion`.** Before the final commit, the checksum of `site/public/forge/blocks.json` must be identical to the byte to what it was at the start. Identical means zero stale analyses.
- **A quantity never travels through a translation placeholder.** Write `{{ $n }} {{ __('schema.unite.jaime') }}`, never `__('schema.aime.compte', ['n' => $n])`. `TranslationKeysTest` enforces this on `.unite.` keys.
- **`php artisan test` and `vendor/bin/pint --test` pass at every commit.** Record the baseline count of passing tests before Task 1 and never let it fall.

## File structure

| File | Its one responsibility |
|---|---|
| `site/database/migrations/..._create_schematic_likes_table.php` | The like join table, and the counter column on `schematics` |
| `site/database/migrations/..._create_favorites_table.php` | The favorite join table |
| `site/app/Models/SchematicLike.php` | One row of the like table |
| `site/app/Models/Favorite.php` | One row of the favorite table |
| `site/app/Http/Controllers/LikeController.php` | Adding and removing a like, and keeping the counter true |
| `site/app/Http/Controllers/FavoriteController.php` | Adding and removing a favorite, and listing one's own |
| `site/app/Console/Commands/RecountLikes.php` | Repairing the counter from the join table |
| `site/resources/views/favorites.blade.php` | The favorites page |
| `site/public/forge/keep.js` | The two buttons in the browser, optimistic, worded from the dictionary |
| `site/app/Http/Controllers/BrowseController.php` | *(modified)* the ordering and its threshold |
| `site/resources/views/browse.blade.php` | *(modified)* the count on a tile |
| `site/resources/views/schematic.blade.php` | *(modified)* the two buttons |
| `site/resources/views/mine.blade.php` | *(modified)* the count on a tile |
| `site/config/nav.php`, `site/public/index.html` | *(modified)* the favorites entry, in both, or `NavigationTest` fails |
| `site/lang/fr/*.php`, `site/public/forge/lang/fr.json` | *(modified)* the new strings |
| `site/routes/web.php` | *(modified)* five routes |
| `site/public/forge/forge.css` | *(modified)* the look of the two buttons and the count |

---

### Task 1: Liking, and a counter that stays true

**Files:**
- Create: `site/database/migrations/2026_08_28_200000_create_schematic_likes_table.php`
- Create: `site/app/Models/SchematicLike.php`
- Create: `site/app/Http/Controllers/LikeController.php`
- Create: `site/app/Console/Commands/RecountLikes.php`
- Modify: `site/routes/web.php`
- Test: `site/tests/Feature/JaimeTest.php`

**Interfaces:**
- Consumes: `Schematic` (route key is `slug`), `User`, both with factories.
- Produces: `schematics.likes` (unsignedInteger, indexed), `SchematicLike`, `POST|DELETE /api/schematiques/{schematic}/aime` answering `{"likes": int, "aime": bool}`, and `php artisan forge:recount-likes`.

- [ ] **Step 1: Write the failing tests**

Create `site/tests/Feature/JaimeTest.php`:

```php
<?php

use App\Models\Schematic;
use App\Models\SchematicLike;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * The public gesture, and the counter that caches it.
 *
 * The counter is denormalised, so every test here is about the two never disagreeing:
 * a double click, a removal that would go negative, and a row deleted underneath.
 */
it('ne compte qu un seul j aime quand on clique deux fois', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create(['likes' => 0]);

    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime")->assertCreated();
    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime")->assertOk();

    expect(SchematicLike::count())->toBe(1)
        ->and($schema->refresh()->likes)->toBe(1);
});

it('compte une fois par personne', function () {
    $schema = Schematic::factory()->create(['likes' => 0]);

    foreach (User::factory()->count(3)->create() as $user) {
        $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime")->assertCreated();
    }

    expect($schema->refresh()->likes)->toBe(3);
});

it('retire le j aime et ne descend jamais sous zero', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create(['likes' => 0]);

    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime");
    $this->actingAs($user)->deleteJson("/api/schematiques/{$schema->slug}/aime")->assertOk();
    $this->actingAs($user)->deleteJson("/api/schematiques/{$schema->slug}/aime")->assertOk();

    expect(SchematicLike::count())->toBe(0)
        ->and($schema->refresh()->likes)->toBe(0);
});

it('refuse un visiteur qui n est pas connecte', function () {
    $schema = Schematic::factory()->create();

    $this->postJson("/api/schematiques/{$schema->slug}/aime")->assertUnauthorized();
});

it('emporte les j aime quand le schema disparait', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create(['likes' => 0]);

    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime");
    $schema->delete();

    expect(SchematicLike::count())->toBe(0);
});

it('repare un compteur qui a derive', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create(['likes' => 0]);
    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime");

    // Ce qu'une panne laisse derriere elle : la ligne existe, le cache ment.
    Schematic::whereKey($schema->id)->update(['likes' => 47]);

    $this->artisan('forge:recount-likes')->assertSuccessful();

    expect($schema->refresh()->likes)->toBe(1);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd site && php artisan test --filter=JaimeTest`
Expected: every test fails, the first ones on a 404 for a route that does not exist yet.

- [ ] **Step 3: Write the migration**

Create `site/database/migrations/2026_08_28_200000_create_schematic_likes_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Who liked what, and the count of it kept beside the schematic.
 *
 * The count is a cache of this table and not a second truth. It lives on `schematics`
 * because the catalogue orders on it, and an ordering over an aggregate cannot use an
 * index: twenty-four tiles would cost a count over the whole catalogue. `schematics.views`
 * is already a column for that exact reason.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('schematic_likes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('schematic_id')->constrained()->cascadeOnDelete();
            $table->timestamp('created_at')->useCurrent();

            // The whole guard against a double click, held by the database rather than by
            // the controller remembering to look first.
            $table->unique(['user_id', 'schematic_id']);
        });

        Schema::table('schematics', function (Blueprint $table) {
            $table->unsignedInteger('likes')->default(0)->index();
        });
    }

    public function down(): void
    {
        Schema::table('schematics', fn (Blueprint $table) => $table->dropColumn('likes'));
        Schema::dropIfExists('schematic_likes');
    }
};
```

- [ ] **Step 4: Write the model**

Create `site/app/Models/SchematicLike.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One person saying once that one schematic is good. */
class SchematicLike extends Model
{
    public $timestamps = false;

    protected $fillable = ['user_id', 'schematic_id', 'created_at'];
}
```

- [ ] **Step 5: Write the controller**

Create `site/app/Http/Controllers/LikeController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Models\Schematic;
use App\Models\SchematicLike;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The public gesture on a schematic.
 *
 * The counter only moves when a row was actually created or actually deleted. A click that
 * changes nothing must not change the number: the unique constraint absorbs the second
 * press, and `wasRecentlyCreated` is how the controller learns which press it was.
 */
class LikeController extends Controller
{
    public function store(Request $request, Schematic $schematic): JsonResponse
    {
        $added = DB::transaction(function () use ($request, $schematic) {
            $like = SchematicLike::firstOrCreate(
                ['user_id' => $request->user()->id, 'schematic_id' => $schematic->id],
                ['created_at' => now()],
            );

            if ($like->wasRecentlyCreated) {
                $schematic->increment('likes');
            }

            return $like->wasRecentlyCreated;
        });

        return response()->json($this->state($schematic, true), $added ? 201 : 200);
    }

    public function destroy(Request $request, Schematic $schematic): JsonResponse
    {
        DB::transaction(function () use ($request, $schematic) {
            $removed = SchematicLike::where('user_id', $request->user()->id)
                ->where('schematic_id', $schematic->id)
                ->delete();

            /* Guarded rather than clamped afterwards. A counter that has already reached
               zero is a counter that has drifted, and decrementing it would print a
               negative number on the page, which is worse than the drift it came from. */
            if ($removed) {
                Schematic::whereKey($schematic->id)->where('likes', '>', 0)->decrement('likes');
            }
        });

        return response()->json($this->state($schematic, false));
    }

    /** @return array{likes: int, aime: bool} */
    private function state(Schematic $schematic, bool $liked): array
    {
        return ['likes' => (int) $schematic->refresh()->likes, 'aime' => $liked];
    }
}
```

- [ ] **Step 6: Write the repair command**

Create `site/app/Console/Commands/RecountLikes.php`:

```php
<?php

namespace App\Console\Commands;

use App\Models\Schematic;
use App\Models\SchematicLike;
use Illuminate\Console\Command;

/**
 * The price of the denormalised counter, paid in one command.
 *
 * A cache of a count drifts: a crash between the insert and the increment, a row deleted
 * by hand, a restored backup. This recomputes every counter from the table that holds the
 * truth, and says how many were wrong rather than repairing in silence.
 */
class RecountLikes extends Command
{
    protected $signature = 'forge:recount-likes';

    protected $description = 'Recompute every like counter from the join table';

    public function handle(): int
    {
        $counts = SchematicLike::query()
            ->selectRaw('schematic_id, count(*) as n')
            ->groupBy('schematic_id')
            ->pluck('n', 'schematic_id');

        $repaired = 0;
        Schematic::query()->select(['id', 'likes'])->chunkById(500, function ($rows) use ($counts, &$repaired) {
            foreach ($rows as $row) {
                $true = (int) ($counts[$row->id] ?? 0);
                if ($true !== (int) $row->likes) {
                    Schematic::whereKey($row->id)->update(['likes' => $true]);
                    $repaired++;
                }
            }
        });

        $this->info("{$repaired} counters repaired.");

        return self::SUCCESS;
    }
}
```

- [ ] **Step 7: Add the routes**

In `site/routes/web.php`, inside the existing `Route::middleware('auth')->group(...)`, using the segment the neighbouring schematic routes use:

```php
    /* The public gesture. Throttled because it is the cheapest request on the site to
       repeat, and the unique constraint stops it counting twice but not arriving twice. */
    Route::post('/api/schematiques/{schematic}/aime', [LikeController::class, 'store'])
        ->middleware('throttle:60,1');
    Route::delete('/api/schematiques/{schematic}/aime', [LikeController::class, 'destroy'])
        ->middleware('throttle:60,1');
```

Add `use App\Http\Controllers\LikeController;` at the top, in alphabetical order with the others.

- [ ] **Step 8: Run the tests and watch them pass**

Run: `cd site && php artisan test --filter=JaimeTest`
Expected: PASS, six tests.

- [ ] **Step 9: Run the whole suite and the style check**

Run: `cd site && php artisan test && vendor/bin/pint --test`
Expected: PASS, and no file listed by Pint. The total must be the baseline plus six.

- [ ] **Step 10: Commit**

```bash
git rev-parse --abbrev-ref HEAD   # confirm you are on your own branch before anything
git commit -m "feat(schemas): let a player say a schema is good" -m "The counter is a column and not a count over the join table: the catalogue
orders on it, and an ordering over an aggregate cannot use an index." -- \
  site/database/migrations/2026_08_28_200000_create_schematic_likes_table.php \
  site/app/Models/SchematicLike.php \
  site/app/Http/Controllers/LikeController.php \
  site/app/Console/Commands/RecountLikes.php \
  site/routes/web.php \
  site/tests/Feature/JaimeTest.php
```

---

### Task 2: The favorite, and the page that holds it

**Files:**
- Create: `site/database/migrations/2026_08_28_201000_create_favorites_table.php`
- Create: `site/app/Models/Favorite.php`
- Create: `site/app/Http/Controllers/FavoriteController.php`
- Create: `site/resources/views/favorites.blade.php`
- Modify: `site/routes/web.php`, `site/config/nav.php`, `site/public/index.html`, `site/lang/fr/compte.php`, `site/lang/fr/nav.php`
- Test: `site/tests/Feature/FavorisTest.php`

**Interfaces:**
- Consumes: everything Task 1 produced, plus `Schematic::listed()` and the tile markup of `mine.blade.php`.
- Produces: `Favorite`, `POST|DELETE /api/schematiques/{schematic}/favori` answering `{"favori": bool}`, and `GET /mes-favoris`.

- [ ] **Step 1: Write the failing tests**

Create `site/tests/Feature/FavorisTest.php`:

```php
<?php

use App\Models\Favorite;
use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * The private gesture.
 *
 * Private is the whole point, so the test that matters most is the one where somebody
 * else's list is not mine, and where mine is empty rather than an error.
 */
it('garde un schema en favori une seule fois', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/favori")->assertCreated();
    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/favori")->assertOk();

    expect(Favorite::count())->toBe(1);
});

it('retire un favori', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/favori");
    $this->actingAs($user)->deleteJson("/api/schematiques/{$schema->slug}/favori")->assertOk();

    expect(Favorite::count())->toBe(0);
});

it('ne montre a personne les favoris d un autre', function () {
    $mine = User::factory()->create();
    $theirs = User::factory()->create();
    $schema = Schematic::factory()->create(['name' => 'Ligne a graphite']);

    $this->actingAs($theirs)->postJson("/api/schematiques/{$schema->slug}/favori");

    $this->actingAs($mine)->get('/mes-favoris')
        ->assertOk()
        ->assertDontSee('Ligne a graphite');
});

it('montre une liste vide plutot qu une erreur', function () {
    $this->actingAs(User::factory()->create())
        ->get('/mes-favoris')
        ->assertOk()
        ->assertSee(__('compte.favoris.vide'));
});

it('refuse la page a un visiteur qui n est pas connecte', function () {
    $this->get('/mes-favoris')->assertRedirect('/auth/discord');
});

it('emporte les favoris quand le schema disparait', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/favori");
    $schema->delete();

    expect(Favorite::count())->toBe(0);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd site && php artisan test --filter=FavorisTest`
Expected: FAIL, on missing routes and a missing translation key.

- [ ] **Step 3: Write the migration and the model**

Create `site/database/migrations/2026_08_28_201000_create_favorites_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What somebody wants to find again.
 *
 * A table of its own rather than a flag on the like: the two gestures were deliberately
 * kept apart, one says a schema is good and the other says I want it back, and a player
 * does one without the other every day.
 *
 * No counter column beside this one. Nothing is ordered on how many people privately kept
 * a schema, and a public number counted from private rows would leak the list it came from.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('favorites', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('schematic_id')->constrained()->cascadeOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['user_id', 'schematic_id']);
            // The page reads one person's list, newest first, and this is that query.
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('favorites');
    }
};
```

Create `site/app/Models/Favorite.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One schematic one person wants to find again. */
class Favorite extends Model
{
    public $timestamps = false;

    protected $fillable = ['user_id', 'schematic_id', 'created_at'];
}
```

- [ ] **Step 4: Write the controller**

Create `site/app/Http/Controllers/FavoriteController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Models\Favorite;
use App\Models\Schematic;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

/**
 * The private list, and the two verbs that fill it.
 *
 * No counter to keep in step, so no transaction: the unique constraint is the whole of the
 * correctness here.
 */
class FavoriteController extends Controller
{
    public function index(Request $request): View
    {
        /* `items` eagerly, like the catalogue does, because every tile reads its ceiling
           and without it a page of twenty-four costs twenty-four more queries. */
        $schematics = Schematic::query()
            ->with(['user', 'items'])
            ->join('favorites', 'favorites.schematic_id', '=', 'schematics.id')
            ->where('favorites.user_id', $request->user()->id)
            ->orderByDesc('favorites.created_at')
            ->orderByDesc('schematics.id')
            ->select('schematics.*')
            ->paginate(24);

        return view('favorites', ['schematics' => $schematics]);
    }

    public function store(Request $request, Schematic $schematic): JsonResponse
    {
        $kept = Favorite::firstOrCreate(
            ['user_id' => $request->user()->id, 'schematic_id' => $schematic->id],
            ['created_at' => now()],
        );

        return response()->json(['favori' => true], $kept->wasRecentlyCreated ? 201 : 200);
    }

    public function destroy(Request $request, Schematic $schematic): JsonResponse
    {
        Favorite::where('user_id', $request->user()->id)
            ->where('schematic_id', $schematic->id)
            ->delete();

        return response()->json(['favori' => false]);
    }
}
```

- [ ] **Step 5: Write the page**

Create `site/resources/views/favorites.blade.php`. Copy the tile markup of `mine.blade.php` rather than inventing a second one, drop the `partials.manage` include (these are other people's schematics, not mine to publish or delete), and add the remove control:

```blade
@extends('layout')

@section('title', __('compte.favoris.titre'))

@section('content')
  <h1>{{ __('compte.favoris.titre') }}</h1>

  @if($schematics->isEmpty())
    {{-- An empty list that says where to go next, rather than an empty list. --}}
    <p class="note">{{ __('compte.favoris.vide') }} <a href="/schemas">{{ __('compte.favoris.parcourir') }}</a></p>
  @else
    <div class="tiles">
      @foreach($schematics as $schematic)
        <article class="tile" data-slug="{{ $schematic->slug }}">
          <a href="/s/{{ $schematic->slug }}">{{ $schematic->name }}</a>
          <p class="figures">
            {{ $schematic->blocks }} {{ __('schema.unite.blocs') }}
            @if($schematic->likes > 0)
              &middot; {{ $schematic->likes }} {{ __('schema.unite.jaime') }}
            @endif
          </p>
          <button type="button" class="link" data-favori="off"
                  data-slug="{{ $schematic->slug }}">{{ __('schema.favori.retirer') }}</button>
        </article>
      @endforeach
    </div>

    @include('partials.pages', ['paginator' => $schematics])
  @endif
@endsection
```

Check the exact names of the tile classes, of the blocks unit key and of the pagination partial against `mine.blade.php` as it stands after the rename, and follow it. If `schema.unite.blocs` does not exist under that name, use the one that does; do not create a second key for the same word.

- [ ] **Step 6: Add the strings**

In `site/lang/fr/compte.php`, inside the existing array:

```php
    'favoris' => [
        'titre' => 'Mes favoris',
        'vide' => "Rien de garde pour l'instant.",
        'parcourir' => 'Parcourir les schemas',
    ],
```

In `site/lang/fr/schema.php`:

```php
    'favori' => [
        'ajouter' => 'Garder en favori',
        'retirer' => 'Retirer des favoris',
    ],
```

Write the accents: `garde` above is this plan file in ASCII, the strings that ship carry them ("Rien de gardé pour l'instant.", "Parcourir les schémas"). The repository requires accents in both languages.

In `site/lang/fr/nav.php`, add the menu entry key `menu.favoris` with the value `Mes favoris`.

- [ ] **Step 7: Add the routes and the navigation entry**

In `site/routes/web.php`, inside the `auth` group:

```php
    Route::get('/mes-favoris', [FavoriteController::class, 'index']);
    Route::post('/api/schematiques/{schematic}/favori', [FavoriteController::class, 'store'])
        ->middleware('throttle:60,1');
    Route::delete('/api/schematiques/{schematic}/favori', [FavoriteController::class, 'destroy'])
        ->middleware('throttle:60,1');
```

In `site/config/nav.php`, in the schematics menu, immediately after `nav.menu.les-miennes`:

```php
        ['key' => 'nav.menu.favoris', 'href' => '/mes-favoris', 'ready' => true, 'auth' => true],
```

Then add the same entry by hand to the header written into `site/public/index.html`. That file never meets PHP, so its header is a copy, and `NavigationTest` compares both against the config. An entry in two of the three places fails the suite.

- [ ] **Step 8: Run the tests and watch them pass**

Run: `cd site && php artisan test --filter=FavorisTest`
Expected: PASS, six tests.

- [ ] **Step 9: Run the whole suite, including navigation and translations**

Run: `cd site && php artisan test && vendor/bin/pint --test`
Expected: PASS. `NavigationTest` and `TranslationKeysTest` in particular must be green without being touched.

- [ ] **Step 10: Commit**

```bash
git rev-parse --abbrev-ref HEAD
git commit -m "feat(compte): keep a schema to find it again" -m "A table apart from the like, because the two gestures answer different
questions, and no counter beside it: a public number counted from private
rows would leak the list it came from." -- \
  site/database/migrations/2026_08_28_201000_create_favorites_table.php \
  site/app/Models/Favorite.php \
  site/app/Http/Controllers/FavoriteController.php \
  site/resources/views/favorites.blade.php \
  site/routes/web.php site/config/nav.php site/public/index.html \
  site/lang/fr/compte.php site/lang/fr/schema.php site/lang/fr/nav.php \
  site/tests/Feature/FavorisTest.php
```

---

### Task 3: The ordering, and the threshold it waits for

**Files:**
- Modify: `site/app/Http/Controllers/BrowseController.php`
- Modify: `site/resources/views/browse.blade.php`
- Test: `site/tests/Feature/TriAimesTest.php`

**Interfaces:**
- Consumes: `schematics.likes` from Task 1.
- Produces: `?tri=aimes` on the catalogue, and `BrowseController::LIKED_ENOUGH = 24`.

- [ ] **Step 1: Write the failing tests**

Create `site/tests/Feature/TriAimesTest.php`:

```php
<?php

use App\Models\Schematic;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * A ranking that refuses to exist before it means anything.
 *
 * The catalogue holds fifteen thousand schematics nobody has liked. Ordered on that
 * column, the first page would be twenty-four rows tied on zero, in whatever order the
 * database found convenient, under a heading promising the most liked. That is a correct
 * number answering a different question, which is the defect this repository has written
 * down six times.
 */
it('n offre pas le classement tant que 23 schemas seulement sont aimes', function () {
    Schematic::factory()->count(23)->create(['visibility' => Schematic::PUBLIC, 'likes' => 1]);

    $this->get('/schemas')->assertOk()->assertDontSee('Les plus aimes');
});

it('offre le classement a partir de 24', function () {
    Schematic::factory()->count(24)->create(['visibility' => Schematic::PUBLIC, 'likes' => 1]);

    $this->get('/schemas')->assertOk()->assertSee('Les plus aimes');
});

it('retombe sur la date quand le classement n existe pas encore', function () {
    Schematic::factory()->count(3)->create(['visibility' => Schematic::PUBLIC, 'likes' => 1]);

    // Tape a la main, puisque la page ne l'offre pas.
    $this->get('/schemas?tri=aimes')->assertOk()->assertSee('Les plus recentes');
});

it('classe sur les j aime au dela du seuil', function () {
    Schematic::factory()->count(24)->create(['visibility' => Schematic::PUBLIC, 'likes' => 1]);
    $best = Schematic::factory()->create([
        'visibility' => Schematic::PUBLIC, 'likes' => 99, 'name' => 'La plus aimee de toutes',
    ]);

    $page = $this->get('/schemas?tri=aimes')->assertOk();

    expect($page->viewData('schematics')->first()->id)->toBe($best->id);
});
```

The strings asserted here carry their accents in the real files ("Les plus aimés", "Les plus récentes"); assert against the exact value written in `BrowseController::ORDERS`.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd site && php artisan test --filter=TriAimesTest`
Expected: FAIL, "Les plus aimes" is nowhere in the page.

- [ ] **Step 3: Add the ordering to the controller**

In `site/app/Http/Controllers/BrowseController.php`, add to `ORDERS`, after `'seen'`:

```php
        'aimes' => 'Les plus aimes',
```

The labels in this constant are literals rather than translation keys, which is what the five neighbours already are. Follow the file rather than half converting it; moving all six into `lang/` is a job of its own and not this one.

Add the threshold and its reason:

```php
    /**
     * How many schematics must carry a like before the ranking is offered.
     *
     * Twenty-four, the size of a page. Below that the ranking cannot fill its own first
     * screen, and a page titled "les plus aimes" would be listing schematics on the
     * strength of a zero they all share.
     */
    private const LIKED_ENOUGH = 24;
```

- [ ] **Step 4: Hide the ordering until it means something**

In `index()`, after `$order` is resolved and before the `match`:

```php
        /* Counted, not cached. This is an index-only scan over one column; the ten minute
           cache this page used to carry was removed the day an index made it pointless. */
        $ranked = Schematic::query()->listed()->where('likes', '>', 0)->count() >= self::LIKED_ENOUGH;

        $orders = self::ORDERS;
        if (! $ranked) {
            unset($orders['aimes']);
            // Typed by hand, since the page does not offer it. Same fallback as an output
            // ordering with no item chosen, and the page says which of the two it is doing.
            if ($order === 'aimes') {
                $order = 'new';
            }
        }
```

Add the arm to the `match`:

```php
            'aimes' => $query->orderByDesc('schematics.likes'),
```

And pass `$orders` to the view in place of `self::ORDERS`:

```php
            'orders' => $orders,
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `cd site && php artisan test --filter=TriAimesTest`
Expected: PASS, four tests.

- [ ] **Step 6: Check that the catalogue did not get slower**

Run: `cd site && php artisan test --filter=BrowsePerformanceTest`
Expected: PASS, untouched. If it fails, the count added per render is the suspect; it must be one query for the whole page, not one per tile.

- [ ] **Step 7: Run the whole suite and commit**

```bash
cd site && php artisan test && vendor/bin/pint --test
cd .. && git rev-parse --abbrev-ref HEAD
git commit -m "feat(vitrine): rank on likes, once there are any" -m "Fifteen thousand schematics nobody has liked would order the whole
catalogue on a zero they all share, under a heading promising the most
liked. The ranking is not offered before twenty-four carry a like." -- \
  site/app/Http/Controllers/BrowseController.php \
  site/resources/views/browse.blade.php \
  site/tests/Feature/TriAimesTest.php
```

---

### Task 4: The two buttons, and the count on a tile

**Files:**
- Create: `site/public/forge/keep.js`
- Modify: `site/resources/views/schematic.blade.php`, `site/resources/views/browse.blade.php`, `site/resources/views/mine.blade.php`, `site/resources/views/layout.blade.php`
- Modify: `site/lang/fr/schema.php`, `site/public/forge/lang/fr.json`, `site/public/forge/forge.css`
- Test: `site/tests/Feature/JaimeAffichageTest.php`

**Interfaces:**
- Consumes: the four verbs of Tasks 1 and 2, and `schematics.likes`.
- Produces: `keep.js`, listening on `[data-aime]` and `[data-favori]`, reading the slug from `data-slug`.

- [ ] **Step 1: Write the failing tests**

Create `site/tests/Feature/JaimeAffichageTest.php`:

```php
<?php

use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('n affiche pas un compteur a zero', function () {
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC, 'likes' => 0]);

    $this->get("/s/{$schema->slug}")->assertOk()->assertDontSee('0 j\'aime', false);
});

it('affiche le compteur des qu il vaut quelque chose', function () {
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC, 'likes' => 12]);

    $this->get("/s/{$schema->slug}")->assertOk()->assertSee('12');
});

it('envoie un visiteur non connecte se connecter plutot que de cacher le bouton', function () {
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->get("/s/{$schema->slug}")->assertOk()->assertSee('/auth/discord');
});

it('montre le bouton presse a qui a deja aime', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime");

    $this->actingAs($user)->get("/s/{$schema->slug}")
        ->assertOk()
        ->assertSee('aria-pressed="true"', false);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd site && php artisan test --filter=JaimeAffichageTest`
Expected: FAIL, the buttons do not exist.

- [ ] **Step 3: Tell the schematic page whether this visitor already pressed**

In the controller behind `/s/{slug}` (`SchematicController::show`), pass two booleans to the view, without a query for a visitor who is not signed in:

```php
        $user = $request->user();
        $aime = $user && SchematicLike::where('user_id', $user->id)
            ->where('schematic_id', $schematic->id)->exists();
        $favori = $user && Favorite::where('user_id', $user->id)
            ->where('schematic_id', $schematic->id)->exists();
```

- [ ] **Step 4: Add the buttons to the schematic page**

In `site/resources/views/schematic.blade.php`, near the existing actions:

```blade
{{-- Two gestures, worded rather than left to two icons: one says the schema is good, the
     other says I want to find it again, and an outline heart against a full heart does not
     carry that difference to anybody who has not been told it. --}}
<div class="keep" data-slug="{{ $schematic->slug }}">
  @auth
    <button type="button" data-aime aria-pressed="{{ $aime ? 'true' : 'false' }}">
      <span class="mot">{{ __($aime ? 'schema.aime.retirer' : 'schema.aime.bouton') }}</span>
      @if($schematic->likes > 0)
        <span class="compte">{{ $schematic->likes }} {{ __('schema.unite.jaime') }}</span>
      @endif
    </button>
    <button type="button" data-favori aria-pressed="{{ $favori ? 'true' : 'false' }}">
      {{ __($favori ? 'schema.favori.retirer' : 'schema.favori.ajouter') }}
    </button>
  @else
    {{-- Shown rather than hidden: a button a visitor cannot see is a feature they never
         learn exists. It is a link, so it works with no JavaScript at all. --}}
    <a class="bouton" href="/auth/discord">{{ __('schema.aime.bouton') }}</a>
    @if($schematic->likes > 0)
      <span class="compte">{{ $schematic->likes }} {{ __('schema.unite.jaime') }}</span>
    @endif
  @endauth
</div>
```

- [ ] **Step 5: Add the count to the tiles**

In `site/resources/views/browse.blade.php` and `site/resources/views/mine.blade.php`, in the figures line of the tile, and nowhere else. No button on a tile: forty-eight controls on a page of twenty-four is noise, and the gesture belongs on the page where the schema is being looked at.

```blade
            @if($schematic->likes > 0)
              &middot; {{ $schematic->likes }} {{ __('schema.unite.jaime') }}
            @endif
```

The count is read off the column the listing already selects. Do not add a `withCount`, and do not touch the eager loading: that would be a query per tile and `BrowsePerformanceTest` exists to catch it.

- [ ] **Step 6: Add the strings**

In `site/lang/fr/schema.php`:

```php
    'aime' => [
        'bouton' => "J'aime",
        'retirer' => "Je n'aime plus",
        'refuse' => 'Le serveur a refuse (:code).',
    ],
    'unite' => [
        // ... alongside the units already there
        'jaime' => "j'aime",   // invariable in the plural, which is why it is one key
    ],
```

The same keys go into `site/public/forge/lang/fr.json`, because `keep.js` says these words after a click and reads them from the dictionary rather than from the markup, exactly as `manage.js` does.

- [ ] **Step 7: Write the browser module**

Create `site/public/forge/keep.js`:

```js
/**
 * The two gestures on a schematic, in the browser.
 *
 * One listener for the page rather than one per control, on the pattern of `manage.js`,
 * and every word it puts on screen comes from the dictionary because none of it is in the
 * markup until somebody clicks.
 *
 * The button moves before the answer comes back and moves back if it does not. A gesture
 * this small has to land immediately or it reads as broken, and the server is the one that
 * decides the count, so the answer carries it.
 */
import { ready, t } from "./i18n.js";

const token = () => decodeURIComponent(
  (document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || "");

async function send(slug, what, method) {
  const answer = await fetch(`/api/schematiques/${slug}/${what}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-XSRF-TOKEN": token(),
      Accept: "application/json",
    },
  });
  if (!answer.ok) throw new Error(t("schema.aime.refuse", { code: answer.status }));
  return answer.json();
}

document.addEventListener("click", async (event) => {
  await ready;

  const button = event.target.closest("[data-aime], [data-favori]");
  if (!button) return;

  const box = button.closest(".keep") || button;
  const slug = box.dataset.slug || button.dataset.slug;
  if (!slug) return;

  const liking = button.hasAttribute("data-aime");
  const was = button.getAttribute("aria-pressed") === "true";

  button.setAttribute("aria-pressed", was ? "false" : "true");
  button.disabled = true;

  try {
    const state = await send(slug, liking ? "aime" : "favori", was ? "DELETE" : "POST");

    const word = button.querySelector(".mot") || button;
    word.textContent = liking
      ? t(was ? "schema.aime.bouton" : "schema.aime.retirer")
      : t(was ? "schema.favori.ajouter" : "schema.favori.retirer");

    /* The count comes back from the server rather than being incremented here: this
       browser does not know whether somebody else pressed it a second ago. */
    if (liking) {
      const count = button.querySelector(".compte");
      if (count) {
        count.textContent = state.likes > 0 ? `${state.likes} ${t("schema.unite.jaime")}` : "";
        count.hidden = state.likes === 0;
      }
    }
  } catch (error) {
    button.setAttribute("aria-pressed", was ? "true" : "false");
    console.error(error);
  } finally {
    button.disabled = false;
  }
});
```

- [ ] **Step 8: Load the module**

In `site/resources/views/layout.blade.php`, beside the existing `nav.js` line:

```blade
<script src="/forge/keep.js" type="module" defer></script>
```

- [ ] **Step 9: Style the two buttons**

In `site/public/forge/forge.css`, give `.keep` a row of the site's chunky bordered buttons, and `[aria-pressed="true"]` the filled look the `.seg .on` state already uses in `manage.js`'s controls. Reuse those declarations rather than writing a second set of colours; the repository keeps colour in its own file, away from anything hashed.

- [ ] **Step 10: Run the tests and watch them pass**

Run: `cd site && php artisan test --filter=JaimeAffichageTest`
Expected: PASS, four tests.

- [ ] **Step 11: Run the whole suite and commit**

```bash
cd site && php artisan test && vendor/bin/pint --test
cd .. && git rev-parse --abbrev-ref HEAD
git commit -m "feat(schemas): put the two gestures on the page" -m "The count on a tile is read off the column the listing already selects, so
no query is added per tile, and there is no button on a tile: forty-eight
controls on a page of twenty-four is noise." -- \
  site/public/forge/keep.js site/public/forge/forge.css site/public/forge/lang/fr.json \
  site/resources/views/schematic.blade.php site/resources/views/browse.blade.php \
  site/resources/views/mine.blade.php site/resources/views/layout.blade.php \
  site/lang/fr/schema.php site/tests/Feature/JaimeAffichageTest.php
```

---

### Task 5: Prove it against the running site

Tests say the numbers are right. They do not say the page reads right, and the defect this repository keeps paying for is a correct number in the wrong place, which is only visible by looking.

**Files:** none. This task changes nothing and blocks the pull request if it fails.

- [ ] **Step 1: Confirm no analysis went stale**

```bash
sha256sum site/public/forge/blocks.json
```

Compare against the value taken before Task 1. Identical to the byte means zero stale analyses and no re-measurement of the catalogue. If it differs, something touched the engine's fingerprint and that is a bug in this work, not a licence to re-measure.

- [ ] **Step 2: Run everything**

```bash
cd site && php artisan test && vendor/bin/pint --test
cd .. && npm test
```

Expected: all green, and the PHP count is the baseline plus twenty.

- [ ] **Step 3: Look at it**

```bash
cd site && php artisan serve --port=8770
```

Sign in with Discord, then check, on the real page:

- a schema with no likes shows no count anywhere, not a "0";
- pressing "J'aime" moves the button immediately, and the count appears;
- pressing it again removes it, and the count goes back to nothing rather than to "0";
- reloading the page keeps the button pressed;
- signed out, the button is a link to Discord and the page still renders;
- `/mes-favoris` lists what was kept, newest first, and the remove control empties it;
- `/schemas` offers "Les plus aimés" only once twenty-four schemas carry a like, and the tiles carry counts that agree with the pages they link to.

Take a screenshot of the schematic page and of `/mes-favoris` and read them. The question to say out loud in front of each number on screen: what question does this surface claim to answer, and is this the answer to that one.

- [ ] **Step 4: Open the pull request**

```bash
git rev-parse --abbrev-ref HEAD
git push -u origin feat/likes-and-favorites
gh pr create --fill
```

## Self-review of this plan against the spec

Checked, section by section:

- Two separate gestures, worded, not merged: Tasks 1, 2, 4.
- Denormalised counter with a repair command, and no double count: Task 1.
- Cascade on the schematic and the user: migrations in Tasks 1 and 2, tests in both.
- Nothing in `EngineVersion`, checked by checksum: Task 5 step 1.
- Ordering with a threshold of 24 and a fallback to date: Task 3.
- Count on tiles with no extra query, `BrowsePerformanceTest` green: Task 4 step 5, Task 3 step 6.
- `/mes-favoris`, navigation entry in all three places: Task 2 step 7.
- Anonymous visitors see the button as a link: Task 4 step 4, tested.
- Throttling on the four verbs: Tasks 1 and 2.
- Units outside placeholders: Task 4 step 6, enforced by `TranslationKeysTest`.
- Out of scope and not smuggled in: no folders, no notes, no list of who liked, no like in `best` or `output`. Nothing in this plan touches those.
