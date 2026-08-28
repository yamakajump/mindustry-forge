# Notes implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private note on a schematic, and a caption saying why a schematic is in a folder.

**Architecture:** One table for the private note, one nullable column on `folder_items` for the caption. Plain escaped text, no markup. Both are small; the care goes into never confusing which one the reader is looking at.

**Tech Stack:** Laravel 12, Pest, Blade, vanilla ES modules, Pint.

The design this implements: `docs/plans/2026-08-28-notes-design.md`.

## Global Constraints

- **Starts after the folders plan is merged** (`2026-08-28-folders-plan.md`), because the caption is a column on a table that plan creates.
- **"Schema" is masculine** in every string.
- **Conventional commits in English**, imperative subject, 50 characters, body says why.
- **No em dash anywhere.**
- **Commit with `git commit -m "..." -- <paths>`**, check `git rev-parse --abbrev-ref HEAD` first, and work in a `git worktree` of your own.
- **Nothing enters `EngineVersion`**; `blocks.json` checksum unchanged.
- **Never `{!! !!}` on either field.** The caption is user content shown to other people, and it is the one place in these four specs where an escape decides whether the site is safe.
- **`php artisan test` and `vendor/bin/pint --test` pass at every commit.**

## File structure

| File | Its one responsibility |
|---|---|
| `site/database/migrations/..._create_schematic_notes_table.php` | The private note |
| `site/database/migrations/..._add_note_to_folder_items_table.php` | The caption column |
| `site/app/Models/SchematicNote.php` | One person's note on one schematic |
| `site/app/Http/Controllers/NoteController.php` | Writing and clearing the private note |
| `site/resources/views/partials/note.blade.php` | The field, on the schematic page |
| `site/public/forge/notes.js` | Saving without a page reload |
| `site/app/Http/Controllers/FolderItemController.php` | *(modified)* the caption |

---

### Task 1: The private note

**Files:**
- Create: `site/database/migrations/2026_09_10_100000_create_schematic_notes_table.php`
- Create: `site/app/Models/SchematicNote.php`, `site/app/Http/Controllers/NoteController.php`
- Modify: `site/routes/web.php`, `site/lang/fr/schema.php`
- Test: `site/tests/Feature/NotePriveeTest.php`

**Interfaces:**
- Consumes: `Schematic` (route key `slug`), `User`.
- Produces: `SchematicNote`, `PUT /api/schematiques/{schematic}/note` answering `{"note": string|null}`.

- [ ] **Step 1: Write the failing tests**

```php
<?php

use App\Models\Schematic;
use App\Models\SchematicNote;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * The one thing on this site that is nobody else's business.
 *
 * So the test that matters is not that it saves, it is that somebody else's note is
 * invisible and that asking for it is a 404 rather than a 403: a 403 confirms it exists.
 */
it('ecrit une note et la remplace au lieu d en empiler deux', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->putJson("/api/schematiques/{$schema->slug}/note", [
        'body' => 'Chauffe si on le nourrit a fond',
    ])->assertOk();

    $this->actingAs($user)->putJson("/api/schematiques/{$schema->slug}/note", [
        'body' => 'Remplace les convoyeurs par des titanes',
    ])->assertOk();

    expect(SchematicNote::count())->toBe(1)
        ->and(SchematicNote::first()->body)->toBe('Remplace les convoyeurs par des titanes');
});

it('supprime la note quand le corps est vide', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)->putJson("/api/schematiques/{$schema->slug}/note", ['body' => 'Quelque chose']);
    $this->actingAs($user)->putJson("/api/schematiques/{$schema->slug}/note", ['body' => '   '])->assertOk();

    // Vide veut dire pas de note, pas une note vide : sinon "a une note" a deux reponses.
    expect(SchematicNote::count())->toBe(0);
});

it('refuse mille un caracteres et accepte mille', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();

    $this->actingAs($user)
        ->putJson("/api/schematiques/{$schema->slug}/note", ['body' => str_repeat('a', 1001)])
        ->assertStatus(422);

    $this->actingAs($user)
        ->putJson("/api/schematiques/{$schema->slug}/note", ['body' => str_repeat('a', 1000)])
        ->assertOk();
});

it('ne montre pas la note d un autre sur la meme page', function () {
    $author = User::factory()->create();
    $other = User::factory()->create();
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->actingAs($author)->putJson("/api/schematiques/{$schema->slug}/note", [
        'body' => 'Secret de fabrication',
    ]);

    $this->actingAs($other)->get("/s/{$schema->slug}")
        ->assertOk()
        ->assertDontSee('Secret de fabrication');
});

it('emporte les notes quand le schema disparait', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create();
    $this->actingAs($user)->putJson("/api/schematiques/{$schema->slug}/note", ['body' => 'Note']);

    $schema->delete();

    expect(SchematicNote::count())->toBe(0);
});

it('refuse un visiteur qui n est pas connecte', function () {
    $schema = Schematic::factory()->create();

    $this->putJson("/api/schematiques/{$schema->slug}/note", ['body' => 'Note'])
        ->assertUnauthorized();
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd site && php artisan test --filter=NotePriveeTest`

