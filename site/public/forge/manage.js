/**
 * Changing who can see a schematic, copying its link, and deleting it.
 *
 * One listener for the page rather than one per control, and each block of controls
 * carries its own slug. There is no framework here and no reason for one: two verbs
 * against an api that already existed and was never called from anywhere.
 *
 * Every word this file puts on screen appears after a click, so none of it is written in
 * the page and all of it comes from the dictionary. That is why the listener waits on
 * `ready` before it says anything.
 */
import { ready, t } from "./i18n.js";
import { askToConfirm } from "./dialog.js";

const token = () => decodeURIComponent(
  (document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || "");

function say(box, text, bad) {
  const note = box.querySelector(".note");
  if (!note) return;
  note.textContent = text;
  note.hidden = !text;
  note.classList.toggle("bad", !!bad);
}

async function send(slug, method, body) {
  const answer = await fetch(`/api/schematiques/${slug}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-XSRF-TOKEN": token(),
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!answer.ok) throw new Error(t("schema.gestion.refuse", { code: answer.status }));
}

const SAID = {
  public: "schema.gestion.note-publique",
  unlisted: "schema.gestion.note-par-lien",
  private: "schema.gestion.note-privee",
};

document.addEventListener("click", async (event) => {
  /* Before the first word, not before the first click: the dictionary is on its way from
     the moment the page loaded, so by the time anyone has aimed at a button it is here. */
  await ready;

  const choice = event.target.closest(".manage .seg button");
  if (choice) {
    const box = choice.closest(".manage");
    const wanted = choice.dataset.visibility;
    const before = box.querySelector(".seg .on");
    if (choice === before) return;

    // Moved before the answer comes back, and moved back if it does not: the click has to
    // land somewhere immediately or it reads as broken.
    for (const button of box.querySelectorAll(".seg button")) {
      const on = button === choice;
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    }
    box.querySelector(".share").hidden = wanted === "private";

    try {
      await send(box.dataset.schema, "PATCH", { visibility: wanted });
      say(box, t(SAID[wanted]));
    } catch (error) {
      for (const button of box.querySelectorAll(".seg button")) {
        const on = button === before;
        button.classList.toggle("on", on);
        button.setAttribute("aria-pressed", on ? "true" : "false");
      }
      box.querySelector(".share").hidden = before?.dataset.visibility === "private";
      say(box, t("schema.gestion.pas-enregistre", { raison: error.message }), true);
    }
    return;
  }

  const copy = event.target.closest(".manage [data-copy]");
  if (copy) {
    const box = copy.closest(".manage");
    await navigator.clipboard.writeText(box.dataset.url);
    copy.textContent = t("schema.gestion.copie");
    setTimeout(() => { copy.textContent = t("schema.gestion.copier"); }, 1600);
    return;
  }

  const button = event.target.closest(".manage [data-delete]");
  if (!button) return;
  const box = button.closest(".manage");
  // Asked once, because it cannot be undone: the string is the only copy the site has.
  if (!await askToConfirm({
    title: t("schema.gestion.supprimer-titre"),
    text: t("schema.gestion.confirmer-suppression", { nom: button.dataset.name }),
    accept: t("schema.gestion.supprimer-bouton"), danger: true,
  })) return;

  button.disabled = true;
  try {
    await send(box.dataset.schema, "DELETE");
    // On a grid the tile goes; on the schematic's own page there is nowhere left to be.
    if (button.dataset.gone) window.location.href = button.dataset.gone;
    else (box.closest(".tile") || box).remove();
  } catch (error) {
    button.disabled = false;
    say(box, t("schema.gestion.pas-supprimee", { raison: error.message }), true);
  }
});
