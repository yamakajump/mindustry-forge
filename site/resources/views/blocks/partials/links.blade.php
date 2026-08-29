{{-- A list of blocks, in one sentence, separated by commas.

     Assembled in PHP rather than with a `@foreach`: each piece is escaped explicitly, so the
     closing `{!! !!}` renders only what this loop built.

     No comma between them any more. They are drawn as bounded targets rather than as a run
     of prose, because on a phone nineteen comma-separated links fifteen pixels tall are a
     slab nobody can aim at; the box is the separator now, and a comma on top of it would be
     one separator too many.

     A floor has no page: the game does not offer it in the build menu, so it is not one of
     the 254. It is still a valid answer to "where does sand come from", so it is named in
     plain text rather than turned into a dead link. --}}
{{-- With its sprite, like everywhere else a block or an item is named on this site. A
     row of five names is read one by one; a row of five sprites is recognised, which is how
     a player thinks about their game. Same endpoint as `thing.blade.php`, about a kilobyte
     each, and `alt` empty because the name is written right beside it. --}}
@php
  $parts = [];
  foreach ($blocks as $blockName => $one) {
      $known = \App\Services\BlockCatalogue::has($blockName);
      $icon = $known
          ? '<img class="icone" src="/icone/bloc/'.e($blockName).'.png?t=32" width="18"'
            .' height="18" loading="lazy" decoding="async" alt="">'
          : '';
      $parts[] = $known
          ? '<a href="/blocs/'.e($blockName).'">'.$icon.e($one->title()).'</a>'
          : e($one->title());
  }
@endphp
{!! implode(' ', $parts) !!}
