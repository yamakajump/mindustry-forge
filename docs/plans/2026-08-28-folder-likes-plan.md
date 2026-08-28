# Liking a folder implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public like on a folder, and the gallery of public folders that makes it worth having.

**Architecture:** Spec 1's pattern on a second table, with its threshold rule inherited rather than reinvented, plus a second threshold of this spec's own: the gallery is not linked from the menu until public folders exist.

**Tech Stack:** Laravel 12, Pest, Blade, vanilla ES modules, Pint.

The design this implements: `docs/plans/2026-08-28-folder-likes-design.md`.

## Global Constraints

- **Starts after the folders plan and spec 1 are both merged.** It extends `keep.js` and `forge:recount-likes`, and it needs `folders` to exist.
- **`BrowseController.php` and `browse.blade.php` are session `mindustry-forge-30`'s.** The gallery here is `FolderController`, over `folders`, and it does not touch either.
- **"Schema" is masculine.**
- **Conventional commits in English**, imperative subject, 50 characters, body says why.
- **No em dash anywhere.**
- **Commit with `git commit -m "..." -- <paths>`**, check `git rev-parse --abbrev-ref HEAD` first, own `git worktree`.
- **Nothing enters `EngineVersion`**; `blocks.json` checksum unchanged.
- **A quantity never travels through a translation placeholder.**
- **Do not write a second module for the same gesture.** `keep.js` gains a `data-kind`; it does not gain a sibling.

## File structure

| File | Its one responsibility |
|---|---|
| `site/database/migrations/..._create_folder_likes_table.php` | The join table and the counter column |
| `site/app/Models/FolderLike.php` | One row of it |
| `site/app/Http/Controllers/FolderLikeController.php` | Adding and removing a folder like |
| `site/app/Console/Commands/RecountLikes.php` | *(modified)* a second pass, not a second command |
| `site/resources/views/folders/index.blade.php` | The gallery of public folders |
| `site/public/forge/keep.js` | *(modified)* which endpoint, from `data-kind` |

---

### Task 1: The like, on a second noun

**Files:**
- Create: `site/database/migrations/2026_09_20_100000_create_folder_likes_table.php`, `site/app/Models/FolderLike.php`, `site/app/Http/Controllers/FolderLikeController.php`
- Modify: `site/app/Console/Commands/RecountLikes.php`, `site/routes/web.php`
- Test: `site/tests/Feature/DossierJaimeTest.php`

**Interfaces:**
- Consumes: `Folder`, and `LikeController` as the shape to copy.
- Produces: `folders.likes`, `FolderLike`, `POST|DELETE /api/dossiers/{folder}/aime`.

- [ ] **Step 1: Write the failing tests**