- [ ] **Step 3: Migration**

```php
Schema::create('schematic_notes', function (Blueprint $table) {
    $table->id();
    $table->foreignId('user_id')->constrained()->cascadeOnDelete();
    $table->foreignId('schematic_id')->constrained()->cascadeOnDelete();
    $table->text('body');
    $table->timestamps();

    // One note per person per schematic. It is a memory, replaced in place, not a thread.
    $table->unique(['user_id', 'schematic_id']);
});
```

- [ ] **Step 4: Model and controller**

```php
class SchematicNote extends Model
{
    protected $fillable = ['user_id', 'schematic_id', 'body'];
}
```

```php
/**
 * The private note, written and cleared in one verb.
 *
 * `PUT` rather than `POST` and `DELETE`: there is at most one note, its address is known
 * before it exists, and writing it twice must leave one. That is what PUT means, and it
 * saves the browser from knowing whether it is creating or replacing.
 */
class NoteController extends Controller
{
    public function put(Request $request, Schematic $schematic): JsonResponse
    {
        $body = trim((string) $request->validate([
            'body' => ['present', 'nullable', 'string', 'max:1000'],
        ])['body']);

        $keys = ['user_id' => $request->user()->id, 'schematic_id' => $schematic->id];

        if ($body === '') {
            SchematicNote::where($keys)->delete();

            return response()->json(['note' => null]);
        }

        SchematicNote::updateOrCreate($keys, ['body' => $body]);

        return response()->json(['note' => $body]);
    }
}
```

Route, inside the `auth` group:

```php
    Route::put('/api/schematiques/{schematic}/note', [NoteController::class, 'put'])
        ->middleware('throttle:60,1');
```

- [ ] **Step 5: The field on the schematic page**

Create `site/resources/views/partials/note.blade.php`, included from `schematic.blade.php`
inside `@auth`, and pass the current note from `SchematicController::show`:

```php
        $note = $request->user()
            ? SchematicNote::where('user_id', $request->user()->id)
                ->where('schematic_id', $schematic->id)->value('body')
            : null;
```

```blade
{{-- Private, and it says so above the field rather than in a tooltip: a page that carries
     two kinds of note must tell the reader which one they are typing into. --}}
<section class="note-privee" data-slug="{{ $schematic->slug }}">
  <h2>{{ __('schema.note.titre') }}</h2>
  <p class="hint">{{ __('schema.note.qui-la-voit') }}</p>
  <textarea maxlength="1000" aria-describedby="note-compte">{{ $note }}</textarea>
  <p id="note-compte" class="compte"></p>
  <button type="button" data-note-save>{{ __('schema.note.enregistrer') }}</button>
</section>
```

Strings in `site/lang/fr/schema.php`:

```php
    'note' => [
        'titre' => 'Ma note',
        'qui-la-voit' => 'Personne d\'autre que toi ne la voit.',
        'enregistrer' => 'Enregistrer',
        'enregistree' => 'Note enregistrée',
    ],
```

The live character count is written by JavaScript and its number never goes through a
placeholder: `${used} / 1000`, built in the module, not in the dictionary.

