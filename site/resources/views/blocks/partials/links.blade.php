{{-- A list of blocks, in one sentence, separated by commas.

     Assembled in PHP rather than with a `@foreach` and `$loop->last`: the comma has to sit
     against the word before it, and Blade puts the template's own layout whitespace between
     the two. Each piece is escaped explicitly, so the closing `{!! !!}` renders only what
     this loop built.

     A floor has no page: the game does not offer it in the build menu, so it is not one of
     the 254. It is still a valid answer to "where does sand come from", so it is named in
     plain text rather than turned into a dead link. --}}
@php
  $parts = [];
  foreach ($blocks as $blockName => $one) {
      $parts[] = \App\Services\BlockCatalogue::has($blockName)
          ? '<a href="/blocs/'.e($blockName).'">'.e($one->title()).'</a>'
          : e($one->title());
  }
@endphp
{!! implode(', ', $parts) !!}
