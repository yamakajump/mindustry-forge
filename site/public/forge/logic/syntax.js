/**
 * Read a program the way the game reads it, and say where it will disappoint.
 *
 * The lexer follows `mindustry.logic.LParser` in v8 build 159.7, statement for statement:
 * tokens end at a space, a tab, a newline, a `#` or a `;`; a `"` opens a string that may
 * not cross a line; a statement of exactly one token ending in `:` is a jump label. None of
 * that is guessed. `bench/data/logique-oracle.json` holds what the game itself made of
 * nineteen programs aimed at those corners, and `tests/js/logic/oracle.test.js` holds this
 * file against it.
 *
 * The point of doing it exactly is that Mindustry's failures here are quiet. An instruction
 * that does not exist is not refused, it becomes `noop`. So is an instruction reserved to
 * the world processor. So is any instruction with one bad value in a fixed list. Operands
 * past the count are dropped. In every one of those cases the program loads, runs, and does
 * less than it says, with nothing on screen to suggest it. Those are the lines this file
 * exists to underline.
 *
 * Reading is all it does. The program is never executed: a property the engine does not
 * model would read back as null, a branch would go the other way, and nothing would say so.
 * That is settled in `docs/todo.md` §7.
 */

import { instruction, resolved, inEnum, isContent, catalogueOf } from "./catalogue.js";

/** Ends a token, per `LParser.token`. */
const BREAKS = new Set([" ", "\t", "\n", "#", ";"]);

/** `Strings.canParseInt`, near enough: what the game will take as a line number. */
const isWholeNumber = (text) => /^[+-]?\d+$/.test(text);

const isNumber = (text) =>
  /^[+-]?(0[xX][0-9a-fA-F]+|0[bB][01]+|\d*\.?\d+([eE][+-]?\d+)?)$/.test(text);

/** How the game names the blocks it links: the block, then which one. */
const LOOKS_LINKED = /^[a-z][a-z-]*\d+$/;

/**
 * A problem that belongs to the whole program rather than to a line.
 *
 * Aimed at the first line rather than at none, because the list is clickable: a problem
 * that goes nowhere when clicked is a problem the reader thinks is broken.
 */
const NOWHERE = { line: 0, start: 0, end: 0 };

/** Written by these instructions into their first operand, so not a link even if it looks it. */
const ASSIGNS = new Set(["set", "op", "sensor", "getlink", "radar", "read", "lookup",
                         "packcolor", "unpackcolor", "ulocate", "uradar", "getblock",
                         "getflag", "weathersense", "fetch", "select"]);

/**
 * Split a program into lines of tokens and statements.
 *
 * Offsets are kept per line rather than over the whole text: the highlighter draws one line
 * at a time, and an editor that recomputes global offsets on every keystroke is an editor
 * that lags on a program of any size.
 */
export function tokenize(text) {
  const lines = text.split("\n").map((source, index) => ({ index, source, tokens: [] }));
  const statements = [];

  let line = 0;
  let column = 0;
  let current = [];

  const at = () => lines[line];
  const push = (token) => { at().tokens.push(token); return token; };

  const flush = () => {
    if (current.length) statements.push({ tokens: current, line: current[0].line });
    current = [];
  };

  while (line < lines.length) {
    const source = at().source;

    if (column >= source.length) {
      flush();
      line++;
      column = 0;
      continue;
    }

    const char = source[column];

    if (char === " " || char === "\t") { column++; continue; }

    if (char === ";") { flush(); column++; continue; }

    if (char === "#") {
      push({ text: source.slice(column), start: column, end: source.length,
             line, kind: "commentaire" });
      column = source.length;
      continue;
    }

    if (char === '"') {
      const close = source.indexOf('"', column + 1);
      if (close < 0) {
        /* `LParser.string` walks to the closing quote and errors on the newline it meets
           first. The game refuses the whole program, so the rest of it is not worth
           reading: whatever this file said about it would be about a program nobody runs. */
        push({ text: source.slice(column), start: column, end: source.length,
               line, kind: "chaine", unterminated: true });
        return { lines, statements, fatal: "outils.logique.probleme.guillemet-ouvert",
                 fatalAt: { line, start: column, end: source.length } };
      }
      const token = push({ text: source.slice(column, close + 1), start: column,
                           end: close + 1, line, kind: "chaine" });
      current.push(token);
      column = close + 1;

      const next = source[column];
      if (next !== undefined && !BREAKS.has(next)) {
        return { lines, statements, fatal: "outils.logique.probleme.espace-attendu",
                 fatalAt: { line, start: column, end: column + 1 } };
      }
      continue;
    }

    let end = column;
    while (end < source.length && !BREAKS.has(source[end])) end++;
    const token = push({ text: source.slice(column, end), start: column, end,
                         line, kind: "operande" });
    current.push(token);
    column = end;
  }
  flush();

  return { lines, statements, fatal: null, fatalAt: null };
}

