{{-- A member's public page. Route GET /u/{user}, fed by ProfileController::show. Accounts
     only, no anonymous profiles: the imported catalogue credits author names with no
     account behind most of them.

     Scope: member, posted, postedCount, views, documented, byResource, measured, standing
     (standing is null unless the visitor is viewing their own page). --}}
@extends('layout')
@section('title', $member->name.' - Mindustry Forge')

@section('body')
<h1 class="title">{{ $member->name }}</h1>
<p class="sub">
  Membre depuis {{ $member->created_at->translatedFormat('F Y') }}
  @if($member->moderator) &middot; modérateur @endif
</p>

{{-- The site's own figure, first and named.
     "Caps turned into declared rates" is what this site expects of its members, and no
     other Mindustry catalogue knows how to count it. Views come after: they answer a
     different question, and showing the two side by side without naming them would be the
     very defect this repository keeps collecting. --}}
<div class="card">
  <p class="lead">{{ $documented }} {{ $documented === 1 ? 'plafond transformé' : 'plafonds transformés' }} en débit déclaré</p>

  @if($byResource !== [])
    <p class="meta">Sur : {{ collect($byResource)
        ->map(fn ($item) => \App\Support\Thing::name($item))->implode(', ') }}</p>
  @endif

  <p class="hint-line">Un débit déclaré est calculé à partir d'un branchement que ce membre a
    marqué à la main. C'est aussi précis qu'une mesure et ça repose sur sa parole, donc le
    site le dit partout où le chiffre s'affiche.</p>
</div>

<div class="card">
  <p class="lead">{{ $postedCount }} {{ $postedCount === 1 ? 'schéma publié' : 'schémas publiés' }}</p>
  <p class="meta">
    {{ number_format($views, 0, ',', ' ') }} {{ $views === 1 ? 'vue' : 'vues' }} sur ces schémas
    @if($measured > 0)
      &middot; {{ $measured }} {{ $measured === 1 ? 'passé' : 'passés' }} au banc
    @endif
  </p>
</div>

@if($standing !== null)
  {{-- Visible to the person themselves, and to nobody else. --}}
  <div class="card">
    <p class="lead">Ton niveau : {{ $standing->level }}</p>
    <p class="meta">
      {{ $member->upheld }} {{ $member->upheld === 1 ? 'action retenue' : 'actions retenues' }},
      {{ $member->overturned }} {{ $member->overturned === 1 ? 'infirmée' : 'infirmées' }}.
      @if($standing->level < 1)
        Une action retenue suffit pour que ton avis commence à peser.
      @elseif($standing->level < 2)
        À cinq actions retenues, ton avis pèse trois fois plus.
      @else
        Ton avis pèse le maximum.
      @endif
    </p>
    <p class="hint-line">Visible par toi seul. Les règles, elles, sont publiques.</p>
  </div>
@endif

@if($posted->isNotEmpty())
  <div class="grid">
    @foreach($posted as $schematic)
      <article class="tile">
        <a href="/s/{{ $schematic->slug }}">
          <div class="noimg">pas d'apercu</div>
          <h3>{{ $schematic->displayName() }}</h3>
        </a>
        <p class="meta">{{ $schematic->blocks }} blocs</p>
      </article>
    @endforeach
  </div>
@endif
@endsection
