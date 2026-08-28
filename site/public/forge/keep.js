/**
 * The two gestures on a schematic, in the browser.
 *
 * One listener for the page rather than one per control, on the pattern of `manage.js`,
 * and every word it puts on screen comes from the dictionary because none of it is in the
 * markup until somebody clicks.
 *
 * The button moves before the answer comes back and moves back if it does not: a gesture
 * this small has to land immediately or it reads as broken. The count is the exception and
 * it comes from the server, because this browser does not know whether somebody else
 * pressed it a second ago.
 */
import { ready, t } from "./i18n.js";

const token = () => decodeURIComponent(
  (document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || "");

async function send(slug, what, method) {
  const answer = await fetch(`/api/schematiques/${slug}/${what}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-XSRF-TOKEN": token(),
      Accept: "application/json",
    },
  });

  if (!answer.ok) throw new Error(t("schema.aime.refuse", { code: answer.status }));

  return answer.json();
}

document.addEventListener("click", async (event) => {
  /* Before the first word, not before the first click: the dictionary is on its way from
     the moment the page loaded, so by the time anyone has aimed at a button it is here. */
  await ready;

  const button = event.target.closest("[data-aime], [data-favori]");
  if (!button) return;

  const box = button.closest(".keep");
  const slug = box?.dataset.schema;
  if (!slug) return;

  const liking = button.hasAttribute("data-aime");
  const was = button.getAttribute("aria-pressed") === "true";

  button.setAttribute("aria-pressed", was ? "false" : "true");
  button.disabled = true;

  const word = button.querySelector(".mot");
  const before = word?.textContent;
  if (word) {
    word.textContent = liking
      ? t(was ? "schema.aime.bouton" : "schema.aime.retirer")
      : t(was ? "schema.favori.ajouter" : "schema.favori.retirer");
  }

  try {
    const state = await send(slug, liking ? "aime" : "favori", was ? "DELETE" : "POST");

    if (liking) {
      const count = box.querySelector(".compte");
      if (count) {
        /* Hidden rather than emptied at zero. "0 j'aime" answers "how many people liked
           it" on a page where the reader is asking whether it is any good, and it reads
           as a verdict. */
        count.textContent = `${state.likes} ${t("schema.unite.jaime")}`;
        count.hidden = state.likes === 0;
      }
    }
  } catch (error) {
    button.setAttribute("aria-pressed", was ? "true" : "false");
    if (word && before !== undefined) word.textContent = before;
    console.error(error);
  } finally {
    button.disabled = false;
  }
});
