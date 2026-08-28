/**
 * The draft, kept in the browser.
 *
 * Twenty minutes of building must not hang on a tab closed by mistake. The board goes into
 * `localStorage` on every gesture and comes back when the editor opens.
 *
 * It is **offered**, never restored on its own. Quietly overwriting what somebody has just
 * pasted with a three-day-old draft is worse than losing the draft: one loses work you knew
 * you had, the other loses work you thought was in front of you.
 */

const KEY = "forge:brouillon";

/** How long a draft is still worth offering. */
const KEEP_FOR = 7 * 24 * 60 * 60 * 1000;

export function keepDraft(board, now) {
  try {
    const frames = board.frames || [];
    if (!board.tiles.length && !Object.keys(board.ground).length && !frames.length) {
      localStorage.removeItem(KEY);
      return;
    }
    localStorage.setItem(KEY, JSON.stringify({
      at: now,
      tiles: board.tiles.map(({ x, y, block, rotation, config }) =>
        ({ x, y, block, rotation, config: config || undefined })),
      ground: board.ground,
      /* Only ever written from here on. A draft kept by yesterday's editor has no such
         key, and that is not a version to read around: it is the "no frame at all" case,
         which `readDraft` already hands back as an empty list on its own. */
      frames,
    }));
  } catch {
    /* A browser in private mode refuses to write, and so does a full quota. Losing the
       draft is a nuisance; bringing the editor down over it would be absurd. */
  }
}

export function readDraft(now) {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) || "null");
    const hasFrames = !!kept?.frames?.length;
    if (!kept?.tiles?.length && !Object.keys(kept?.ground || {}).length && !hasFrames) return null;
    if (now - (kept.at || 0) > KEEP_FOR) return null;
    /* A draft written before frames existed carries no `frames` key at all. Defaulting it
       here, once, is the entire migration: nobody downstream has to know the key could be
       missing, and a draft from yesterday opens exactly as one from today. */
    return { ...kept, frames: kept.frames || [] };
  } catch {
    return null;
  }
}

export function dropDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* see above */ }
}

/** One counted French part: "3 blocs", "1 cadre", never with the count itself missing. */
function partOf(count, singular, plural = `${singular}s`) {
  return `${count} ${count > 1 ? plural : singular}`;
}

/** French list punctuation: "A", "A et B", "A, B et C". Never an Oxford comma before "et". */
function joinFr(parts) {
  if (parts.length < 2) return parts[0] || "";
  return `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}`;
}

/**
 * What a kept draft actually holds, said in French, naming only the parts that are not
 * zero.
 *
 * A draft is kept when it has blocks, painted ground or frames - see `keepDraft` above -
 * and any one of those alone is enough. Saying "un brouillon de 0 blocs" for a draft that
 * is all painted ground is an exact number answering a question nobody asked: this
 * repository's own name for that defect. Say what is there instead, and leave out what
 * is not.
 */
export function describeDraft(kept) {
  const blocks = kept.tiles?.length || 0;
  const ground = Object.keys(kept.ground || {}).length;
  const frames = kept.frames?.length || 0;

  const parts = [];
  if (blocks) parts.push(partOf(blocks, "bloc"));
  if (ground) parts.push(partOf(ground, "case de sol peinte", "cases de sol peintes"));
  if (frames) parts.push(partOf(frames, "cadre"));

  return joinFr(parts);
}

/** How long ago, said the way somebody would say it out loud. */
export function ageOf(at, now) {
  /* Under a minute is not counted: `Math.round` on thirty seconds announced "one minute
     ago" for a draft written that very second.

     The strings below stay French because a player reads them. They are also written in
     plain text rather than going through `t()`, which is a gap in the i18n groundwork
     rather than something to fix inside a translation pass. */
  if (now - at < 60000) return "à l'instant";
  const minutes = Math.round((now - at) / 60000);
  if (minutes < 60) return `il y a ${minutes} minute${minutes > 1 ? "s" : ""}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} heure${hours > 1 ? "s" : ""}`;
  const days = Math.round(hours / 24);
  return `il y a ${days} jour${days > 1 ? "s" : ""}`;
}
