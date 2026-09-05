<?php

/*
 * What the site says when it cannot answer.
 *
 * It said nothing of its own: "404 | Not Found", in English, on white, with no navigation
 * and no way back, on a site that is French everywhere else. Both of these are pages
 * somebody reaches without looking for them: a link pasted into a thread pointing at a
 * schematic since removed, and the two seconds during which the database restarts.
 */

return [
    '404' => [
        'titre' => 'Cette page n\'existe pas',
        /* The three true reasons, in the order they happen. A schematic taken out of the
           showcase is still on the server and simply not visible any more, and that is the
           commonest of the three: saying only "deleted" would be wrong half the time. */
        'explication' => 'Ce schéma a peut-être été supprimé ou remis en privé. Sinon, '
            .'c\'est l\'adresse qui a été recopiée de travers.',
        'analyser' => 'Analyser un schéma',
        'parcourir' => 'Parcourir le catalogue',
    ],

    '500' => [
        'titre' => 'Quelque chose s\'est cassé de notre côté',
        /* No detail: what the failure was belongs in the log. And no promised delay, since
           nobody here knows one. */
        'explication' => 'Ce n\'est pas ton adresse, c\'est le site. Réessaie dans un instant.',
        'reessayer' => 'Réessayer',
        'accueil' => 'Revenir à l\'accueil',
    ],
];
