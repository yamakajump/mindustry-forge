@extends('layout')
@section('title', 'Mes schematiques - Mindustry Forge')

@section('body')
<h1 class="title">Mes schematiques</h1>
<p class="sub">Tout ce que tu as garde. Publie ce que tu veux montrer, garde le reste.</p>

@if($schematics->isEmpty())
  <div class="card">
    <p class="empty">Rien encore. Analyse une schematique et garde-la depuis la page
      d'analyse.</p>
    <p class="row"><a class="button primary" href="/">Analyser une schematique</a></p>
  </div>
@else
  <div class="grid">
    @foreach($schematics as $schematic)
      <article class="tile" data-slug="{{ $schematic->slug }}">
        <a href="/s/{{ $schematic->slug }}">
          @php $preview = \Illuminate\Support\Facades\Storage::disk('public')
                 ->exists("apercus/{$schematic->slug}.png") @endphp
          @if($preview)
            <img src="{{ asset("storage/apercus/{$schematic->slug}.png") }}" alt="" loading="lazy">
          @else
            <div class="noimg">pas d'apercu</div>
          @endif
          <h3>{{ $schematic->name }}</h3>
        </a>
        <p class="meta">
          {{ $schematic->blocks }} blocs
          @if($schematic->power_made > 0.5)
            &middot; {{ number_format($schematic->power_made - $schematic->power_used, 0, ',', ' ') }} energie/s
          @endif
        </p>
        {{-- Managing a schematic where it is looked at, rather than on a page of its own.
             The api for this existed from the first day and nothing ever called it: a
             schematic could be published and then never unpublished, renamed or removed. --}}
        <div class="manage">
          <select aria-label="Qui peut la voir">
            @foreach(['private' => 'Privee', 'unlisted' => 'Par lien', 'public' => 'Publique'] as $value => $label)
              <option value="{{ $value }}" @selected($schematic->visibility === $value)>{{ $label }}</option>
            @endforeach
          </select>
          <button type="button" class="link danger" data-delete>Supprimer</button>
        </div>
        <p class="hint-line note" hidden></p>
      </article>
    @endforeach
  </div>
  {{ $schematics->links() }}

  <script>
  /* One listener for the whole grid rather than one per tile, and the tile carries its
     own slug. Nothing here is worth a framework. */
  const token = () => decodeURIComponent(
    (document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || "");

  const say = (tile, text, bad) => {
    const note = tile.querySelector(".note");
    note.textContent = text;
    note.hidden = !text;
    note.classList.toggle("bad", !!bad);
  };

  const send = async (tile, method, body) => {
    const answer = await fetch(`/api/schematiques/${tile.dataset.slug}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-XSRF-TOKEN": token(),
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!answer.ok) throw new Error(`refuse (${answer.status})`);
  };

  document.querySelector(".grid")?.addEventListener("change", async (event) => {
    const select = event.target.closest("select");
    if (!select) return;
    const tile = select.closest(".tile");
    const wanted = select.value;
    try {
      await send(tile, "PATCH", { visibility: wanted });
      say(tile, wanted === "public" ? "Publiee, elle est dans la vitrine."
        : wanted === "unlisted" ? "Accessible par lien, absente de la vitrine."
        : "Privee, toi seul la vois.");
    } catch (error) {
      say(tile, `Pas enregistre : ${error.message}`, true);
    }
  });

  document.querySelector(".grid")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete]");
    if (!button) return;
    const tile = button.closest(".tile");
    const name = tile.querySelector("h3").textContent.trim();
    /* Asked once, because it cannot be undone: the string is the only copy of the
       schematic the site has. */
    if (!confirm(`Supprimer "${name}" ? C'est definitif.`)) return;
    button.disabled = true;
    try {
      await send(tile, "DELETE");
      tile.remove();
    } catch (error) {
      button.disabled = false;
      say(tile, `Pas supprimee : ${error.message}`, true);
    }
  });
  </script>
@endif
@endsection
