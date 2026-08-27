<?php

/*
 * The header, declared once and rendered twice.
 *
 * Twice because one of the two pages is static: the analyser is served as a file and never
 * meets PHP, so its header is written by hand in `public/index.html`. This file is what the
 * two are held against, and a test fails when they drift.
 *
 * `ready` is what keeps an entry out of the page. The tools and the block wiki are being
 * built in their own branches, so their entries are declared here, in the shape they will
 * have, and rendered by nobody until the page they point at exists. A live link to a 404 is
 * worse than an absent link, and flipping one `false` is cheaper than rebuilding a menu.
 *
 * Every entry states `ready` rather than defaulting to it: the flag is the whole point of
 * the file, and the branch that lands a tool should not have to work out where it goes.
 */

return [
    ['key' => 'nav.barre.analyser', 'href' => '/', 'ready' => true],
    ['key' => 'nav.barre.editer', 'href' => '/editer', 'ready' => true],

    ['key' => 'nav.barre.schematiques', 'menu' => [
        ['key' => 'nav.menu.parcourir', 'href' => '/schematiques', 'ready' => true],
        ['key' => 'nav.menu.les-miennes', 'href' => '/mes-schematiques', 'ready' => true, 'auth' => true],
        ['key' => 'nav.menu.comparer', 'href' => '/comparer', 'ready' => false],
        ['key' => 'nav.menu.publier', 'href' => '/publier', 'ready' => false],
    ]],

    ['key' => 'nav.barre.outils', 'menu' => [
        ['key' => 'nav.menu.logique', 'href' => '/outils/logique', 'ready' => false],
        ['key' => 'nav.menu.affichage', 'href' => '/outils/affichage', 'ready' => false],
        ['key' => 'nav.menu.toile', 'href' => '/outils/toile', 'ready' => false],
        ['key' => 'nav.menu.trieurs', 'href' => '/outils/trieurs', 'ready' => false],
        ['key' => 'nav.menu.planificateur', 'href' => '/outils/planificateur', 'ready' => false],
        ['key' => 'nav.menu.carte', 'href' => '/outils/carte', 'ready' => false],
    ]],

    ['key' => 'nav.barre.blocs', 'href' => '/blocs', 'ready' => false],
];
