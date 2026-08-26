/**
 * Changing who can see a schematic, copying its link, and deleting it.
 *
 * One listener for the page rather than one per control, and each block of controls
 * carries its own slug. There is no framework here and no reason for one: two verbs
 * against an api that already existed and was never called from anywhere.
 */
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
  if (!answer.ok) throw new Error(`refuse (${answer.status})`);
}

const SAID = {
  public: "Publiee : elle est dans la vitrine et classee avec les autres.",
  unlisted: "Par lien : elle marche pour qui l'a, et reste hors de la vitrine.",
  private: "Privee : toi seul la vois.",
};

document.addEventListener("click", async (event) => {
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
      await send(box.dataset.slug, "PATCH", { visibility: wanted });
      say(box, SAID[wanted]);
    } catch (error) {
      for (const button of box.querySelectorAll(".seg button")) {
        const on = button === before;
        button.classList.toggle("on", on);
        button.setAttribute("aria-pressed", on ? "true" : "false");
      }
      box.querySelector(".share").hidden = before?.dataset.visibility === "private";
      say(box, `Pas enregistre : ${error.message}`, true);
    }
    return;
  }

  const copy = event.target.closest(".manage [data-copy]");
  if (copy) {
    const box = copy.closest(".manage");
    await navigator.clipboard.writeText(box.dataset.url);
    copy.textContent = "Copie";
    setTimeout(() => { copy.textContent = "Copier"; }, 1600);
    return;
  }

  const button = event.target.closest(".manage [data-delete]");
  if (!button) return;
  const box = button.closest(".manage");
  // Asked once, because it cannot be undone: the string is the only copy the site has.
  if (!confirm(`Supprimer "${button.dataset.name}" ? C'est definitif.`)) return;

  button.disabled = true;
  try {
    await send(box.dataset.slug, "DELETE");
    // On a grid the tile goes; on the schematic's own page there is nowhere left to be.
    if (button.dataset.gone) window.location.href = button.dataset.gone;
    else (box.closest(".tile") || box).remove();
  } catch (error) {
    button.disabled = false;
    say(box, `Pas supprimee : ${error.message}`, true);
  }
});
