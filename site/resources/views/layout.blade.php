<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>@yield('title', 'Mindustry Forge')</title>
<link rel="icon" href="/favicon.svg">
@stack('head')
<link rel="stylesheet" href="/forge/forge.css">
</head>
<body>
<header>
  <a class="brand" href="/">Mindustry <span>Forge</span></a>
  <nav>
    <a href="/">Analyser</a>
    <a href="/schematiques">Parcourir</a>
    @auth
      <a href="/mes-schematiques">Mes schematiques</a>
      <form method="post" action="/deconnexion" class="inline">@csrf
        <button class="link" type="submit">Deconnexion</button>
      </form>
      <span class="who">
        @if(auth()->user()->avatar)
          <img src="{{ auth()->user()->avatar }}" alt="" width="24" height="24">
        @endif
        {{ auth()->user()->name }}
      </span>
    @else
      <a class="discord" href="/auth/discord">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M20.3 4.4A19 19 0 0 0 15.6 3l-.2.5c1.6.4 2.4.9 3.2 1.5a11 11 0 0 0-9.2 0c.8-.6 1.7-1.1 3.2-1.5L12.4 3a19 19 0 0 0-4.7 1.4C4.7 8.8 3.9 13.1 4.3 17.3a19 19 0 0 0 5.7 2.9l.7-1.3c-.8-.3-1.5-.7-2.1-1.1l.4-.3a13 13 0 0 0 11.3 0l.4.3c-.6.4-1.3.8-2.1 1.1l.7 1.3c2-.6 4-1.6 5.7-2.9.5-4.9-.8-9.1-4.7-12.9ZM9.7 14.9c-1.1 0-2-1-2-2.3s.9-2.3 2-2.3 2 1 2 2.3-.9 2.3-2 2.3Zm4.6 0c-1.1 0-2-1-2-2.3s.9-2.3 2-2.3 2 1 2 2.3-.9 2.3-2 2.3Z"/></svg>
        Se connecter avec Discord
      </a>
    @endauth
  </nav>
</header>

@if(session('error'))
  <p class="flash">{{ session('error') }}</p>
@endif

<main>@yield('body')</main>
</body>
</html>
