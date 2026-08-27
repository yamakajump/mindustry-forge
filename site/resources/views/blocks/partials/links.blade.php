{{-- Une liste de blocs, en une phrase, separes par des virgules.

     Assemblee en PHP plutot qu'avec un `@foreach` et un `$loop->last` : la virgule doit
     coller au mot precedent, et Blade insere l'espace de la mise en forme du gabarit entre
     les deux. Chaque morceau est echappe explicitement, donc le `{!! !!}` final ne rend que
     ce que cette boucle a construit.

     Un sol n'a pas de page : le jeu ne le propose pas a la construction, donc il n'est pas
     dans les 254. Il reste une reponse valable a « d'ou vient le sable », alors il est
     nomme en clair plutot que transforme en lien mort. --}}
@php
  $parts = [];
  foreach ($blocks as $blockName => $one) {
      $parts[] = \App\Services\BlockCatalogue::has($blockName)
          ? '<a href="/blocs/'.e($blockName).'">'.e($one->title()).'</a>'
          : e($one->title());
  }
@endphp
{!! implode(', ', $parts) !!}
