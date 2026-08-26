/**
 * Changing who can see a schematic, and deleting one.
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
  public: "Publiee, elle est dans la vitrine.",
  unlisted: "Accessible par lien, absente de la vitrine.",
  private: "Privee, toi seul la vois.",
};

document.addEventListener("change", async (event) => {
  const select = event.target.closest(".manage select");
  if (!select) return;
  const box = select.closest(".manage");
  try {
    await send(box.dataset.slug, "PATCH", { visibility: select.value });
    say(box, SAID[select.value]);
  } catch (error) {
    say(box, `Pas enregistre : ${error.message}`, true);
  }
});

document.addEventListener("click", async (event) => {
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
