{{-- Une chose du jeu, avec son icone quand le jeu en dessine une.

     Les liquides n'en ont pas dans l'atlas, donc ils sortent en texte seul plutot qu'avec
     un trou a la place de l'image : une icone manquante ne doit pas se voir. --}}
@php($icon = \App\Services\Sprites::itemIcon($thing, 18))
<span class="bloc-thing">
  @if($icon)<span class="sprite" style="{{ $icon }}" aria-hidden="true"></span>@endif
  {{ $label ?? $thing }}
</span>
