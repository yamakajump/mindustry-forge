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
 * The first test below is the feature. The second is the reason it is pinned to a list of
 * addresses rather than opened to `*`, and it is the one that matters: `X-Forwarded-Proto`
 * is a string, and a client that can reach the origin can write whatever it likes in it.
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
it('croit Cloudflare sur le schema', function (string $ip) {
    $request = depuis($ip, ['X-Forwarded-Proto' => 'https']);
    app()->handle($request);

    expect($request->isSecure())->toBeTrue()
        ->and($request->getSchemeAndHttpHost())->toStartWith('https://');
})->with([
    'ipv4' => '162.158.1.1',
    'ipv4 autre plage' => '104.16.0.1',
    'ipv6' => '2606:4700::1',
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
    'juste sous une plage Cloudflare' => '162.157.255.255',
    'juste au-dessus' => '162.160.0.1',
]);

/* Sans l'en-tete, meme venant de Cloudflare, rien n'est suppose : une requete en clair
   reste en clair. */
it('ne devine pas le schema quand l en-tete est absent', function () {
    $request = depuis('162.158.1.1');
    app()->handle($request);

    expect($request->isSecure())->toBeFalse();
});

/* La liste elle-meme, parce qu'une plage mal recopiee ne se voit pas : elle retire
   silencieusement des visiteurs de la confiance, et leurs pages repartent en http. */
it('ne porte que des plages bien formees', function () {
    $plages = (require __DIR__.'/../../config/cloudflare.php')['proxies'];

    expect($plages)->not->toBeEmpty();

    foreach ($plages as $plage) {
        [$adresse, $masque] = array_pad(explode('/', $plage, 2), 2, null);

        expect(filter_var($adresse, FILTER_VALIDATE_IP))->not->toBeFalse("adresse : {$plage}")
            ->and($masque)->toMatch('/^\d{1,3}$/', "masque : {$plage}");
    }
});
