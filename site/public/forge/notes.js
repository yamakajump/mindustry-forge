/**
 * Saving the private note.
 *
 * Not optimistic, unlike the like: text somebody typed must not look saved before it is.
 * The live count is written here rather than pulled from the dictionary, because a number
 * that travels through a translation placeholder disappears the day the key is missing,
 * and this repository sells nothing but numbers.
 */
import { ready, t } from "./i18n.js";

const token = () => decodeURIComponent(
  (document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || "");

const LIMIT = 1000;

function count(box) {
  const field = box.querySelector("[data-note]");
  const shown = box.querySelector(".compte-note");
  if (field && shown) shown.textContent = `${field.value.length} / ${LIMIT}`;
}

document.addEventListener("input", (event) => {
  const field = event.target.closest("[data-note]");
  if (field) count(field.closest(".note-privee"));
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-note-save]");
  if (!button) return;

  await ready;

  const box = button.closest(".note-privee");
  const field = box.querySelector("[data-note]");
  const said = box.querySelector(".note");

  button.disabled = true;
  try {
    const answer = await fetch(`/api/schematiques/${box.dataset.schema}/note`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-XSRF-TOKEN": token(),
        Accept: "application/json",
      },
      body: JSON.stringify({ body: field.value }),
    });

    if (!answer.ok) throw new Error(t("schema.aime.refuse", { code: answer.status }));

    said.textContent = t("schema.note.enregistree");
    said.hidden = false;
    said.classList.remove("bad");
  } catch (error) {
    said.textContent = error.message;
    said.hidden = false;
    said.classList.add("bad");
  } finally {
    button.disabled = false;
  }
});

for (const box of document.querySelectorAll(".note-privee")) count(box);
