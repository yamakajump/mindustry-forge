<!DOCTYPE html>
<html lang="{{ app()->getLocale() }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>@yield('title', 'Mindustry Forge')</title>
{{-- Three icon formats, because three families of client ask for one differently: the
     .ico for whatever hits /favicon.ico without reading the head, the SVG for any current
     browser, the square PNG for the iOS home screen. --}}
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#1b2027">

{{-- What a shared link unfurls into. These are defaults: a page with something better to
     say overrides them from its own @push('head'), and the last tag wins. --}}
{{-- Written out rather than pulled from site/lang/. The key convention there is
     <domain>.<screen>.<element> with a fixed list of domains, and a site-wide description
     belongs to no screen; dropping it into somebody else's domain file is what that
     directory's README asks nobody to do. One language ships, so this costs nothing today
     and moves the day a second one does. --}}
<meta name="description" content="Colle une schematique Mindustry, sache ce qu'elle produit vraiment et ou elle coince.">
<meta property="og:site_name" content="Mindustry Forge">
<meta property="og:locale" content="fr_FR">
<meta property="og:type" content="website">
<meta property="og:title" content="@yield('title', 'Mindustry Forge')">
<meta property="og:description" content="Colle une schematique Mindustry, sache ce qu'elle produit vraiment et ou elle coince.">
<meta property="og:url" content="{{ url()->current() }}">
{{-- An absolute address, which asset() only produces when APP_URL is right. A relative
     og:image is resolved by nobody: the thumbnail is simply missing, with no error
     anywhere to say so. --}}
<meta property="og:image" content="{{ asset('og.jpg') }}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Mindustry Forge">
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
