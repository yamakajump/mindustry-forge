# Folders implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Named, pictured, nestable folders of schematics that a player can hand to somebody else with a link.

**Architecture:** One table with a self reference for the tree and one join table for the contents, navigated one folder at a time so that no recursive query and no tree widget are needed. Visibility reuses the schematic's three values verbatim. The icon is a catalogue name rendered by the existing `IconController`, never an upload.

**Tech Stack:** Laravel 12, Pest, SQLite in memory for tests, Blade, vanilla ES modules, GD through the existing `Services/Cards`, Pint for style.

The design this implements: `docs/plans/2026-08-28-folders-design.md`.

## Global Constraints

- **Do not start before spec 1 is merged** (`docs/plans/2026-08-28-likes-and-favorites-plan.md`). The folder page reuses the tile and the like count that spec 1 puts on it, and `config/nav.php` is touched by both.
- **Do not start before `fix/mot-schema` is merged**, the "schema" rename owned by session `mindustry-forge-7b`.
- **Do not touch `BrowseController.php` or `browse.blade.php`.** They belong to session `mindustry-forge-30`. If a folder listing seems to want them, it wants its own query over `folder_items`, which is a different question: this listing is "what is in this folder", not "what exists on the site".
- **"Schema" is masculine** in every string added here.
- **No npm dependency.**
- **Conventional commits in English**, imperative subject, 50 characters maximum, body says why. This repository is public, and its rule is English regardless of the language of the session.
- **No em dash anywhere.**
- **Commit with `git commit -m "..." -- <paths>`, never a bare `git commit`.** Several sessions share this working tree and a single HEAD. Run `git rev-parse --abbrev-ref HEAD` immediately before every commit, and check that your branch's base is `main` and not another session's branch. Take a `git worktree` of your own.
- **Nothing here enters `EngineVersion`.** The checksum of `site/public/forge/blocks.json` must be identical to the byte before and after.
- **A quantity never travels through a translation placeholder.**
- **`php artisan test` and `vendor/bin/pint --test` pass at every commit.** Record the baseline before Task 1.

## File structure

| File | Its one responsibility |
|---|---|
| `site/database/migrations/..._create_folders_table.php` | The tree and the contents |
| `site/app/Models/Folder.php` | One folder, its children, its schematics, its depth |
| `site/app/Http/Controllers/FolderController.php` | Making, renaming, moving, deleting, showing |
| `site/app/Http/Controllers/FolderItemController.php` | Putting a schematic in and taking it out |
| `site/app/Services/Cards/FolderCard.php` | What Discord shows for a folder link |
| `site/app/Http/Controllers/FolderCardController.php` | Serving that card |
| `site/resources/views/folders/mine.blade.php` | One's own folders |
| `site/resources/views/folders/show.blade.php` | One folder |
| `site/public/forge/folders.js` | Making and editing a folder in the browser |
| `site/routes/web.php`, `site/config/nav.php`, `site/public/index.html` | *(modified)* the addresses and the menu |
| `site/lang/fr/dossiers.php` | *(new)* every word the folders put on screen |

A language file of its own rather than lines added to `schema.php`: folders are their own
screen with their own vocabulary, and the repository's key convention is
`<domaine>.<ecran>.<element>`.

---

### Task 1: The tree, and the two guards that keep it a tree

**Files:**
- Create: `site/database/migrations/2026_09_01_100000_create_folders_table.php`
- Create: `site/app/Models/Folder.php`
- Test: `site/tests/Feature/DossierArbreTest.php`

**Interfaces:**
- Consumes: `User`, `Schematic`, and `Schematic::VISIBILITIES`.
- Produces: `Folder` with `parent()`, `children()`, `schematics()`, `depth()`, `ancestors()`, `Folder::MAX_DEPTH = 5`, and `Folder::wouldCycle(?Folder $newParent): bool`.

- [ ] **Step 1: Write the failing tests**

Create `site/tests/Feature/DossierArbreTest.php`:

