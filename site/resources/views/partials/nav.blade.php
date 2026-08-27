{{-- The header, from `config/nav.php`.

     `public/index.html` carries the same header written by hand, because it is served as a
     file and never meets PHP. A test compares the two against the config, so an entry that
     lands here and not there cannot be merged. --}}
@php
    $visible = function (array $entry) {
        if (! ($entry['ready'] ?? false)) {
            return false;
        }

        return ! ($entry['auth'] ?? false) || auth()->check();
    };
@endphp

{{-- Outside the nav rather than inside it: a button that collapses its own container
     disappears with it, and there is nothing left to press to bring it back.

     Ships `hidden`, and `nav.js` reveals it. Without JavaScript there is nothing to open
     the nav with, so the nav stays where it is and wraps, which is what it did before
     there were menus at all. --}}
<button class="deplier" type="button" aria-expanded="false" aria-controls="nav"
        aria-label="{{ __('nav.barre.deplier') }}" hidden>
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
</button>

<nav id="nav">
  @foreach(config('nav') as $entry)
    @if(isset($entry['menu']))
      @php $children = array_filter($entry['menu'], $visible); @endphp
      @continue(empty($children))
      <details class="menu">
        <summary>{{ __($entry['key']) }}</summary>
        <div class="menu-list">
          @foreach($children as $child)
            <a href="{{ $child['href'] }}">{{ __($child['key']) }}</a>
          @endforeach
        </div>
      </details>
    @else
      @continue(! $visible($entry))
      <a href="{{ $entry['href'] }}">{{ __($entry['key']) }}</a>
    @endif
  @endforeach

  @auth
    <form method="post" action="/deconnexion" class="inline">@csrf
      <button class="link" type="submit">{{ __('compte.barre.deconnexion') }}</button>
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
      {{ __('compte.barre.connexion') }}
    </a>
  @endauth
</nav>