- [ ] **Step 6: The module**

`site/public/forge/notes.js`, on the pattern of `manage.js`: one listener, the `XSRF-TOKEN`
cookie, words from the dictionary, and an `input` listener updating the count. Saving is not
optimistic here, unlike the like: text somebody typed must not appear saved until it is.

- [ ] **Step 7: Run everything and commit**

```bash
cd site && php artisan test && vendor/bin/pint --test
cd .. && git rev-parse --abbrev-ref HEAD
git commit -m "feat(schemas): keep a private note on a schema" -m "PUT rather than POST and DELETE: there is at most one note, and writing it
twice has to leave one. An empty body deletes, so that having a note is one
question with one answer." -- \
  site/database/migrations/2026_09_10_100000_create_schematic_notes_table.php \
  site/app/Models/SchematicNote.php site/app/Http/Controllers/NoteController.php \
  site/app/Http/Controllers/SchematicController.php \
  site/resources/views/partials/note.blade.php site/resources/views/schematic.blade.php \
  site/public/forge/notes.js site/public/forge/lang/fr.json \
  site/lang/fr/schema.php site/routes/web.php \
  site/tests/Feature/NotePriveeTest.php
```

---

### Task 2: The folder caption

**Files:**
- Create: `site/database/migrations/2026_09_10_101000_add_note_to_folder_items_table.php`
- Modify: `site/app/Http/Controllers/FolderItemController.php`, `site/resources/views/folders/show.blade.php`, `site/lang/fr/dossiers.php`, `site/routes/web.php`
- Test: `site/tests/Feature/LegendeDossierTest.php`

**Interfaces:**
- Consumes: `Folder`, `folder_items` from the folders plan.
- Produces: `PATCH /api/dossiers/{folder}/schemas/{schematic}` taking `{"note": string|null}`.

- [ ] **Step 1: Write the failing tests**

```php
<?php

use App\Models\Folder;
use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('montre la legende a qui voit le dossier', function () {
    $owner = User::factory()->create();
    $folder = Folder::factory()->create(['user_id' => $owner->id, 'visibility' => Schematic::PUBLIC]);
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $folder->schematics()->attach($schema->id);

    $this->actingAs($owner)->patchJson(
        "/api/dossiers/{$folder->slug}/schemas/{$schema->slug}",
        ['note' => 'Commence par celui-la']
    )->assertOk();

    $this->get("/d/{$folder->slug}")->assertOk()->assertSee('Commence par celui-la');
});

it('n autorise que le proprietaire du dossier a legender', function () {
    $folder = Folder::factory()->create(['visibility' => Schematic::PUBLIC]);
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $folder->schematics()->attach($schema->id);

    $this->actingAs(User::factory()->create())->patchJson(
        "/api/dossiers/{$folder->slug}/schemas/{$schema->slug}",
        ['note' => 'Pas chez moi']
    )->assertForbidden();
});

it('refuse deux cent quatre vingt un caracteres', function () {
    $owner = User::factory()->create();
    $folder = Folder::factory()->create(['user_id' => $owner->id]);
    $schema = Schematic::factory()->create();
    $folder->schematics()->attach($schema->id);

    $this->actingAs($owner)->patchJson(
        "/api/dossiers/{$folder->slug}/schemas/{$schema->slug}",
        ['note' => str_repeat('a', 281)]
    )->assertStatus(422);
});

it('echappe une legende qui contient du html', function () {
    $owner = User::factory()->create();
    $folder = Folder::factory()->create(['user_id' => $owner->id, 'visibility' => Schematic::PUBLIC]);
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $folder->schematics()->attach($schema->id);

    $this->actingAs($owner)->patchJson(
        "/api/dossiers/{$folder->slug}/schemas/{$schema->slug}",
        ['note' => '<script>alert(1)</script>']
    );

    $this->get("/d/{$folder->slug}")
        ->assertOk()
        ->assertDontSee('<script>alert(1)</script>', false)
        ->assertSee('&lt;script&gt;', false);
});

it('oublie la legende quand le schema sort du dossier, et garde la note privee', function () {
    $owner = User::factory()->create();
    $folder = Folder::factory()->create(['user_id' => $owner->id]);
    $schema = Schematic::factory()->create();
    $folder->schematics()->attach($schema->id, ['note' => 'Une legende']);
    $this->actingAs($owner)->putJson("/api/schematiques/{$schema->slug}/note", ['body' => 'Ma note']);

    $this->actingAs($owner)->deleteJson("/api/dossiers/{$folder->slug}/schemas/{$schema->slug}");

    expect(App\Models\SchematicNote::count())->toBe(1)
        ->and($folder->refresh()->schematics)->toHaveCount(0);
});
```

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: Migration and controller**

