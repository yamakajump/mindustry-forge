{{-- A schematic's head, injected into the analyser's own.

     A crawler and a Discord unfurler read this and never run a line of the page, which is
     the whole reason one screen can be both the tool and the thing a link points at: the
     figure a reader sees before opening anything lives here, not in the body.

     Rendered into the `<!--TETE-->` hole of `public/index.html` by
     `SchematicController::show`. Everything between the markers is replaced, so this has to
     carry every tag the analyser's own head carried, not only the ones that differ: a page
     that kept the analyser's `og:url` would unfurl every schematic as the home page. --}}
<title>{{ $schematic->displayName() }} - Mindustry Forge</title>
<meta name="description" content="{{ $summary }}">
<link rel="canonical" href="{{ url("/s/{$schematic->slug}") }}">
<meta property="og:site_name" content="Mindustry Forge">
<meta property="og:locale" content="fr_FR">
<meta property="og:type" content="article">
<meta property="og:title" content="{{ $schematic->displayName() }}">
<meta property="og:description" content="{{ $summary }}">
<meta property="og:url" content="{{ url("/s/{$schematic->slug}") }}">
{{-- The card, and not the raw preview: a plan is square or very long depending on what was
     copied, and an unfurler crops it without saying so. `SocialCardController` always
     answers the shape they expect, with the name and the figures on it. --}}
<meta property="og:image" content="{{ url("/s/{$schematic->slug}/carte.jpg") }}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{{ $schematic->displayName() }} - {{ $summary }}">
<meta name="twitter:card" content="summary_large_image">
{{-- Kept out of the index when it is not on the wall. A schematic shared by link is meant
     for whoever was given the link, and a crawler that finds it anyway must not file it. --}}
@unless($schematic->visibility === \App\Models\Schematic::PUBLIC && $schematic->hidden_at === null)
  <meta name="robots" content="noindex">
@endunless
