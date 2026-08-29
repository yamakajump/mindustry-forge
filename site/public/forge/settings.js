/**
 * What the visitor chose last time, kept in their own browser.
 *
 * Every panel on this site opened from a hard-coded default, on every load. Each one taken
 * alone is a shrug; together they are a site that recognises nobody, and the same three
 * answers get re-entered on every visit by somebody who works on Erekir with a wide brush.
 *
 * One key per preference, all under `forge:`, on the pattern the editor's recents row
 * already followed. Kept small on purpose: this stores what a control is set to, never
 * what a member owns. An account's plans, folders and favourites live on the server, where
 * they survive a machine, and nothing here should tempt anybody into keeping them twice.
 *
 * A STORED VALUE IS UNTRUSTED INPUT. It was written by an older version of this page and
 * read by this one, which is the same shape as a query string somebody edited: a planet
 * that no longer exists, a tool that was renamed, a number that came back as a string. So
 * `recall` takes what is acceptable and returns the fallback for anything else, rather than
 * handing a panel a value it will fail on in a way nobody can reproduce.
 *
 * Writing can fail - private mode, a full quota - and losing a preference is a nuisance
 * while losing the editor is not. Both halves swallow, like `readRecents` does.
 */

const PREFIX = "forge:";

/**
 * What was stored under `key`, if it is still one of `allowed`.
 *
 * @param {string} key without the prefix
 * @param {*} fallback returned when nothing is stored, or when what is stored is not
 *   acceptable
 * @param {null|Array|function(*): boolean} allowed the list it has to be in, or a predicate.
 *   Null accepts any string, which is right for a free-form value and wrong for anything
 *   that indexes into something.
 */
export function recall(key, fallback = null, allowed = null) {
  let kept;
  try {
    kept = localStorage.getItem(PREFIX + key);
  } catch {
    return fallback;
  }
  if (kept === null) return fallback;

  if (Array.isArray(allowed)) return allowed.includes(kept) ? kept : fallback;
  if (typeof allowed === "function") return allowed(kept) ? kept : fallback;
  return kept;
}

/**
 * The same, for a number.
 *
 * Bounds rather than a list, and the fallback for anything that is not a finite number
 * inside them: a slider handed a NaN renders a thumb nobody can find again.
 */
export function recallNumber(key, fallback, low, high) {
  const kept = Number(recall(key, null));
  return Number.isFinite(kept) && kept >= low && kept <= high ? kept : fallback;
}

/** Keep it. An empty string is a value; use `forget` to say there is none. */
export function remember(key, value) {
  try {
    localStorage.setItem(PREFIX + key, String(value));
  } catch {
    /* See the note at the top: a preference is worth less than the page it is on. */
  }
}

export function forget(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* Same. */
  }
}
