{{-- A picker that shows the thing, and is still a form control.

     Three filters on this site list items the game draws with a sprite and offered them as
     twenty lines of text in a native dropdown: the ingredient and the planet in the
     catalogue, the icon on a folder. A player recognises pyratite by its sprite before they
     read the word, and the page already knew it, since "produces what" is a grid of images
     for exactly that reason.

     What kept the others as dropdowns is that "produces what" is made of links: it applies
     the moment you choose, which suits the page's main question and suits nothing else.
     These three are constraints inside a form that is submitted as a whole, so they are
     radio buttons in a grid instead. That keeps every property the `<select>` had and the
     grid of links does not: the value posts with the form, the keyboard walks it with the
     arrows, a screen reader announces a group of radios, and the page works with no
     JavaScript at all. The `<details>` only folds it away.

     Expects:
       nom      the field name, which is what posts
       titre    what the summary calls it
       valeur   what is chosen now, "" for none
       vide     what "none" is called in the grid, where it has room to be a sentence
       videCourt  the same for the summary, where it sits after the field's own name and a
                  sentence would repeat it; optional, defaults to vide
       options  [['valeur' =>, 'libelle' =>, 'famille' => 'objet'|'liquide'|'bloc'|null,
                   'icone' => the sprite name when it is not the posted value]]
--}}
@php
  $choisi = collect($options)->firstWhere('valeur', $valeur);
@endphp
<details class="choix">
  <summary>
    <span class="choix-quoi">{{ $titre }}</span>
    @if($choisi && ($choisi['famille'] ?? null))
      <img class="icone" src="/icone/{{ $choisi['famille'] }}/{{ $choisi['icone'] ?? $choisi['valeur'] }}.png?t=32"
           width="20" height="20" decoding="async" alt="">
    @endif
    <b>{{ $choisi['libelle'] ?? ($videCourt ?? $vide) }}</b>
    <span class="choix-changer">changer</span>
  </summary>

  <div class="choix-grille">
    <label class="choix-case">
      <input type="radio" name="{{ $nom }}" value="" @checked($valeur === '')>
      <span>{{ $vide }}</span>
    </label>

    @foreach($options as $option)
      <label class="choix-case">
        <input type="radio" name="{{ $nom }}" value="{{ $option['valeur'] }}"
               @checked($valeur === $option['valeur'])>
        @if($option['famille'] ?? null)
          <img class="icone" src="/icone/{{ $option['famille'] }}/{{ $option['icone'] ?? $option['valeur'] }}.png?t=32"
               width="24" height="24" loading="lazy" decoding="async" alt="">
        @endif
        <span>{{ $option['libelle'] }}</span>
      </label>
    @endforeach
  </div>
</details>
