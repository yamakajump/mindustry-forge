{{-- La note privee.

     Elle dit au-dessus du champ qui la lira, plutot que dans une bulle d'aide que personne
     n'ouvre : le jour ou les legendes de dossier arrivent, la page portera deux sortes de
     notes, et « Note » tout court n'apprendrait rien au lecteur sur qui va la voir.

     L'enregistrement n'est pas optimiste, contrairement au j'aime : du texte que quelqu'un
     a tape ne doit pas avoir l'air enregistre avant de l'etre. --}}
<section class="note-privee card" data-schema="{{ $schematic->slug }}">
  <h2>{{ __('schema.note.titre') }}</h2>
  <p class="hint-line">{{ __('schema.note.qui-la-voit') }}</p>
  <textarea data-note rows="3" maxlength="1000">{{ $note }}</textarea>
  <div class="row">
    <button type="button" data-note-save>{{ __('schema.note.enregistrer') }}</button>
    <span class="compte-note" aria-live="polite"></span>
  </div>
  <p class="hint-line note" hidden></p>
</section>
