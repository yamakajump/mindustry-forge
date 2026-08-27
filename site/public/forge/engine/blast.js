/**
 * What a block takes with it when it dies.
 *
 * Two blocks in this engine kill themselves: a thorium reactor that overheats and a
 * neoplasia reactor whose neoplasm has nowhere to go. Until now they simply stopped, and a
 * schematic that destroys itself read as a schematic that works: the counters of a dead
 * block are zero on both sides, which looks like agreement.
 *
 * The blast is not a radius. `Damage.tileDamage` casts a ray at every angle out of the
 * middle, and each ray **spends itself** on whatever it passes through: a wall in the way
 * soaks its own health out of the ray and what is behind it survives. That is the whole
 * reason a reactor bank is built with walls between the reactors, and it is a fact about a
 * layout that no rate can express.
 *
 * `mindustry.entities.Damage` and `mindustry.entities.comp.BuildingComp.onDestroyed`,
 * Mindustry v159.7.
 */

const TILE = 8;

/**
 * `Building.damage`: take it off the health, and die at zero.
 *
 * Deferred rather than immediate, because the game's own explosion is: `dynamicExplosion`
 * schedules its waves with `Time.run(i * 2f, ...)`, so a chain of reactors goes off over
 * several frames rather than all inside one call.
 */
export function hurt(build, amount) {
  if (build.state.dead || amount <= 0) return;
  build.state.health = (build.state.health ?? build.block.health ?? 1) - amount;
  if (build.state.health > 0) return;

  build.state.dead = true;
  build.state.running = 0;
  build.state.heat = 0;

  /* Worked out **before** the block is emptied, and copied rather than referenced: the
     strength of the blast is what it was holding, and clearing the module first left every
     explosion with the strength of an empty block. */
  const kept = {
    items: [...build.items.counts],
    liquids: [...build.liquids.held()],
  };
  build.items.clear();
  build.liquids.clear();
  blastFrom(build, kept);
}

/**
 * `Building.onDestroyed` and `Damage.dynamicExplosion`, together.
 *
 * The strength is what the block was **holding**: an empty vault barely scratches its
 * neighbours and one full of blast compound levels the block around it. `explosiveness` is
 * capped per item at the block's own capacity, which is what stops a core from taking out
 * half a base.
 */
function blastFrom(build, held) {
  const world = build.world;
  if (!world) return;
  const known = world.catalogue;

  let explosiveness = build.block.base_explosiveness || 0;
  const cap = build.itemCapacity;
  for (const [item, count] of held.items) {
    const worth = known?.items?.[item]?.explosiveness || 0;
    explosiveness += worth * Math.min(count, cap);
  }
  for (const [liquid, amount] of held.liquids) {
    explosiveness += (known?.liquids?.[liquid]?.explosiveness || 0) * amount / 2;
  }
  explosiveness *= 3.5 * (build.block.explosiveness_scale ?? 1);

  const radius = TILE * build.size / 2;

  /* `waves` bursts, each reaching further than the last, and each doing half the
     explosiveness. Nothing under two explosiveness does anything at all, which is why a
     plain wall coming down is silent. */
  const waves = explosiveness <= 2
    ? 0
    : Math.max(1, Math.min(25, Math.trunc(explosiveness / 11)));
  const each = explosiveness / 2;
  for (let i = 0; i < waves; i++) {
    const reach = Math.max(0, Math.min(50, radius + explosiveness)) * ((i + 1) / waves);
    world.later(i * 2, () => rayDamage(world, build, reach / TILE, each));
  }

  /* A reactor does add a second blast of its own, nineteen tiles of five thousand damage
     against a vault's four hundred and ninety-five, and it is **not** modelled because it
     cannot reach anything here: `NuclearReactor.onDestroyed` passes its own team to
     `Damage.damage`, and that argument is the team to **spare**. Everything in a schematic
     is one team, so the only thing that touches your own blocks is the generic blast above,
     made of what the reactor was holding.

     Measured: a thorium reactor overheating beside a large battery leaves the battery
     standing, because thirty thorium is thirty-eight explosiveness in three waves of
     nineteen against three hundred and sixty health. */
}

/**
 * `Damage.tileDamage`: a ray at every angle, each spending itself on what it hits.
 *
 * The ray count and the Bresenham walk are the game's, because which tile a ray clips
 * decides who dies: rounded differently, a wall one tile off the diagonal shields a reactor
 * it does not shield in the game.
 */
function rayDamage(world, from, tiles, damage) {
  const x = from.x;
  const y = from.y;

  // A ray that starts **inside** a multiblock deals a whole side at once instead, because
  // otherwise the block it starts in would soak the lot.
  const inside = world.at(x, y);
  if (inside && inside.size > 1 && !inside.state.dead
      && (inside.state.health ?? inside.block.health ?? 1) > damage) {
    hurt(inside, damage * Math.min(inside.size, tiles * 0.4));
    return;
  }

  const radius = Math.min(tiles, 100);
  const rad2 = radius * radius;
  const rays = Math.ceil(radius * 2 * Math.PI);
  const spacing = Math.PI * 2 / rays;
  const worst = new Map();

  for (let i = 0; i <= rays; i++) {
    let dealt = 0;
    let cx = x;
    let cy = y;
    const endX = x + Math.trunc(Math.cos(spacing * i) * radius);
    const endY = y + Math.trunc(Math.sin(spacing * i) * radius);

    const spanX = Math.abs(endX - cx);
    const spanY = -Math.abs(endY - cy);
    const stepX = cx < endX ? 1 : -1;
    const stepY = cy < endY ? 1 : -1;
    let error = spanX + spanY;

    while (cx !== endX || cy !== endY) {
      const build = world.at(cx, cy);
      if (build && !build.state.dead) {
        // Full strength in the middle, sixty per cent of it at the rim.
        const edge = 0.6;
        const away = (cx - x) ** 2 + (cy - y) ** 2;
        const mult = (1 - away / rad2 + edge) / (1 + edge);
        const next = damage * mult - dealt;
        const key = `${cx},${cy}`;
        worst.set(key, Math.max(worst.get(key) || 0, next));
        dealt += build.state.health ?? build.block.health ?? 1;
        if (next - dealt <= 0) break;
      }

      if (2 * error - spanY > spanX - 2 * error) { error += spanY; cx += stepX; }
      else { error += spanX; cy += stepY; }
    }
  }

  for (const [key, amount] of worst) {
    const [cx, cy] = key.split(",").map(Number);
    const build = world.at(cx, cy);
    if (build) hurt(build, amount);
  }
}