```php
<?php

use App\Models\Folder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * A tree stays a tree only because two moves are refused.
 *
 * A folder moved inside its own descendant makes a ring: both folders leave every listing
 * at once, and the person who caused it cannot reach either to undo it. That is data loss
 * with no error message, so it is the first thing tested here.
 */
function tree(User $owner, int $deep): Folder
{
    $parent = null;
    foreach (range(1, $deep) as $level) {
        $parent = Folder::factory()->create([
            'user_id' => $owner->id,
            'parent_id' => $parent?->id,
            'name' => "Niveau {$level}",
        ]);
    }

    return $parent;
}

it('connait sa profondeur', function () {
    $deepest = tree(User::factory()->create(), 3);

    expect($deepest->depth())->toBe(3)
        ->and($deepest->ancestors())->toHaveCount(2);
});

it('refuse de descendre un dossier dans son propre descendant', function () {
    $owner = User::factory()->create();
    $root = Folder::factory()->create(['user_id' => $owner->id]);
    $child = Folder::factory()->create(['user_id' => $owner->id, 'parent_id' => $root->id]);

    expect($root->wouldCycle($child))->toBeTrue();
});

it('refuse aussi de se ranger dans lui meme', function () {
    $folder = Folder::factory()->create();

    expect($folder->wouldCycle($folder))->toBeTrue();
});

it('accepte un deplacement lateral', function () {
    $owner = User::factory()->create();
    $one = Folder::factory()->create(['user_id' => $owner->id]);
    $two = Folder::factory()->create(['user_id' => $owner->id]);

    expect($two->wouldCycle($one))->toBeFalse();
});

it('accepte la racine', function () {
    $folder = Folder::factory()->create(['parent_id' => Folder::factory()->create()->id]);

    expect($folder->wouldCycle(null))->toBeFalse();
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd site && php artisan test --filter=DossierArbreTest`
Expected: FAIL, `Class "App\Models\Folder" not found`.

- [ ] **Step 3: Write the migration**

Create `site/database/migrations/2026_09_01_100000_create_folders_table.php`:

```php
<?php

use App\Models\Schematic;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A folder, and what is in it.
 *
 * `parent_id` is a self reference and the whole of the nesting. No materialised path and no
 * closure table: the pages walk one level at a time, so a child listing is one indexed
 * query and a breadcrumb is at most five. Both structures exist to make a whole subtree
 * cheap to read at once, which nothing here asks for.
 *
 * `visibility` carries the same three values as a schematic, on purpose. A second scale
 * would mean explaining twice why "par lien" is not "publique".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('folders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            /* Nulls on delete rather than cascade: deleting a folder promotes its children
               instead of taking a subtree with it. A recursive delete behind one button is
               how somebody loses a month of collecting to a misclick. The controller sets
               the new parent explicitly; this is the safety net, not the mechanism. */
            $table->foreignId('parent_id')->nullable()
                ->constrained('folders')->nullOnDelete();

            $table->string('slug', 16)->unique();
            $table->string('name');
            $table->string('icon')->nullable();
            $table->text('description')->nullable();
            $table->string('visibility')->default(Schematic::PRIVATE);
            $table->timestamps();

            // The one query every page of this feature runs: the children of a folder, or
            // the roots of a person when parent_id is null.
            $table->index(['user_id', 'parent_id']);
            $table->index(['visibility', 'created_at']);
        });

        Schema::create('folder_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('folder_id')->constrained()->cascadeOnDelete();
            $table->foreignId('schematic_id')->constrained()->cascadeOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['folder_id', 'schematic_id']);
            $table->index(['folder_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('folder_items');
        Schema::dropIfExists('folders');
    }
};
```

- [ ] **Step 4: Write the model**

Create `site/app/Models/Folder.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * A collection somebody assembled on purpose, which may hold other collections.
 */
class Folder extends Model
{
    use HasFactory;

    /**
     * How deep the nesting may go.
     *
     * A guard, not a design. Five is not meaningful: it is past what anybody assembling
     * schematics will reach, and short enough that a breadcrumb still fits on a phone. It
     * exists so a pathological move meets a wall and says so, rather than building a chain
     * nothing can render.
     */
    public const MAX_DEPTH = 5;

    protected $fillable = ['user_id', 'parent_id', 'name', 'icon', 'description', 'visibility'];

    protected static function booted(): void
    {
        static::creating(function (self $folder) {
            $folder->slug ??= Str::lower(Str::random(12));
        });
    }

    public function getRouteKeyName(): string
    {
        return 'slug';
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function schematics(): BelongsToMany
    {
        return $this->belongsToMany(Schematic::class, 'folder_items')
            ->withPivot(['created_at']);
    }

    /** Every folder above this one, nearest first. At most MAX_DEPTH - 1 of them. */
    public function ancestors(): array
    {
        $chain = [];
        $at = $this->parent;
        while ($at !== null && count($chain) < self::MAX_DEPTH) {
            $chain[] = $at;
            $at = $at->parent;
        }

        return $chain;
    }

    /** 1 at the root. */
    public function depth(): int
    {
        return count($this->ancestors()) + 1;
    }

    /**
     * Would putting this folder under that one make a ring?
     *
     * Walks up from the proposed parent looking for this folder. Bounded by MAX_DEPTH, so
     * it cannot itself loop on a tree that is already broken.
     */
    public function wouldCycle(?self $newParent): bool
    {
        if ($newParent === null) {
            return false;
        }

        if ($newParent->is($this)) {
            return true;
        }

        $at = $newParent;
        for ($step = 0; $at !== null && $step <= self::MAX_DEPTH; $step++) {
            if ($at->is($this)) {
                return true;
            }
            $at = $at->parent;
        }

        return false;
    }
}
```

