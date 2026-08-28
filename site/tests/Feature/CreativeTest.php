<?php

use App\Models\Schematic;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * Creative, set aside and never quietly dropped.
 *
 * Corentin's screenshot showed `pure sandbox stupidity`, `Fuck it quad nuke`,
 * `Server lagger` and `useless box` at the top of the power ranking. These are schematics
 * built for sandbox servers or to make a server lag: they cannot be placed in a normal
 * game, so they answer a different question from the one the list asks.
 *
 * The detection looks at the **blocks**, never at the name. Ten blocks are `sandboxOnly` in
 * the game's catalogue; `Def Mega Base (sandbox)` would give itself away by its name, but
 * `useless box` and `Server lagger` would not, and they are the same thing.
 *
 * "Set aside", not "thrown out": the count is displayed and a link undoes the filter.
 */

function creation(string $name, array $held, string $visibility = 'public'): Schematic
{
    return Schematic::factory()->create([
        'name' => $name, 'visibility' => $visibility, 'blocks' => array_sum($held),
        'analysis' => ['held' => $held],
    ]);
}

it('recognises creative by its blocks and not by its name', function () {
    $lagger = creation('Server lagger', ['power-void' => 40, 'conveyor' => 2]);
    $usine = creation('Four a silicium', ['silicon-smelter' => 4, 'conveyor' => 20]);

    expect($lagger->creative())->toBeTrue();
    expect($usine->creative())->toBeFalse();
});

it('sets creative aside from the list by default', function () {
    creation('Server lagger', ['power-void' => 40]);
    creation('Four a silicium', ['silicon-smelter' => 4]);

    $page = $this->get('/schemas')->assertOk();

    $page->assertSee('Four a silicium');
    $page->assertDontSee('Server lagger');
});

it('says how many it sets aside, and offers to show them', function () {
    /* The point I refuse to be vague about: a catalogue that announces fifteen thousand
       schematics and serves fourteen thousand without a word would be lying about its own
       size. The count is displayed, and the link undoes the filter. */
    creation('Server lagger', ['power-void' => 40]);
    creation('pure sandbox stupidity', ['item-source' => 3]);
    creation('Four a silicium', ['silicon-smelter' => 4]);

    $page = $this->get('/schemas')->assertOk();

    $page->assertSee('2 schémas de bac a sable sont mis à part', escape: false);
    $page->assertSee('creatif=oui', escape: false);
});

it('shows them when asked, labelled for what they are', function () {
    creation('Server lagger', ['power-void' => 40]);
    creation('Four a silicium', ['silicon-smelter' => 4]);

    $page = $this->get('/schemas?creatif=oui')->assertOk();

    $page->assertSee('Server lagger');
    $page->assertSee('Four a silicium');
    $page->assertSee('bac a sable');
});

it('counts what this page sets aside, not what the catalogue sets aside', function () {
    /* The seventh face of the same defect, this time on the sentence that explains a setting
     * aside.
     *
     * In production the sentence announced 4 475 on **every** page, which is the right count
     * for the catalogue and the wrong answer to "how many did this page set aside". On the
     * power ranking the true answer was zero: those schematics were already absent from it,
     * removed by the measurement/ceiling split since their measured power is zero, so this
     * filter had nothing left to remove.
     *
     * A page that sets nothing aside announced four thousand five hundred. */
    creation('Bac a sable a graphite', ['power-source' => 1, 'graphite-press' => 2]);
    creation('Usine a silicium', ['silicon-smelter' => 4]);
    creation('Presse a graphite', ['graphite-press' => 2]);

    // Filtered on a block the sandbox one does not hold: nothing to set aside here.
    $ciblee = $this->get('/schemas?bloc=silicon-smelter')->assertOk();
    $ciblee->assertSee('Usine a silicium');
    $ciblee->assertDontSee('mise a part');

    // Without a filter, the only creative one of the batch is counted, and in the singular.
    $toutes = $this->get('/schemas')->assertOk();
    $toutes->assertSee('1 schéma de bac a sable est mis à part', escape: false);
});

it('never counts private schematics among what is set aside', function () {
    /* The announced count has to be the count of the list the reader is looking at. Counting
       a private schematic would promise them something the link will never show. */
    creation('Privee et creative', ['power-void' => 40], visibility: 'private');
    creation('Four a silicium', ['silicon-smelter' => 4]);

    $this->get('/schemas')->assertOk()->assertDontSee('mises a part');
});
