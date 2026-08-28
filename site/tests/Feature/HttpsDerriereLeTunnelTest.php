<?php

use Illuminate\Http\Request;

/**
 * Whose word this site takes about the scheme it is served on.
 *
 * Cloudflare terminates TLS and the origin listens on port 80 only, so PHP is handed a plain
 * HTTP request. Before this, every absolute URL Laravel generated said http on a site served
 * over https. Measured in production:
 *
 *     GET https://mindustryforge.com/schematiques?produit=silicon
 *     301 -> http://mindustryforge.com/schemas?produit=silicon
 *
 * THE FIRST VERSION OF THIS FILE TESTED THE WRONG PROXY. It asserted that a request from
 * Cloudflare's published ranges is believed, which was true of the code and false of the
 * deployment: the origin is behind a Cloudflare Tunnel, `cloudflared` runs on the machine,
 * and every request reaches nginx from `::1`. Eight green tests and a production that had
 * not moved. A test can only check the question it was given.
 *
 * So the cases below are the loopback, and the refusal is still the half that matters.
 */
function depuis(string $ip, array $entetes = []): Request
{
    return Request::create(
        'http://mindustryforge.com/schemas', 'GET', [], [], [],
        ['REMOTE_ADDR' => $ip] + collect($entetes)
            ->mapWithKeys(fn ($v, $k) => ['HTTP_'.str_replace('-', '_', strtoupper($k)) => $v])
            ->all()
    );
}

/** Une adresse de chaque famille, prise dans les plages du fichier de configuration. */
it('croit le tunnel sur le schema', function (string $ip) {
    $request = depuis($ip, ['X-Forwarded-Proto' => 'https']);
    app()->handle($request);

    expect($request->isSecure())->toBeTrue()
        ->and($request->getSchemeAndHttpHost())->toStartWith('https://');
})->with([
    'boucle locale v4' => '127.0.0.1',
    'boucle locale v6' => '::1',
]);

/*
 * Le test qui justifie la liste.
 *
 * Avec `at: '*'`, celui-ci passerait aussi, et n'importe qui atteignant l'origine
 * choisirait le schema, l'hote et le port que le site croit avoir. Ce n'est pas une
 * question de cosmetique : c'est ce qui empoisonne un cache et ce qui fabrique un lien de
 * reinitialisation vers un domaine que l'attaquant a choisi.
 */
it('ne croit personne d autre', function (string $ip) {
    $request = depuis($ip, ['X-Forwarded-Proto' => 'https']);
    app()->handle($request);

    expect($request->isSecure())->toBeFalse();
})->with([
    'une adresse publique quelconque' => '8.8.8.8',
    /* Les plages de Cloudflare elles-memes, parce que la premiere version leur faisait
       confiance : si elles revenaient dans la liste, ce serait sans mesure derriere. */
    'une adresse de Cloudflare' => '162.158.1.1',
    'le reseau prive de la machine' => '10.0.0.4',
]);

/* Sans l'en-tete, meme venant de Cloudflare, rien n'est suppose : une requete en clair
   reste en clair. */
it('ne devine pas le schema quand l en-tete est absent', function () {
    $request = depuis('::1');
    app()->handle($request);

    expect($request->isSecure())->toBeFalse();
});

/* La liste elle-meme, parce qu'une plage mal recopiee ne se voit pas : elle retire
   silencieusement des visiteurs de la confiance, et leurs pages repartent en http. */
it('ne porte que des adresses bien formees', function () {
    $plages = (require __DIR__.'/../../config/proxies.php')['trusted'];

    expect($plages)->not->toBeEmpty();

    foreach ($plages as $plage) {
        [$adresse, $masque] = array_pad(explode('/', $plage, 2), 2, null);

        expect(filter_var($adresse, FILTER_VALIDATE_IP))->not->toBeFalse("adresse : {$plage}");

        if ($masque !== null) {
            expect($masque)->toMatch('/^\d{1,3}$/', "masque : {$plage}");
        }
    }
});
