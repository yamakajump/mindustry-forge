<?php

/*
 * Les dossiers : un rangement qu'on assemble exprès, et qu'on peut donner.
 *
 * Fichier à part plutôt que des lignes ajoutées à `schema.php` : les dossiers sont leur
 * propre écran avec leur propre vocabulaire, et la convention du dépôt écrit les clés
 * `<domaine>.<écran>.<élément>`.
 */

return [
    'page' => [
        'les-miens' => 'Mes dossiers',
        'vide' => "Aucun dossier pour l'instant.",
        'creer-premier' => 'Créer le premier',
        'contenu' => 'Ce que contient ce dossier',
        'sous-dossiers' => 'Les dossiers qui sont dedans',
        'rien-dedans' => 'Ce dossier est vide.',
        /* Deux phrases pour deux questions : ce qu'un visiteur ne voit pas, et ce que le
           propriétaire a partagé sans le savoir. Un dossier de douze qui se lit comme un
           dossier de quatre, sans un mot, est la faute que ce dépôt paie depuis le 27. */
        'retires-visiteur' => 'ne sont pas montrés ici, parce qu ils sont privés',
        'retires-proprietaire' => 'de ce dossier ne sont visibles que par toi',
    ],

    'gestion' => [
        'creer' => 'Nouveau dossier',
        'nom' => 'Nom du dossier',
        'renommer' => 'Renommer',
        'icone' => 'Choisir une icône',
        'sans-icone' => 'Sans icône',
        'supprimer' => 'Supprimer le dossier',
        // `supprimer-confirme` n'est pas ici : seul dossiers.js la prononce, et une cle que
        // le PHP ne demande jamais est une orpheline. Elle vit dans forge/lang/fr.json.
        'ajouter-ici' => 'Mettre dans ce dossier',
        'legender' => 'Dire pourquoi il est la',
        'retirer-dici' => 'Retirer de ce dossier',
    ],

    'erreur' => [
        'boucle' => 'Un dossier ne peut pas être rangé dans un de ses propres sous-dossiers.',
        'trop-profond' => 'Les dossiers ne peuvent pas être imbriqués sur plus de :max niveaux.',
        'icone-inconnue' => 'Cette icône ne fait pas partie du catalogue du jeu.',
    ],

    'unite' => [
        'schemas' => 'schémas',
        'sous-dossiers' => 'sous-dossiers',
    ],
];