/**
 * A program, read: its statements, its labels, and everything the game will quietly change.
 *
 * `links` is what the processor is wired to, and it only ever softens a warning: a name the
 * program uses is checked against it, never the other way round.
 */
export function parse(text, { links = [] } = {}) {
  const lexed = tokenize(text);
  const problems = [];
  const limits = catalogueOf().limits;

  /* Every key is written out whole, here and everywhere else, rather than a family and a
     suffix joined at the last moment. A key that only exists once the page is running is a
     key no test can check and a line no translator can find, and `tests/js/i18n.test.js`
     refuses a whole file over one. */
  const say = (key, severity, at, params = {}) => problems.push({
    key, severity, line: at.line, start: at.start, end: at.end, params,
  });

  /* A fatal error is recorded and reading carries on over what the lexer did manage to
     read. The game refuses the whole program either way, and it is told so; but an editor
     that drops its colours and its other warnings the moment a quote is left open is an
     editor that goes blind exactly while a line is being typed. */
  if (lexed.fatal) {
    problems.push({ key: lexed.fatal, severity: "refus", ...lexed.fatalAt, params: {} });
  }

  // Labels first: a statement of one token ending in `:`, per `LParser.statement`.
  const labels = new Map();
  const statements = [];
  for (const entry of lexed.statements) {
    const [first] = entry.tokens;
    if (entry.tokens.length === 1 && first.kind !== "chaine" && first.text.endsWith(":")) {
      const name = first.text.slice(0, -1);
      first.kind = "etiquette";
      if (labels.has(name)) {
        say("outils.logique.probleme.etiquette-double", "refus", first, { nom: name });
      } else if (labels.size >= 500) {
        say("outils.logique.probleme.etiquettes-trop", "refus", first, { maximum: 500 });
      } else {
        labels.set(name, statements.length);
      }
      continue;
    }
    entry.at = statements.length;
    statements.push(entry);
  }

  /* Every name the program writes into. Not a scope, on purpose: the game has no scopes,
     and a bare name is a variable the moment anything assigns to it. */
  const variables = new Set();
  for (const entry of statements) {
    const [name, first] = entry.tokens;
    if (first && ASSIGNS.has(resolved(name.text))) variables.add(first.text);
    /* `op` and `select` put their result in the second operand, after the operator. */
    if (["op", "select"].includes(resolved(name.text)) && entry.tokens[2]) {
      variables.delete(first.text);
      variables.add(entry.tokens[2].text);
    }
  }

  const linkNames = new Set(links.map((link) => link.name).filter(Boolean));

  for (const entry of statements) {
    const [name, ...operands] = entry.tokens;
    const known = instruction(name.text);
    name.kind = "instruction";
    entry.name = resolved(name.text);
    entry.instruction = known;

    /* What the game will actually run this line as. Three different mistakes all end in
       the same place, a `noop`, and the player is told about none of them: an instruction
       that does not exist, one reserved to the world processor, and one carrying a value
       that is not in its list. Marking the statement rather than the mistake is what lets
       the editor grey out the line as what it is, dead. */
    entry.noop = false;

    if (!known) {
      name.kind = "inconnu";
      entry.noop = true;
      say("outils.logique.probleme.instruction-inconnue", "erreur", name, { nom: name.text });
      continue;
    }

    if (known.privileged) {
      name.kind = "monde";
      entry.noop = true;
      say("outils.logique.probleme.instruction-monde", "erreur", name, { nom: known.name });
    }

    if (operands.length > known.operands.length) {
      const extra = operands[known.operands.length];
      const last = operands[operands.length - 1];
      say("outils.logique.probleme.operandes-en-trop", "avertissement",
          { line: extra.line, start: extra.start,
            end: last.line === extra.line ? last.end : extra.end },
          { compte: operands.length - known.operands.length });
    }

    operands.forEach((token, index) => {
      const shape = known.operands[index];
      if (!shape) return;
      classify(token, shape, { entry, index, labels, linkNames, variables, problems,
                               statements, say });
    });
  }

  const bytes = new TextEncoder().encode(text).length;
  if (bytes > limits.code_bytes) {
    say("outils.logique.probleme.programme-trop-long", "erreur", NOWHERE,
        { octets: bytes, maximum: limits.code_bytes });
  }
  if (links.length > limits.links) {
    say("outils.logique.probleme.liens-trop", "erreur", NOWHERE,
        { compte: links.length, maximum: limits.links });
  }

  return { ...lexed, statements, labels, variables, problems, bytes };
}

