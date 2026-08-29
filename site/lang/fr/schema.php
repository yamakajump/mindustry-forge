<?php

/*
 * A schematic: its page, its listing entry, and the controls its author gets over it.
 *
 * `gestion.copier` is also in the browser dictionary, `public/forge/lang/fr.json`, and it
 * has to say the same thing in both: the button is written by Blade and put back by
 * `manage.js` after it has flashed "Copie". A test holds the two together.
 */

return [
    'unite' => [
        /*
         * Le nom de la chose, pas l'unite. Il se pose la ou `Thing::name()` pose
         * « Graphite » : `SchematicItem::nomAffiche()` renvoie l'un ou l'autre selon que
         * la ligne porte de l'energie ou une ressource, d'ou la capitale.
         */
        'energie' => 'Énergie',
        'par-seconde' => '/ s',
        /*
         * L'unite composee, en minuscule et sans espace, parce qu'elle se lit au milieu
         * d'une phrase : « 400 energie/s » et non « 400 Énergie/ s ». Ecrite d'un seul
         * tenant plutot qu'en collant `energie` et `par-seconde`, qui donnait les deux
         * defauts a la fois. Meme valeur que `blocs.unite.energie-seconde` dans l'autre
         * domaine, parce que la convention de cles est <domaine>.<ecran>.<element> et
         * qu'une cle ne traverse pas un domaine.
         */
        'energie-seconde' => 'énergie/s',
        // Invariable au pluriel, d'ou une seule cle : « 1 j'aime », « 12 j'aime ».
        'jaime' => "j'aime",
        'blocs' => 'blocs',
    ],

    /*
     * Les deux gestes, dits plutot que laisses a deux icones.
     *
     * Un coeur plein contre un coeur vide ne porte pas la difference entre « c'est bien »
     * et « je veux le retrouver » a quelqu'un a qui personne ne l'a expliquee. La page a
     * les deux, donc elle nomme les deux.
     */
    'aime' => [
        'bouton' => "J'aime",
        'retirer' => "Je n'aime plus",
        // `schema.aime.refuse` n'est pas ici : seul keep.js la prononce, et une cle que
        // le PHP ne demande jamais est une orpheline pour TranslationKeysTest. Elle vit
        // dans public/forge/lang/fr.json, comme schema.gestion.refuse a cote.
    ],

    /*
     * La note privee.
     *
     * La page portera deux sortes de notes le jour ou les legendes de dossier arrivent,
     * donc celle-ci dit au-dessus du champ qui la lira. « Note » tout court, sur une page
     * qui en a deux, n'apprend rien au lecteur sur qui va la voir.
     */
    'note' => [
        'titre' => 'Ma note',
        'qui-la-voit' => "Personne d'autre que toi ne la voit.",
        'enregistrer' => 'Enregistrer',
    ],

    'favori' => [
        'ajouter' => 'Garder en favori',
        'retirer' => 'Retirer des favoris',
    ],

    /*
     * A sandbox tap, said rather than quoted.
     *
     * No figure goes through these, for the reason written at the top of this file and for
     * a sharper one: the figure is the whole defect. 1,246 pages printed 479,999,971 energy
     * a second in green because `power-source` hands out 999,999.94 and the arithmetic was
     * done correctly on it.
     */
    'page' => [
        'bac-a-sable' => 'Alimenté par une source de bac à sable',
        'bac-a-sable-court' => 'source de bac à sable',
        'cout' => 'Ce qu\'il coûte',
        'cout-aide' => "Ce que le jeu retire de ton noyau quand tu le poses, à l'unité
            pres : c'est `Block.requirements` additionne bloc par bloc, pas une estimation.",
        /*
         * Le courant affiche vient de `analysis['potential']`, donc du plafond, et le
         * dire est la moitie de la correction : l'autre moitie est de ne plus le ranger
         * parmi les mesures. Une ferme de reacteurs sans carburant declare a un plafond
         * de 1 950 000 et une mesure de zero, et les deux sont vrais.
         */
        'energie-plafond' => 'Énergie nette, au mieux',
        'au-mieux' => 'au mieux',
        /*
         * Le contraire du precedent, et il se dit a voix haute. La vitrine classe sur
         * les plafonds ; le jour ou un schema n'en porte pas, sa tuile montre sa
         * mesure plutot que rien, et une mesure sans etiquette se lirait comme le
         * plafond de la tuile d'a cote. Un filet silencieux ne vaut pas mieux que pas
         * de filet.
         */
        'mesuree' => 'mesuré',
        /*
         * La troisième nature, et elle se nomme comme les deux autres.
         *
         * Un débit calculé à partir d'un branchement qu'un joueur a marqué est aussi
         * précis qu'une mesure et repose sur la parole d'un inconnu. Affiché sous
         * l'étiquette « mesuré », il redéfinirait le mot pour les 419 lignes qui
         * l'avaient mérité, sans que rien ne le signale et sans qu'un seul chiffre soit
         * faux. C'est le défaut que ce dépôt collectionne, et le voici évité en un mot.
         */
        'declaree' => 'déclaré par un joueur',
        'bac-a-sable-aide' => "Un robinet de bac à sable donne autant qu'on lui demande, donc
            ce que ce schéma sort n'est pas une mesure de ce que ses blocs font :
            c'est ce qu'un robinet permet. Il reste lisible et analysable, il n'est
            simplement pas classé parmi les producteurs.",
        'bac-a-sable-courant' => "Son courant vient d'une source de bac a sable, pas de ses
            generateurs : il n'y a rien a en conclure sur ce qu'il rendrait a ta base.",
    ],

    /*
     * The comparison page.
     *
     * No figure goes through a placeholder: when a key is missing Laravel returns the key
     * without substituting, so the value would disappear outright. The view puts the
     * numbers against these words instead.
     */
    'comparer' => [
        'titre' => 'Comparer deux schémas',
        'sous-titre' => "Les deux ont été lus par le même moteur, donc la difference se
            soustrait au lieu de se deviner sur deux captures d'écran.",
        'gauche' => 'A gauche',
        'droite' => 'A droite',
        'cherche' => 'Cherche un schéma par son nom',
        'comparer' => 'Comparer',
        'aide' => "Tape un nom, ou colle la fin d'une adresse après /s/.",
        'trouves' => 'Ce qui porte ce nom',
        'blocs' => 'blocs',
        'par' => 'par',
        'rien-trouve' => 'Rien ne porte ce nom.',
        'mettre-a-gauche' => 'a gauche',
        'mettre-a-droite' => 'a droite',
        'comparer-avec' => 'Comparer avec un autre',
        'a-choisir' => 'Des schémas à comparer',
        'rien-a-comparer' => "Rien de publié pour l'instant.",
        'energie' => 'Énergie',

        /*
         * The two slots, which are what the page is now built around.
         *
         * It used to be two text boxes asking for an identifier, above a list of names
         * proving the site already knew which schematics it was talking about. A page whose
         * whole subject is two pictures showed neither of them, at any point, and Corentin's
         * words for it were "on ne voit pas les schemas".
         */
        'vide' => 'Rien de choisi de ce côté',
        'dessin' => 'Dessin du plan...',
        'enlever' => 'enlever',
        'echanger' => 'Échanger les deux côtés',
        'ouvrir' => 'ouvrir sa page',

        'ce-quils-font' => "Ce qu'ils font tous les deux",
        'lun-pas-lautre' => "Ce que l'un fait et pas l'autre",
        'la-place' => 'La place et le courant',
        'le-cout' => "Ce qu'ils coutent a poser",
        'ce-qui-bloque' => 'Ce qui les arrête',
        'rien-ne-bloque' => 'rien de signale',

        'mesure-blocs' => 'Blocs poses',
        'mesure-emprise' => 'Emprise au sol',
        'mesure-energie' => 'Énergie a fournir',

        'ecart-lecture' => "L'ecart est celui de gauche moins celui de droite : en vert, la
            gauche en fait plus.",
        'non-soustrait' => 'pas soustrait',
        'ecart' => 'ecart',

        /*
         * The three refusals, and they are what makes the page worth having.
         *
         * A single figure mixing things that do not belong on one axis reads as a verdict,
         * which is exactly the fault repaired on the net-power ranking.
         */
        'rien-en-commun' => "Ces deux schémas ne produisent rien en commun, donc il n'y a pas
            de vainqueur à désigner. Classer du graphite contre du silicium reviendrait à
            décréter qu'un graphite vaut un silicium.",
        'plafond' => "Ces chiffres sont des plafonds, pas des mesures : personne n'a dit à ces
            schémas où ils se branchent, donc c'est ce qu'ils feraient au mieux.",
        'kinds-melanges' => "Un des deux chiffres est une mesure et l'autre un plafond. Ils
            sont montrés côte à côte et volontairement pas soustraits : leur difference ne
            voudrait rien dire.",
        'pas-de-verdict' => "Aucun vainqueur n'est désigné. Un schéma qui produit plus et
            coûte trois fois plus cher n'est pas meilleur, c'est un autre marché, et vous
            êtes seul a savoir lequel vous voulez.",
    ],

    'gestion' => [
        'qui-peut-voir' => 'Qui peut le voir',
        'privee' => 'Privé',
        'par-lien' => 'Par lien',
        'publique' => 'Public',
        'lien' => 'Lien du schéma',
        'copier' => 'Copier',
        'supprimer' => 'Supprimer',
    ],
];
