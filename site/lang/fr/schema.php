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
        'energie' => 'energie',
        'par-seconde' => '/ s',
        'par-minute' => '/ min',
        // Invariable au pluriel, d'ou une seule cle : « 1 j'aime », « 12 j'aime ».
        'jaime' => "j'aime",
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
        'bac-a-sable' => 'Alimenté par une source de bac a sable',
        'bac-a-sable-court' => 'source de bac a sable',
        'cout' => 'Ce qu il coute',
        'cout-aide' => "Ce que le jeu retire de ton noyau quand tu le poses, a l'unite
            pres : c'est `Block.requirements` additionne bloc par bloc, pas une estimation.",
        /*
         * Le courant affiche vient de `analysis['potential']`, donc du plafond, et le
         * dire est la moitie de la correction : l'autre moitie est de ne plus le ranger
         * parmi les mesures. Une ferme de reacteurs sans carburant declare a un plafond
         * de 1 950 000 et une mesure de zero, et les deux sont vrais.
         */
        'energie-plafond' => 'Energie nette, au mieux',
        'au-mieux' => 'au mieux',
        /*
         * Le contraire du precedent, et il se dit a voix haute. La vitrine classe sur
         * les plafonds ; le jour ou un schema n'en porte pas, sa tuile montre sa
         * mesure plutot que rien, et une mesure sans etiquette se lirait comme le
         * plafond de la tuile d'a cote. Un filet silencieux ne vaut pas mieux que pas
         * de filet.
         */
        'mesuree' => 'mesuré',
        'bac-a-sable-aide' => "Un robinet de bac a sable donne autant qu'on lui demande, donc
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
        'titre' => 'Comparer deux schemas',
        'sous-titre' => "Les deux ont ete lus par le meme moteur, donc la difference se
            soustrait au lieu de se deviner sur deux captures d'ecran.",
        'gauche' => 'A gauche',
        'droite' => 'A droite',
        'cherche' => 'Cherche un schema par son nom',
        'comparer' => 'Comparer',
        'aide' => "Tape un nom, ou colle la fin d'une adresse apres /s/.",
        'trouves' => 'Ce qui porte ce nom',
        'blocs' => 'blocs',
        'par' => 'par',
        'rien-trouve' => 'Rien ne porte ce nom.',
        'mettre-a-gauche' => 'a gauche',
        'mettre-a-droite' => 'a droite',
        'comparer-avec' => 'Comparer avec un autre',
        'a-choisir' => 'Des schemas a comparer',
        'rien-a-comparer' => "Rien de publie pour l'instant.",
        'energie' => 'energie',

        /*
         * The two slots, which are what the page is now built around.
         *
         * It used to be two text boxes asking for an identifier, above a list of names
         * proving the site already knew which schematics it was talking about. A page whose
         * whole subject is two pictures showed neither of them, at any point, and Corentin's
         * words for it were "on ne voit pas les schemas".
         */
        'vide' => 'Rien de choisi de ce cote',
        'dessin' => 'Dessin du plan...',
        'enlever' => 'enlever',
        'echanger' => 'Echanger les deux cotes',
        'ouvrir' => 'ouvrir sa page',

        'ce-quils-font' => "Ce qu'ils font tous les deux",
        'lun-pas-lautre' => "Ce que l'un fait et pas l'autre",
        'la-place' => 'La place et le courant',
        'le-cout' => "Ce qu'ils coutent a poser",
        'ce-qui-bloque' => 'Ce qui les arrete',
        'rien-ne-bloque' => 'rien de signale',

        'mesure-blocs' => 'Blocs poses',
        'mesure-emprise' => 'Emprise au sol',
        'mesure-energie' => 'Energie a fournir',

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
        'rien-en-commun' => "Ces deux schemas ne produisent rien en commun, donc il n'y a pas
            de vainqueur a designer. Classer du graphite contre du silicium reviendrait a
            decreter qu'un graphite vaut un silicium.",
        'plafond' => "Ces chiffres sont des plafonds, pas des mesures : personne n'a dit a ces
            schemas ou ils se branchent, donc c'est ce qu'ils feraient au mieux.",
        'kinds-melanges' => "Un des deux chiffres est une mesure et l'autre un plafond. Ils
            sont montres cote a cote et volontairement pas soustraits : leur difference ne
            voudrait rien dire.",
        'pas-de-verdict' => "Aucun vainqueur n'est designe. Un schema qui produit plus et
            coute trois fois plus cher n'est pas meilleur, c'est un autre marche, et vous
            etes seul a savoir lequel vous voulez.",
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
