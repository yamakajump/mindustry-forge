<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BlockCardController;
use App\Http\Controllers\BlockController;
use App\Http\Controllers\BrowseController;
use App\Http\Controllers\CompareController;
use App\Http\Controllers\ContributionController;
use App\Http\Controllers\FavoriteController;
use App\Http\Controllers\HomeController;
use App\Http\Controllers\IconController;
use App\Http\Controllers\LikeController;
use App\Http\Controllers\ModerationController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\SchematicController;
use App\Http\Controllers\SchematicSearchController;
use App\Http\Controllers\SocialCardController;
use Illuminate\Http\Request;
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
Route::get('/', [HomeController::class, 'show']);

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

/*
 * The catalogue.
 *
 * `/schemas` and not `/schematiques`, because the game's own French bundle says `Schema`
 * and a player never meets the other word in their game.
 *
 * The old address answers a permanent redirect that CARRIES THE QUERY STRING. Laravel's
 * `Route::redirect` would not: its `RedirectController` rebuilds the target from the route
 * parameters and drops everything after the `?`. A shared link to
 * `/schematiques?produit=silicon&tri=best&page=3` would then land on an unfiltered first
 * page, answering 200 with a plausible result to a question nobody asked, which is the
 * defect this repository has logged six times. `SchemaRedirectTest` asserts the target and
 * not merely the status, because a redirect that loses its filters still redirects.
 */
Route::get('/schemas', [BrowseController::class, 'index']);
Route::get('/schematiques', fn (Request $request) => redirect(
    '/schemas'.($request->getQueryString() ? '?'.$request->getQueryString() : ''), 301
));

/* The same move for the member's own list, and outside the `auth` group on purpose: a
   redirect has nothing to authenticate. Inside it, a signed-out visitor following an old
   link would be sent to Discord and land on the login's own destination, losing the address
   they asked for. */
Route::get('/mes-schematiques', fn () => redirect('/mes-schemas', 301));
Route::get('/s/{schematic}', [SchematicController::class, 'show']);

/* A member's page. Accounts only: the imported catalogue credits author names with no
   account behind them, and a page each would be thousands of near empty pages that let
   anybody claim a name that is not theirs. */
Route::get('/u/{user}', [ProfileController::class, 'show']);

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

/* Names while somebody types them, for the comparison page's two slots.
 *
 * Declared above `/api/schematiques/{schematic}`, and it has to stay there: route binding
 * matches in order, so the other way round `recherche` would be read as a slug and answer
 * 404 for ever. */
Route::get('/api/schematiques/recherche', SchematicSearchController::class);

/* The string itself, so the analyser can pull one in from a shared link. Plain text and
   nothing else: this is a public schematic, and everything else about it is on its page. */
Route::get('/api/schematiques/{schematic}/code', [SchematicController::class, 'code']);

/* Everything the analyser needs to reopen one, including what its author marked by hand.
   Stored from the first day and never read back. */
Route::get('/api/schematiques/{schematic}', [SchematicController::class, 'read']);

Route::middleware('auth')->group(function () {
    Route::get('/mes-schemas', [SchematicController::class, 'mine']);

    /* Mes favoris : le catalogue avec le filtre deja arme, et non une seconde liste.
     *
     * Une page a part aurait eu sa propre requete, donc une deuxieme implementation de
     * « lister des schemas », ce que la premiere regle du depot interdit. Le cout ne se voit
     * pas le premier jour : il se voit quand la vitrine sait filtrer par encombrement, par
     * planete et par debit minimum, et qu'une liste de quatre-vingts favoris ne sait rien
     * faire de tout ca. Ici elle herite de tout, y compris de ce que personne n'a encore
     * imagine.
     *
     * L'adresse est `/mes-favoris` et non `/favoris`, par parite avec `/mes-schemas` : le
     * « mes » dit que la liste est personnelle avant meme qu'elle s'affiche. */
    Route::get('/mes-favoris', fn (Request $request) => app(BrowseController::class)
        ->index($request->merge(['favoris' => 'oui'])));
    Route::post('/api/schematiques', [SchematicController::class, 'store']);
    Route::patch('/api/schematiques/{schematic}', [SchematicController::class, 'update']);
    Route::delete('/api/schematiques/{schematic}', [SchematicController::class, 'destroy']);

    /* The public gesture, and the private one beside it.
     *
     * Throttled because they are the cheapest requests on the site to repeat: the unique
     * constraint stops a second press counting twice, but not from arriving.
     *
     * The address keeps `schematiques` while the pages moved to `/schemas`, deliberately.
     * A machine address carries no word a player reads, and the model binding hangs off
     * this exact segment, so renaming it would buy a redirect and cost a binding. */
    Route::post('/api/schematiques/{schematic}/aime', [LikeController::class, 'store'])
        ->middleware('throttle:60,1');
    Route::delete('/api/schematiques/{schematic}/aime', [LikeController::class, 'destroy'])
        ->middleware('throttle:60,1');

    Route::post('/api/schematiques/{schematic}/favori', [FavoriteController::class, 'store'])
        ->middleware('throttle:60,1');
    Route::delete('/api/schematiques/{schematic}/favori', [FavoriteController::class, 'destroy'])
        ->middleware('throttle:60,1');
    /* Saying that something does not belong here. Signed in, because a report from nobody
       cannot be weighed, cannot be answered, and costs its author nothing to repeat. */
    Route::post('/api/signalements', [ReportController::class, 'store']);

    /* The queue. Behind `auth` like everything else here, and it answers 404 rather than
       403 to anybody who is not a moderator: a page that says "forbidden" tells a stranger
       it exists. */
    /* Saying where somebody else's schematic is fed, which is the one thing that turns a
       ceiling into a throughput and the reason all the rest of this exists. */
    Route::post('/api/contributions', [ContributionController::class, 'store']);
    Route::post('/api/contributions/{contribution}/vote', [ContributionController::class, 'vote']);

    Route::get('/moderation', [ModerationController::class, 'index']);
    Route::post('/moderation/decision', [ModerationController::class, 'decide']);
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
