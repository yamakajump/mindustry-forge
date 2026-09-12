/**
 * The answer, the size of an answer.
 *
 * It replaces three cards that said one thing between them. "Une fois alimente a fond"
 * stated a ceiling, "Branche comme il est" stated a throughput and "Goulot" stated why the
 * two differed; on a schematic nothing throttles, the first two printed the same figure one
 * card apart, and a reader meeting 2,67 twice under two headings has to work out that it is
 * one fact and not two.
 *
 * They also sat fourth, fifth and eighth in a column of thirteen. A page whose whole promise
 * is "find out what it really produces" put what it produces past the fold, under a login
 * prompt and a shopping list of pumps.
 *
 * What it says depends on what the thing is, which `type.js` decides. The old report had
 * exactly one shape and assumed every schematic was a factory, so a wall of displays showing
 * a meme was handed a ceiling of nothing and asked where it plugged in.
 *
 * Not imported by `bilan.js`, deliberately: see the note at the top of `type.js`.
 *
 * The formatting helpers arrive as `outils` rather than being imported. They live in the
 * page, where the sprite atlas and the name table are, and passing them keeps this file a
 * pure function of its arguments, which is what lets `tests/js/verdict.test.js` run it under
 * Node with six stubs and no browser.
 */
import { COURANT, DEFEND, FABRIQUE, MONTRE, RIEN, TRANSPORTE, seBranche } from "./type.js";

/**
 * The one figure the block is built around, and the unit beside it.
 *
 * Power first when there is any, because a schematic that makes electricity almost always
 * also shows a trickle of some intermediate, and the electricity is what it is for: one of
 * them was reported as producing coal and spore pods, which it eats itself, while the power
 * in its own name went unmentioned.
 */
function principal(report, answered, outils) {
  const { rate, perSecond, t, withIcon, escape, lisible, bolt } = outils;
  const power = answered ? (report.power || {}) : (report.potential || {});
  const matiere = Object.entries(
    (answered ? report.perMinute : report.potentialPerMinute) || {},
  ).sort((a, b) => b[1] - a[1]);

  if ((power.made || 0) > 0.01) {
    const net = answered ? power.net : power.made - power.spent;
    return {
      icone: bolt(30),
      chiffre: rate(net),
      unite: t("analyse.unite.energie-par-seconde"),
      reste: matiere,
    };
  }
  if (matiere.length) {
    const [item, n] = matiere[0];
    return {
      icone: withIcon(item, 30),
      chiffre: perSecond(n / 60),
      unite: `${escape(lisible(item))} / ${t("analyse.unite.seconde")}`,
      reste: matiere.slice(1),
    };
  }
  return null;
}

/** The small rows under the headline, for a schematic that makes more than one thing. */
function autres(reste, outils) {
  const { perSecond, withIcon, escape, lisible, t } = outils;
  return reste.filter(([, n]) => n / 60 > 0.005).map(([item, n]) =>
    `<div class="ligne-aussi">${withIcon(item, 18)}<b>${perSecond(n / 60)}</b>
      <span>${escape(lisible(item))} / ${escape(t("analyse.unite.seconde"))}</span></div>`,
  ).join("");
}

/**
 * Why the figure is what it is: what throttles it, or that nothing does, or that nobody has
 * said where it plugs in yet.
 *
 * The marking request is the important one, and it is here rather than in a card of its own
 * because this is the most looked-at spot on the page and the request is what unlocks every
 * other figure on it.
 */
