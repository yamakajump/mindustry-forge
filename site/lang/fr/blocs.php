<?php

/*
 * Les chaînes du wiki des blocs.
 *
 * ATTENTION, tant que le socle multilingue n'a pas atterri : `config/app.php` fixe encore
 * la locale à `en` et il n'existe pas de `lang/en/`, donc `__('blocs.page.recette')`
 * affiche la clé en clair au lieu du texte. Ce n'est pas un bug de ces pages, c'est
 * attendu, et ça se répare tout seul quand la voie i18n bascule la locale sur `fr`.
 *
 * Nommage : <domaine>.<ecran>.<element>, domaine `blocs`.
 *
 * UNE RÈGLE, ET ELLE A UNE RAISON : aucun chiffre ne passe par un placeholder. Les unités
 * ci-dessous sont des mots nus (`cases`, `s`, `/s`) que la vue accole au nombre, au lieu de
 * chaînes à trous du genre `:n cases`. Quand une clé manque, Laravel rend la clé sans
 * substituer, donc une chaîne à trous ferait purement disparaître la valeur : « 160 points »
 * devenait « blocs.unite.points ». Un chiffre perdu est pire qu'un mot illisible, et ça vaut
 * aussi une fois le socle en place, le jour où un traducteur oublie un `:n`.
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
        'temps_forage' => 'Forage, par case de minerai',
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
         * Le mot qui compte le plus de ce fichier.
         *
         * Ces débits sont des plafonds nominaux : ce que le bloc ferait alimenté à fond,
         * seul, sans goulot. Le reste du site présente des chiffres qui sortent du solveur,
         * alimentation et boost compris, et qui sont presque toujours plus bas. Les deux ne
         * doivent jamais se ressembler sur une page : ce site vend la différence entre une
         * mesure et une estimation, et c'est la seule chose qu'il vend.
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
