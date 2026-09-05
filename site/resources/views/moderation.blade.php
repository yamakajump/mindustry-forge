{{-- The moderation queue: reports, heaviest first. Route GET /moderation (behind auth,
     moderators only; ModerationController::index answers 404 rather than 403 to anybody
     else so the page's existence is not announced to a stranger).

     Scope: waiting, schematics, reasons. --}}
@extends('layout')
@section('title', 'Modération - Mindustry Forge')

@section('body')
<h1 class="title">Modération</h1>
<p class="sub">Ce que des membres ont signalé, le plus lourd en premier. Un signalement
  retenu crédite ceux qui l'ont fait ; un signalement rejeté leur coûte le double.</p>

@if($waiting->isEmpty())
  <div class="card">
    <p class="empty">Rien à relire.</p>
  </div>
@else
  @foreach($waiting as $row)
    @php
      $schematic = $schematics[$row->target_id] ?? null;
      $filed = $reasons[$row->target_type.':'.$row->target_id] ?? collect();
    @endphp
    <div class="card">
      <h2>
        @if($schematic)
          <a href="/s/{{ $schematic->slug }}">{{ $schematic->displayName() }}</a>
        @else
          Contenu supprimé (#{{ $row->target_id }})
        @endif
      </h2>

      <p class="meta">
        {{ $row->reports }} signalement{{ $row->reports > 1 ? 's' : '' }},
        poids {{ (int) $row->weight }}
        @if($schematic?->hidden_at)
          &middot; <strong>déjà masqué</strong>, en attente de cette décision
        @else
          &middot; encore visible : le poids n'a pas atteint le seuil
        @endif
      </p>

      <ul>
        @foreach($filed as $one)
          <li>{{ $one->reason }}@if($one->note) : {{ $one->note }}@endif
            <span class="meta">(poids {{ (int) $one->weight }})</span></li>
        @endforeach
      </ul>

      <form method="post" action="/moderation/decision" class="row">
        @csrf
        <input type="hidden" name="cible" value="{{ $row->target_type }}">
        <input type="hidden" name="id" value="{{ $row->target_id }}">
        <input name="motif" placeholder="Ce que l'auteur lira" maxlength="500">
        <button class="button primary" name="verdict" value="upheld" type="submit">
          Les signalements ont raison
        </button>
        <button class="button" name="verdict" value="overturned" type="submit">
          Remettre en ligne
        </button>
      </form>
    </div>
  @endforeach
@endif
@endsection
