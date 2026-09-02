{{-- An address that leads nowhere, said in the language and the clothes of the site.

     It was Laravel's white page: "404 | Not Found", in English, with no navigation and no
     link to leave by. And it is a page people reach without having looked for it: a link
     pasted into a Discord thread pointing at a schematic since deleted or put back to
     private, and an address typed crooked.

     `@extends('layout')` is enough to draw the site's bar: the way out is there, and the
     rest of the page can content itself with saying what happened.

     Nothing here touches the database: an error page that queries a database which is down
     is an error page that fails in its turn. --}}
@extends('layout')
@section('title', __('erreurs.404.titre').' - Mindustry Forge')

@section('body')
<div class="card erreur">
  <h1 class="title">{{ __('erreurs.404.titre') }}</h1>
  <p class="sub">{{ __('erreurs.404.explication') }}</p>
  <p class="row">
    <a class="button primary" href="/">{{ __('erreurs.404.analyser') }}</a>
    <a class="button" href="/schemas">{{ __('erreurs.404.parcourir') }}</a>
  </p>
</div>
@endsection
