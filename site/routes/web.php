<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BrowseController;
use App\Http\Controllers\SchematicController;
use Illuminate\Support\Facades\Route;

/*
 * The analyser itself is a static page and stays one: it needs no server, so it does not
 * get one. Everything here is what a server is actually for, which is remembering things
 * and letting other people see them.
 */
Route::get('/', fn () => response()->file(public_path('index.html')));

Route::get('/auth/discord', [AuthController::class, 'start'])->name('login');
Route::get('/auth/discord/callback', [AuthController::class, 'callback']);
Route::post('/deconnexion', [AuthController::class, 'logout']);

Route::get('/schematiques', [BrowseController::class, 'index']);
Route::get('/s/{schematic}', [SchematicController::class, 'show']);

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
