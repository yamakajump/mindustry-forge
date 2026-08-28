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

it('knows its depth and its ancestors', function () {
    $deepest = tree(User::factory()->create(), 3);

    expect($deepest->depth())->toBe(3)
        ->and($deepest->ancestors())->toHaveCount(2);
});

it('counts a depth of one at the root', function () {
    expect(Folder::factory()->create()->depth())->toBe(1);
});

it('refuses to move a folder into its own descendant', function () {
    $owner = User::factory()->create();
    $root = Folder::factory()->create(['user_id' => $owner->id]);
    $child = Folder::factory()->create(['user_id' => $owner->id, 'parent_id' => $root->id]);

    expect($root->wouldCycle($child))->toBeTrue();
});

it('also refuses to file itself inside itself', function () {
    $folder = Folder::factory()->create();

    expect($folder->wouldCycle($folder))->toBeTrue();
});

it('accepts a sideways move', function () {
    $owner = User::factory()->create();
    $one = Folder::factory()->create(['user_id' => $owner->id]);
    $two = Folder::factory()->create(['user_id' => $owner->id]);

    expect($two->wouldCycle($one))->toBeFalse();
});

it('accepts a move back to the root', function () {
    $folder = Folder::factory()->create(['parent_id' => Folder::factory()->create()->id]);

    expect($folder->wouldCycle(null))->toBeFalse();
});

it('gives itself an address on creation', function () {
    $folder = Folder::factory()->create();

    expect($folder->slug)->toBeString()->not->toBeEmpty()
        ->and($folder->getRouteKeyName())->toBe('slug');
});

it('holds schematics and lets itself be emptied', function () {
    $folder = Folder::factory()->create();
    $schema = Schematic::factory()->create();

    $folder->schematics()->attach($schema->id);
    expect($folder->refresh()->schematics)->toHaveCount(1);

    $folder->schematics()->detach($schema->id);
    expect($folder->refresh()->schematics)->toHaveCount(0);
});

it('takes its folders with it when the person disappears', function () {
    $owner = User::factory()->create();
    Folder::factory()->create(['user_id' => $owner->id]);

    $owner->delete();

    expect(Folder::count())->toBe(0);
});
