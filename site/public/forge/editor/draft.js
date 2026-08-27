/**
 * Le brouillon, gardé dans le navigateur.
 *
 * Vingt minutes de construction ne doivent pas tenir à un onglet qu'on ferme par erreur.
 * Le plateau part dans `localStorage` à chaque geste, et revient à l'ouverture.
 *
 * Il est **proposé**, jamais restauré d'office. Écraser silencieusement ce que quelqu'un
 * vient de coller par un brouillon vieux de trois jours est pire que de perdre le
 * brouillon : dans un cas on perd du travail qu'on savait avoir, dans l'autre on perd du
 * travail qu'on croyait avoir devant les yeux.
 */

const KEY = "forge:brouillon";

/** Combien de temps un brouillon vaut encore la peine d'être proposé. */
const KEEP_FOR = 7 * 24 * 60 * 60 * 1000;

export function keepDraft(board, now) {
  try {
    if (!board.tiles.length && !Object.keys(board.ground).length) {
      localStorage.removeItem(KEY);
      return;
    }
    localStorage.setItem(KEY, JSON.stringify({
      at: now,
      tiles: board.tiles.map(({ x, y, block, rotation, config }) =>
        ({ x, y, block, rotation, config: config || undefined })),
      ground: board.ground,
    }));
  } catch {
    /* Un navigateur en navigation privée refuse d'écrire, et un quota plein aussi. Perdre
       le brouillon est ennuyeux ; faire tomber l'éditeur pour ça serait absurde. */
  }
}

export function readDraft(now) {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!kept?.tiles?.length && !Object.keys(kept?.ground || {}).length) return null;
    if (now - (kept.at || 0) > KEEP_FOR) return null;
    return kept;
  } catch {
    return null;
  }
}

export function dropDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* voir plus haut */ }
}

/** Depuis combien de temps, dit comme on le dirait à voix haute. */
export function ageOf(at, now) {
  /* Sous la minute, on ne compte pas : `Math.round` sur trente secondes annonçait « il y a
     1 minute » pour un brouillon écrit à l'instant même. */
  if (now - at < 60000) return "à l'instant";
  const minutes = Math.round((now - at) / 60000);
  if (minutes < 60) return `il y a ${minutes} minute${minutes > 1 ? "s" : ""}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} heure${hours > 1 ? "s" : ""}`;
  const days = Math.round(hours / 24);
  return `il y a ${days} jour${days > 1 ? "s" : ""}`;
}
