<?php

use App\Console\Commands\Sources\PoliteClient;
use App\Models\Schematic;
use App\Models\SchematicItem;
use App\Services\EngineVersion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

/*
 * Ramener quinze mille schematiques de chez les autres, et les mesurer.
 *
 * Deux choses sont testees ici et une seule est du code : la deuxieme est une promesse
 * faite au serveur d'en face. Un collecteur qui redemande ce qu'il tient deja, qui tourne
 * en rond sur une derniere page, ou qui se fait passer pour un navigateur, est un
 * collecteur qui se fait couper - et il n'y aura pas de deuxieme chance, parce que ces
 * deux catalogues sont tenus par des gens seuls qui verront le trafic.
 *
 * Les tests d'analyse font tourner le vrai Node sur le vrai `analyse.js`. C'est le but :
 * ce depot n'a qu'une implementation de l'analyse, donc la seule chose qui vaille d'etre
 * verifiee est que la commande la fait tourner telle quelle.
 */

/** Quatre panneaux solaires, ecrits par `tests/js/helpers.js`. Deux sur deux, 28,8 d'energie. */
const PANNEAUX = 'bXNjaAF4nGNgYmBiZGDJS8xNZeAvLE0sKUpVKEjMy0tNLK1gZOAuzs9JLNItSMxLzWFgYGBhgAFGFAYjiAIAYa8MPg==';

/** Le catalogue mindustry-tool, reduit a ce que le collecteur en lit vraiment. */
function toolFake(array $ids = ['aaa', 'bbb']): void
{
    $listing = array_map(fn ($id) => ['id' => $id, 'name' => "listee {$id}"], $ids);

    $routes = [
        'api.mindustry-tool.com/api/v4/schematics/count' => Http::response('12584'),
        'api.mindustry-tool.com/api/v4/schematics?page=0*' => Http::response($listing),
        'api.mindustry-tool.com/api/v4/schematics?page=*' => Http::response([]),
        'api.mindustry-tool.com/api/v4/users/*' => Http::response(['name' => 'sharrlotte']),
    ];

    foreach ($ids as $id) {
        $routes["api.mindustry-tool.com/api/v4/schematics/{$id}"] = Http::response([
            'id' => $id,
            'name' => "Ligne {$id}",
            'description' => '',
            'createdBy' => 'un-uuid',
            'meta' => ['powerConsumption' => 0, 'powerProduction' => 15],
        ]);
        $routes["api.mindustry-tool.com/api/v4/schematics/{$id}/data"]
            = Http::response(base64_decode(PANNEAUX));
    }

    Http::fake($routes);
}

/** Le catalogue mindustryschematics, dont le listing porte deja le base64. */
function otherFake(int $pages = 1, int $perPage = 2): void
{
    Http::fake([
        'mindustryschematics.com/schematics.json*' => function ($request) use ($pages, $perPage) {
            // Comme le vrai : un numero de page au-dela du dernier est **borne**, pas
            // refuse. C'est le piege que `pages()` doit contourner.
            $asked = min($pages, max(1, (int) ($request->data()['page'] ?? 1)));

            return Http::response([
                'page' => $asked, 'pages' => $pages, 'documents' => $pages * $perPage,
                'schematics' => array_map(fn ($n) => [
                    '_id' => "p{$asked}n{$n}", 'name' => "entree {$asked}-{$n}",
                    'text' => PANNEAUX,
                ], range(1, $perPage)),
            ]);
        },
        'mindustryschematics.com/schematics/*.json*' => Http::response([
            'name' => 'Detaillee', 'description' => 'ce que fait le truc',
            'creator_id' => 'un-id', 'powerConsumption' => 366, 'text' => PANNEAUX,
        ]),
        'mindustryschematics.com/user/*' => Http::response(['username' => 'klim']),
    ]);
}

function collecte(array $options = []): void
{
    test()->artisan('forge:collecter', ['--pause' => 0] + $options)->assertSuccessful();
}

