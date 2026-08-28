<?php

use App\Models\Folder;
use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * A tree stays a tree only because two moves are refused.
 *
 * A folder moved inside its own descendant makes a ring: both leave every listing at once,
 * and whoever caused it cannot reach either one to undo it. That is data loss with no error
 * message, so it is the first thing tested here.
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

it('connait sa profondeur et ses ancetres', function () {
    $deepest = tree(User::factory()->create(), 3);

    expect($deepest->depth())->toBe(3)
        ->and($deepest->ancestors())->toHaveCount(2);
});

it('compte une profondeur de un a la racine', function () {
    expect(Folder::factory()->create()->depth())->toBe(1);
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

it('accepte le retour a la racine', function () {
    $folder = Folder::factory()->create(['parent_id' => Folder::factory()->create()->id]);

    expect($folder->wouldCycle(null))->toBeFalse();
});

it('se donne une adresse a la creation', function () {
    $folder = Folder::factory()->create();

    expect($folder->slug)->toBeString()->not->toBeEmpty()
        ->and($folder->getRouteKeyName())->toBe('slug');
});

it('tient des schemas et se laisse vider', function () {
    $folder = Folder::factory()->create();
    $schema = Schematic::factory()->create();

    $folder->schematics()->attach($schema->id);
    expect($folder->refresh()->schematics)->toHaveCount(1);

    $folder->schematics()->detach($schema->id);
    expect($folder->refresh()->schematics)->toHaveCount(0);
});

it('emporte ses dossiers quand la personne disparait', function () {
    $owner = User::factory()->create();
    Folder::factory()->create(['user_id' => $owner->id]);

    $owner->delete();

    expect(Folder::count())->toBe(0);
});
