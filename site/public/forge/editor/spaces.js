/**
 * Work spaces: an account's saved editor boards, kept on the server so a build started on
 * one machine can be picked up on another.
 *
 * The single anonymous draft in `draft.js` stays exactly what it is: one board, one
 * machine, seven days, in `localStorage`, offered and never imposed. A work space is what
 * signing in buys on top of that, and this module never touches `localStorage` itself
 * except to read the existing draft once, when asked to import it.
 *
 * A "board" here is always a plain snapshot, `{ tiles, ground, frames }`, the same shape
 * `draft.js` already writes out. Never the live board object from `state.js`: that one also
 * carries `done`/`undone` (the undo history) and methods, neither of which belongs in a
 * save. The caller builds the snapshot with `board.snapshot()`, never by hand: leaving
 * `frames` out here would drop every frame a player drew, silently, on the next reopen.
 *
 * Every request needs an account, so every one of them can fail with "not signed in". This
 * module does not decide what that means on screen: it reports a status and, on failure, a
 * reason, and leaves the interface to say it in its own words.
 */

import { dropDraft, readDraft } from "./draft.js";

const csrf = () => decodeURIComponent(
  (document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || "");

/**
 * One request to the work space API, decoded and checked.
 *
 * Throws on anything that is not a 2xx, with the server's own validation message when
 * there is one (quota reached, board too large: both already French, from `edition.php`)
 * and a short fallback otherwise. `keepalive` is the one flag worth exposing here: it is
 * what lets a save started in `beforeunload` survive the page going away, at the cost of
 * the small body limit browsers put on keepalive requests.
 */
async function request(path, { method = "GET", body, keepalive = false } = {}) {
  const answer = await fetch(path, {
    method,
    keepalive,
    headers: {
      "Content-Type": "application/json",
      "X-XSRF-TOKEN": csrf(),
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data = null;
  try { data = await answer.json(); } catch { /* a 204, or a body that is not JSON */ }

  if (!answer.ok) {
    const reason = data?.errors ? Object.values(data.errors).flat()[0] : data?.message;
    // A gap in the i18n groundwork, not something to fix inside this module: see the same
    // admission in `draft.js` about `ageOf`. Reached only when the server itself could not
    // be asked (offline, DNS, a 500 with no JSON body) - every refusal the server can
    // explain already answers in French, from `edition.php`.
    throw new Error(reason || `la sauvegarde a été refusée (${answer.status})`);
  }
  return data;
}

/** Whether a visitor is signed in, and as whom. `null` when nobody is. */
export async function whoAmI() {
  return (await request("/api/moi")).user;
}

/** This account's spaces, most recently opened first. */
export async function listSpaces() {
  return (await request("/api/espaces")).spaces;
}

/**
 * Save a new space. Rejects with the quota message once `Space::MAX_SPACES` is reached,
 * or the size message once the encoded board passes `Space::MAX_BOARD_BYTES`.
 */
export async function createSpace(name, board) {
  return request("/api/espaces", { method: "POST", body: { name, board } });
}

/**
 * Reopen a space: fetches its board and marks it opened, which is what "my plans" sorts
 * on. Call this once, when a space is chosen to work on - not on every save; `saveBoard`
 * marks it opened too, since a space being actively saved is, by definition, open.
 */
export async function openSpace(slug) {
  return request(`/api/espaces/${slug}`);
}

export async function renameSpace(slug, name) {
  return request(`/api/espaces/${slug}`, { method: "PATCH", body: { name } });
}

/**
 * Write a full snapshot over whatever the space held. Never a delta: the whole point of
 * keeping one column is that a save cannot disagree with the save before it.
 */
export async function saveBoard(slug, board, { keepalive = false } = {}) {
  return request(`/api/espaces/${slug}`, { method: "PATCH", body: { board }, keepalive });
}

export async function deleteSpace(slug) {
  await request(`/api/espaces/${slug}`, { method: "DELETE" });
}

/** Whether a local draft exists worth offering as a first space. Reads nothing else. */
export function localDraftAvailable() {
  return readDraft(Date.now()) !== null;
}

/**
 * Turn the local draft into a new space, named `name`.
 *
 * Only ever called from an explicit "yes, import it" click somewhere upstream: this
 * function does the importing, it does not decide to. Offering it silently would repeat
 * exactly the mistake `draft.js` was written to avoid on its own screen - overwriting what
 * somebody has just pasted with something old is worse than losing the old thing.
 *
 * Drops the local draft once the import has actually been saved, and not before: a failed
 * `createSpace` (offline, quota, too big) must leave the original draft exactly where it
 * was, or the attempt would cost the very thing it was trying to keep.
 */
export async function importLocalDraft(name) {
  const kept = readDraft(Date.now());
  if (!kept) throw new Error("il n'y a pas de brouillon local à importer");
  const space = await createSpace(name, { tiles: kept.tiles, ground: kept.ground, frames: kept.frames || [] });
  dropDraft();
  return space;
}

/**
 * A deferred, single-flight autosave for one open space.
 *
 * `schedule(board)` is meant to be called on every gesture, exactly like `commit()` calls
 * `keepDraft` today; the actual save waits `delay` ms after the last call before it fires,
 * so a hundred gestures in a row cost one request and not a hundred.
 *
 * Never two saves in flight at once. A board scheduled while one is already in flight is
 * not dropped and does not start a second request racing the first: it is remembered and
 * sent the moment the first one returns, so the last board always wins.
 *
 * `onStatus(status, detail)` is called with `"saving"`, `"saved"` or `"failed"` (`detail`
 * carries the reason on `"failed"` only). This module writes nothing to the screen itself;
 * that is the one status the interface is expected to show, per the design.
 */
export function autosave(slug, { delay = 4000, onStatus } = {}) {
  let timer = null;
  let inFlight = false;
  let pending = null;

  const report = (status, detail) => onStatus?.(status, detail);

  async function flushNow(board, { keepalive = false } = {}) {
    clearTimeout(timer);
    timer = null;
    if (inFlight) {
      pending = board;
      return;
    }
    inFlight = true;
    report("saving");
    try {
      await saveBoard(slug, board, { keepalive });
      report("saved");
    } catch (error) {
      report("failed", error.message);
    } finally {
      inFlight = false;
      if (pending) {
        const next = pending;
        pending = null;
        flushNow(next);
      }
    }
  }

  return {
    /** Call on every gesture. Actually saves `delay` ms after the last call. */
    schedule(board) {
      clearTimeout(timer);
      timer = setTimeout(() => flushNow(board), delay);
    },
    /**
     * Save right now rather than waiting out the delay, e.g. from `beforeunload`.
     *
     * Best-effort by nature: `keepalive` is what lets the request survive the page going
     * away, but Chromium caps a keepalive request's body around 64 KB in total, which a
     * well filled board can exceed. The debounced save above is the real protection, since
     * it already runs every few seconds of activity; this is the tail end since the last
     * one, not the only line of defence.
     */
    flush(board) {
      flushNow(board, { keepalive: true });
    },
    /** Cancel a pending debounced save without sending it, e.g. when a space is closed. */
    stop() {
      clearTimeout(timer);
      timer = null;
    },
  };
}
