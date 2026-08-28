/**
 * One string, in the language the page asked for.
 *
 * Half the text on this site never reaches a server. The analyser and the editor are
 * static pages, and everything they say is written by JavaScript, so Laravel's own
 * localisation cannot reach it. This is the other half of it.
 *
 * Deliberately small. The need is to swap a key for a string, not to decline nouns: a
 * dictionary, a lookup, and braces for the parts that change. A library that pluralises
 * in Arabic would be a dependency to carry for a site that ships one language.
 *
 * French stays written in clear in the pages themselves, and a key only ever replaces it.
 * So a reader with JavaScript off, or one who arrives before the dictionary does, reads
 * French rather than `nav.analyser`.
 */

/** The language the site is written in. Its dictionary is the one the others are built from. */
export const DEFAULT_LOCALE = "fr";

/* Rejected rather than passed to `fetch`: `locale` is read off the document, and a
   document is not somewhere to take a URL fragment from on trust. */
const LOCALE = /^[a-z]{2}(-[a-z]{2})?$/i;

let locale = DEFAULT_LOCALE;
let dictionary = Object.create(null);

/* Said once per key. A missing string tends to be missing on every render, and a console
   scrolling the same line is a console nobody reads. */
const said = new Set();

function warn(message) {
  if (said.has(message)) return;
  said.add(message);
  if (typeof console !== "undefined") console.warn(`i18n: ${message}`);
}

/**
 * The string filed under `key`, with `{placeholders}` filled from `params`.
 *
 * Returns the key itself when there is nothing filed under it. Ugly on purpose: a key on
 * screen is a bug someone reports, where a blank string is a bug nobody notices. The
 * coverage test is what stops it reaching a reader.
 */
export function t(key, params) {
  const line = dictionary[key];
  if (line === undefined) {
    warn(`key missing from the ${locale} dictionary: ${key}`);
    return key;
  }
  if (params === undefined) return line;

  return line.replace(/\{(\w+)\}/g, (whole, name) => {
    if (params[name] === undefined) {
      warn(`${key} expects {${name}}, which was not supplied`);
      return whole;
    }
    return params[name];
  });
}

/** The language currently in use. */
export function currentLocale() {
  return locale;
}

/**
 * Install a dictionary that is already in hand.
 *
 * This is the whole of what `useLocale` does once the file has arrived, and it is what the
 * tests use: they read the same JSON the browser fetches, so nothing is tested against a
 * dictionary written for the occasion.
 */
export function useDictionary(entries, next = DEFAULT_LOCALE) {
  dictionary = Object.assign(Object.create(null), entries);
  locale = next;
  said.clear();
}

/**
 * Fetch the dictionary for `next` and install it.
 *
 * Resolved against this module rather than against the page: the analyser is served at
 * `/`, at `/editer` and one day elsewhere, and a relative path would mean a different file
 * each time.
 */
export async function useLocale(next) {
  if (!LOCALE.test(next)) throw new Error(`langue invalide : ${next}`);
  const answer = await fetch(new URL(`./lang/${next}.json`, import.meta.url));
  if (!answer.ok) throw new Error(`dictionnaire ${next} illisible (${answer.status})`);
  useDictionary(await answer.json(), next);
}

/**
 * Translate what is already in the page.
 *
 * `data-i18n` carries the key for an element's text, `data-i18n-<attribut>` for one of its
 * attributes: `data-i18n-placeholder`, `data-i18n-aria-label`.
 *
 * Does nothing while the site is in the language it is written in, which is the point of
 * writing it in clear: there is no work to do, so there is no flash to avoid.
 */
export function translate(root = document) {
  if (locale === DEFAULT_LOCALE) return;

  for (const node of root.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of root.querySelectorAll("*")) {
    for (const { name, value } of node.attributes) {
      if (!name.startsWith("data-i18n-")) continue;
      node.setAttribute(name.slice("data-i18n-".length), t(value));
    }
  }
}

/**
 * The dictionary, on its way, asked for as soon as this module is imported.
 *
 * The language comes from `<html lang>`, which the server writes: one decision, taken in
 * one place, and the two halves of the site cannot end up disagreeing about it.
 *
 * Fetched for French too, unlike `translate`. What is already written in the page needs
 * no dictionary, but a string a script builds after a click was never written anywhere,
 * so it has to be looked up whatever the language.
 *
 * Anything that puts a string on screen should await this first.
 */
export const ready = typeof document === "undefined"
  ? Promise.resolve()
  : (async () => {
      try {
        await useLocale(document.documentElement.lang || DEFAULT_LOCALE);
      } catch (error) {
        /* Swallowed on purpose. A dictionary that did not arrive is a page missing some
           of its words, which is bad; a page that throws on load because of it is worse,
           and everything already drawn stays readable. */
        warn(error.message);
      }
    })();