```php
<?php

use App\Models\Folder;
use App\Models\FolderLike;
use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('ne compte qu un seul j aime par personne', function () {
    $user = User::factory()->create();
    $folder = Folder::factory()->create(['visibility' => Schematic::PUBLIC, 'likes' => 0]);

    $this->actingAs($user)->postJson("/api/dossiers/{$folder->slug}/aime")->assertCreated();
    $this->actingAs($user)->postJson("/api/dossiers/{$folder->slug}/aime")->assertOk();

    expect(FolderLike::count())->toBe(1)
        ->and($folder->refresh()->likes)->toBe(1);
});

it('ne descend jamais sous zero', function () {
    $user = User::factory()->create();
    $folder = Folder::factory()->create(['visibility' => Schematic::PUBLIC, 'likes' => 0]);

    $this->actingAs($user)->postJson("/api/dossiers/{$folder->slug}/aime");
    $this->actingAs($user)->deleteJson("/api/dossiers/{$folder->slug}/aime");
    $this->actingAs($user)->deleteJson("/api/dossiers/{$folder->slug}/aime")->assertOk();

    expect($folder->refresh()->likes)->toBe(0);
});

it('refuse d aimer un dossier prive', function () {
    $folder = Folder::factory()->create(['visibility' => Schematic::PRIVATE]);

    $this->actingAs(User::factory()->create())
        ->postJson("/api/dossiers/{$folder->slug}/aime")
        ->assertNotFound();
});

it('repare les deux compteurs en une seule passe', function () {
    $user = User::factory()->create();
    $folder = Folder::factory()->create(['visibility' => Schematic::PUBLIC, 'likes' => 0]);
    $schema = Schematic::factory()->create(['likes' => 0]);

    $this->actingAs($user)->postJson("/api/dossiers/{$folder->slug}/aime");
    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime");

    Folder::whereKey($folder->id)->update(['likes' => 47]);
    Schematic::whereKey($schema->id)->update(['likes' => 47]);

    $this->artisan('forge:recount-likes')->assertSuccessful();

    expect($folder->refresh()->likes)->toBe(1)
        ->and($schema->refresh()->likes)->toBe(1);
});

it('emporte les j aime quand le dossier disparait', function () {
    $user = User::factory()->create();
    $folder = Folder::factory()->create(['visibility' => Schematic::PUBLIC]);
    $this->actingAs($user)->postJson("/api/dossiers/{$folder->slug}/aime");

    $folder->delete();

    expect(FolderLike::count())->toBe(0);
});
```

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: Migration**

```php
Schema::create('folder_likes', function (Blueprint $table) {
    $table->id();
    $table->foreignId('user_id')->constrained()->cascadeOnDelete();
    $table->foreignId('folder_id')->constrained()->cascadeOnDelete();
    $table->timestamp('created_at')->useCurrent();
    $table->unique(['user_id', 'folder_id']);
});

Schema::table('folders', function (Blueprint $table) {
    $table->unsignedInteger('likes')->default(0)->index();
});
```

The third flat table, and the bet spec 1 made is settled here: three readable tables have
cost less than one polymorphic `likeable` plus the migration to reach it.

- [ ] **Step 4: Controller, copied deliberately**

`FolderLikeController` is `LikeController` with `Folder` in place of `Schematic`. Read that
file and follow it exactly: the `firstOrCreate` guarded by the unique constraint, the
counter moving only on `wasRecentlyCreated`, the `where('likes', '>', 0)` on the decrement,
the transaction around both.

One thing it adds, and it is the only difference: a private folder is a 404 for anybody but
its owner, before the like is recorded. Liking something you cannot see would be a way to
learn it exists.

- [ ] **Step 5: A second pass in the command, not a second command**

In `RecountLikes::handle()`, after the schematics pass, the same walk over `folders` against
`folder_likes`. Report the two figures separately, because "3 counters repaired" that mixes
two tables says nothing about where the drift is.

Two commands doing the same repair on two tables is one command somebody forgets to run.

- [ ] **Step 6: Routes**

```php
    Route::post('/api/dossiers/{folder}/aime', [FolderLikeController::class, 'store'])
        ->middleware('throttle:60,1');
    Route::delete('/api/dossiers/{folder}/aime', [FolderLikeController::class, 'destroy'])
        ->middleware('throttle:60,1');
```

- [ ] **Step 7: Run everything and commit**

```bash
cd site && php artisan test && vendor/bin/pint --test
cd .. && git rev-parse --abbrev-ref HEAD
git commit -m "feat(dossiers): let a player say a folder is good" -m "The third flat table rather than the polymorphic likeable spec 1 declined:
three readable tables have cost less than one abstraction and its migration." -- \
  site/database/migrations/2026_09_20_100000_create_folder_likes_table.php \
  site/app/Models/FolderLike.php site/app/Http/Controllers/FolderLikeController.php \
  site/app/Console/Commands/RecountLikes.php site/routes/web.php \
  site/tests/Feature/DossierJaimeTest.php
```

---

### Task 2: The gallery, and its two thresholds