/** Paint one operand, and say so when the game would refuse to make sense of it. */
function classify(token, shape, context) {
  const { entry, index, labels, linkNames, variables, problems, statements, say }
    = context;

  if (token.kind === "chaine") return;

  if (shape.type === "enum") {
    if (inEnum(shape.enum, token.text)) {
      token.kind = "valeur";
      return;
    }
    /* One bad value in a fixed list does not spoil one operand: `LogicIO.read` fails to
       build the statement at all and the whole line becomes a `noop`. Measured, not
       assumed. */
    token.kind = "inconnu";
    entry.noop = true;
    problems.push({ key: "outils.logique.probleme.valeur-inconnue", severity: "erreur", line: token.line,
                    start: token.start, end: token.end,
                    params: { valeur: token.text, liste: shape.enum } });
    return;
  }

  // The jump target: a line number, or the name of a label.
  if (entry.name === "jump" && index === 0) {
    if (isWholeNumber(token.text)) {
      token.kind = "nombre";
      const target = Number(token.text);
      if (target < 0 || target >= statements.length) {
        problems.push({ key: "outils.logique.probleme.saut-hors-programme", severity: "avertissement",
                        line: token.line, start: token.start, end: token.end,
                        params: { cible: target, compte: statements.length } });
      }
      return;
    }
    token.kind = "etiquette";
    if (!labels.has(token.text)) {
      problems.push({ key: "outils.logique.probleme.etiquette-absente", severity: "refus", line: token.line,
                      start: token.start, end: token.end, params: { nom: token.text } });
    }
    return;
  }

  if (token.text.startsWith("@")) {
    const name = resolved(token.text);
    token.kind = isContent(name) ? "contenu"
      : catalogueOf().globals.includes(name) ? "globale"
      : "propriete";
    return;
  }

  if (isNumber(token.text) || ["true", "false", "null"].includes(token.text)) {
    token.kind = "nombre";
    return;
  }

  if (linkNames.has(token.text)) {
    token.kind = "lien";
    return;
  }

  token.kind = "variable";

  /* A name shaped like one of the game's own link names, never declared and never written
     to, is almost always a link the player forgot to add. Almost, hence a warning and not
     an error: nothing here can tell a forgotten link from a variable called `cell1`, and
     the escape hatch is that anything the program assigns to is left alone.

     Said only when the processor has been wired to something. A program written to be
     pasted into a processor that already exists in the game declares no links here, and it
     has none to declare: the wiring was done in the game, by clicking. Warning then would
     put a line under every block name in the program and say nothing true about any of
     them, which is how a whole column of warnings gets switched off. */
  if (linkNames.size && LOOKS_LINKED.test(token.text) && !variables.has(token.text)) {
    say("outils.logique.probleme.lien-inconnu", "avertissement", token, { nom: token.text });
  }
}

/** Whether the game would refuse to load this program at all. */
export const refused = (report) =>
  report.problems.some((problem) => problem.severity === "refus");
