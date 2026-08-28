/**
 * Choosing the two schematics, while somebody types their names.
 *
 * The page works entirely without this. Both sides are one GET form, every suggestion is a
 * link to the same address, and a reader with no JavaScript gets the server-rendered list
 * of matches under the field. What is added here is the wait: pressing Comparer to find out
 * whether a name matched anything is a full page load per keystroke you were willing to
 * make, and there are two fields.
 *
 * The plans are the reason it is worth the module. Eight results called "Silicon" are eight
 * identical lines, and the schematic that decides it is the picture. Each result carries its
 * own code when the code is small, so drawing one costs nothing but the sprite sheet that
 * the two chosen plans already paid for.
 */

import { watch } from "./apercu.js";
import { ready, t } from "./i18n.js";

/** How long to wait for the typing to stop. Long enough to skip a word, short enough to feel live. */
const SETTLE = 200;

/** What a slug looks like, so a search result cannot send the page somewhere else. */
const SLUG = /^[a-z0-9]{1,16}$/;

const arena = document.getElementById("cmp-arene");

if (arena) {
  for (const side of arena.querySelectorAll(".cmp-cote.vide")) {
    wire(side);
  }
}

function wire(side) {
  const field = side.querySelector(".cmp-champ input");
  const list = side.querySelector(".cmp-resultats");
  if (!field || !list) return;

  const which = side.dataset.cote === "b" ? "b" : "a";
  /* The other side rides along in every link. Picking one used to drop the other, so
     filling in a comparison meant choosing the same schematic twice. */
  const other = side.dataset.autre || "";

  let timer = null;
  let inflight = null;
  /* What the last answer put on screen was for. Answers can arrive out of order, and a
     slow one for "sil" landing after a fast one for "silicon" would leave the list saying
     something the field no longer asks. */
  let showing = field.value.trim();

  const clear = () => {
    list.replaceChildren();
    field.setAttribute("aria-expanded", "false");
  };

  const search = async (term) => {
    inflight?.abort();
    inflight = new AbortController();

    try {
      const answer = await fetch(
        `/api/schematiques/recherche?q=${encodeURIComponent(term)}`,
        { signal: inflight.signal },
      );
      if (!answer.ok) throw new Error(String(answer.status));
      const { results } = await answer.json();

      if (field.value.trim() !== term) return;
      showing = term;
      render(list, results || [], which, other);
      field.setAttribute("aria-expanded", results?.length ? "true" : "false");
    } catch (error) {
      if (error.name === "AbortError") return;
      /* Said out loud rather than left as an empty list. A search that answered nothing
         and a search that never answered look the same on screen, and one of them is the
         site being broken. */
      if (field.value.trim() !== term) return;
      showing = term;
      say(list, t("schema.comparer.recherche-cassee"));
      field.setAttribute("aria-expanded", "false");
    }
  };

  field.addEventListener("input", () => {
    const term = field.value.trim();
    clearTimeout(timer);

    if (term === "") {
      inflight?.abort();
      showing = "";
      clear();
      return;
    }
    if (term === showing) return;

    timer = setTimeout(() => ready.then(() => search(term)), SETTLE);
  });

  /* Down into the list, back up out of it, Escape to leave it. The results are links, so
     Tab and Enter already work; what a list under a field owes on top of that is the arrow
     keys, because that is what every other one does. */
  field.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      const first = list.querySelector(".cmp-resultat");
      if (first) {
        event.preventDefault();
        first.focus();
      }
    } else if (event.key === "Escape" && list.childElementCount) {
      event.preventDefault();
      clear();
    }
  });

  list.addEventListener("keydown", (event) => {
    const found = [...list.querySelectorAll(".cmp-resultat")];
    const at = found.indexOf(event.target);
    if (at < 0) return;

    if (event.key === "ArrowDown" && at < found.length - 1) {
      event.preventDefault();
      found[at + 1].focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      (at === 0 ? field : found[at - 1]).focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      field.focus();
      clear();
    }
  });
}

/** One line of text where the list goes, for the two cases that are not a list. */
function say(list, message) {
  const line = document.createElement("p");
  line.className = "empty cmp-vain";
  line.textContent = message;
  list.replaceChildren(line);
}

function render(list, results, which, other) {
  if (!results.length) {
    say(list, t("schema.comparer.rien-trouve"));
    return;
  }

  const rows = document.createDocumentFragment();

  for (const found of results) {
    /* Checked here rather than trusted. This builds an address out of what an endpoint
       said, and an address built from a string somebody else chose is the one place a
       search box can turn into a link to somewhere else. */
    if (!SLUG.test(found.slug || "")) continue;

    const row = document.createElement("a");
    row.className = "cmp-resultat";
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", "false");

    const where = new URLSearchParams();
    where.set("a", which === "a" ? found.slug : other);
    where.set("b", which === "b" ? found.slug : other);
    row.href = `?${where}`;

    /* The plan, drawn by the same module the chosen plans use. `data-code` when it rode
       along in the answer, `data-slug` when it was too big to: the panel then asks for it
       itself, and only once it is about to be looked at. */
    const mini = document.createElement("span");
    mini.className = "cmp-mini";
    if (found.code) {
      mini.dataset.code = found.code;
    } else {
      mini.dataset.slug = found.slug;
    }

    const text = document.createElement("span");
    text.className = "cmp-resultat-texte";

    const name = document.createElement("span");
    name.className = "cmp-resultat-nom";
    name.textContent = found.name || found.slug;

    /* The figure stays out of the translated string. A missing key renders the key
       without substituting, so a size written as one sentence would lose the number and
       keep the word, and the number is the half a reader came for. */
    const about = document.createElement("span");
    about.className = "cmp-resultat-de";
    const size = found.blocks > 0 ? `${found.blocks} ${t("schema.comparer.blocs")} · ` : "";
    about.textContent = `${size}${t("schema.comparer.par")} ${found.author || ""}`.trim();

    text.append(name, about);
    row.append(mini, text);
    rows.append(row);
  }

  list.replaceChildren(rows);
  watch(list);
}
