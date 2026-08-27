{{-- One thing from the game, with its icon when the game draws one.

     Liquids have none in the atlas, so they come out as plain text rather than with a hole
     where the image would be: a missing icon must not be visible. --}}
@php($icon = \App\Services\Sprites::itemIcon($thing, 18))
<span class="bloc-thing">
  @if($icon)<span class="sprite" style="{{ $icon }}" aria-hidden="true"></span>@endif
  {{ $label ?? $thing }}
</span>