it('ingere en prive, sans proprietaire, et dit d ou ca vient', function () {
    toolFake(['aaa']);

    collecte(['source' => Schematic::MINDUSTRY_TOOL]);

    $kept = Schematic::sole();

    expect($kept->visibility)->toBe(Schematic::PRIVATE)
        // Collecter et publier sont deux gestes distincts. Le second attend un message au
        // mainteneur d'en face, et cette ligne est ce qui l'empeche de partir tout seul.
        ->and($kept->user_id)->toBeNull()
        ->and($kept->source)->toBe(Schematic::MINDUSTRY_TOOL)
        ->and($kept->source_id)->toBe('aaa')
        ->and($kept->author)->toBe('sharrlotte')
        ->and($kept->name)->toBe('Ligne aaa')
        ->and($kept->code)->toBe(PANNEAUX)
        ->and($kept->fetched_at)->not->toBeNull()
        // Leur reponse entiere, y compris leurs propres chiffres de puissance : partout ou
        // les deux moteurs divergent, l'un des deux a tort, et ce depot peut dire lequel.
        ->and($kept->source_meta['meta']['powerProduction'])->toBe(15)
        // Rien n'est analyse par la collecte, donc la ligne est perimee par construction.
        ->and($kept->engine_version)->toBeNull()
        ->and($kept->analysisIsStale())->toBeTrue();
});

it('ne redemande pas ce qu il tient deja', function () {
    /*
     * La reprise entiere du collecteur tient dans ce test. Il n'y a pas de curseur ni de
     * fichier de position : la question posee avant de payer les deux appels que coute une
     * entree est "est-ce que la base la tient ?". Si ce test tombe, relancer une collecte
     * coupee au dixieme mille recommence dix mille fois deux appels chez quelqu'un d'autre.
     */
    toolFake(['aaa', 'bbb']);

    collecte(['source' => Schematic::MINDUSTRY_TOOL]);
    collecte(['source' => Schematic::MINDUSTRY_TOOL]);

    $details = Http::recorded(fn ($request) => str_ends_with($request->url(), '/schematics/aaa'));

    expect(Schematic::count())->toBe(2)
        ->and($details)->toHaveCount(1);
});

it('reprend une collecte coupee au milieu', function () {
    toolFake(['aaa', 'bbb']);

    collecte(['source' => Schematic::MINDUSTRY_TOOL, '--limite' => 1]);
    expect(Schematic::count())->toBe(1);

    collecte(['source' => Schematic::MINDUSTRY_TOOL]);

    expect(Schematic::pluck('source_id')->sort()->values()->all())->toBe(['aaa', 'bbb']);
});

it('s annonce sous son propre nom plutot que sous celui d un navigateur', function () {
    /*
     * Se deguiser en Chrome marcherait mieux et vaudrait exactement ce que ca a l'air de
     * valoir le jour ou on ecrit au mainteneur d'en face. Un agent nommable est aussi un
     * agent qu'ils peuvent bloquer proprement, ce qui est leur droit.
     */
    toolFake(['aaa']);

    collecte(['source' => Schematic::MINDUSTRY_TOOL]);

    Http::assertSent(fn ($request) => $request->header('User-Agent')[0] === PoliteClient::AGENT);
    Http::assertNotSent(fn ($request) => str_contains($request->header('User-Agent')[0] ?? '', 'Chrome'));
});

it('ne tourne pas en rond sur une derniere page qui se repete', function () {
    /*
     * mindustryschematics borne le numero de page au lieu de le refuser : demander la page
     * deux cents rend la page cent quarante-huit, avec un HTTP 200 et vingt entrees
     * parfaitement valables. Un collecteur qui attendrait une page vide tournerait pour
     * toujours sans qu'aucune erreur ne le signale.
     */
    otherFake(pages: 2, perPage: 2);

    collecte(['source' => Schematic::MINDUSTRY_SCHEMATICS]);

    expect(Schematic::count())->toBe(4);
    Http::assertNotSent(fn ($request) => ($request->data()['page'] ?? null) == 3);
});

it('ne gonfle pas le compteur de telechargements de la source', function () {
    // La page du site appelle son propre detail avec `?increment=true`. Le collecteur lit
    // la meme adresse ; il n'a aucune raison de faire monter leurs statistiques pour ca.
    otherFake();

    collecte(['source' => Schematic::MINDUSTRY_SCHEMATICS]);

    Http::assertNotSent(fn ($request) => str_contains($request->url(), 'increment'));
});

it('garde le base64 du listing et jette le doublon dans les metadonnees', function () {
    otherFake();

    collecte(['source' => Schematic::MINDUSTRY_SCHEMATICS]);

    $kept = Schematic::first();

    expect($kept->code)->toBe(PANNEAUX)
        ->and($kept->description)->toBe('ce que fait le truc')
        ->and($kept->author)->toBe('klim')
        ->and($kept->source_meta)->toHaveKey('powerConsumption')
        // Deja entier dans `code` : le garder deux fois est de la place perdue en double.
        ->and($kept->source_meta)->not->toHaveKey('text');
});