function pourquoi(report, answered, what, outils) {
  const { escape, t, lisible, perSecond } = outils;

  if (!answered && seBranche(what.kind)) {
    return `<p class="pourquoi">${escape(t("analyse.verdict.plafond"))}</p>
      <div class="row"><button type="button" class="primary" id="verdict-marquer">${
        escape(t("analyse.verdict.dis-par-ou"))}</button>
      <button type="button" id="verdict-scelle">${
        escape(t("analyse.ports.scelle"))}</button></div>`;
  }

  if (report.bottleneck) {
    const [name, share] = report.bottleneck;
    const cale = report.throttle
      ? ` ${t("analyse.goulot.plafonne", {
          bloc: escape(lisible(report.throttle.name)),
          x: report.throttle.x, y: report.throttle.y,
          plafond: `${perSecond(report.throttle.ceiling)} / ${t("analyse.unite.seconde")}`,
        })}`
      : "";
    /* The advice comes with the name, and not in a card of its own as it used to. Naming
       what throttles a line without saying what to do about it is half an answer, and it
       was the half a reader had to scroll for. */
    return `<p class="pourquoi bride">${escape(t("analyse.verdict.bride"))}
      <strong>${escape(lisible(name))}</strong>,
      ${Math.round(share * 100)}&nbsp;% ${escape(t("analyse.goulot.regime"))}.${cale}</p>
      <p class="pourquoi">${escape(t("analyse.goulot.conseil"))}</p>`;
  }

  return `<p class="pourquoi libre">${escape(t("analyse.verdict.rien-ne-bride"))}</p>`;
}

/**
 * What a schematic that makes nothing is, said as what it IS.
 *
 * Never as what the tool failed to do. "Impossible d'analyser" on a display wall would be
 * the tool blaming a player for building something it did not expect, and a whole category
 * of what people actually build would read as broken. Deadpan, and no `--bad`: "Ca ne
 * fabrique rien" under a display showing a meme is funnier than a written wink, and it does
 * not age.
 */
function sansChiffre(what, report, outils) {
  const { escape, t, rate } = outils;
  const power = report.potential || { made: 0, spent: 0 };
  const dit = {
    [MONTRE]: "analyse.verdict.ecran",
    [DEFEND]: "analyse.verdict.defense",
    [TRANSPORTE]: "analyse.verdict.transport",
    [RIEN]: "analyse.verdict.rien",
  }[what.kind] || "analyse.verdict.rien";

  const details = [];
  if (what.ecrans) {
    details.push(`${what.ecrans} ${t(what.ecrans > 1
      ? "analyse.verdict.unite.ecrans" : "analyse.verdict.unite.ecran")}`);
  }
  if (what.processeurs) {
    details.push(`${what.processeurs} ${t(what.processeurs > 1
      ? "analyse.verdict.unite.processeurs" : "analyse.verdict.unite.processeur")}`);
  }
  if (power.spent > 0.01) {
    details.push(`${rate(power.spent)} ${t("analyse.unite.energie-par-seconde")}`);
  }

  return `<p class="quoi">${escape(t(dit))}</p>
    ${details.length ? `<p class="pourquoi">${escape(details.join(" · "))}</p>` : ""}`;
}

/**
 * The block itself.
 *
 * `answered` is the page's own word for "somebody has said where this plugs in", and it is
 * what decides between a measurement and a ceiling. It is passed rather than read off the
 * report so that the caller stays the one place that knows what the player has done.
 */
export function verdict(report, what, answered, outils) {
  const { escape, t } = outils;
  const figure = principal(report, answered, outils);

  if (!figure) {
    return `<div class="verdict ${escape(what.kind)}">${
      sansChiffre(what, report, outils)}</div>`;
  }

  const sousLeTitre = what.kind === COURANT || what.kind === FABRIQUE
    ? "" : `<p class="quoi">${escape(t(what.kind === DEFEND
        ? "analyse.verdict.defense" : "analyse.verdict.transport"))}</p>`;

  return `<div class="verdict ${escape(what.kind)}">
    ${sousLeTitre}
    ${answered ? "" : `<p class="au-mieux">${escape(t("analyse.plafond.au-mieux"))}</p>`}
    <div class="chiffre">${figure.icone}<b>${figure.chiffre}</b>
      <span>${figure.unite}</span></div>
    ${autres(figure.reste, outils)}
    ${pourquoi(report, answered, what, outils)}
  </div>`;
}
