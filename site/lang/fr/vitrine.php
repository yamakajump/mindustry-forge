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

    /*
     * Les contraintes, qui sont la moitie de cette page qu'aucun autre site Mindustry n'a.
     * « Cent graphite par minute sous trente blocs » est la phrase par laquelle ce depot
     * s'ouvre, et jusqu'ici aucune de ses trois propositions ne pouvait etre tapee.
     *
     * Aucune quantite ne passe par un placeholder : une cle manquante rendrait la cle sans
     * substituer, et le nombre disparaitrait de la seule phrase qui existe pour le donner.
     * Les nombres sont donc poses a cote de ces mots par la vue.
     */
    'contraintes' => [
        'titre' => 'Contraintes',
        'tient-dans' => 'Tient dans',
        'au-moins' => 'Au moins',
        'au-plus' => 'Au plus',
        'planete' => 'Planete',
        'planete-peu-importe' => 'peu importe',
        'autonome' => 'autonome en energie',
        'verifie' => 'verifie par le banc',
        'chercher' => 'Appliquer',
        'unite' => [
            'tuiles' => 'tuiles',
            'par-minute' => 'par minute',
            'blocs' => 'blocs',
        ],
        /*
         * Pourquoi l'encombrement ne permute pas les deux cotes.
         *
         * Verifie dans le jeu et non sur un wiki : `Binding` n'expose que `schematicFlipX`
         * et `schematicFlipY`, aucune rotation, et `Schematics.rotate()` n'est appelee que
         * par `BaseBuilderAI` et `BaseGenerator`. Un miroir ne change pas l'encombrement.
         */
        'sans-rotation' => 'Le jeu ne permet pas de faire pivoter un schema a la pose, donc
            un plan plus large que haut ne rentre pas dans un trou plus haut que large.',
        'debit-sans-objet' => 'Choisis d abord ce que tu cherches : un debit minimum n a rien
            contre quoi se mesurer tant qu aucun objet n est choisi.',
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
