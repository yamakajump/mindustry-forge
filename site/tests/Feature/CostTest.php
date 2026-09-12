<?php

use App\Models\Schematic;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * What a schematic costs to place, with the game's icons.
 *
 * The figure comes from the analysis, which gets it from `Block.requirements`: it is what
 * the game takes out of the core, to the unit. Recomputed here from `schematic_blocks`
 * times the catalogue, it would be the same arithmetic written a second time, so a second
 * thing to be wrong, about the figure a player checks against their own core before
 * pasting.
 */

function avecCout(array $cost): Schematic
{
    return Schematic::factory()->create([
        'visibility' => 'public', 'name' => 'Chaine a silicium', 'blocks' => 12,
        'analysis' => ['cost' => $cost],
    ]);
}

it('orders the cost the way the game does, not alphabetically', function () {
    /* Copper before lead, titanium before thorium: the order the player reads on every panel
       in the game. Alphabetically, a Serpulo build would start with beryllium, which has no
       business being there. */
    $kept = avecCout(['titanium' => 40, 'copper' => 320, 'lead' => 96]);

    expect(array_keys($kept->cost()))->toBe(['copper', 'lead', 'titanium']);
});

/* The card that printed those icons was on a schematic's own page, which serves the
   analyser since 12/09/2026 and draws its own. What the cost still has to be right about is
   the order and the arithmetic, which is what the rest of this file is for. */

it('does not show an empty card when the cost is unknown', function () {
    /* An analysis stored before the field existed, or a schematic made of blocks no
       catalogue knows: better to say nothing than to show a zero. */
    $kept = Schematic::factory()->create([
        'visibility' => 'public', 'blocks' => 3, 'analysis' => [],
    ]);

    $this->get("/s/{$kept->slug}")->assertOk()->assertDontSee('Ce qu&#039;il coûte', escape: false);
});

it('defends itself against what a browser can send', function () {
    $kept = avecCout(['copper' => 320, 'lead' => 0, 'plomb' => 'beaucoup', '' => 4]);

    expect($kept->cost())->toBe(['copper' => 320]);
});
