/**
 * A paragraph that the browser silently cuts in two.
 *
 * `<p>` may not contain a block-level element. The parser does not complain: it closes the
 * paragraph the moment it meets one, and everything after it becomes a sibling. The markup
 * says one thing and the document says another, with nothing in between to notice.
 *
 * The catalogue's search sentence was written as a `<p class="phrase">` holding a
 * `<details>` picker, three clauses and a button. In the document, the `<p>` held its first
 * span and nothing else, and the rest sat after it. So every rule written for `.phrase` and
 * its children addressed one span; the sentence was never laid out as a sentence, its
 * punctuation floated wherever the line happened to end, and the fix everybody kept
 * reaching for was more CSS. Reading the markup could not show it and no test could see it:
 * it only exists once a browser has parsed the file.
 *
 * The rule checked here is the narrow one that bites: a paragraph that opens a block-level
 * element before it closes. Not a validator - a validator is a dependency, and this is one
 * mistake, made once, that cost an afternoon.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const racine = new URL("../../site/", import.meta.url);
const lire = (chemin) => readFileSync(new URL(chemin, racine), "utf8");

/**
 * The elements that close a paragraph, from the HTML parser's own list.
 *
 * Not every block element: the ones this repository actually writes, plus `<p>` itself,
 * which closes the previous one just as firmly. `<span>`, `<a>`, `<b>`, `<kbd>`, `<img>`,
 * `<input>`, `<select>`, `<button>` and `<label>` are inline and belong inside a paragraph.
 */
const BLOCS = ["p", "div", "details", "ul", "ol", "li", "table", "section", "article",
  "header", "footer", "nav", "form", "h1", "h2", "h3", "h4", "figure", "blockquote", "pre"];

const OUVRE = new RegExp(`<(${BLOCS.join("|")})[\\s>]`, "i");

/** Every template and page that a browser parses as HTML. */
function pages() {
  const trouvees = [];
  const marcher = (dossier, suffixe, prefixe) => {
    for (const entree of readdirSync(new URL(dossier, racine), { withFileTypes: true })) {
      if (entree.isDirectory()) {
        marcher(`${dossier}${entree.name}/`, suffixe, `${prefixe}${entree.name}/`);
      } else if (entree.name.endsWith(suffixe)) {
        trouvees.push([`${prefixe}${entree.name}`, lire(`${dossier}${entree.name}`)]);
      }
    }
  };
  marcher("resources/views/", ".blade.php", "");
  for (const nom of ["public/index.html", "public/outils/logique.html",
    "public/outils/planificateur.html"]) {
    trouvees.push([nom, lire(nom)]);
  }
  return trouvees;
}

/**
 * What each `<p>` holds before it closes, as the parser would read it.
 *
 * Comments come out first, in both dialects: a `{{-- --}}` explaining a `<div>` is not a
 * `<div>`. Blade expressions come out too, since `{{ $x }}` never emits markup here.
 */
function paragraphes(source) {
  /* Blanked rather than removed, keeping the line breaks: the caller turns an index into a
     line number against the original file, and a comment taken out shifts every index after
     it. A failure pointing at the wrong line costs the reader exactly the time this file is
     meant to save them. */
  const blanchir = (texte) => texte.replace(/[^\n]/g, " ");
  const propre = source
    .replace(/\{\{--[\s\S]*?--\}\}/g, blanchir)
    .replace(/<!--[\s\S]*?-->/g, blanchir)
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, blanchir)
    .replace(/\{\{[\s\S]*?\}\}/g, blanchir);

  const dedans = [];
  const ouvertures = [...propre.matchAll(/<p[\s>]/gi)];
  for (const ouverture of ouvertures) {
    const depuis = ouverture.index;
    const fin = propre.toLowerCase().indexOf("</p>", depuis);
    dedans.push([depuis, propre.slice(depuis + 3, fin === -1 ? propre.length : fin)]);
  }
  return dedans;
}

test("no paragraph opens a block element the parser would close it on", () => {
  const fautes = [];

  for (const [nom, source] of pages()) {
    for (const [ou, contenu] of paragraphes(source)) {
      const coupable = contenu.match(OUVRE);
      if (!coupable) continue;
      const ligne = source.slice(0, ou).split("\n").length;
      fautes.push(`${nom}:${ligne} — a <p> holding a <${coupable[1].toLowerCase()}>:`
        + ` the parser closes the paragraph there, and everything after it`
        + ` becomes a sibling. Use a <div>.`);
    }
  }

  assert.deepEqual(fautes, [], `\n  ${fautes.join("\n  ")}\n`);
});

test("it sees the mistake, and lets an inline paragraph through", () => {
  const casse = paragraphes('<p class="phrase"><span>Je cherche</span><details>...</details></p>');
  assert.equal(casse.length, 1);
  assert.match(casse[0][1], OUVRE);

  const bon = paragraphes('<p>Un <b>chiffre</b>, un <a href="/x">lien</a> et un <input></p>');
  assert.equal(bon.length, 1);
  assert.equal(bon[0][1].match(OUVRE), null);

  // A comment naming a block element is not one.
  const commente = paragraphes('<p>{{-- see the <div> above --}}Texte</p>');
  assert.equal(commente[0][1].match(OUVRE), null);
});
