{{-- A stored schematic's own cards, injected into the analyser.

     Everything here is about the schematic as an object somebody keeps and shares: who may
     see it, whether this reader likes it, the note only they read, the code to take away,
     and the markings other players have offered. None of it is about what the plan does,
     because the analyser this is injected into answers that, and answering it twice under
     two headings is what made one schematic read as two screens.

     `SchematicController::show` renders this and drops it into the `<!--FICHE-->` hole in
     `public/index.html`. Rendered here rather than rebuilt in JavaScript: every one of these
     already has its tests and its wiring in `keep.js`, `manage.js` and `notes.js`, and a
     second copy of five working things is five more things to keep in step. --}}

    {{-- The two gestures, named rather than left to two icons: a filled heart against an
         empty heart does not tell somebody nobody ever explained it to the difference
         between "this is good" and "I want to find it again".

         The count only shows above zero. "0 likes" under a schematic nobody has opened yet
         answers "how many people liked it" on a page where the reader is asking whether it
         is any good, and it reads as a verdict. --}}
    {{-- `data-schema` and not `data-slug`: in this repository, `data-slug` is apercu.js's
         contract, and it takes every element carrying one for a tile whose code it has to
         fetch so it can draw the plan. It replaced these two buttons with a canvas, on the
         real page, while the eleven tests were all going green. --}}
    {{-- No "ouvrir ce schema" button any more: it was the link between the two screens,
         and there is one screen. The reader is already in the analyser, with the plan drawn
         and the verdict above them. --}}
    <div class="keep" data-schema="{{ $schematic->slug }}">
      @auth
        <button type="button" data-aime aria-pressed="{{ $aime ? 'true' : 'false' }}">
          <span class="mot">{{ __($aime ? 'schema.aime.retirer' : 'schema.aime.bouton') }}</span>
        </button>
        <button type="button" data-favori aria-pressed="{{ $favori ? 'true' : 'false' }}">
          <span class="mot">{{ __($favori ? 'schema.favori.retirer' : 'schema.favori.ajouter') }}</span>
        </button>
        {{-- Beside the buttons and not inside them: inside the button, the page showed
             "Like  3 likes", the same word twice three pixels apart. No test sees that,
             only opening the page does. --}}
        <span class="compte"{{ $schematic->likes > 0 ? '' : ' hidden' }}>{{ $schematic->likes }} {{ __('schema.unite.jaime') }}</span>
        @if($folders->isNotEmpty())
          {{-- Checkboxes and not a dropdown: a schematic goes into several folders at once,
               which is the whole point, and a `select` would say the opposite. --}}
          <details class="ranger">
            <summary>{{ __('dossiers.gestion.ajouter-ici') }}</summary>
            <div class="menu-list">
              @foreach($folders as $folder)
                <label>
                  <input type="checkbox" data-ranger
                         data-dossier="{{ $folder->slug }}"
                         data-schema="{{ $schematic->slug }}"
                         @checked(in_array($folder->slug, $inFolders, true))>
                  {{ $folder->name }}
                </label>
              @endforeach
            </div>
            <p class="hint-line note" hidden></p>
          </details>
        @endif
      @else
        {{-- Shown rather than hidden, and as a link rather than a button: a button a
             visitor never sees is a feature whose existence they never learn about, and a
             link works without a line of JavaScript. --}}
        <a class="bouton" href="/auth/discord">{{ __('schema.aime.bouton') }}</a>
        @if($schematic->likes > 0)
          <span class="compte">{{ $schematic->likes }} {{ __('schema.unite.jaime') }}</span>
        @endif
      @endauth
    </div>
    @auth
      @include('partials.note')
    @endauth
    {{-- Where it came from, said plainly on the page rather than kept in the database.
         Most of this catalogue was posted somewhere else by somebody else, and a site that
         hides that is passing off other people's work as its own listing. It also sets
         expectations honestly: nothing here was checked by hand, the analysis is this
         engine's reading of a string it was handed, and a schematic can perfectly well be
         broken, half-finished or out of date at the source. Better said here than
         discovered in-game. --}}
    @if($schematic->imported())
      <div class="card notice">
        <h2>Schéma importé</h2>
        <p>
          Récupéré sur
          @if($schematic->sourceUrl())
            <a href="{{ $schematic->sourceUrl() }}" rel="noopener nofollow"
               target="_blank">{{ $schematic->sourceName() ?? $schematic->source }}</a>,
          @else
            {{ $schematic->sourceName() ?? $schematic->source }},
          @endif
          où {{ $schematic->credit() }} l'a publié. Il ne vient pas d'ici et
          personne ne l'a relu&nbsp;: il peut être incomplet, cassé, ou fait pour
          une version du jeu qui n'est plus la nôtre.
        </p>
        <p>
          Les chiffres ci-dessous sont ce que l'analyse en déduit, pas une promesse de
          l'auteur.
          @if($schematic->verified)
            Celui-là a été rejoué sur un vrai serveur.
          @else
            Ils n'ont pas encore été rejoués sur un vrai serveur.
          @endif
        </p>
        @if($schematic->fetched_at)
          <p class="hint-line">Récupéré le {{ $schematic->fetched_at->format('d/m/Y') }}.</p>
        @endif
      </div>
    @endif
    {{-- Somebody else's words, in a frame that says so.
         Printed bare between the site's own cards, a description reads like something this
         page computed. Plenty of them imitate one: the schematic that prompted this one
         opens with "Input: 22 Sand/s / 11 Coal/s" in English, three cards above the site's
         own answer to that exact question, in French, which may well disagree with it.

         Fifteen thousand of these arrived from other catalogues and none was written for
         this page: one is a line, one is sixteen thousand characters, one is ASCII art. So
         the frame promises nothing about the shape inside it and simply gives the long ones
         somewhere to scroll, which is the only treatment all four survive. --}}
    @if($schematic->description)
      <div class="card auteur">
        <h2>Ce qu'en dit {{ $schematic->credit() }}</h2>
        <p class="desc">{{ $schematic->displayDescription() }}</p>
        <p class="hint-line">Ses mots, pas une mesure de Forge. Les chiffres de cette page
          sont plus bas.</p>
      </div>
    @endif
    @if($schematic->managedBy(auth()->user()))
      <div class="card"><h2>Gérer</h2>
        @include('partials.manage', ['gone' => '/mes-schemas'])
        <p class="hint-line">
          @if($schematic->user_id !== auth()->id())
            Tu vois ces boutons parce que tu tiens la vitrine, pas parce que le
            schéma est à toi.
          @else
            Privé, personne d'autre ne le voit. Par lien, il marche pour qui l'a et
            reste hors de la vitrine. Public, il est dans la vitrine et classé avec
            les autres.
          @endif
        </p>
      </div>
    @endif
    {{-- Markings offered by other players, waiting for somebody to weigh them.

         The whole machinery for this was written and routed and had no interface at all:
         a proposal could be made and never seen, so the queue only grew and the schematic
         went on showing a ceiling. Their own proposal is listed too, without buttons: seeing
         that it arrived is half of why anybody sends a second one, and the server already
         refuses a vote on one's own. --}}
    @if($propositions->isNotEmpty())
      <div class="card"><h2>Des branchements proposés</h2>
        <p class="hint-line">Ce schéma n'a pas de mesure. Quelqu'un a dit où il se branche ;
          il faut d'autres avis avant que la page l'annonce.</p>
        @foreach($propositions as $proposition)
          <div class="proposition" data-proposition="{{ $proposition->id }}">
            <p class="proposition-qui">
              <strong>{{ $proposition->user?->name ?? 'quelqu\'un' }}</strong>
              &middot; {{ $proposition->created_at?->diffForHumans() }}
              &middot; {{ count($proposition->marks ?? []) }}
              {{ count($proposition->marks ?? []) > 1 ? 'marques' : 'marque' }}
            </p>
            @if($proposition->note)
              <p class="proposition-mot">{{ $proposition->note }}</p>
            @endif
            @if($proposition->user_id === auth()->id())
              <p class="hint-line proposition-note">Ta proposition. En attente d'autres avis.</p>
            @elseif(array_key_exists($proposition->id, $dejaPese))
              <p class="hint-line proposition-note">{{ $dejaPese[$proposition->id]
                ? 'Tu es d\'accord.' : 'Tu n\'es pas d\'accord.' }}</p>
            @else
              <p class="row">
                <button type="button" data-accord="oui">C'est ça</button>
                <button type="button" data-accord="non">Non</button>
              </p>
              <p class="hint-line proposition-note"></p>
            @endif
          </div>
        @endforeach
      </div>
    @endif
    <div class="card"><h2>Prendre le schéma</h2>
      <textarea id="code" readonly rows="3">{{ $schematic->code }}</textarea>
      <div class="row">
        {{-- Amber no longer: the page's rule is that its main gesture is the only amber
             control on it (see `index.html`'s own note above "Parcourir"), and the main
             gesture is now named at the top. This one keeps its meaning from the card's
             title and from the code sitting right above it. --}}
        <button id="copy" type="button">Copier</button>
        {{-- What opened the schematic used to sit here too. It is at the top of the page
             now, where somebody arriving looks; this card's subject is the code to paste
             into the game, which is a different need, and it keeps the rest of its row. --}}

        {{-- The move starts here, not from an empty page. Nobody reaches the comparison
             page with two identifiers in mind: you are on a schematic and you wonder how
             it stands. So one side is already filled in and only one is left to pick. --}}
        @if($schematic->visibility === \App\Models\Schematic::PUBLIC)
          <a class="button" href="/comparer?a={{ $schematic->slug }}">{{
            __('schema.comparer.comparer-avec') }}</a>
        @endif

        {{-- To the logic editor, and only when there is something there to open. The count
             comes from the analysis already stored, so the page decodes nothing to find it
             out: of the ninety-six measured schematics in the catalogue, six in ten have no
             processor at all, and a dead button on six pages in ten teaches the reader to
             stop reading that row. --}}
        @if (data_get($schematic->analysis, 'logic.processors', 0) > 0)
          <a class="button" href="/outils/logique?s={{ $schematic->slug }}">
            Ouvrir la logique</a>
        @endif
      </div>
      <p class="hint-line">Colle-le dans Mindustry avec ctrl+v.</p>
    </div>
  
<script>
document.getElementById("copy")?.addEventListener("click", async (event) => {
  /* A refusal is said out loud. Without this catch, a denied write left the button reading
     "Copier" without a word: on the card whose only gesture this is, the reader could not
     tell whether the code had gone or not. The field sits right above, so the fallback is
     to select it: one ctrl+C left to do, rather than a dead end. */
  const zone = document.getElementById("code");
  try {
    await navigator.clipboard.writeText(zone.value);
    event.target.textContent = "Copié";
    setTimeout(() => { event.target.textContent = "Copier"; }, 1600);
  } catch {
    zone.focus();
    zone.select();
    event.target.textContent = "Copie-le avec ctrl+C";
    setTimeout(() => { event.target.textContent = "Copier"; }, 4000);
  }
});
</script>
