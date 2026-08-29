/**
 * Making, renaming and deleting a folder, and taking a schematic out of one.
 *
 * One listener for the page, on the pattern of `manage.js` and `keep.js`: the `XSRF-TOKEN`
 * cookie, no framework, and every word said after a click coming from the dictionary
 * rather than from the markup.
 *
 * Nothing here is optimistic, unlike the like. A name somebody typed must not appear saved
 * until the server has it, and a folder must not vanish from the page before it is gone.
 */
import { ready, t } from "./i18n.js";
import { askForText, askToConfirm } from "./dialog.js";

const token = () => decodeURIComponent(
  (document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || "");

async function send(path, method, body) {
  const answer = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-XSRF-TOKEN": token(),
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!answer.ok) {
    /* The server's own words when it refuses, rather than a generic failure: a folder five
       deep and a folder moved into its own child are refused for different reasons, and
       the person needs to know which. */
    const said = await answer.json().catch(() => null);
    const first = said?.message || t("schema.aime.refuse", { code: answer.status });
    throw new Error(first);
  }

  return answer.json();
}

function say(box, text, bad) {
  const note = box?.querySelector(".note");
  if (!note) return;
  note.textContent = text;
  note.hidden = !text;
  note.classList.toggle("bad", !!bad);
}

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-creer]");
  if (!form) return;

  event.preventDefault();
  await ready;

  const name = form.querySelector("#nom").value.trim();
  if (!name) return;

  const icon = form.querySelector("#icone").value;

  try {
    await send("/api/dossiers", "POST", { name, icon: icon || null });
    location.reload();
  } catch (error) {
    say(form, error.message, true);
  }
});

document.addEventListener("change", async (event) => {
  const box = event.target.closest("[data-ranger]");
  if (!box) return;

  await ready;

  const wanted = box.checked;
  const path = `/api/dossiers/${box.dataset.dossier}/schemas/${box.dataset.schema}`;

  try {
    await send(path, wanted ? "POST" : "DELETE");
  } catch (error) {
    // The box goes back where it was: it says what the server knows, not what was
    // clicked. A box left ticked on a filing the server refused is a silent lie.
    box.checked = !wanted;
    say(box.closest("details"), error.message, true);
  }
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-renommer], [data-supprimer], [data-retirer], [data-legender]");
  if (!button) return;

  await ready;

  const card = button.closest("[data-dossier]");
  const slug = card?.dataset.dossier || button.dataset.dossier;
  if (!slug) return;

  try {
    if (button.hasAttribute("data-renommer")) {
      const name = await askForText({
        title: t("dossiers.gestion.nom"), label: t("dossiers.gestion.nom"),
        value: button.dataset.nom || "",
      });
      if (name === null || name.trim() === "") return;
      await send(`/api/dossiers/${slug}`, "PATCH", { name: name.trim() });
    } else if (button.hasAttribute("data-supprimer")) {
      /* What it holds does not go with it, and the question says so: a deletion believed
         to be recursive is the one that gets regretted. */
      if (!await askToConfirm({
        title: t("dossiers.gestion.supprimer-titre"),
        text: t("dossiers.gestion.supprimer-confirme"),
        accept: t("dossiers.gestion.supprimer-bouton"), danger: true,
      })) return;
      await send(`/api/dossiers/${slug}`, "DELETE");
    } else if (button.hasAttribute("data-legender")) {
      /* Null and the empty string are different answers here, and `askForText` keeps them
         apart the way `prompt` did: dismissing leaves the caption alone, emptying the field
         clears it. */
      const note = await askForText({
        title: t("dossiers.gestion.legender"), label: t("dossiers.gestion.legender"),
        value: button.dataset.note || "",
      });
      if (note === null) return;
      await send(`/api/dossiers/${button.dataset.dossier}/schemas/${button.dataset.schema}`, "PATCH", { note });
    } else {
      await send(`/api/dossiers/${slug}/schemas/${button.dataset.schema}`, "DELETE");
    }

    location.reload();
  } catch (error) {
    say(card, error.message, true);
    console.error(error);
  }
});