Create `site/database/factories/FolderFactory.php` on the pattern of `SchematicFactory`, with a name, no parent, and `visibility` private by default.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `cd site && php artisan test --filter=DossierArbreTest`
Expected: PASS, five tests.

- [ ] **Step 6: Run the whole suite and commit**

```bash
cd site && php artisan test && vendor/bin/pint --test
cd .. && git rev-parse --abbrev-ref HEAD
git commit -m "feat(dossiers): hold folders in a tree" -m "A self reference and two refused moves, rather than a materialised path: the
pages walk one level at a time, so nothing asks for a whole subtree at once." -- \
  site/database/migrations/2026_09_01_100000_create_folders_table.php \
  site/app/Models/Folder.php site/database/factories/FolderFactory.php \
  site/tests/Feature/DossierArbreTest.php
```

---

### Task 2: Making, renaming, moving and deleting a folder

**Files:**
- Create: `site/app/Http/Controllers/FolderController.php`
- Create: `site/lang/fr/dossiers.php`
- Modify: `site/routes/web.php`
- Test: `site/tests/Feature/DossierGestionTest.php`

**Interfaces:**
- Consumes: `Folder`, `Folder::MAX_DEPTH`, `Folder::wouldCycle()`, `BlockCatalogue::has()`.
- Produces: `POST /api/dossiers`, `PATCH|DELETE /api/dossiers/{folder}`, and `GET /mes-dossiers`.

- [ ] **Step 1: Write the failing tests**

Create `site/tests/Feature/DossierGestionTest.php`:

```php
<?php

use App\Models\Folder;
use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('cree un dossier avec un nom et une icone du catalogue', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/api/dossiers', [
        'name' => 'Chaine silicium',
        'icon' => 'item/silicon',
    ])->assertCreated()->assertJsonStructure(['slug', 'url']);

    expect(Folder::first()->icon)->toBe('item/silicon');
});

it('refuse une icone qui n est pas au catalogue', function () {
    $this->actingAs(User::factory()->create())
        ->postJson('/api/dossiers', ['name' => 'Truc', 'icon' => 'item/inexistant'])
        ->assertStatus(422);

    expect(Folder::count())->toBe(0);
});

it('refuse de depasser la profondeur maximale', function () {
    $user = User::factory()->create();
    $parent = null;
    foreach (range(1, Folder::MAX_DEPTH) as $ignored) {
        $parent = Folder::factory()->create(['user_id' => $user->id, 'parent_id' => $parent?->id]);
    }

    $this->actingAs($user)
        ->postJson('/api/dossiers', ['name' => 'Un de trop', 'parent' => $parent->slug])
        ->assertStatus(422);
});

it('refuse un deplacement qui ferait une boucle', function () {
    $user = User::factory()->create();
    $root = Folder::factory()->create(['user_id' => $user->id]);
    $child = Folder::factory()->create(['user_id' => $user->id, 'parent_id' => $root->id]);

    $this->actingAs($user)
        ->patchJson("/api/dossiers/{$root->slug}", ['parent' => $child->slug])
        ->assertStatus(422);

    expect($root->refresh()->parent_id)->toBeNull();
});

it('ne laisse personne toucher au dossier d un autre', function () {
    $folder = Folder::factory()->create();

    $this->actingAs(User::factory()->create())
        ->patchJson("/api/dossiers/{$folder->slug}", ['name' => 'Vole'])
        ->assertForbidden();
});

it('promeut les enfants au lieu de les supprimer', function () {
    $user = User::factory()->create();
    $grandparent = Folder::factory()->create(['user_id' => $user->id]);
    $parent = Folder::factory()->create(['user_id' => $user->id, 'parent_id' => $grandparent->id]);
    $child = Folder::factory()->create(['user_id' => $user->id, 'parent_id' => $parent->id]);

    $this->actingAs($user)->deleteJson("/api/dossiers/{$parent->slug}")->assertOk();

    expect(Folder::find($child->id)->parent_id)->toBe($grandparent->id);
});

it('promeut a la racine quand le dossier supprime etait a la racine', function () {
    $user = User::factory()->create();
    $parent = Folder::factory()->create(['user_id' => $user->id]);
    $child = Folder::factory()->create(['user_id' => $user->id, 'parent_id' => $parent->id]);

    $this->actingAs($user)->deleteJson("/api/dossiers/{$parent->slug}");

    expect(Folder::find($child->id)->parent_id)->toBeNull();
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd site && php artisan test --filter=DossierGestionTest`
Expected: FAIL on missing routes.

