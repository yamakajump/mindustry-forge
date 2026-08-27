<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BlockCardController;
use App\Http\Controllers\BlockController;
use App\Http\Controllers\BrowseController;
use App\Http\Controllers\CompareController;
use App\Http\Controllers\IconController;
use App\Http\Controllers\SchematicController;
use App\Http\Controllers\SocialCardController;
use Illuminate\Support\Facades\Route;

/*
 * The analyser computes nothing on the server, and stays that way: the reading, the graph
 * and the bottleneck all happen in the visitor's browser. Everything else here is what a
 * server is actually for, which is remembering things and letting other people see them.
 *
 * It does go through PHP, though, and this line is the proof. An earlier wording said the
 * page "needs no server, so it does not get one", which reads as a fact and is not one:
 * Laravel boots on every hit of `/`, and the response carries a session cookie. Somebody
 * planning work on the home page believed it, and weighed a cost that did not exist.
 * A comment that states an intention in the present tense will be read as a measurement.
 */
Route::get('/', fn () => response()->file(public_path('index.html')));

/*
 * The editor, which is the same page.
 *
 * It mounts full screen over the analyser, so it had no address of its own and nothing
 * could point at it: eleven modules in production and not one link to them. The page reads
 * its own path on load to know which of the two to open.
 *
 * A route rather than a `#editer` fragment: a fragment never reaches the server, so it
 * cannot be shared in a Discord thread and cannot be indexed.
 */
Route::get('/editer', fn () => response()->file(public_path('index.html')));

/*
 * The logic editor, a static page of its own rather than a mode of the analyser.
 *
 * A route rather than the file served as it lies: nginx looks for `index.html` in no
 * directory at all, so `/outils/logique/` would answer nothing, and `/outils/logique.html`
 * is an address nobody wants to still be honouring in ten years.
 */
Route::get('/outils/logique', fn () => response()->file(public_path('outils/logique.html')));

/*
 * The factory planner, the analysis run backwards.
 *
 * Static like the logic editor and for the same reason: it needs no server. It reads the
 * catalogue the bench dumped and unrolls a recipe chain in the visitor's browser, which is
 * the same arithmetic the analyser runs and has no business being a second implementation
 * behind an endpoint.
 */
Route::get('/outils/planificateur', fn () => response()->file(public_path('outils/planificateur.html')));

Route::get('/auth/discord', [AuthController::class, 'start'])->name('login');
Route::get('/auth/discord/callback', [AuthController::class, 'callback']);
Route::post('/deconnexion', [AuthController::class, 'logout']);

Route::get('/schematiques', [BrowseController::class, 'index']);
Route::get('/s/{schematic}', [SchematicController::class, 'show']);

/*
 * Two schematics side by side, which is the question the catalogue creates.
 *
 * Both come in as query parameters rather than as path segments: the page is reachable and
 * useful with neither, with one, or with both, and an address whose meaning changes with
 * how much of it is filled in is an address that has to be a query.
 */
Route::get('/comparer', [CompareController::class, 'index']);

/* What Discord shows when the link above is pasted. An address of its own rather than the
   raw preview: a plan is square or very long depending on what was copied, and an unfurler
   crops it without saying so. The card is always the shape they expect, and it carries the
   name, the figures and the mark. */
Route::get('/s/{schematic}/carte.jpg', [SocialCardController::class, 'show']);

/*
 * The block wiki, one page per block, rendered from the catalogue the bench dumped.
 *
 * No language prefix, deliberately. One language is shipped, so prefixing every route in
 * the site would be paying now for a need nobody has yet; the day a second language lands,
 * the prefix goes on the whole site at once, with redirects, as a job of its own. Decided
 * with the pilot on 27/08 rather than left to whichever route was written first.
 */
Route::get('/blocs', [BlockController::class, 'index']);
Route::get('/blocs/{name}', [BlockController::class, 'show']);

/* The thumbnail the page above unfurls into. Two hundred and fifty-four pages all shared
   the site's generic image, so every block link looked like every other one. */
Route::get('/blocs/{name}/carte.jpg', [BlockCardController::class, 'show']);

/* One block's or one item's picture, for the pages that put names in a list. The sprite
   sheet the analyser draws with weighs 1.28 MB; the same ten icons cut out weigh 8 kB.

   Deliberately not under /forge/, where it would have been the obvious place. The vhost
   serves that prefix as static files with `try_files $uri =404`, and the regex block above
   it only rescues js, css and json: a .png that is not on disk would answer 404 in
   production without ever reaching PHP, while working perfectly behind `artisan serve`,
   which routes everything. */
Route::get('/icone/{family}/{name}.png', [IconController::class, 'show'])
    ->where('name', '[a-z0-9-]+');

/* The string itself, so the analyser can pull one in from a shared link. Plain text and
   nothing else: this is a public schematic, and everything else about it is on its page. */
Route::get('/api/schematiques/{schematic}/code', [SchematicController::class, 'code']);

/* Everything the analyser needs to reopen one, including what its author marked by hand.
   Stored from the first day and never read back. */
Route::get('/api/schematiques/{schematic}', [SchematicController::class, 'read']);

Route::middleware('auth')->group(function () {
    Route::get('/mes-schematiques', [SchematicController::class, 'mine']);
    Route::post('/api/schematiques', [SchematicController::class, 'store']);
    Route::patch('/api/schematiques/{schematic}', [SchematicController::class, 'update']);
    Route::delete('/api/schematiques/{schematic}', [SchematicController::class, 'destroy']);
});

/*
 * Who is signed in, for the static analyser page.
 *
 * Wrapped in a key rather than answered with a bare null: `response()->json(null)` writes
 * `{}`, and an empty object is truthy in a browser, so the page cheerfully rendered a
 * signed-in header for nobody and put "undefined" where a name goes.
 */
Route::get('/api/moi', fn () => response()->json([
    'user' => auth()->user()
        ? ['name' => auth()->user()->name, 'avatar' => auth()->user()->avatar]
        : null,
]));
