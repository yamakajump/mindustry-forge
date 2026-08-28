{{-- The private note.

     It says above the field who will read it, rather than in a tooltip nobody opens: the
     day folder captions arrive, the page will carry two kinds of note, and a bare "Note"
     would teach the reader nothing about who is going to see it.

     Saving is not optimistic, unlike the like button: text somebody typed must not look
     saved before it is. --}}
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