- [ ] **Step 3: Write the controller**

Create `site/app/Http/Controllers/FolderController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Models\Folder;
use App\Models\Schematic;
use App\Services\BlockCatalogue;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

/**
 * Making a folder, changing it, and getting rid of it without taking a subtree along.
 */
class FolderController extends Controller
{
    public function mine(Request $request): View
    {
        return view('folders.mine', [
            'folders' => Folder::query()
                ->where('user_id', $request->user()->id)
                ->whereNull('parent_id')
                ->withCount(['children', 'schematics'])
                ->orderBy('name')
                ->paginate(24),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $fields = $this->validated($request);
        $parent = $this->parentFrom($request, null);

        if ($parent && $parent->depth() >= Folder::MAX_DEPTH) {
            throw ValidationException::withMessages([
                'parent' => __('dossiers.erreur.trop-profond', ['max' => Folder::MAX_DEPTH]),
            ]);
        }

        $folder = Folder::create($fields + [
            'user_id' => $request->user()->id,
            'parent_id' => $parent?->id,
        ]);

        return response()->json([
            'slug' => $folder->slug,
            'url' => url("/d/{$folder->slug}"),
        ], 201);
    }

    public function update(Request $request, Folder $folder): JsonResponse
    {
        $this->owned($request, $folder);

        $fields = $this->validated($request);

        if ($request->has('parent')) {
            $parent = $this->parentFrom($request, $folder);
            $fields['parent_id'] = $parent?->id;
        }

        $folder->update($fields);

        return response()->json(['slug' => $folder->slug]);
    }

    public function destroy(Request $request, Folder $folder): JsonResponse
    {
        $this->owned($request, $folder);

        /* The children move up rather than down with it. Written here rather than left to
           the foreign key's nullOnDelete, because "promoted to the parent" and "promoted
           to the root" are different outcomes and only one of them is what somebody
           deleting a middle folder expects. */
        $folder->children()->update(['parent_id' => $folder->parent_id]);
        $folder->delete();

        return response()->json(['supprime' => true]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['sometimes', 'string', 'max:80'],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'visibility' => ['sometimes', Rule::in(Schematic::VISIBILITIES)],
            // Checked against the catalogue rather than trusted, exactly as the `bloc`
            // filter is: a name that is not a block would render as a broken image.
            'icon' => ['sometimes', 'nullable', 'string', function ($attribute, $value, $fail) {
                if ($value !== null && ! BlockCatalogue::hasIcon($value)) {
                    $fail(__('dossiers.erreur.icone-inconnue'));
                }
            }],
        ]);
    }

    private function parentFrom(Request $request, ?Folder $moving): ?Folder
    {
        $slug = $request->input('parent');
        if ($slug === null || $slug === '') {
            return null;
        }

        $parent = Folder::where('slug', $slug)
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        if ($moving && $moving->wouldCycle($parent)) {
            throw ValidationException::withMessages([
                'parent' => __('dossiers.erreur.boucle'),
            ]);
        }

        if ($parent->depth() >= Folder::MAX_DEPTH) {
            throw ValidationException::withMessages([
                'parent' => __('dossiers.erreur.trop-profond', ['max' => Folder::MAX_DEPTH]),
            ]);
        }

        return $parent;
    }

    private function owned(Request $request, Folder $folder): void
    {
        abort_unless($folder->user_id === $request->user()->id, 403);
    }
}
```

- [ ] **Step 4: Teach the catalogue to validate an icon name**

