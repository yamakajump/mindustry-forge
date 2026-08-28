{{--
  The site's pagination, because Laravel's is not this site's.

  The framework's default view is written for Tailwind and this site has no Tailwind: all
  of its classes fall flat, and the SVG chevron it lays down, deprived of the `w-5 h-5`
  that was meant to constrain it, draws itself at the size of the page. The defect showed
  on the catalogue and on "my schematics", plain to see on a screenshot.

  It also rendered `pagination.previous` and `pagination.next` as they are, for want of a
  `lang/fr/pagination.php`, and announced "Showing 1 to 24 of 884 results" in English on a
  French site.

  Words rather than arrows: they translate, they depend on no stylesheet to come out the
  right size, and they read out to the screen reader.
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
    The three numbers are written outside the translation. A missing key renders the key
    itself without substituting, so a count passed as a parameter would disappear in
    silence, and on a site that sells nothing but numbers, losing a figure is worse than
    losing a word. Here it degrades to "1 - 24 vitrine.pagination.sur 884", which stays
    readable.
  --}}
  <p class="pages-count">
    {{ $paginator->firstItem() }} - {{ $paginator->lastItem() }}
    {{ __('vitrine.pagination.sur') }}
    {{ $paginator->total() }}
    {{ __('vitrine.pagination.schematiques') }}
  </p>
@endif
