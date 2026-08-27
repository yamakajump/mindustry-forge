<?php

/*
 * A schematic: its page, its listing entry, and the controls its author gets over it.
 *
 * `gestion.copier` is also in the browser dictionary, `public/forge/lang/fr.json`, and it
 * has to say the same thing in both: the button is written by Blade and put back by
 * `manage.js` after it has flashed "Copie". A test holds the two together.
 */

return [
    /*
     * A sandbox tap, said rather than quoted.
     *
     * No figure goes through these, for the reason written at the top of this file and for
     * a sharper one: the figure is the whole defect. 1,246 pages printed 479,999,971 energy
     * a second in green because `power-source` hands out 999,999.94 and the arithmetic was
     * done correctly on it.
     */
    'page' => [
        'bac-a-sable' => 'Alimentee par une source de bac a sable',
        'bac-a-sable-court' => 'source de bac a sable',
        /*
         * Le courant affiche vient de `analysis['potential']`, donc du plafond, et le
         * dire est la moitie de la correction : l'autre moitie est de ne plus le ranger
         * parmi les mesures. Une ferme de reacteurs sans carburant declare a un plafond
         * de 1 950 000 et une mesure de zero, et les deux sont vrais.
         */
        'energie-plafond' => 'Energie nette, au mieux',
        'au-mieux' => 'au mieux',
        'bac-a-sable-aide' => "Un robinet de bac a sable donne autant qu'on lui demande, donc
            ce que cette schematique sort n'est pas une mesure de ce que ses blocs font :
            c'est ce qu'un robinet permet. Elle reste lisible et analysable, elle n'est
            simplement pas classee parmi les productrices.",
        'bac-a-sable-courant' => "Son courant vient d'une source de bac a sable, pas de ses
            generateurs : il n'y a rien a en conclure sur ce qu'elle rendrait a ta base.",
    ],

    /*
     * The comparison page.
     *
     * No figure goes through a placeholder: when a key is missing Laravel returns the key
     * without substituting, so the value would disappear outright. The view puts the
     * numbers against these words instead.
     */
    'comparer' => [
        'titre' => 'Comparer deux schematiques',
        'sous-titre' => "Les deux ont ete lues par le meme moteur, donc la difference se
            soustrait au lieu de se deviner sur deux captures d'ecran.",
        'gauche' => 'A gauche',
        'droite' => 'A droite',
        'identifiant' => 'un nom, ou un identifiant',
        'comparer' => 'Comparer',
        'aide' => "Tape un nom, ou colle la fin d'une adresse apres /s/.",
        'trouvees' => 'Ce qui porte ce nom',
        'blocs' => 'blocs',
        'par' => 'par',
        'rien-trouve' => 'Rien ne porte ce nom.',
        'mettre-a-gauche' => 'a gauche',
        'mettre-a-droite' => 'a droite',
        'comparer-avec' => 'Comparer avec une autre',
        'a-choisir' => 'Des schematiques a comparer',
        'rien-a-comparer' => "Rien de publie pour l'instant.",
        'energie' => 'energie',

        'ce-quelles-font' => 'Ce qu\'elles font toutes les deux',
        'lune-pas-lautre' => "Ce que l'une fait et pas l'autre",
        'la-place' => 'La place et le courant',
        'le-cout' => "Ce qu'elles coutent a poser",
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
        'rien-en-commun' => "Ces deux schematiques ne produisent rien en commun, donc il n'y
            a pas de vainqueur a designer. Classer du graphite contre du silicium reviendrait
            a decreter qu'un graphite vaut un silicium.",
        'plafond' => "Ces chiffres sont des plafonds, pas des mesures : personne n'a dit a ces
            schematiques ou elles se branchent, donc c'est ce qu'elles feraient au mieux.",
        'kinds-melanges' => "Un des deux chiffres est une mesure et l'autre un plafond. Ils
            sont montres cote a cote et volontairement pas soustraits : leur difference ne
            voudrait rien dire.",
        'pas-de-verdict' => "Aucun vainqueur n'est designe. Une schematique qui produit plus
            et coute trois fois plus cher n'est pas meilleure, c'est un autre marche, et vous
            etes seul a savoir lequel vous voulez.",
    ],

    'gestion' => [
        'qui-peut-voir' => 'Qui peut la voir',
        'privee' => 'Privee',
        'par-lien' => 'Par lien',
        'publique' => 'Publique',
        'lien' => 'Lien de la schematique',
        'copier' => 'Copier',
        'supprimer' => 'Supprimer',
    ],
];
