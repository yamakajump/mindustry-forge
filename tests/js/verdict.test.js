/**
 * The answer block, and the four things it must never say.
 *
 * It must not ask a wall of displays where it plugs in, it must not print a ceiling as
 * though it were a measurement, it must not blame the reader for what it could not compute,
 * and it must not print the same figure twice. The first three were live defects; the
 * fourth is what the three cards it replaces did between them.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { verdict } from "../../site/public/forge/rapport/verdict.js";
import { COURANT, FABRIQUE, MONTRE, RIEN } from "../../site/public/forge/rapport/type.js";

/* Six stubs, which is the whole reason `verdict` takes its helpers as an argument: the real
   ones need a sprite atlas and the game's name table, and neither exists under Node. `t`
   returns the key, so a test can assert on a key rather than on French that may be
   reworded. */
const outils = {
  escape: (s) => String(s),
  t: (key, values) => (values
    ? `${key}(${Object.values(values).join(",")})`
    : key),
  lisible: (name) => `<${name}>`,
  withIcon: () => "[icone]",
  perSecond: (n) => String(Math.round(n * 100) / 100),
  rate: (n) => String(Math.round(n)),
  bolt: () => "[eclair]",
};

const bilan = (extra = {}) => ({
  perMinute: {},
  potentialPerMinute: {},
  power: { made: 0, spent: 0, net: 0 },
  potential: { made: 0, spent: 0 },
  bottleneck: null,
  throttle: null,
  ...extra,
});

const ecran = { kind: MONTRE, ecrans: 4, processeurs: 2 };
const usine = { kind: FABRIQUE, ecrans: 0, processeurs: 0 };

test("a display wall is never asked where it plugs in", () => {
  // The defect the screenshots exposed. `answered` is false, which on a factory is exactly
  // what triggers the request, so this is the case that used to get it wrong.
  const html = verdict(bilan({ potential: { made: 0, spent: 12 } }), ecran, false, outils);

  assert.ok(!html.includes("dis-par-ou"), "it asked a display where its intake is");
  assert.ok(html.includes("analyse.verdict.ecran"), "it did not say what it is");
});

test("a display says what it is, not what the tool failed to do", () => {
  const html = verdict(bilan({ potential: { made: 0, spent: 12 } }), ecran, false, outils);

  assert.ok(html.includes("4 analyse.verdict.unite.ecrans"));
  assert.ok(html.includes("2 analyse.verdict.unite.processeurs"));
  // Never the failure colour: this is a category of build, not a broken reading.
  assert.ok(!html.includes("bad"), "a display is not an error");
});

test("the count agrees with the sentence beside it, both ways round", () => {
  const un = verdict(bilan(), { kind: MONTRE, ecrans: 1, processeurs: 1 }, false, outils);

  assert.ok(un.includes("1 analyse.verdict.unite.ecran"), "singular");
  assert.ok(!un.includes("unite.ecrans"), "it pluralised a single display");
});

test("nothing marked shows a ceiling, and says out loud that it is one", () => {
  const html = verdict(
    bilan({ potentialPerMinute: { graphite: 160 } }), usine, false, outils);

  assert.ok(html.includes("analyse.plafond.au-mieux"), "a ceiling passed as a measurement");
  assert.ok(html.includes("analyse.verdict.plafond"));
  assert.ok(html.includes("verdict-marquer"), "a factory must be asked where it plugs in");
});

test("marked shows the measurement, and drops the ceiling wording", () => {
  const html = verdict(
    bilan({ perMinute: { graphite: 160 }, potentialPerMinute: { graphite: 300 } }),
    usine, true, outils);

  assert.ok(!html.includes("analyse.plafond.au-mieux"));
  assert.ok(html.includes("2.67"), "it did not print the measured rate");
  assert.ok(!html.includes("5"), "it printed the ceiling beside the measurement");
});

test("the figure appears once, which is the whole point of merging three cards", () => {
  const html = verdict(bilan({ perMinute: { graphite: 160 } }), usine, true, outils);

  assert.equal(html.split("2.67").length - 1, 1);
});

test("what throttles it is named, with how hard", () => {
  const html = verdict(bilan({
    perMinute: { graphite: 100 },
    bottleneck: ["titanium-conveyor", 0.62],
    throttle: { name: "conveyor", x: 4, y: 12, ceiling: 13.2 },
  }), usine, true, outils);

  assert.ok(html.includes("<titanium-conveyor>"));
  assert.ok(html.includes("62"));
  assert.ok(html.includes("analyse.goulot.plafonne"));
});

test("nothing throttling it is said, rather than left silent", () => {
  const html = verdict(bilan({ perMinute: { graphite: 100 } }), usine, true, outils);

  assert.ok(html.includes("analyse.verdict.rien-ne-bride"));
});

test("a full way out is named, and not called free because nothing is starved", () => {
  /* The case the placement button creates: the first chip is a copper conveyor, six and a
     half a second, and a plan making eight now measures six and a half with every machine
     of it running at a hundred per cent. `bottleneck` is empty, because it only ever knows
     about starved machines, and the block used to print "rien ne le bride" over a figure it
     had just cut by a fifth. */
  const html = verdict(bilan({
    perMinute: { graphite: 100 },
    bottleneck: null,
    throttle: { name: "conveyor", x: 2, y: 0, ceiling: 6.5 },
  }), usine, true, outils);

  assert.ok(html.includes("analyse.goulot.sortie"));
  assert.ok(html.includes("<conveyor>"));
  assert.ok(!html.includes("analyse.verdict.rien-ne-bride"),
    "it called the plan unrestricted and named what restricts it, in the same block");
});

