/**
 * Asking for a name, and asking whether somebody is sure, in the site's own skin.
 *
 * Both went through the browser's `prompt` and `confirm`. Those open at the top of the
 * window with the domain name above them, in the browser's colours, and nothing about them
 * belongs to this site: "sans nom" pre-filled in a grey box titled `mindustryforge.com` was
 * the moment a player first named something they made. They also cannot carry a word of
 * explanation, cannot validate before they close, and block the page while they are open.
 *
 * `<dialog>` rather than a div: the focus trap, the backdrop, Escape and returning the
 * focus to whatever had it are the four things a hand-built modal gets wrong, and the
 * element does all four.
 *
 * NULL AND THE EMPTY STRING ARE DIFFERENT ANSWERS, and callers rely on it. `dossiers.js`
 * reads a cancelled caption as "leave it alone" and an emptied one as "clear it", so a
 * dialog resolving `""` on cancel would silently delete captions. Cancelling resolves null
 * here, exactly like `prompt`.
 *
 * Nothing in this file is load-bearing for the page it sits on: it renders no markup until
 * something is asked, and everything it says is handed to it by the caller, which is what
 * keeps the words in `site/public/forge/lang/` where the pages keep theirs.
 */

/** Whichever dialog is open, so a second call cannot leave the first one behind. */
let open = null;

function close(dialog) {
  dialog.close();
  dialog.remove();
  if (open === dialog) open = null;
}

/**
 * The shell both questions share: a titled box, a body, and two buttons.
 *
 * `decide` is called with `true` on the accepting button and `false` on the other, on
 * Escape, and on a click outside the box. That last one is deliberate and is the reason
 * this listens for `cancel` rather than trusting `returnValue`: a dialog dismissed by the
 * backdrop closes with an empty return value, which is indistinguishable from accepting an
 * emptied field.
 */
function frame({ title, accept, cancel }, body, decide) {
  const dialog = document.createElement("dialog");
  dialog.className = "demande";
  dialog.innerHTML = `
    <form method="dialog">
      <h2></h2>
      <div class="corps"></div>
      <div class="boutons">
        <button type="button" class="ghost" data-do="cancel"></button>
        <button type="button" class="primary" data-do="accept"></button>
      </div>
    </form>`;
  dialog.querySelector("h2").textContent = title;
  dialog.querySelector('[data-do="cancel"]').textContent = cancel;
  dialog.querySelector('[data-do="accept"]').textContent = accept;
  dialog.querySelector(".corps").append(body);

  dialog.addEventListener("click", (event) => {
    const button = event.target.closest("[data-do]");
    if (button) decide(button.dataset.do === "accept");
    // A click on the dialog element itself is a click on its backdrop: the form inside it
    // covers the box, so anything landing here missed it.
    else if (event.target === dialog) decide(false);
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    decide(false);
  });

  /* A second question closes the first, and answers it: leaving the previous promise
     pending would leave its caller waiting on a box nobody can see any more. */
  open?.dismiss?.();
  dialog.dismiss = () => decide(false);
  document.body.append(dialog);
  open = dialog;
  dialog.showModal();
  return dialog;
}

/**
 * A name, or null if the question was dismissed.
 *
 * @param {{title: string, label: string, value?: string, hint?: string,
 *   accept?: string, cancel?: string}} asked
 * @returns {Promise<string|null>}
 */
export function askForText({ title, label, value = "", hint = "",
  accept = "Valider", cancel = "Annuler" }) {
  const body = document.createElement("div");
  body.innerHTML = `<label></label><input type="text" autocomplete="off">`;
  const field = body.querySelector("input");
  const tag = body.querySelector("label");
  tag.textContent = label;
  field.value = value;
  const id = `demande-${Math.random().toString(36).slice(2, 8)}`;
  field.id = id;
  tag.htmlFor = id;
  if (hint) {
    const line = document.createElement("p");
    line.className = "hint-line";
    line.textContent = hint;
    body.append(line);
  }

  return new Promise((resolve) => {
    const dialog = frame({ title, accept, cancel }, body, (yes) => {
      const answer = field.value;
      close(dialog);
      resolve(yes ? answer : null);
    });
    /* Selected rather than merely focused: the field arrives holding a suggestion, and the
       first thing anybody does with a suggestion they do not want is type over it. */
    field.select();
    field.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const answer = field.value;
      close(dialog);
      resolve(answer);
    });
  });
}

/**
 * Whether to go ahead.
 *
 * @param {{title: string, text?: string, accept?: string, cancel?: string,
 *   danger?: boolean}} asked
 * @returns {Promise<boolean>}
 */
export function askToConfirm({ title, text = "", accept = "Confirmer",
  cancel = "Annuler", danger = false }) {
  const body = document.createElement("p");
  body.textContent = text;

  return new Promise((resolve) => {
    const dialog = frame({ title, accept, cancel }, body, (yes) => {
      close(dialog);
      resolve(yes);
    });
    /* The accepting button carries the weight of the sentence above it. A deletion is not
       offered in amber like a save: the colour is part of the question. */
    if (danger) {
      const go = dialog.querySelector('[data-do="accept"]');
      go.classList.remove("primary");
      go.classList.add("danger");
    }
    dialog.querySelector('[data-do="cancel"]').focus();
  });
}
