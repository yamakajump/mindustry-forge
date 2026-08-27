/**
 * Where the view is looking, and which tile is under the cursor.
 *
 * `x` and `y` are the tile at the centre of the view, `scale` the number of pixels per tile.
 * The screen counts its pixels downwards and the map counts its tiles upwards, and that
 * inversion is half of all one-tile mistakes.
 *
 * The scale stays whole. A fractional scale makes a 32-pixel sprite shimmer along its own
 * grid, which reads as a rendering defect rather than as pixel art: `render.js` takes the
 * same precaution for the same reason.
 */

/** Below this a tile stops being readable; above it, you are counting sprite pixels. */
const MIN_SCALE = 4;
const MAX_SCALE = 64;

/** The real size of a block sprite in the game's atlas. */
const NATIVE = 32;

const clamp = (value) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(value)));

export function createCamera({ scale = 24, x = 0, y = 0 } = {}) {
  const camera = { scale: clamp(scale), x, y };

  /** The world point, in fractional tiles, under a screen pixel. */
  const worldAt = (px, py, viewport) => ({
    wx: camera.x + (px - viewport.width / 2) / camera.scale,
    wy: camera.y - (py - viewport.height / 2) / camera.scale,
  });

  /**
   * The tile under a pixel.
   *
   * Rounded down, never to nearest. With `Math.round`, half of every tile spills onto its
   * neighbour and a click on the right of a tile drops the block beside it.
   */
  camera.toTile = (px, py, viewport) => {
    const { wx, wy } = worldAt(px, py, viewport);
    return { x: Math.floor(wx), y: Math.floor(wy) };
  };

  /** The pixel of a map point. The exact inverse of `toTile`. */
  camera.toScreen = (tx, ty, viewport) => ({
    px: viewport.width / 2 + (tx - camera.x) * camera.scale,
    py: viewport.height / 2 - (ty - camera.y) * camera.scale,
  });

  /**
   * The rectangle a tile occupies on screen, top left corner first.
   *
   * Separate from `toScreen`, and not out of fussiness: `toScreen` converts a **point**, and
   * a tile's point is its bottom left corner, while drawing wants the **top** left corner,
   * since the screen counts the opposite way from the map. Confusing the two shifts every
   * sprite one tile upwards, which barely shows on a regular grid and is glaring the moment
   * a large block overlaps a small one.
   */
  camera.rectOf = (tx, ty, viewport) => ({
    ...camera.toScreen(tx, ty + 1, viewport),
    size: camera.scale,
  });

  /**
   * Zoom around a point, keeping under the cursor whatever was there.
   *
   * Zooming around the centre of the view is simpler to write and hateful to use: what you
   * are looking at escapes as soon as you close in, and the view has to be dragged back on
   * every notch of the wheel.
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

  /** Dragging the picture `dx` pixels right shows the map that much further left. */
  camera.pan = (dx, dy) => {
    camera.x -= dx / camera.scale;
    camera.y += dy / camera.scale;
    return camera;
  };

  /**
   * Frame a whole box, with a little air around it.
   *
   * The scale stops at `NATIVE`, the sprite's real size, while zooming by hand goes up to
   * `MAX_SCALE`. That is not an inconsistency: enlarging past the native size shows nothing
   * more, it shows the same pixels bigger. Without that ceiling, opening a five-conveyor
   * schematic in a 1160 pixel view worked out a scale of 165, clamped to 64, and you
   * arrived with your nose against the block with no idea why. Measured, not assumed.
   */
  camera.frame = (box, viewport) => {
    const width = Math.max(1, box.width);
    const height = Math.max(1, box.height);
    const fit = Math.floor(
      Math.min(viewport.width / (width + 2), viewport.height / (height + 2)));
    camera.scale = clamp(Math.min(NATIVE, fit));
    camera.x = box.left + (width - 1) / 2;
    camera.y = box.bottom + (height - 1) / 2;
    return camera;
  };

  return camera;
}
