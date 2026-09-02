{{-- The shared shell every screen in this app extends with `@extends('layout')`. No
     controller renders it on its own; it is not a screen, it is what wraps one.

     Sections a view may fill: title, og-type, og-title, og-description, og-image, og-alt,
     body. All optional, each defaults to a site-wide value below. The `head` stack takes a
     view's own <link>/<script> tags; the header itself is `@include('partials.nav')`. --}}
<!DOCTYPE html>
<html lang="{{ app()->getLocale() }}">
<head>
@php
  /* The one sentence the site leads with, held in a variable rather than written inside the
     @yield calls that need it twice. An apostrophe escaped inside a Blade directive stops
     the compiler mid-file: the whole layout then renders as literal text, @stack and
     @include included, and the page still returns 200 while showing its own source. */
  $baseline = "Colle un schéma Mindustry, sache ce qu'il produit vraiment et où il coince.";
@endphp
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>@yield('title', 'Mindustry Forge')</title>
{{-- Written out rather than pulled from site/lang/. The key convention there is
     <domain>.<screen>.<element> with a fixed list of domains, and a description that holds
     for the whole site belongs to no screen; dropping it into another lane's domain file is
     what that directory's README asks nobody to do. --}}
<meta name="description" content="@yield('og-description', $baseline)">
{{-- The one address this page wants to be known by. /schemas answers 200 to every
     combination of its sixteen query parameters, so without this the same twenty-four tiles
     are a practically unbounded number of pages competing with each other, and a crawler
     spends itself there rather than on the four thousand schematic pages behind them.
     App\Support\Canonical says which parameters name a different set and which only
     reorder one. --}}
<link rel="canonical" href="{{ \App\Support\Canonical::of(request()) }}">
{{-- Three icon formats, because three families of client ask for one differently: the
     .ico for whatever hits /favicon.ico without reading the head, the SVG for any current
     browser, the square PNG for the iOS home screen. --}}
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#1b2027">

{{-- What a shared link unfurls into.

     Every tag below is emitted exactly once, from here, with a value a page replaces
     through @section. It used to be defaults here plus a @push on the page, and that put
     two og:image tags in the same head: repeated og:image is an array, consumers take the
     first, so the generic card beat the specific one and both per-page cards were wasted
     work. A page cannot override an array by appending to it. --}}
<meta property="og:site_name" content="Mindustry Forge">
<meta property="og:locale" content="fr_FR">
<meta property="og:type" content="@yield('og-type', 'website')">
<meta property="og:title" content="@yield('og-title', 'Mindustry Forge')">
<meta property="og:description" content="@yield('og-description', $baseline)">
<meta property="og:url" content="{{ url()->current() }}">
{{-- An absolute address, which asset() only produces when APP_URL is right. A relative
     og:image is resolved by nobody: the thumbnail is simply missing, with no error
     anywhere to say so. --}}
<meta property="og:image" content="@yield('og-image', asset('og.jpg'))">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="@yield('og-alt', 'Mindustry Forge')">
<meta name="twitter:card" content="summary_large_image">
@stack('head')
<link rel="stylesheet" href="/forge/forge.css">
<script src="/forge/nav.js" type="module" defer></script>
</head>
<body>
<header>
  <a class="brand" href="/">
    <svg class="signe" viewBox="0 0 32 32" aria-hidden="true" fill="currentColor"><path d="M6 6h4v20H6z"/><path d="M10 6h12v4H10z"/><path d="M22 4l5 4-5 4z"/><path d="M10 14h10v4H10z"/></svg>
    Mindustry <span>Forge</span>
  </a>
  @include('partials.nav')
</header>

@if(session('error'))
  <p class="flash">{{ session('error') }}</p>
@endif

<main>@yield('body')</main>
</body>
</html>
