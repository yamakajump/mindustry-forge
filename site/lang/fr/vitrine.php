<?php

/* Browsing published schematics: filters, sorting, the grid. */

return [
    /*
     * Le creatif, mis a part et jamais escamote.
     *
     * Dix blocs valent `sandboxOnly` dans le catalogue du jeu, et un schéma qui en
     * tient un ne se pose pas en partie normale. Ce n'est pas un jugement de gout : c'est
     * le jeu qui le dit, et c'est pourquoi la detection porte sur les blocs et jamais sur
     * le nom. `Def Mega Base (sandbox)` se trahit, `useless box` et `Server lagger` non,
     * et ce sont les memes.
     *
     * Aucun chiffre ne passe par un placeholder : le compte est pose a cote de la phrase
     * par la vue, parce qu'une cle manquante rendrait la cle sans substituer et le nombre
     * disparaitrait.
     */
    /*
     * Chercher par un bloc contenu : « montre-moi ce qu'on construit avec un reacteur au
     * thorium ». Le site ne savait pas y repondre tant que `schematic_blocks` etait vide.
     */
    'bloc' => [
        'label' => 'Qui contient',
        'exemple' => 'thorium-reactor',
        'filtrees' => 'Uniquement ceux qui contiennent',
        'enlever' => 'Enlever ce filtre',
        'inconnu' => "Ce nom n'est pas un bloc du jeu, donc rien n'est filtre. Choisis dans
            la liste proposee : elle ne contient que des noms qui existent.",
    ],

    'creatif' => [
        'mise-a-part' => 'schéma de bac a sable est mis à part, parce qu il ne
            se pose pas en partie normale.',
        'mises-a-part' => 'schémas de bac a sable sont mis à part, parce qu ils ne
            se posent pas en partie normale.',
        'montrer' => 'Les afficher quand meme',
        'affichees' => 'Les schémas de bac a sable sont affichés.',
        'remettre' => 'Revenir a ceux qui se posent en partie',
        'etiquette' => 'bac a sable',
    ],

    'pagination' => [
        /* Words, not arrows. They translate, they need no stylesheet to come out the
           right size, and a screen reader reads them. The default view's chevron drew
           at the width of the page here, because its Tailwind classes do nothing. */
        'titre' => 'Pages de resultats',
        'precedent' => 'Precedente',
        'suivant' => 'Suivante',
        'sur' => 'sur',
        'schematiques' => 'schémas',
    ],
];
