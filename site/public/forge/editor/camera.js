/**
 * Où l'on regarde, et quelle case est sous le curseur.
 *
 * `x` et `y` sont la tuile au centre de la vue, `scale` le nombre de pixels par tuile.
 * L'écran compte ses pixels vers le bas, la carte compte ses tuiles vers le haut, et cette
 * inversion est la moitié des erreurs d'une case.
 *
 * L'échelle reste entière. Une échelle fractionnaire fait scintiller un sprite de 32
 * pixels le long de sa propre grille, ce qui se lit comme un défaut de rendu plutôt que
 * comme du pixel art : `render.js` prend la même précaution pour la même raison.
 */

/** En dessous, une tuile n'est plus lisible ; au dessus, on compte les pixels du sprite. */
const MIN_SCALE = 4;
const MAX_SCALE = 64;

const clamp = (value) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(value)));

export function createCamera({ scale = 24, x = 0, y = 0 } = {}) {
  const camera = { scale: clamp(scale), x, y };

  /** Le point du monde, en tuiles fractionnaires, sous un pixel de l'écran. */
  const worldAt = (px, py, viewport) => ({
    wx: camera.x + (px - viewport.width / 2) / camera.scale,
    wy: camera.y - (py - viewport.height / 2) / camera.scale,
  });

  /**
   * La case sous un pixel.
   *
   * Arrondi vers le bas, jamais au plus proche. Avec `Math.round`, la moitié de chaque
   * tuile déborde sur sa voisine et un clic sur la droite d'une case pose le bloc à côté.
   */
  camera.toTile = (px, py, viewport) => {
    const { wx, wy } = worldAt(px, py, viewport);
    return { x: Math.floor(wx), y: Math.floor(wy) };
  };

  /** Le pixel d'un point de la carte. C'est l'inverse exact de `toTile`. */
  camera.toScreen = (tx, ty, viewport) => ({
    px: viewport.width / 2 + (tx - camera.x) * camera.scale,
    py: viewport.height / 2 - (ty - camera.y) * camera.scale,
  });

  /**
   * Le rectangle qu'une case occupe à l'écran, coin haut gauche en tête.
   *
   * Distinct de `toScreen` et pas par coquetterie : `toScreen` convertit un **point**, et
   * le point d'une case est son coin bas gauche, alors que dessiner veut le coin **haut**
   * gauche, puisque l'écran compte à l'envers de la carte. Confondre les deux décale
   * chaque sprite d'une tuile vers le haut, ce qui se voit à peine sur une grille régulière
   * et saute aux yeux dès qu'un gros bloc en chevauche un petit.
   */
  camera.rectOf = (tx, ty, viewport) => ({
    ...camera.toScreen(tx, ty + 1, viewport),
    size: camera.scale,
  });

  /**
   * Zoomer autour d'un point, en gardant sous le curseur ce qui y était.
   *
   * Zoomer autour du centre de la vue est plus simple à écrire et détestable à l'usage :
   * ce qu'on regarde s'échappe dès qu'on approche, et il faut redéplacer la vue à chaque
   * cran de molette.
   */
  camera.zoomAt = (factor, px, py, viewport) => {
    const { wx, wy } = worldAt(px, py, viewport);
    const before = camera.scale;
    camera.scale = clamp(camera.scale * factor);
    if (camera.scale === before) return camera;
    camera.x = wx - (px - viewport.width / 2) / camera.scale;
    camera.y = wy + (py - viewport.height / 2) / camera.scale;
    return camera;
  };

  /** Tirer l'image de `dx` pixels vers la droite montre la carte d'autant vers la gauche. */
  camera.pan = (dx, dy) => {
    camera.x -= dx / camera.scale;
    camera.y += dy / camera.scale;
    return camera;
  };

  /** Cadrer une boîte entière, avec un peu d'air autour. */
  camera.frame = (box, viewport) => {
    const width = Math.max(1, box.width);
    const height = Math.max(1, box.height);
    camera.scale = clamp(Math.floor(
      Math.min(viewport.width / (width + 2), viewport.height / (height + 2))));
    camera.x = box.left + (width - 1) / 2;
    camera.y = box.bottom + (height - 1) / 2;
    return camera;
  };

  return camera;
}