Add to `site/app/Services/BlockCatalogue.php`:

```php
    /**
     * Is `block/thorium-reactor` or `item/graphite` something `IconController` can draw?
     *
     * Here rather than in the controller because the catalogue is what knows, and because
     * the folder validation and the icon route must agree on the answer: two readings of
     * "does this exist" that can disagree is a broken image on a page that validated fine.
     */
    public static function hasIcon(string $name): bool
    {
        [$family, $thing] = array_pad(explode('/', $name, 2), 2, null);

        return match ($family) {
            'block' => $thing !== null && self::has($thing),
            'item', 'liquid' => $thing !== null && self::hasItem($thing),
            default => false,
        };
    }
```

Read `IconController` for the exact families and the existing lookup helpers before writing this, and reuse them rather than adding a parallel one. If `hasItem` does not exist under that name, use the one that does.

- [ ] **Step 5: Write the strings**

Create `site/lang/fr/dossiers.php`:

```php
<?php

return [
    'page' => [
        'les-miens' => 'Mes dossiers',
        'vide' => "Aucun dossier pour l'instant.",
        'contenu' => 'Ce que contient ce dossier',
        'retires' => 'schémas de ce dossier ne sont visibles que par toi',
    ],
    'gestion' => [
        'creer' => 'Nouveau dossier',
        'renommer' => 'Renommer',
        'icone' => 'Choisir une icône',
        'supprimer' => 'Supprimer le dossier',
    ],
    'erreur' => [
        'boucle' => 'Un dossier ne peut pas être rangé dans un de ses propres sous-dossiers.',
        'trop-profond' => 'Les dossiers ne peuvent pas être imbriqués sur plus de :max niveaux.',
        'icone-unknown' => 'Cette icône ne fait pas partie du catalogue.',
    ],
    'unite' => [
        'schemas' => 'schémas',
        'sous-dossiers' => 'sous-dossiers',
    ],
];
```

Note that `erreur.icone-unknown` above is wrong on purpose in this plan: the key used by the controller is `dossiers.erreur.icone-inconnue`. Fix it to match when you write the file, and let that be the reminder that a key is only correct if both sides spell it the same. The `unite` keys carry no placeholder, by the repository's rule.

- [ ] **Step 6: Add the routes**

```php
Route::get('/d/{folder}', [FolderController::class, 'show']);

Route::middleware('auth')->group(function () {
    Route::get('/mes-dossiers', [FolderController::class, 'mine']);
    Route::post('/api/dossiers', [FolderController::class, 'store'])->middleware('throttle:30,1');
    Route::patch('/api/dossiers/{folder}', [FolderController::class, 'update']);
    Route::delete('/api/dossiers/{folder}', [FolderController::class, 'destroy']);
});
```

`show` is written in Task 3; add its route there rather than leaving a route pointing at a method that does not exist.

- [ ] **Step 7: Run the tests, the suite, and commit**

```bash
cd site && php artisan test --filter=DossierGestionTest && php artisan test && vendor/bin/pint --test
cd .. && git rev-parse --abbrev-ref HEAD
git commit -m "feat(dossiers): make, move and delete a folder" -m "Deleting promotes the children instead of taking the subtree: a recursive
delete behind one button is how somebody loses a month of collecting." -- \
  site/app/Http/Controllers/FolderController.php site/app/Services/BlockCatalogue.php \
  site/lang/fr/dossiers.php site/routes/web.php \
  site/tests/Feature/DossierGestionTest.php
```

---

### Task 3: Showing a folder, and telling the truth about what it hides

**Files:**
- Create: `site/app/Http/Controllers/FolderItemController.php`
- Create: `site/resources/views/folders/show.blade.php`, `site/resources/views/folders/mine.blade.php`
- Modify: `site/routes/web.php`, `site/config/nav.php`, `site/public/index.html`
- Test: `site/tests/Feature/DossierPartageTest.php`

**Interfaces:**
- Consumes: `Folder`, `Schematic::listed()`, and the tile markup spec 1 leaves in `mine.blade.php`.
- Produces: `GET /d/{folder}`, `POST|DELETE /api/dossiers/{folder}/schemas/{schematic}`.

- [ ] **Step 1: Write the failing tests**

Create `site/tests/Feature/DossierPartageTest.php`:

