<?php

use App\Models\Schematic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * What the two gestures look like on a page, which no test of the counter can tell us.
 *
 * The rule this repository keeps paying for is that a correct number shown where it answers
 * another question is wrong there. A "0 j'aime" under a schematic nobody has seen is one of
 * those: it answers "how many people liked it" on a page where the reader is asking whether
 * it is any good, and it reads as a verdict.
 */
/* Les assertions laissent Laravel echapper la chaine attendue plutot que de passer
   `false`. « j'aime » brut n'apparait jamais dans du HTML, l'apostrophe y est `&#039;`,
   donc un `assertDontSee("j'aime", false)` ne trouve rien quoi qu'il arrive : il passait
   sans rien prouver, y compris quand le compteur etait bien affiche. */
it('n affiche pas un compteur a zero', function () {
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->get("/s/{$schema->slug}")
        ->assertOk()
        ->assertDontSee(__('schema.unite.jaime'));
});

it('affiche le compteur des qu il vaut quelque chose', function () {
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    Schematic::whereKey($schema->id)->update(['likes' => 12]);

    $this->get("/s/{$schema->slug}")
        ->assertOk()
        ->assertSee('12')
        ->assertSee(__('schema.unite.jaime'));
});

it('envoie un visiteur non connecte se connecter plutot que de cacher le bouton', function () {
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    /* Montre plutot que cache : un bouton qu'un visiteur ne voit pas est une
       fonctionnalite dont il n'apprend jamais l'existence. */
    $this->get("/s/{$schema->slug}")
        ->assertOk()
        ->assertSee('/auth/discord', false)
        ->assertSee(__('schema.aime.bouton'));
});

it('montre le bouton presse a qui a deja aime', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/aime");

    $this->actingAs($user)->get("/s/{$schema->slug}")
        ->assertOk()
        ->assertSee('data-aime aria-pressed="true"', false);
});

it('montre le bouton relache a qui n a pas aime', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    $this->actingAs($user)->get("/s/{$schema->slug}")
        ->assertOk()
        ->assertSee('data-aime aria-pressed="false"', false);
});

it('montre le favori presse a qui l a garde', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $this->actingAs($user)->postJson("/api/schematiques/{$schema->slug}/favori");

    $this->actingAs($user)->get("/s/{$schema->slug}")
        ->assertOk()
        ->assertSee('data-favori aria-pressed="true"', false);
});

it('ne prend pas l etat de quelqu un d autre pour le sien', function () {
    $theirs = User::factory()->create();
    $mine = User::factory()->create();
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    $this->actingAs($theirs)->postJson("/api/schematiques/{$schema->slug}/aime");

    $this->actingAs($mine)->get("/s/{$schema->slug}")
        ->assertOk()
        // Le compteur est public et vaut un pour tout le monde ; le bouton, lui, est le mien.
        ->assertSee('data-aime aria-pressed="false"', false)
        ->assertSee('1');
});

it('affiche le compte sur la tuile de mes schemas', function () {
    $user = User::factory()->create();
    $schema = Schematic::factory()->create(['user_id' => $user->id]);
    Schematic::whereKey($schema->id)->update(['likes' => 7]);

    $this->actingAs($user)->get('/mes-schemas')
        ->assertOk()
        ->assertSee('7')
        ->assertSee(__('schema.unite.jaime'));
});

it('ne compte aucune requete de plus par tuile', function () {
    $user = User::factory()->create();
    Schematic::factory()->count(10)->create(['user_id' => $user->id]);

    /* Le compte se lit sur la colonne que la liste selectionne deja. Un `withCount` ou une
       lecture par tuile ferait dix requetes de plus, ce que BrowsePerformanceTest existe
       pour attraper sur le catalogue et que rien ne surveille ici. */
    DB::enableQueryLog();
    $this->actingAs($user)->get('/mes-schemas')->assertOk();
    $queries = count(DB::getQueryLog());
    DB::disableQueryLog();

    expect($queries)->toBeLessThan(15);
});

it('cache le compteur a zero pour qui est connecte, sans le retirer du document', function () {
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);

    /* Connecte, le compteur est dans la page mais `hidden` : keep.js le devoile au premier
       j'aime sans avoir a fabriquer l'element. Le rendre visible a zero serait la faute
       que ce fichier surveille, le retirer du document obligerait le module a le creer. */
    $this->actingAs(User::factory()->create())
        ->get("/s/{$schema->slug}")
        ->assertOk()
        ->assertSee('class="compte" hidden', false);
});

it('devoile le compteur des qu il vaut quelque chose, pour qui est connecte', function () {
    $schema = Schematic::factory()->create(['visibility' => Schematic::PUBLIC]);
    Schematic::whereKey($schema->id)->update(['likes' => 3]);

    $this->actingAs(User::factory()->create())
        ->get("/s/{$schema->slug}")
        ->assertOk()
        ->assertDontSee('class="compte" hidden', false)
        ->assertSee('3');
});
