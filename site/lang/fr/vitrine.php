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
        /*
         * L'autre sens de la question du site. « Qu'est-ce qui fait du graphite » est une
         * liste de courses ; « qu'est-ce qui mange du charbon » est la reponse a « ma mine
         * tourne, que puis-je construire maintenant », qui est la façon dont un joueur
         * choisit sa prochaine usine.
         */
        'consomme' => 'Il faut lui amener',
        'consomme-rien' => "peu importe ce qu'il faut lui amener",
        'planete' => 'Planète',
        'planete-peu-importe' => 'peu importe',
        'autonome' => 'autonome en énergie',
        'verifie' => 'vérifié par le banc',
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
        'sans-rotation' => 'Le jeu ne permet pas de faire pivoter un schéma à la pose, donc
            un plan plus large que haut ne rentre pas dans un trou plus haut que large.',
        'debit-sans-objet' => "Choisis d'abord ce que tu cherches : un débit minimum n'a rien
            contre quoi se mesurer tant qu'aucun objet n'est choisi.",
    ],

    /*
     * Ce que la page dit d'un schema, en plus de le classer.
     *
     * Une liste qui se contente de trier laisse toute la comparaison au joueur : vingt-quatre
     * tuiles, quatre nombres chacune, et nulle part une phrase qui dise laquelle repond a sa
     * question. Corentin : « dis quel est le plus rendement par rapport a la taille, lui est
     * plus pour le debut de jeu car moins de ressource demander ».
     *
     * La regle sous laquelle ces phrases vivent, et c'est celle du depot : une remarque n'est
     * jamais un avis, et elle ne voyage jamais sans le chiffre qui l'a produite. Pas « celui-ci
     * est bien » mais « le plus rentable a la surface, 2,3 fois la mediane de cette liste ». Un
     * lecteur peut etre en desaccord avec le second, ce qui est la seule facon honnete
     * d'ecrire le premier.
     *
     * Aucune quantite ne passe par un placeholder, ici moins qu'ailleurs : ces phrases ne sont
     * QUE des chiffres, et une cle manquante les viderait de tout ce qu'elles apportent.
     */
    /*
     * Les puces de filtres actifs. Aucun nombre n'y passe par un placeholder : ils sont
     * assembles par le controleur, parce qu'une cle manquante rendrait « au moins » sans son
     * millier, et le millier est toute la phrase.
     */
    /*
     * Les trois listes personnelles, et la phrase qui dit ce qu'elles ne filtrent pas.
     *
     * `ordinary()` est une regle du CATALOGUE et pas une regle de LISTE. Le catalogue met de
     * cote ce qui ne se pose pas en partie normale, parce qu'il repond a « qu'est-ce qui
     * existe et qui marche ». Une liste personnelle repond a « qu'est-ce que j'ai garde », et
     * la reponse ne se discute pas.
     */
    'a-moi' => [
        'titre' => 'À moi',
        'favoris' => 'mes favoris',
        'aimes' => "ceux que j'ai aimés",
        'miens' => "ceux que j'ai publiés",
        'tout-garde' => "Dans une liste à moi, rien n'est mis de côté : un schéma de bac à
            sable que j'ai gardé, je le revois.",
    ],

    /*
     * Comparer deux plans depuis la liste, sans une ligne de JavaScript.
     *
     * `/comparer` existait et la vitrine ne l'alimentait pas. Des cases a cocher auraient
     * demande un script, et sans lui elles n'auraient rien fait, ce qui est pire qu'une
     * absence. Un parametre d'adresse fait le meme travail : le premier clic retient, le
     * second compare, et chaque etape se partage.
     */
    'comparer' => [
        'retenir' => 'Comparer',
        'retenu' => 'À comparer avec',
        'choisis-le-second' => 'Choisis le second ci-dessous.',
        'avec-celui-ci' => 'Comparer avec celui-ci',
        'tenu' => 'retenu',
        'annuler' => 'Annuler',
    ],

    'puces' => [
        'titre' => 'Recherche en cours',
        'retirer' => 'Retirer cette contrainte',
        'tout-effacer' => 'tout effacer',
    ],

    'verdict' => [
        'rendement' => 'Le meilleur rendement pour sa taille',
        'production' => 'Le plus productif',
        'encombrement' => 'Le plus petit',
        'blocs' => 'Le moins de blocs à poser',
        'par-tuile' => 'par tuile de sol',
    ],

    'note' => [
        'rentable' => 'Rentable à la surface',
        'etale' => "Étalé pour ce qu'il rend",
        'la-mediane' => 'la médiane de cette liste',
        'contre' => 'contre',
        'pour-la-mediane' => 'pour la médiane',
        'le-plus-petit' => 'Le plus petit de cette liste',
        'soit' => 'soit',
        /*
         * « Debut de partie » est ce qu'un joueur veut savoir et ce que ce depot refuse de
         * deviner : aucun champ du jeu ne classe ses ressources par epoque. Le jeu tient
         * pourtant cet ordre, dans son arbre technologique, et le dumper du banc le parcourt
         * deja pour attribuer une planete a chaque bloc.
         *
         * En attendant, la question est retournee en une que le catalogue sait trancher sans
         * aucun ordre : tout se ramasse-t-il au sol, ou faut-il d'abord avoir bati une usine ?
         * Le joueur lit le fait et conclut « tot » lui-meme.
         */
        'rien-a-fabriquer' => 'Rien à fabriquer avant de le poser',
        'a-fabriquer' => "Demande d'abord de fabriquer",
        'coute' => 'coûte',
        'autonome' => "S'alimente tout seul",
        'a-brancher' => 'À brancher',
        'il-reste' => 'il lui reste',
        'il-faut' => 'il lui faut',

        /*
         * L'unite ecrite d'un bloc plutot qu'assemblee de deux cles.
         *
         * `schema.unite.energie` vaut « energie » et `schema.unite.par-seconde` vaut « / s »,
         * espace comprise : les coller rendait « energie/ s » sur chaque tuile. Une unite se
         * lit, elle ne se calcule pas, et le reste du site ecrit deja « energie/s » entier.
         */
        'energie-seconde' => 'énergie/s',
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
        'titre' => 'Pages de résultats',
        'precedent' => 'Precedente',
        'suivant' => 'Suivante',
        'sur' => 'sur',
        'schematiques' => 'schémas',
    ],
];