```php
Schema::table('folder_items', function (Blueprint $table) {
    /* A column and not a table: a table of captions would have exactly the same key as
       this row and need a join to say anything, which is the definition of a column. */
    $table->text('note')->nullable();
});
```

Add to `FolderItemController`, and add `withPivot(['created_at', 'note'])` to
`Folder::schematics()`:

```php
    public function update(Request $request, Folder $folder, Schematic $schematic): JsonResponse
    {
        abort_unless($folder->user_id === $request->user()->id, 403);

        $note = trim((string) $request->validate([
            'note' => ['present', 'nullable', 'string', 'max:280'],
        ])['note']);

        $folder->schematics()->updateExistingPivot($schematic->id, [
            'note' => $note === '' ? null : $note,
        ]);

        return response()->json(['note' => $note === '' ? null : $note]);
    }
```

- [ ] **Step 4: Show it, under the tile**

In `folders/show.blade.php`, under each tile, and **with `{{ }}`, never `{!! !!}`**:

```blade
        @if($schematic->pivot->note)
          <p class="legende">{{ $schematic->pivot->note }}</p>
        @endif
        @if($mine)
          <button type="button" class="link" data-legende
                  data-schema="{{ $schematic->slug }}">{{ __('dossiers.legende.editer') }}</button>
        @endif
```

Strings into `site/lang/fr/dossiers.php` under a `legende` key, and the editing control into
`folders.js` from the folders plan rather than a module of its own.

- [ ] **Step 5: Run everything and commit**

```bash
cd site && php artisan test && vendor/bin/pint --test
cd .. && git rev-parse --abbrev-ref HEAD
git commit -m "feat(dossiers): caption why a schema is in a folder" -m "The caption belongs to the folder, not the schema: the same plan is the one
to start with in a beginner's folder and the fallback in somebody else's." -- \
  site/database/migrations/2026_09_10_101000_add_note_to_folder_items_table.php \
  site/app/Http/Controllers/FolderItemController.php site/app/Models/Folder.php \
  site/resources/views/folders/show.blade.php site/public/forge/folders.js \
  site/lang/fr/dossiers.php site/public/forge/lang/fr.json site/routes/web.php \
  site/tests/Feature/LegendeDossierTest.php
```

---

### Task 3: Prove it against the running site

- [ ] **Step 1:** `sha256sum site/public/forge/blocks.json`, unchanged.
- [ ] **Step 2:** `php artisan test`, `vendor/bin/pint --test`, `npm test`, all green.
- [ ] **Step 3: Look at it**, signed in as two different accounts:

- the private note saves, survives a reload, and the count moves as you type;
- the second account opens the same schematic and sees an empty field, not yours;
- a caption shows under the tile in a folder, to a signed-out visitor too;
- the page says clearly which note is which, without having to click anything;
- a caption of 280 characters does not break the tile grid.

- [ ] **Step 4:** push and `gh pr create --fill`.

## Self-review against the spec

- Two notes, two storages, two surfaces, named differently on screen: Tasks 1 and 2.
- One row per person per schematic, replaced in place: Task 1 step 3, tested.
- Empty body deletes: Task 1, tested.
- 1000 and 280 characters, server side and live in the field: Tasks 1 and 2, tested.
- Escaped, no markup, never `{!! !!}`: Task 2 step 4, tested against a script tag.
- Somebody else's private note invisible: Task 1, tested.
- Removing from a folder drops the caption and keeps the private note: Task 2, tested.
- Out of scope: no comments, no replies, no note in any card, meta tag or listing.
