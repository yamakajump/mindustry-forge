{{-- When it is the site that has a problem, and not the address.

     Not a theoretical one: the database restarts whenever the server takes its system
     upgrades, and the requests in flight during those seconds fall. Whoever was reading a
     schematic just then got Laravel's white page.

     A moment later everything works again, so the only useful thing to say is to try
     again. Deliberately without detail: what the failure was is the log's business, not
     the reader's.

     `@extends('layout')` queries nothing, which is the condition for this page to show
     when the rest cannot. --}}
@extends('layout')
@section('title', __('erreurs.500.titre').' - Mindustry Forge')

@section('body')
<div class="card erreur">
  <h1 class="title">{{ __('erreurs.500.titre') }}</h1>
  <p class="sub">{{ __('erreurs.500.explication') }}</p>
  <p class="row">
    <a class="button primary" href="{{ url()->current() }}">{{ __('erreurs.500.reessayer') }}</a>
    <a class="button" href="/">{{ __('erreurs.500.accueil') }}</a>
  </p>
</div>
@endsection
