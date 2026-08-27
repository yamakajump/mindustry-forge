{{-- Une chose du jeu, avec son icone.

     Servie a l'unite par `/icone/{famille}/{nom}.png`, environ un kilooctet, plutot que par
     la feuille entiere de 1 311 ko posee en fond.

     La famille est demandee au catalogue plutot qu'ecrite en liste : ce qui est dans `items`
     est un objet, dans `liquids` un liquide. Les onze liquides ont bien un sprite, range sous
     le prefixe des objets ; la version precedente de ce gabarit les affichait en texte seul,
     sur la foi d'une recherche d'un prefixe `liquid/` qui n'existe pas.

     `alt` vide parce que le nom est ecrit juste a cote : un lecteur d'ecran qui annonce
     « sable sable » est pire qu'un qui ne dit rien. --}}
@php
  $famille = isset(\App\Services\BlockCatalogue::items()[$thing]) ? 'objet'
    : (isset(\App\Services\BlockCatalogue::liquids()[$thing]) ? 'liquide' : 'bloc');
@endphp
<span class="bloc-thing">
  <img class="icone" src="/icone/{{ $famille }}/{{ $thing }}.png?t=32"
       width="18" height="18" loading="lazy" decoding="async" alt="">
  {{ $label ?? $thing }}
</span>
