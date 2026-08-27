<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BlockController;
use App\Http\Controllers\BrowseController;
use App\Http\Controllers\SchematicController;
use Illuminate\Support\Facades\Route;

/*
 * The analyser itself is a static page and stays one: it needs no server, so it does not
 * get one. Everything here is what a server is actually for, which is remembering things
 * and letting other people see them.
 */
Route::get('/', fn () => response()->file(public_path('index.html')));

/*
 * L'éditeur, qui est la même page.
 *
 * Il se monte en plein écran par-dessus l'analyseur, donc il n'avait pas d'adresse à lui
 * et rien ne pouvait pointer dessus : onze modules en production, aucun lien vers eux. La
 * page lit son propre chemin au chargement pour savoir lequel des deux ouvrir.
 *
 * Une route plutôt qu'un fragment `#editer` : un fragment ne part pas au serveur, donc il
 * ne se partage pas dans un fil Discord et ne s'indexe pas.
 */
Route::get('/editer', fn () => response()->file(public_path('index.html')));

Route::get('/auth/discord', [AuthController::class, 'start'])->name('login');
Route::get('/auth/discord/callback', [AuthController::class, 'callback']);
Route::post('/deconnexion', [AuthController::class, 'logout']);

Route::get('/schematiques', [BrowseController::class, 'index']);
Route::get('/s/{schematic}', [SchematicController::class, 'show']);

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