it('attend et recommence quand la source demande de ralentir', function () {
    // Un 429 se soigne en attendant, pas en abandonnant l'entree : la lacher ferait un
    // trou dans le catalogue qu'aucun passage suivant ne viendrait combler.
    Http::fake([
        'api.mindustry-tool.com/api/v4/schematics/count' => Http::response('1'),
        'api.mindustry-tool.com/api/v4/schematics?page=0*' => Http::response([['id' => 'aaa']]),
        'api.mindustry-tool.com/api/v4/schematics?page=*' => Http::response([]),
        'api.mindustry-tool.com/api/v4/schematics/aaa' => Http::sequence()
            ->push('trop vite', 429)
            ->push(['id' => 'aaa', 'name' => 'Enfin'], 200),
        'api.mindustry-tool.com/api/v4/schematics/aaa/data' => Http::response(base64_decode(PANNEAUX)),
        'api.mindustry-tool.com/api/v4/users/*' => Http::response(['name' => 'quelqu un']),
    ]);

    collecte(['source' => Schematic::MINDUSTRY_TOOL]);

    expect(Schematic::sole()->name)->toBe('Enfin');
});

it('refuse une source qui n existe pas plutot que de ne rien faire', function () {
    Http::fake();

    $this->artisan('forge:collecter', ['source' => 'wikipedia', '--pause' => 0])
        ->assertExitCode(2);

    expect(Schematic::count())->toBe(0);
    Http::assertNothingSent();
});

it('analyse ce qui a ete collecte avec le moteur du navigateur', function () {
    /*
     * Le vrai Node sur le vrai `analyse.js`. Ce depot n'a qu'une implementation de
     * l'analyse et la commande ne fait que la lancer : simuler Node ici ne testerait plus
     * rien du tout, sinon que la commande sait parler a un fantome.
     */
    $imported = Schematic::factory()->imported()->create(['code' => PANNEAUX]);

    $this->artisan('forge:analyser')->assertSuccessful();

    $imported->refresh();

    expect($imported->engine_version)->toBe(EngineVersion::current())
        ->and($imported->analysisIsStale())->toBeFalse()
        ->and($imported->width)->toBe(2)
        ->and($imported->height)->toBe(2)
        ->and($imported->blocks)->toBe(4)
        ->and($imported->power_made)->toBe(28.8)
        // Ce que le hook `saved` reconstruit derriere : quatre panneaux sont une centrale,
        // donc la schematique est trouvable sous l'energie comme une autre l'est sous le
        // graphite.
        ->and($imported->items()->where('item', SchematicItem::POWER)->exists())->toBeTrue();
});

it('ne garde de l analyse que ce qui se relit', function () {
    // La reponse de `analyse()` porte le graphe, ou les noeuds se pointent les uns les
    // autres. Tout garder ne serait pas seulement enorme : ce n'est pas serialisable.
    $imported = Schematic::factory()->imported()->create(['code' => PANNEAUX]);

    $this->artisan('forge:analyser')->assertSuccessful();

    expect($imported->refresh()->analysis)
        ->toHaveKeys(['perMinute', 'potential', 'cost', 'needs'])
        ->not->toHaveKey('graph')
        ->not->toHaveKey('offers')
        ->not->toHaveKey('detail');
});

it('estampille quand meme une schematique que le moteur ne sait pas lire', function () {
    /*
     * Sinon la file ne se vide jamais. Une ligne illisible reste perimee, la commande la
     * reprend au tour suivant, et une collecte de quinze mille avec cinquante `.msch`
     * tordus tourne en rond pour toujours. Elle **a** ete analysee : la reponse est que ce
     * moteur-la n'y arrive pas, et c'est une reponse qu'il faut garder.
     */
    $broken = Schematic::factory()->imported()->create(['code' => 'ceci n est pas du base64']);

    $this->artisan('forge:analyser')->assertSuccessful();

    $broken->refresh();

    expect($broken->engine_version)->toBe(EngineVersion::current())
        ->and($broken->analysis)->toHaveKey('erreur')
        ->and(Schematic::stale()->count())->toBe(0);
});

it('ne reprend pas ce que le moteur courant a deja mesure', function () {
    Schematic::factory()->imported()->create([
        'code' => PANNEAUX, 'engine_version' => EngineVersion::current(), 'analysed_at' => now(),
    ]);

    $this->artisan('forge:analyser')
        ->expectsOutputToContain('0 analysees')
        ->assertSuccessful();
});