test("power wins over the trickle of intermediates a plant also shows", () => {
  /* One power plant was reported as producing coal and spore pods, which are intermediates
     it eats itself, while the electricity in its own name went unmentioned. */
  const html = verdict(bilan({
    power: { made: 2970, spent: 568, net: 2402 },
    perMinute: { coal: 12, "spore-pod": 3 },
  }), { kind: COURANT, ecrans: 0, processeurs: 0 }, true, outils);

  const chiffre = html.slice(html.indexOf('class="chiffre"'));
  assert.ok(chiffre.includes("2402"), "the power net is not the headline");
  assert.ok(html.includes("analyse.unite.energie-par-seconde"));
});

test("a schematic that makes several things lists the rest under the headline", () => {
  const html = verdict(
    bilan({ perMinute: { graphite: 160, silicon: 60 } }), usine, true, outils);

  assert.ok(html.includes("ligne-aussi"));
  assert.ok(html.includes("<silicon>"));
});

test("a schematic that makes nothing at all still says something true", () => {
  const html = verdict(bilan(), { kind: RIEN, ecrans: 0, processeurs: 0 }, false, outils);

  assert.ok(html.includes("analyse.verdict.rien"));
  assert.ok(!html.includes("verdict-marquer"), "nothing to plug in, nothing to ask");
});

test("where Forge and the game's own panel differ is said under the answer", () => {
  /* The game's preview ignores overdrive projectors, so a farm under five of them is
     understated by thousands in the game's own numbers. That is the single most interesting
     thing this site can say, and it was the last line of the last card: a reader who never
     scrolled that far read the difference as Forge being wrong. */
  const html = verdict(bilan({
    power: { made: 2970, spent: 0, net: 2970 },
    potential: { made: 2970, spent: 0 },
    asTheGameSaysIt: { made: 1980, spent: 0, boosted: 6, projectors: 2 },
  }), { kind: COURANT, ecrans: 0, processeurs: 0 }, true, outils);

  assert.ok(html.includes("analyse.verdict.le-jeu-dit"));
  assert.ok(html.includes("1980"), "it did not print what the game says");
});

test("it says nothing when the two agree, which is almost every schematic", () => {
  // A caveat printed on every page is a caveat nobody reads.
  const html = verdict(bilan({
    power: { made: 2970, spent: 0, net: 2970 },
    potential: { made: 2970, spent: 0 },
    asTheGameSaysIt: { made: 2970, spent: 0, boosted: 0, projectors: 0 },
  }), { kind: COURANT, ecrans: 0, processeurs: 0 }, true, outils);

  assert.ok(!html.includes("analyse.verdict.le-jeu-dit"));
});

test("a plant that makes nothing right now is not a plant that makes nothing", () => {
  /* The commonest thing to do on a first attempt is mark an intake with the wrong resource.
     A power plant whose fuel was marked wrongly measured zero, fell through to the block
     for schematics that produce nothing, and said "Ca ne fabrique rien" under the name of a
     schematic whose own title said it made two thousand. */
  const html = verdict(bilan({
    power: { made: 0, spent: 0, net: 0 },
    potential: { made: 2970, spent: 568 },
  }), { kind: COURANT, ecrans: 0, processeurs: 0 }, true, outils);

  assert.ok(!html.includes("analyse.verdict.rien"), "it told a power plant it makes nothing");
  assert.ok(html.includes("2402"), "it did not fall back to what the plan can do");
  assert.ok(html.includes("analyse.plafond.au-mieux"), "the fallback is not labelled a ceiling");
  assert.ok(html.includes("analyse.verdict.a-larret"), "it did not say why the figure is a ceiling");
});

test("a factory stopped for want of an ingredient says so too", () => {
  const html = verdict(bilan({
    perMinute: {},
    potentialPerMinute: { graphite: 160 },
  }), usine, true, outils);

  assert.ok(html.includes("2.67"));
  assert.ok(html.includes("analyse.verdict.a-larret"));
});

test("a plan whose output has nowhere to go is running, and is told so", () => {
  /* Reported on `4x Kiln`: four kilns at a hundred per cent, the block panel saying so, and
     this block announcing that the plan was not running and something was missing. Nothing
     was missing. The metaglass had no way out, and "il lui manque quelque chose" sends its
     author looking for an ingredient that is already there. */
  const html = verdict(bilan({
    perMinute: {},
    potentialPerMinute: { metaglass: 480 },
    bloque: { metaglass: 8 },
  }), usine, true, outils);

  assert.ok(html.includes("analyse.verdict.bouche"));
  assert.ok(!html.includes("analyse.verdict.a-larret"),
    "it told a plan running flat out that it was stopped");
  assert.ok(!html.includes("analyse.plafond.au-mieux"),
    "the figure is what it makes, not a ceiling it might reach");
});

test("a plan that is genuinely short of an ingredient still says so", () => {
  // The other half: nothing is made at all, so nothing can be stuck.
  const html = verdict(bilan({
    perMinute: {},
    potentialPerMinute: { graphite: 160 },
    bloque: {},
  }), usine, true, outils);

  assert.ok(html.includes("analyse.verdict.a-larret"));
  assert.ok(!html.includes("analyse.verdict.bouche"));
});

test("a jammed plan is given the way to say where it comes out", () => {
  /* Telling somebody nothing comes out and offering no way to say where it comes out is the
     same defect as asking a display where it plugs in: an instruction that cannot be
     followed. There was no route to marking an outlet at all once an intake was marked. */
  const html = verdict(bilan({
    perMinute: {},
    potentialPerMinute: { metaglass: 480 },
    bloque: { metaglass: 8 },
  }), usine, true, outils);

  assert.ok(html.includes("verdict-sortie"));
  assert.ok(html.includes("analyse.verdict.dis-par-ou-sort"));
});