```php
<?php

use App\Models\Folder;
use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * What a folder shows to somebody who is not its owner.
 *
 * The hard case is not the private folder, it is the public folder holding schematics the
 * visitor cannot see: listing them leaks names and figures, hiding them silently makes a
 * folder of twelve read as a folder of four with no explanation.
 */
it('cache un schema prive et dit combien il en a retire', function () {
    $owner = User::factory()->create();
    $folder = Folder::factory()->create([
        'user_id' => $owner->id, 'visibility' => Schematic::PUBLIC,
    ]);
    $folder->schematics()->attach([
        Schematic::factory()->create(['visibility' => Schematic::PUBLIC, 'name' => 'Visible'])->id,
        Schematic::factory()->create(['visibility' => Schematic::PRIVATE, 'name' => 'Cachee'])->id,
    ]);

    $page = $this->get("/d/{$folder->slug}")->assertOk();

    $page->assertSee('Visible')->assertDontSee('Cachee');
    expect($page->viewData('withheld'))->toBe(1);
});

it('previent le proprietaire que la moitie de son dossier est invisible', function () {
    $owner = User::factory()->create();
    $folder = Folder::factory()->create([
        'user_id' => $owner->id, 'visibility' => Schematic::PUBLIC,
    ]);
    $folder->schematics()->attach(
        Schematic::factory()->create(['visibility' => Schematic::PRIVATE])->id
    );

    $this->actingAs($owner)->get("/d/{$folder->slug}")
        ->assertOk()
        ->assertSee(__('dossiers.page.retires'));
});

it('refuse un dossier prive a tout le monde sauf son proprietaire', function () {
    $folder = Folder::factory()->create(['visibility' => Schematic::PRIVATE]);

    $this->get("/d/{$folder->slug}")->assertNotFound();
    $this->actingAs(User::factory()->create())->get("/d/{$folder->slug}")->assertNotFound();
    $this->actingAs($folder->user)->get("/d/{$folder->slug}")->assertOk();
});

it('sert un dossier par lien sans le lister nulle part', function () {
    $folder = Folder::factory()->create(['visibility' => Schematic::UNLISTED]);

    $this->get("/d/{$folder->slug}")->assertOk();
});

it('met un schema dans deux dossiers a la fois', function () {
    $user = User::factory()->create();
    $one = Folder::factory()->create(['user_id' => $user->id]);
    $two = Folder::factory()->create(['user_id' => $user->id]);
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    foreach ([$one, $two] as $folder) {
        $this->actingAs($user)
            ->postJson("/api/dossiers/{$folder->slug}/schemas/{$schema->slug}")
            ->assertCreated();
    }

    $this->actingAs($user)->deleteJson("/api/dossiers/{$one->slug}/schemas/{$schema->slug}");

    expect($one->refresh()->schematics)->toHaveCount(0)
        ->and($two->refresh()->schematics)->toHaveCount(1);
});

it('ne laisse personne remplir le dossier d un autre', function () {
    $folder = Folder::factory()->create();
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->actingAs(User::factory()->create())
        ->postJson("/api/dossiers/{$folder->slug}/schemas/{$schema->slug}")
        ->assertForbidden();
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd site && php artisan test --filter=DossierPartageTest`

- [ ] **Step 3: Write `FolderController::show`**

```php
    public function show(Request $request, Folder $folder): View
    {
        $mine = $request->user()?->id === $folder->user_id;
        abort_if($folder->visibility === Schematic::PRIVATE && ! $mine, 404);

        /* Counted on this folder's contents, before the exclusion, and not as the
           difference of two totals: a difference means two passes over the same set, and
           the figure has to be this folder's rather than the catalogue's. */
        $all = $folder->schematics();
        $withheld = $mine
            ? (clone $all)->where('schematics.visibility', Schematic::PRIVATE)->count()
            : (clone $all)->whereNot(fn ($q) => $q->listed())->count();

        return view('folders.show', [
            'folder' => $folder,
            'mine' => $mine,
            'children' => $folder->children()
                ->when(! $mine, fn ($q) => $q->where('visibility', Schematic::PUBLIC))
                ->withCount('schematics')->orderBy('name')->get(),
            'schematics' => $all->listed()->with(['user', 'items'])
                ->orderByDesc('folder_items.created_at')->paginate(24),
            'withheld' => $withheld,
            'ancestors' => array_reverse($folder->ancestors()),
        ]);
    }
```

Note the owner sees the same listing everybody else does, and is told separately what is
missing from it. Showing owners their private schematics inline would mean they never
discover that visitors cannot see them, which is the failure this whole section exists to
prevent.

