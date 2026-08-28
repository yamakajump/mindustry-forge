<?php

use App\Models\Favorite;
use App\Models\Schematic;
use App\Models\SchematicLike;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * Les trois listes personnelles, et le palmares qui attend d'avoir du monde.
 *
 * Ce fichier existe pour deux regles qu'aucun test de valeur ne verrait.
 *
 * La premiere : `ordinary()` est une regle du CATALOGUE et pas une regle de LISTE. Le
 * catalogue met de cote ce qui ne se pose pas en partie normale, parce qu'il repond a
 * « qu'est-ce qui existe et qui marche ». Une liste personnelle repond a « qu'est-ce que
 * j'ai garde », et la reponse ne se discute pas. Appliquer la premiere regle a la seconde
 * ferait disparaitre un favori sans un mot, ce qui se lit comme un site qui perd des
 * choses.
 *
 * La seconde : un classement qui ne peut pas remplir son premier ecran n'est pas un
 * classement. « Les plus aimés » ouvert le premier jour sur quinze mille schemas a zero
 * serait un chiffre exact affiche a l'endroit qui pose une autre question.
 */

/** Un schema publie, avec de quoi le distinguer des autres. */
function publie(string $name, array $held = []): Schematic
{
    return Schematic::factory()->create([
        'name' => $name,
        'visibility' => Schematic::PUBLIC,
        'width' => 10,
        'height' => 10,
        'blocks' => max(1, array_sum($held) ?: 12),
        'analysis' => $held === [] ? [] : ['held' => $held],
    ]);
}

/*
 * Le seuil du palmares.
 *
 * Vingt-trois contre vingt-quatre, et la valeur n'est pas recopiee ici : elle est celle
 * d'une page. Si la pagination change, ce test change avec elle plutot que de garder une
 * raison qui a cesse d'etre vraie.
 */
it('n offre pas les plus aimés tant qu une page entière ne tient pas', function () {
    $liked = collect(range(1, 23))->map(fn ($n) => publie("Aime {$n}"));
    Schematic::whereIn('id', $liked->pluck('id'))->update(['likes' => 3]);

    $this->get('/schemas')->assertOk()->assertDontSee('Les plus aimés');
});

it('offre les plus aimés dès qu une page entière en porte', function () {
    $liked = collect(range(1, 24))->map(fn ($n) => publie("Aime {$n}"));
    // Par le constructeur de requetes et non par la factory : `likes` n'est pas dans
    // `$fillable`, deliberement, comme `views`. Un compteur ne se remplit pas en masse, et
    // une factory qui l'essaie est ignoree en silence et rend zero.
    Schematic::whereIn('id', $liked->pluck('id'))->update(['likes' => 3]);

    $this->get('/schemas')->assertOk()->assertSee('Les plus aimés');
});

it('retombe sur la date quand on demande les plus aimés sous le seuil', function () {
    publie('Le seul');

    $this->get('/schemas?tri=aimes')
        ->assertOk()
        ->assertSee('Les plus récents')
        ->assertDontSee('Les plus aimés');
});

it('classe sur le compte de j aime au-delà du seuil', function () {
    $rows = collect(range(1, 24))->map(fn ($n) => publie("Plan {$n}"));
    Schematic::whereIn('id', $rows->pluck('id'))->update(['likes' => 1]);
    Schematic::whereKey($rows->last()->id)->update(['likes' => 99]);

    $html = $this->get('/schemas?tri=aimes')->content();
    $grid = substr($html, strpos($html, '<div class="grid">'));

    expect(strpos($grid, 'Plan 24'))->toBeLessThan(strpos($grid, 'Plan 1'));
});

/*
 * Mes favoris, qui ne sont pas le catalogue.
 */
it('ne montre que ce que j ai gardé', function () {
    $me = User::factory()->create();
    $kept = publie('Garde');
    publie('Pas garde');
    Favorite::create(['user_id' => $me->id, 'schematic_id' => $kept->id]);

    $this->actingAs($me)->get('/schemas?favoris=oui')
        ->assertOk()
        ->assertSee('Garde')
        ->assertDontSee('Pas garde');
});

/*
 * Le test qui justifie ce fichier.
 *
 * Un plan de bac a sable garde en favori doit revenir. La version fausse aurait ete
 * silencieuse : la liste aurait simplement ete plus courte, sans erreur nulle part, et le
 * joueur aurait conclu que le site avait perdu son favori.
 */
it('rend un favori de bac à sable, que le catalogue met pourtant de côté', function () {
    $me = User::factory()->create();
    $sandbox = publie('Bac a sable garde', ['item-source' => 2, 'conveyor' => 8]);
    Favorite::create(['user_id' => $me->id, 'schematic_id' => $sandbox->id]);

    // Le catalogue l'ecarte, et il a raison de le faire.
    $this->actingAs($me)->get('/schemas')->assertDontSee('Bac a sable garde');

    // Ma liste le rend, et elle a raison aussi. Les deux repondent a deux questions.
    $this->actingAs($me)->get('/schemas?favoris=oui')->assertSee('Bac a sable garde');
});

it('vaut aussi pour ce que j ai publié', function () {
    $me = User::factory()->create();
    $sandbox = publie('Mon bac a sable', ['power-source' => 1, 'conveyor' => 6]);
    $sandbox->update(['user_id' => $me->id]);

    $this->actingAs($me)->get('/schemas?miens=oui')->assertSee('Mon bac a sable');
});

