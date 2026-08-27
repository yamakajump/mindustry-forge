<?php

/* Browsing published schematics: filters, sorting, the grid. */

return [
    'pagination' => [
        /* Words, not arrows. They translate, they need no stylesheet to come out the
           right size, and a screen reader reads them. The default view's chevron drew
           at the width of the page here, because its Tailwind classes do nothing. */
        'titre' => 'Pages de resultats',
        'precedent' => 'Precedente',
        'suivant' => 'Suivante',
        'sur' => 'sur',
        'schematiques' => 'schematiques',
    ],
];
