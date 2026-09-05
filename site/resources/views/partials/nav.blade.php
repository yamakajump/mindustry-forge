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
      <svg viewBox="0 0 127.14 96.36" width="20" height="15" fill="currentColor" aria-hidden="true"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>
      {{ __('compte.barre.connexion') }}
    </a>
  @endauth
</nav>
