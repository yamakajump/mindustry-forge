<!DOCTYPE html>
<html lang="{{ app()->getLocale() }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>@yield('title', 'Mindustry Forge')</title>
<link rel="icon" href="/favicon.svg">
@stack('head')
<link rel="stylesheet" href="/forge/forge.css">
<script src="/forge/nav.js" type="module" defer></script>
</head>
<body>
<header>
  <a class="brand" href="/">Mindustry <span>Forge</span></a>
  @include('partials.nav')
</header>

@if(session('error'))
  <p class="flash">{{ session('error') }}</p>
@endif

<main>@yield('body')</main>
</body>
</html>