it('classe mes favoris dans l ordre où je les ai gardés', function () {
    $me = User::factory()->create();
    $vieux = publie('Garde en premier');
    $neuf = publie('Garde en dernier');

    Favorite::create(['user_id' => $me->id, 'schematic_id' => $vieux->id,
        'created_at' => now()->subDay()]);
    Favorite::create(['user_id' => $me->id, 'schematic_id' => $neuf->id,
        'created_at' => now()]);

    $html = $this->actingAs($me)->get('/schemas?favoris=oui')->content();
    $grid = substr($html, strpos($html, '<div class="grid">'));

    expect(strpos($grid, 'Garde en dernier'))->toBeLessThan(strpos($grid, 'Garde en premier'));
});

it('ne montre que ce que j ai aimé', function () {
    $me = User::factory()->create();
    $liked = publie('Aime');
    publie('Pas aime');
    SchematicLike::create(['user_id' => $me->id, 'schematic_id' => $liked->id]);

    $this->actingAs($me)->get('/schemas?aimes=oui')
        ->assertOk()
        ->assertSee('Aime')
        ->assertDontSee('Pas aime');
});

/*
 * Le visiteur sans compte.
 *
 * Une adresse se tape et se partage : `favoris=oui` peut arriver sans session. Filtrer sur
 * un identifiant nul rendrait une page vide sans dire pourquoi, ce qui se lit comme un
 * catalogue vide plutot que comme un filtre inapplicable.
 */
it('ignore les filtres personnels pour qui n est pas connecté', function () {
    publie('Visible');

    $this->get('/schemas?favoris=oui&aimes=oui&miens=oui')
        ->assertOk()
        ->assertSee('Visible');
});

it('n offre pas les cases personnelles à un visiteur sans compte', function () {
    publie('Visible');

    $this->get('/schemas')->assertOk()->assertDontSee('mes favoris');
});

/*
 * L'adresse dediee, qui est la meme page avec le filtre deja arme.
 *
 * Une page a part aurait eu sa propre requete, donc une deuxieme implementation de « lister
 * des schemas ». Le cout se voit le jour ou la vitrine sait filtrer par encombrement et par
 * planete et que la liste de favoris ne sait rien faire de tout ca.
 */
it('sert mes favoris à leur propre adresse, avec les mêmes filtres', function () {
    $me = User::factory()->create();
    $kept = publie('Garde');
    publie('Pas garde');
    Favorite::create(['user_id' => $me->id, 'schematic_id' => $kept->id]);

    $this->actingAs($me)->get('/mes-favoris')
        ->assertOk()
        ->assertSee('Garde')
        ->assertDontSee('Pas garde');
});

it('laisse mes favoris se filtrer comme le reste du catalogue', function () {
    $me = User::factory()->create();
    $grand = publie('Trop grand');
    $petit = publie('Rentre');
    $grand->update(['width' => 40, 'height' => 40]);
    $petit->update(['width' => 8, 'height' => 8]);

    foreach ([$grand, $petit] as $one) {
        Favorite::create(['user_id' => $me->id, 'schematic_id' => $one->id]);
    }

    $this->actingAs($me)->get('/mes-favoris?large=10&haut=10')
        ->assertOk()
        ->assertSee('Rentre')
        ->assertDontSee('Trop grand');
});

it('envoie un visiteur sans compte se connecter plutôt que sur une liste vide', function () {
    $this->get('/mes-favoris')->assertRedirect('/auth/discord');
});

/*
 * Ce que la page dit quand la liste personnelle est vide, et quand elle est filtree.
 *
 * Deux phrases exactes posees la ou on demandait autre chose, trouvees en ouvrant la page
 * et non en lisant une sortie de commande.
 */
it('dit que je n ai rien gardé, plutôt que de m envoyer publier', function () {
    $me = User::factory()->create();
    publie('Existe ailleurs');

    $page = $this->actingAs($me)->get('/mes-favoris')->assertOk();

    // Sans l'apostrophe : Blade la rend en `&#039;`, donc une assertion qui la porte
    // echouerait sur l'echappement et non sur la phrase.
    $page->assertSee('encore rien gardé')
        // La phrase du catalogue serait exacte et hors sujet : il n'y a rien a publier, il
        // n'y a rien de garde, et elle envoyait analyser un plan pour resoudre ca.
        ->assertDontSee('Rien de publié qui corresponde');
});

it('dit dans une puce que la liste est filtrée sur mes favoris', function () {
    $me = User::factory()->create();
    $kept = publie('Garde');
    Favorite::create(['user_id' => $me->id, 'schematic_id' => $kept->id]);

    // Sans cette puce, le panneau qui porte les cases est replie et le titre est celui du
    // catalogue : un lecteur voit une vitrine anormalement courte, pas ses favoris.
    $this->actingAs($me)->get('/mes-favoris')
        ->assertOk()
        ->assertSee('Recherche en cours')
        ->assertSee('mes favoris');
});

it('garde la phrase du catalogue quand la recherche est celle du catalogue', function () {
    $this->get('/schemas?produit=silicon')
        ->assertOk()
        ->assertSee('Rien de publié qui corresponde');
});
