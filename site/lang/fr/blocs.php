<?php

/*
 * The block wiki's strings.
 *
 * HEADS UP while the multilingual groundwork is not in yet: `config/app.php` still pins the
 * locale to `en` and there is no `lang/en/`, so `__('blocs.page.recette')` prints the key
 * instead of the text. That is not a bug in these pages, it is expected, and it fixes itself
 * the moment the i18n voice switches the locale to `fr`.
 *
 * Naming: <domain>.<screen>.<element>, domain `blocs`.
 *
 * ONE RULE, AND IT HAS A REASON: no figure ever goes through a placeholder. The units below
 * are bare words (`cases`, `s`, `/s`) that the view puts against the number, rather than
 * strings with a hole in them like `:n cases`. When a key is missing, Laravel returns the key
 * without substituting, so a string with a hole would make the value disappear outright:
 * "160 points" became "blocs.unite.points". A lost figure is worse than an unreadable word,
 * and this still holds once the groundwork lands, on the day a translator drops a `:n`.
 */

return [

    'index' => [
        'titre' => 'Les blocs du jeu',
        'sous_titre' => 'Chaque chiffre est lu dans un serveur Mindustry qui tourne, pas
            recopié d\'un wiki. Le jour où le jeu change, ces pages changent avec lui.',
        'version' => 'Catalogue extrait de Mindustry',
        'categorie' => 'Catégorie',
        'planete' => 'Planète',
        'toutes' => 'toutes',
        'partout' => 'les deux',
        'filtrer' => 'Filtrer',
        'vide' => 'Aucun bloc ne correspond.',
        'blocs' => 'blocs',
    ],

    'categorie' => [
        'distribution' => 'Transport',
        'liquid' => 'Liquides',
        'power' => 'Énergie',
        'production' => 'Extraction',
        'crafting' => 'Usines',
        'defense' => 'Défense',
        'turret' => 'Tourelles',
        'units' => 'Unités',
        'effect' => 'Stockage et effets',
        'logic' => 'Logique',
    ],

    'planete' => [
        'serpulo' => 'Serpulo',
        'erekir' => 'Erekir',
        'les_deux' => 'Serpulo et Erekir',
    ],

    'page' => [
        'retour' => 'Tous les blocs',
        'conditionnel' => 'Ce bloc ne se pose pas en partie normale. Condition du jeu :',

        'fiche' => 'La fiche',
        'taille' => 'Encombrement',
        'resistance' => 'Résistance',
        'construction' => 'Temps de pose',
        'capacite' => 'Réserve',
        'capacite_liquide' => 'Réserve de liquide',
        'portee' => 'Portée',
        'liens' => 'Liens simultanés',
        'debit_transport' => 'Débit de transport',
        'forage' => 'Forage, par case de minerai',
        'forage_note' => 'Le temps pour un objet, avec une seule case de minerai sous la
            foreuse. Deux fois plus de cases, deux fois plus vite. Ce qui sort vraiment dans
            une schématique est mesuré par l\'analyse.',
        'durete_max' => 'Dureté maximale forée',
        'boost_liquide' => 'Accélération au liquide',

        'cout' => 'Coût de construction',
        'recette' => 'Ce qu\'il fabrique',
        'entree' => 'Il consomme',
        'sortie' => 'Il produit',
        'duree' => 'Une passe dure',
        'energie' => 'Énergie',
        'energie_consommee' => 'Il consomme',
        'energie_produite' => 'Il fournit',
        'munitions' => 'Munitions acceptées',
        'liquides_acceptes' => 'Liquides acceptés',

        'alimente_par' => 'Ce qui peut l\'alimenter',
        'alimente' => 'Ce qu\'il peut alimenter',
        'se_fabrique_dans' => 'se fabrique dans',
        'se_mine_sur' => 'se mine sur',
        'sans_source' => 'rien dans le catalogue ne le produit',
        'sans_debouche' => 'aucun bloc ne le consomme',

        'schematiques' => 'Des schématiques qui s\'en servent',
        'schematiques_compte' => 'schématiques publiques en contiennent',
        'aucune_schematique' => 'Aucune schématique publiée n\'en contient pour l\'instant.',
        'exemplaires' => 'exemplaires',

        /*
         * The most important words in this file.
         *
         * These rates are nominal ceilings: what the block would do fed perfectly, alone,
         * with nothing in its way. Everything else the site prints comes out of the solver,
         * feed and boost included, and is almost always lower. The two must never look alike
         * on a page: this site sells the difference between a measurement and an estimate,
         * and that is the only thing it sells.
         */
        'au_mieux' => 'au mieux',
        'plafond' => 'Ce sont des plafonds : ce que le bloc ferait alimenté à fond et sans
            rien en travers. Ce qu\'il fait vraiment dans une schématique est mesuré par
            l\'analyse, et c\'est presque toujours moins.',
    ],

    'unite' => [
        'par_seconde' => '/s',
        'cases' => 'cases',
        'secondes' => 's',
        'energie_seconde' => 'énergie/s',
        'points' => 'points',
    ],
];