**Files:**
- Create: `site/resources/views/folders/index.blade.php`
- Modify: `site/app/Http/Controllers/FolderController.php`, `site/routes/web.php`, `site/config/nav.php`, `site/public/index.html`, `site/lang/fr/dossiers.php`
- Test: `site/tests/Feature/GalerieDossiersTest.php`

**Interfaces:**
- Consumes: `folders.likes`, `Folder`.
- Produces: `GET /dossiers`, `FolderController::index`, the `aimes` ordering.

- [ ] **Step 1: Write the failing tests**

```php
<?php

use App\Models\Folder;
use App\Models\Schematic;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * Two thresholds, and they answer two different questions.
 *
 * The ordering waits for enough liked folders to fill a page, which is spec 1's rule. The
 * menu entry waits for any public folder at all, which is this page's own: an empty gallery
 * reachable from the menu teaches every visitor, once, that the feature is dead.
 */
it('n offre pas le classement sous le seuil', function () {
    Folder::factory()->count(5)->create(['visibility' => Schematic::PUBLIC, 'likes' => 1]);

    $this->get('/dossiers')->assertOk()->assertDontSee('Les plus aimés');
});

it('offre le classement une fois une page de dossiers aimes', function () {
    Folder::factory()->count(24)->create(['visibility' => Schematic::PUBLIC, 'likes' => 1]);

    $this->get('/dossiers')->assertOk()->assertSee('Les plus aimés');
});

it('repond et le dit quand il n y a aucun dossier public', function () {
    $this->get('/dossiers')->assertOk()->assertSee(__('dossiers.galerie.aucun'));
});

it('ne montre jamais un dossier prive ni un dossier par lien', function () {
    Folder::factory()->create(['visibility' => Schematic::PRIVATE, 'name' => 'Prive']);
    Folder::factory()->create(['visibility' => Schematic::UNLISTED, 'name' => 'Par lien']);

    $this->get('/dossiers')->assertOk()->assertDontSee('Prive')->assertDontSee('Par lien');
});

it('classe sur les j aime au dela du seuil', function () {
    Folder::factory()->count(24)->create(['visibility' => Schematic::PUBLIC, 'likes' => 1]);
    $best = Folder::factory()->create([
        'visibility' => Schematic::PUBLIC, 'likes' => 99, 'name' => 'Le meilleur pack',
    ]);

    $page = $this->get('/dossiers?tri=aimes')->assertOk();

    expect($page->viewData('folders')->first()->id)->toBe($best->id);
});
```

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: `FolderController::index`**

```php
    /** How a gallery can be ordered. Literals, like `BrowseController::ORDERS`. */
    private const ORDERS = [
        'new' => 'Les plus récents',
        'garnis' => 'Les mieux garnis',
        'aimes' => 'Les plus aimés',
    ];

    public function index(Request $request): View
    {
        $public = Folder::query()->where('visibility', Schematic::PUBLIC);

        /* The same rule the catalogue uses, and derived from the page size rather than
           written as a number, so that changing the page size cannot leave a true-looking
           sentence beside a stale threshold. */
        $perPage = 24;
        $ranked = (clone $public)->where('likes', '>', 0)->count() >= $perPage;

        $orders = self::ORDERS;
        if (! $ranked) {
            unset($orders['aimes']);
        }

        $order = array_key_exists($request->query('tri'), $orders) ? $request->query('tri') : 'new';

        $public = match ($order) {
            'garnis' => $public->withCount('schematics')->orderByDesc('schematics_count'),
            'aimes' => $public->orderByDesc('likes'),
            default => $public->orderByDesc('created_at'),
        };

        return view('folders.index', [
            'folders' => $public->withCount(['schematics', 'children'])
                ->with('user')->orderByDesc('id')->paginate($perPage)->withQueryString(),
            'orders' => $orders,
            'order' => $order,
        ]);
    }
```

`orderByDesc('id')` last, so the ordering is total: thousands of folders will tie on zero
schematics or one like, and rows that compare equal come back in whatever order the database
found convenient, which is how paging shows one folder twice and another never.