- [ ] **Step 4: Write `FolderItemController`**

```php
<?php

namespace App\Http\Controllers;

use App\Models\Folder;
use App\Models\Schematic;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Putting a schematic into a folder, and taking it out. */
class FolderItemController extends Controller
{
    public function store(Request $request, Folder $folder, Schematic $schematic): JsonResponse
    {
        abort_unless($folder->user_id === $request->user()->id, 403);

        // A folder may hold anybody's schematic, which is the point, but only one it could
        // be shown: putting somebody else's private plan in a folder would be a way to
        // learn it exists.
        abort_unless($schematic->visibility !== Schematic::PRIVATE
            || $schematic->user_id === $request->user()->id, 404);

        $added = $folder->schematics()->syncWithoutDetaching([$schematic->id]);

        return response()->json(['dans' => true], $added['attached'] ? 201 : 200);
    }

    public function destroy(Request $request, Folder $folder, Schematic $schematic): JsonResponse
    {
        abort_unless($folder->user_id === $request->user()->id, 403);

        $folder->schematics()->detach($schematic->id);

        return response()->json(['dans' => false]);
    }
}
```

- [ ] **Step 5: Write the two views**

`folders/show.blade.php`: the breadcrumb from `$ancestors`, the folder's icon through
`/icone/{{ $folder->icon }}.png` when set, its name and description, then the child folders,
then the schematics as tiles copied from `mine.blade.php` as spec 1 leaves it.

When `$withheld > 0`, a line above the tiles. Two wordings, because they answer two
questions: to a visitor, how many this page is not showing; to the owner,
`{{ $withheld }} {{ __('dossiers.page.retires') }}`, which tells them their shared folder is
half invisible.

`folders/mine.blade.php`: the root folders as cards with icon, name, and the two counts
from `withCount`, plus the create control.

- [ ] **Step 6: Routes and navigation**

Add the `show` route from Task 2 step 6, the two item routes, and in `config/nav.php` under
the schematics menu:

```php
        ['key' => 'nav.menu.dossiers', 'href' => '/mes-dossiers', 'ready' => true, 'auth' => true],
```

`'ready' => true` here, unlike spec 1's favorites entry: this task creates the page in the
same commit, so there is no window where the menu points at a 404. Mirror it by hand into
`site/public/index.html` or `NavigationTest` fails.

- [ ] **Step 7: Run everything and commit**

```bash
cd site && php artisan test && vendor/bin/pint --test
cd .. && git rev-parse --abbrev-ref HEAD
git commit -m "feat(dossiers): show a folder and what it withholds" -m "A public folder holding private schematics must neither leak them nor read
as a folder of four when it holds twelve. The owner is told separately, or
they never learn their shared folder is half invisible." -- \
  site/app/Http/Controllers/FolderController.php \
  site/app/Http/Controllers/FolderItemController.php \
  site/resources/views/folders/ site/routes/web.php \
  site/config/nav.php site/public/index.html site/lang/fr/dossiers.php \
  site/tests/Feature/DossierPartageTest.php
```

---

### Task 4: The card Discord unfurls

**Files:**
- Create: `site/app/Services/Cards/FolderCard.php`, `site/app/Http/Controllers/FolderCardController.php`
- Modify: `site/routes/web.php`, `site/resources/views/folders/show.blade.php`
- Test: `site/tests/Feature/DossierCarteTest.php`

**Interfaces:**
- Consumes: `Services/Cards/Card.php` and whatever `SchematicCard` and `BlockCard` share.
- Produces: `GET /d/{folder}/carte.jpg`.

- [ ] **Step 1: Read the two cards that exist**

Read `site/app/Services/Cards/Card.php`, `SchematicCard.php` and `BlockCard.php` before
writing anything. `FolderCard` is the third of a family; the shape, the dimensions, the
fonts and the caching all already exist and are not to be re-decided here.

- [ ] **Step 2: Write the failing test**

```php
it('rend une carte de dossier a la taille des autres', function () {
    $folder = Folder::factory()->create(['visibility' => Schematic::PUBLIC]);

    $answer = $this->get("/d/{$folder->slug}/carte.jpg")->assertOk();

    expect($answer->headers->get('content-type'))->toBe('image/jpeg');
    [$width, $height] = getimagesizefromstring($answer->streamedContent());
    expect($width)->toBe(1200)->and($height)->toBe(630);
});

it('ne rend pas la carte d un dossier prive', function () {
    $folder = Folder::factory()->create(['visibility' => Schematic::PRIVATE]);

    $this->get("/d/{$folder->slug}/carte.jpg")->assertNotFound();
});
```

