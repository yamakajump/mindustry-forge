{{--
  La pagination du site, parce que celle de Laravel n'est pas celle d'ici.

  La vue par defaut du framework est ecrite pour Tailwind et ce site n'a pas Tailwind :
  toutes ses classes tombent a plat, et le chevron SVG qu'elle pose, prive du `w-5 h-5`
  qui devait le contraindre, se dessine a la taille de la page. Le defaut se voyait sur
  la place de marche et sur "mes schémas", en clair sur une capture.

  Elle rendait aussi `pagination.previous` et `pagination.next` tels quels, faute de
  `lang/fr/pagination.php`, et annoncait "Showing 1 to 24 of 884 results" en anglais sur
  un site francais.

  Des mots plutot que des fleches : ils se traduisent, ils ne dependent d'aucune feuille
  de style pour avoir la bonne taille, et ils se lisent au lecteur d'ecran.
--}}
@if ($paginator->hasPages())
  <nav class="pages" role="navigation" aria-label="{{ __('vitrine.pagination.titre') }}">
    @if ($paginator->onFirstPage())
      <span class="page off">{{ __('vitrine.pagination.precedent') }}</span>
    @else
      <a class="page" href="{{ $paginator->previousPageUrl() }}" rel="prev">{{ __('vitrine.pagination.precedent') }}</a>
    @endif

    @foreach ($elements as $element)
      @if (is_string($element))
        <span class="page gap">{{ $element }}</span>
      @endif

      @if (is_array($element))
        @foreach ($element as $page => $url)
          @if ($page == $paginator->currentPage())
            <span class="page here" aria-current="page">{{ $page }}</span>
          @else
            <a class="page" href="{{ $url }}">{{ $page }}</a>
          @endif
        @endforeach
      @endif
    @endforeach

    @if ($paginator->hasMorePages())
      <a class="page" href="{{ $paginator->nextPageUrl() }}" rel="next">{{ __('vitrine.pagination.suivant') }}</a>
    @else
      <span class="page off">{{ __('vitrine.pagination.suivant') }}</span>
    @endif
  </nav>

  {{--
    Les trois nombres sont ecrits hors de la traduction. Une cle manquante rend la cle
    elle-meme sans substituer, donc un compte passe en parametre disparaitrait en silence,
    et sur un site qui ne vend que des chiffres, perdre un chiffre est pire que perdre un
    mot. Ici ca degrade en "1 - 24 vitrine.pagination.sur 884", ce qui reste lisible.
  --}}
  <p class="pages-count">
    {{ $paginator->firstItem() }} - {{ $paginator->lastItem() }}
    {{ __('vitrine.pagination.sur') }}
    {{ $paginator->total() }}
    {{ __('vitrine.pagination.schematiques') }}
  </p>
@endif
