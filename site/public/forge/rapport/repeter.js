/**
 * The same plan, put down again beside itself.
 *
 * Nobody builds one silicon smelter module. They build the one they were given, decide it
 * is not enough, and put down six of them in a row, which is the single commonest thing a
 * player does with a schematic somebody handed them. The question that follows is always
 * the same: how much does that cost me, and what do I have to bring.
 *
 * All of it is arithmetic on figures the report already holds, so this asks nothing of the
 * engine and adds nothing to measure. What it adds is the multiplication a reader was doing
 * in their head, done in front of them and done right: six times the output is also six
 * times the intake, six times the current and six times the build cost, and the third of
 * those is the one people forget until the grid browns out.
 *
 * Not imported by `bilan.js`: see the note at the top of `type.js`.
 */

/** How many copies are worth offering. Beyond this a player is building a base, not a row. */
const PALIERS = [2, 4, 8];

/**
 * Whether it is the sort of plan somebody repeats at all.
 *
 * A module makes something and is small enough to line up. A whole base is not repeated, a
 * wall is not repeated into a thicker wall by copying the schematic, and a display shows
 * the same picture twice however many you put down. Offering the multiplication on those is
 * offering arithmetic nobody asked for on a page that already has too much of it.
 */
export function repetable(report, produit) {
  if (!produit) return false;
  if ((report.blocks || 0) > 220) return false;
  const largeur = report.width || 0;
  const hauteur = report.height || 0;
  return largeur > 0 && hauteur > 0 && largeur <= 40 && hauteur <= 40;
}

/**
 * What N copies come to.
 *
 * Linear, and honestly so: putting two modules side by side gives two modules' output, for
 * two modules' intake. What it does NOT model is them sharing a belt, which is the reason
 * the intake is stated at all rather than left implied - six modules on one titanium
 * conveyor is six modules starving, and the figure below is what tells a reader the belt is
 * the thing to widen.
 */
export function repetitions(report, produit) {
  const espace = (report.width || 0) * (report.height || 0);

  return PALIERS.map((fois) => ({
    fois,
    sort: produit.taux * fois,
    prend: Object.fromEntries(Object.entries(report.needs || {})
      .map(([, need]) => [need.resource, need.perMinute * fois])),
    courant: Math.max(0, ((report.potential?.spent || 0) - (report.potential?.made || 0)) * fois),
    cases: espace * fois,
    cout: Object.fromEntries(Object.entries(report.cost || {})
      .map(([item, n]) => [item, n * fois])),
  }));
}