Take 1200 by 630 from whatever `SchematicCard` actually uses; if it differs, the test
asserts that value and this plan is wrong about the number, not about the check.

- [ ] **Step 3: Write the card and its route**

It carries the folder's name, its icon, the count of schematics, and up to four thumbnails.
A folder with no schematics still renders, with its name and a zero, because a link that
404s in Discord is worse than a plain card.

The `og:image` meta in `folders/show.blade.php` points at it, on the pattern of
`schematic.blade.php`.

- [ ] **Step 4: Run everything and commit**

```bash
cd site && php artisan test && vendor/bin/pint --test
cd .. && git rev-parse --abbrev-ref HEAD
git commit -m "feat(dossiers): give a folder link a preview" -m "Sharing happens in Discord, and a link with no preview does not get
clicked. Third of the card family, so nothing about its shape is re-decided." -- \
  site/app/Services/Cards/FolderCard.php \
  site/app/Http/Controllers/FolderCardController.php \
  site/routes/web.php site/resources/views/folders/show.blade.php \
  site/tests/Feature/DossierCarteTest.php
```

---

### Task 5: The browser side

**Files:**
- Create: `site/public/forge/folders.js`
- Modify: `site/resources/views/schematic.blade.php`, `site/public/forge/lang/fr.json`, `site/public/forge/forge.css`, `site/resources/views/layout.blade.php`

- [ ] **Step 1: Write the module**

On the pattern of `manage.js` and spec 1's `keep.js`: one listener for the page, the
`XSRF-TOKEN` cookie, every word from the dictionary. It handles creating a folder, renaming
in place, picking an icon from a grid of catalogue names, and the "put this schematic in a
folder" control on `/s/{slug}`.

The icon picker is a list of names the page already carries, rendered as `<img>` tags
against `/icone/...`. No search over the whole catalogue in the first version: the twenty or
so items and the commonest blocks cover what a folder is named after.

- [ ] **Step 2: Add the control to a schematic's page**

A single button next to the like and the favorite, opening the list of one's own folders
with a checkbox each. A schematic can be in several, so checkboxes and not a select.

- [ ] **Step 3: Run the suite, check the page by hand, commit**

---

### Task 6: Prove it against the running site

- [ ] **Step 1: Checksum**

`sha256sum site/public/forge/blocks.json`, identical to the value taken before Task 1.

- [ ] **Step 2: Everything**

```bash
cd site && php artisan test && vendor/bin/pint --test
cd .. && npm test
```

- [ ] **Step 3: Look at it, signed in and signed out**

- a folder three deep shows a breadcrumb that fits, and each crumb goes where it says;
- deleting the middle folder leaves the deepest one reachable, one level up;
- a public folder holding one private schematic shows one tile and says one is withheld, and
  the owner sees the same page plus the warning;
- an unlisted folder opens on its address and appears in no listing;
- the icon picked shows on the folder, on `/mes-dossiers`, and on the card;
- paste `/d/{slug}` into Discord and look at the unfurl;
- the whole of the above with JavaScript disabled: navigation and reading still work, only
  the editing controls are gone.

- [ ] **Step 4: Open the pull request**

```bash
git rev-parse --abbrev-ref HEAD
git push -u origin feat/dossiers
gh pr create --fill
```

## Self-review against the spec

- Tree with `parent_id`, one level at a time, no recursive query: Task 1.
- Cycle guard and depth cap of 5, both refused with a reason: Tasks 1 and 2.
- Icon from the catalogue, validated, never an upload: Task 2 steps 3 and 4.
- Visibility reusing the schematic's three values: Task 1 migration, Task 3 tests.
- A folder's visibility independent of its parent's: Task 3, `show` checks only its own.
- Withheld count, on the filtered query, with the owner warned: Task 3 step 3.
- Delete promotes children: Task 2 step 3, two tests for the two outcomes.
- A schematic in several folders: Task 3 test.
- Card for Discord, third of the family: Task 4.
- Language file of its own, units outside placeholders: Task 2 step 5.
- Nothing in `EngineVersion`: Task 6 step 1.
- Out of scope and not smuggled in: no hand ordering, no folder likes (spec 4), no notes
  (spec 3), no collaborative folders, no copying somebody else's folder.
