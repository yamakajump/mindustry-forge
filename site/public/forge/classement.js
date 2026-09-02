/**
 * The way somebody likes to read the catalogue, kept in their own browser.
 *
 * The sort is the one thing on that page that is a preference rather than a question. A
 * filter is something you asked once, on purpose, and finding the list still narrowed to
 * silicon three days later would be a page answering a question nobody remembers asking. A
 * sort is how you like to read a list, and re-choosing it on every visit is exactly the
 * shrug this preference is about.
 *
 * ONE RULE, AND IT IS THE ISSUE'S OWN: an address wins over a memory. `/schemas?tri=seen`
 * shared in a thread has to open on `seen` for whoever follows it, whatever their own last
 * sort was, or a shared link stops meaning one thing. So this acts only on an address that
 * says nothing at all. Anything in the query string and it stays quiet, sort or not.
 *
 * It replaces rather than pushes, so the back button leaves the site instead of bouncing
 * between two spellings of one page, and it never navigates to the default, which would be
 * a round trip to arrive where the server already was.
 *
 * A crawler reads the plain page: this runs in a browser, and `/schemas` stays canonical and
 * indexed. The memory is one reader's on one machine, which is the whole reason it lives
 * here and not in a cookie the server would have to answer differently for.
 */

import { recall, remember } from "./settings.js";

/** What the server falls back to, which is what a bare address already shows. */
export const DEFAUT = "new";

/**
 * What to do, given an address and a memory. No document, so it can be tested.
 *
 * @returns {{retenir: string}|{aller: string}|null}
 */
export function decision({ search, offerts, restaurables = offerts, garde }) {
  const demande = new URLSearchParams(search).get("tri");

  /* Written only when the address names a sort, which is the only case where the reader
     chose one. Writing first and reading after was this file's first shape and could not
     work: a bare address shows the default, so it stored the default over whatever was
     there and then found nothing worth restoring. */
  if (demande && offerts.includes(demande)) return { retenir: demande };

  if (search) return null;

  /* Restored only if this page can honour it. Three of the six sorts compare what a
     schematic produces and have nothing to compare while no item is chosen; the page greys
     them and the server falls back. Sending somebody to `?tri=dense` on a bare catalogue
     produced an address that said one thing while the list showed another, which is worse
     than not remembering. An address naming one is still obeyed: it is the reader's. */
  if (!restaurables.includes(garde) || garde === DEFAUT) return null;

  return { aller: `?tri=${encodeURIComponent(garde)}` };
}

/** The sort one tab stands for, read off its own address. */
const triDe = (lien) => new URL(lien.href, location.href).searchParams.get("tri");

/**
 * Every sort the page offers, and the ones it can actually apply as it stands.
 *
 * Read off the tabs rather than written out again here: the list of six lives in the
 * controller, and a second copy would start disagreeing with it the day a seventh arrives.
 */
function offertsSurLaPage() {
  const liens = [...document.querySelectorAll(".tris .tri")];
  return {
    offerts: liens.map(triDe).filter(Boolean),
    // The "gris" class is the page saying a sort has nothing to compare, no item chosen.
    restaurables: liens.filter((a) => !a.classList.contains("gris")).map(triDe).filter(Boolean),
  };
}

export function souvenir() {
  const { offerts, restaurables } = offertsSurLaPage();
  if (!offerts.length) return;

  const quoi = decision({
    search: location.search,
    offerts,
    restaurables,
    garde: recall("catalogue.tri", DEFAUT, offerts),
  });

  if (quoi?.retenir) remember("catalogue.tri", quoi.retenir);
  if (quoi?.aller) location.replace(location.pathname + quoi.aller);
}

if (typeof document !== "undefined" && document.querySelector(".tris")) souvenir();