- [ ] **Step 4: The gallery view**

Cards, not tiles: icon, name, author, the count of schematics, the count of children when
above zero, and the like count when above zero. **No thumbnails**: twenty-four folders would
mean ninety-six schematic renders on one page, and the Discord card already carries them,
generated once on demand.

A folder all of whose schematics are invisible to this visitor shows its withheld count from
the folders spec, rather than reading as empty.

- [ ] **Step 5: The navigation entry, unready until there is something to see**

```php
        ['key' => 'nav.menu.galerie', 'href' => '/dossiers', 'ready' => false, 'auth' => false],
```

**Ships `false`, and it is flipped by hand once public folders exist**, which is a judgement
about the site's content and not about the code. Note it in the pull request body so the
flip is somebody's job rather than a thing everybody assumes somebody did.

The address answers either way. Refusing to link a page is not the same as hiding it.

- [ ] **Step 6: Run everything and commit**

```bash
cd site && php artisan test && vendor/bin/pint --test
cd .. && git rev-parse --abbrev-ref HEAD
git commit -m "feat(dossiers): open a gallery of public folders" -m "Two thresholds: the ranking waits for a page of liked folders, the menu
entry waits for any public folder at all. An empty gallery in the menu
teaches every visitor once that the feature is dead." -- \
  site/app/Http/Controllers/FolderController.php \
  site/resources/views/folders/index.blade.php \
  site/routes/web.php site/config/nav.php site/public/index.html \
  site/lang/fr/dossiers.php site/tests/Feature/GalerieDossiersTest.php
```

---

### Task 3: One gesture, one module

**Files:**
- Modify: `site/public/forge/keep.js`, `site/resources/views/folders/show.blade.php`, `site/resources/views/folders/index.blade.php`

- [ ] **Step 1: Teach `keep.js` which noun it is on**

The box already carries `data-slug`. It gains `data-kind`, absent or `schema` for a
schematic and `dossier` for a folder, and the module builds `/api/schematiques/...` or
`/api/dossiers/...` from it. Nothing else changes: the optimistic move, the rollback, the
count coming back from the server, all already there.

A second module for the same gesture on a different noun is a second thing to fix the day
the gesture is wrong.

- [ ] **Step 2: Put the button on a folder's page and on its card**

On `/d/{slug}`, beside the name. On the gallery card, the count only, no button, for the
same reason spec 1 gave: twenty-four controls on a page of twenty-four is noise.

- [ ] **Step 3: Run everything, look at the pages, commit**

---

### Task 4: Prove it against the running site

- [ ] **Step 1:** `sha256sum site/public/forge/blocks.json`, unchanged.
- [ ] **Step 2:** `php artisan test`, `vendor/bin/pint --test`, `npm test`.
- [ ] **Step 3: Look at it**

- liking a folder moves the button at once and the count appears;
- the same button on a schematic still works, which is the thing `data-kind` could break;
- `/dossiers` with five liked folders offers no ranking, and says nothing about a ranking;
- `/dossiers` with none says there are none, and does not error;
- the menu does not link `/dossiers` yet, and the address still answers;
- a private folder is nowhere in the gallery, signed in as anybody.

- [ ] **Step 4:** push, `gh pr create --fill`, and write the `ready => false` flip into the
  pull request body as an explicit follow-up.

## Self-review against the spec

- Like on a folder, third flat table, counter column: Task 1.
- One repair command with two passes: Task 1 step 5, tested in one run.
- Ranking threshold derived from the page size: Task 2 step 3, tested at 5 and at 24.
- Gallery not linked until public folders exist: Task 2 step 5.
- Empty gallery answers and says so: Task 2, tested.
- Private and unlisted folders never in the gallery: Task 2, tested.
- No favorite on a folder: nothing in this plan adds one.
- One module for one gesture: Task 3.
- No thumbnails in the gallery, no trending, no combined score: nothing here adds them.
