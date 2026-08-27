/**
 * The editor: a textarea that shows what the game will make of what you typed.
 *
 * A `<textarea>` with its text made transparent, sitting exactly on top of a `<pre>` that
 * holds the same text painted token by token. The caret, the selection, undo, spellcheck
 * off, dragging, the mobile keyboard and every accessibility affordance stay the browser's,
 * because they are hard and the browser already did them. All this code does is keep the
 * two layers in step.
 *
 * The gutter counts twice, and that is the point of having one. On the left, the line as it
 * is in the file. On the right, the instruction number: what `jump` actually counts in.
 * They are not the same the moment a program has a comment or a label in it, and getting
 * that wrong is the most common way a hand-written jump lands one line off.
 *
 * Nothing here runs the program. `docs/todo.md` §7.
 */

import { t } from "./i18n.js";
import { catalogueOf, instruction, valuesOf, suggestsFor, resolved } from "./catalogue.js";
import { parse } from "./syntax.js";

const escaped = (text) => text
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** How many suggestions are worth showing. Beyond this nobody reads, they retype. */
const SUGGESTIONS = 12;

/**
 * The families a suggestion can belong to, and so the labels the list can carry.
 *
 * Named here rather than left implicit in the calls that build the list, because the label
 * for each one is a translated string and a family added without one shows a raw key to a
 * player. `tests/js/logic/i18n.test.js` reads this.
 */
export const KINDS = ["instruction", "monde", "valeur", "variable", "etiquette",
                      "contenu", "lien"];

export class LogicEditor {
  /**
   * @param {HTMLElement} root where to build
   * @param {{ onChange?: (report: object) => void }} options
   */
  constructor(root, { onChange = () => {} } = {}) {
    this.onChange = onChange;
    this.links = [];
    this.report = null;

    root.classList.add("mlog");
    root.innerHTML = `
      <div class="mlog-gutter" aria-hidden="true"></div>
      <div class="mlog-sheet">
        <pre class="mlog-paint" aria-hidden="true"></pre>
        <textarea class="mlog-input" spellcheck="false" autocomplete="off"
                  autocapitalize="off" autocorrect="off" wrap="off"></textarea>
      </div>
      <ul class="mlog-suggest" role="listbox" hidden></ul>`;

    this.gutter = root.querySelector(".mlog-gutter");
    this.paint = root.querySelector(".mlog-paint");
    this.input = root.querySelector(".mlog-input");
    this.suggest = root.querySelector(".mlog-suggest");
    this.sheet = root.querySelector(".mlog-sheet");

    this.input.setAttribute("aria-label", t("outils.logique.programme"));

    this.input.addEventListener("input", () => this.refresh());
    this.input.addEventListener("scroll", () => this.sync());
    this.input.addEventListener("keydown", (event) => this.onKey(event));
    this.input.addEventListener("blur", () => this.close());
    /* A click moves the caret without changing the text, so `input` never fires and the
       suggestion list would go on describing the operand the caret has left. */
    this.input.addEventListener("click", () => this.offer());
    this.input.addEventListener("keyup", (event) => {
      if (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End") {
        this.offer();
      }
    });

    this.refresh();
  }

  /** The program, as text. */
  get value() { return this.input.value; }

  set value(text) {
    this.input.value = text;
    this.refresh();
  }

  /** What the processor is wired to. Feeds both the checker and the suggestions. */
  setLinks(links) {
    this.links = links;
    this.refresh();
  }

  focus() { this.input.focus(); }

  /** Re-read, re-paint, re-measure. Cheap enough to do on every keystroke. */
  refresh() {
    const report = parse(this.input.value, { links: this.links });
    this.report = report;

    this.paint.innerHTML = report.lines.map((line) => this.painted(line)).join("\n") || " ";

    /* The two numbers, side by side. A blank on the right for a line that is a comment, a
       label or nothing at all: those are exactly the lines that do not advance the count,
       and showing a number there would be the lie this column exists to prevent. */
    const numbers = new Map();
    for (const entry of report.statements) numbers.set(entry.line, entry.at);
    this.gutter.innerHTML = report.lines.map((line) =>
      `<span class="mlog-line"><i>${line.index + 1}</i><b>${
        numbers.has(line.index) ? numbers.get(line.index) : ""}</b></span>`).join("");

    this.sync();
    this.offer();
    this.onChange(report);
  }

  /** One line, painted. */
  painted(line) {
    const source = line.source;
    let out = "";
    let at = 0;
    for (const token of line.tokens) {
      out += escaped(source.slice(at, token.start));
      out += `<span class="k-${token.kind}">${escaped(source.slice(token.start, token.end))}</span>`;
      at = token.end;
    }
    out += escaped(source.slice(at));

    const dead = this.report.statements.some((entry) => entry.noop && entry.line === line.index);
    return dead ? `<span class="mlog-dead">${out || " "}</span>` : out || " ";
  }

  /** Keep the painted layer and the gutter under the same scroll as the text. */
  sync() {
    this.paint.style.transform =
      `translate(${-this.input.scrollLeft}px, ${-this.input.scrollTop}px)`;
    this.gutter.scrollTop = this.input.scrollTop;
  }

  /* Suggestions ------------------------------------------------------------------- */

  /** Where the caret sits, in tokens: which statement, which operand, what has been typed. */
  where() {
    const caret = this.input.selectionStart;
    if (caret !== this.input.selectionEnd) return null;

    const before = this.input.value.slice(0, caret);
    const lineStart = before.lastIndexOf("\n") + 1;
    const line = before.slice(lineStart);

    /* Inside a string or past a `#`, there is nothing to suggest: the game reads both as
       text and any list offered there would be wrong by construction. */
    const quotes = (line.match(/"/g) || []).length;
    if (quotes % 2 === 1) return null;
    if (line.includes("#")) return null;

    // Only the part of the line the current statement owns; `;` starts a new one.
    const statement = line.slice(line.lastIndexOf(";") + 1);
    const pieces = statement.split(/[ \t]+/);
    const typed = pieces[pieces.length - 1];
    const index = pieces.filter(Boolean).length - (typed ? 1 : 0);

    return { caret, typed, index, name: pieces.filter(Boolean)[0] ?? "",
             column: caret - lineStart, row: before.split("\n").length - 1 };
  }

  /** What may be typed here, best first. */
  candidates(place) {
    const catalogue = catalogueOf();
    const out = [];
    const add = (text, kind, help) => out.push({ text, kind, help });

    if (place.index === 0) {
      for (const entry of catalogue.instructions) {
        if (entry.hidden) continue;
        add(entry.name, entry.privileged ? "monde" : "instruction",
            entry.help?.fr ?? entry.help?.en ?? "");
      }
      return out;
    }

    const known = instruction(place.name);
    if (!known) return out;

    const shape = known.operands[place.index - 1];
    if (!shape) return out;

    if (shape.type === "enum") {
      for (const value of valuesOf(shape.enum)) {
        add(value.name, "valeur", value.help?.fr ?? value.help?.en ?? "");
      }
      return out;
    }

    if (resolved(place.name) === "jump" && place.index === 1) {
      for (const label of this.report.labels.keys()) add(label, "etiquette", "");
    }

    const sources = suggestsFor(place.name, place.index - 1);

    for (const link of this.links) {
      if (link.name) add(link.name, "lien", `${link.dx}, ${link.dy}`);
    }
    for (const name of this.report.variables) add(name, "variable", "");

    /* `sensor` takes a property or a content name in a slot the game calls a plain string,
       so the catalogue cannot know. `suggestsFor` is the short table that does, and it only
       ever steers what is offered: nothing is ever marked wrong on the strength of it. */
    if (sources.includes("LAccess")) {
      for (const value of valuesOf("LAccess")) {
        add(`@${value.name}`, "valeur", value.help?.fr ?? value.help?.en ?? "");
      }
    }
    if (sources.includes("content") || place.typed.startsWith("@")) {
      for (const name of catalogue.globals) add(name, "variable", "");
      for (const name of catalogue.content) add(name, "contenu", "");
    }

    return out;
  }

  /** Show the list, or hide it when there is nothing useful to say. */
  offer() {
    /* Nothing is offered to an editor nobody is typing in. Without this the list opens on
       an empty program the moment the page loads, over a program that is not there yet. */
    if (document.activeElement !== this.input) return this.close();

    const place = this.where();
    this.place = place;
    if (!place) return this.close();

    const typed = place.typed.toLowerCase();
    let found = this.candidates(place)
      .filter((entry) => entry.text.toLowerCase().startsWith(typed))
      .filter((entry) => entry.text !== place.typed);

    /* Nothing typed and nothing but a wall of names to offer: the list would cover the
       program to say "any variable at all". Instructions are the exception, because there
       the list is the documentation. */
    if (!typed && place.index > 0) found = found.filter((entry) => entry.kind === "valeur"
      || entry.kind === "lien" || entry.kind === "etiquette");

    if (!found.length) return this.close();

    // Stable and short: the same prefix gives the same list twice.
    found = found.slice(0, SUGGESTIONS);

    this.found = found;
    this.chosen = 0;
    this.draw();
  }

  draw() {
    this.suggest.innerHTML = this.found.map((entry, index) => `
      <li role="option" data-at="${index}" class="${index === this.chosen ? "on" : ""}"
          aria-selected="${index === this.chosen}">
        <span class="mlog-suggest-text k-${entry.kind}">${escaped(entry.text)}</span>
        <span class="mlog-suggest-kind">${escaped(t(`outils.logique.completion-${
          entry.kind === "monde" ? "instruction" : entry.kind}`))}${
          entry.kind === "monde" ? ` · ${escaped(t("outils.logique.monde"))}` : ""}</span>
        ${entry.help ? `<span class="mlog-suggest-help">${escaped(entry.help)}</span>` : ""}
      </li>`).join("");

    /* Placed from the caret's row and column rather than from a measured caret rectangle:
       the sheet is monospaced, so a column is a width, and the alternative is a mirror
       element that has to be kept identical to the textarea forever. */
    /* Placed from where the sheet sits inside the whole editor, gutter included: the list
       is a child of the editor, not of the sheet, because a sheet that clips its own
       overflow would clip the list off the bottom of the program. */
    const cell = this.metrics();
    const left = clamp(
      this.sheet.offsetLeft + cell.left + this.place.column * cell.width - this.input.scrollLeft,
      this.sheet.offsetLeft,
      this.sheet.offsetLeft + this.sheet.clientWidth - 280);
    const under = this.sheet.offsetTop + cell.top
      + (this.place.row + 1) * cell.height - this.input.scrollTop;

    this.suggest.style.left = `${left}px`;
    this.suggest.style.top = `${under}px`;
    this.suggest.hidden = false;

    /* Au-dessus de la ligne quand il n'y a plus la place en dessous, et seulement alors :
       une liste qui saute d'un cote a l'autre a chaque lettre est plus penible qu'une liste
       un peu basse. Mesure apres l'affichage, la hauteur depend de ce qu'elle contient. */
    const height = this.suggest.offsetHeight;
    const room = this.sheet.offsetTop + this.sheet.offsetHeight;
    if (under + height > room && under - cell.height - height >= 0) {
      this.suggest.style.top = `${under - cell.height - height}px`;
    }

    this.suggest.onmousedown = (event) => {
      /* `mousedown`, not `click`: the textarea loses focus first and the blur handler
         would have closed the list before a click ever landed. */
      const item = event.target.closest("li");
      if (!item) return;
      event.preventDefault();
      this.accept(this.found[Number(item.dataset.at)]);
    };
  }

  /** One character of the sheet, measured once and remembered. */
  metrics() {
    if (!this.cell) {
      const ruler = document.createElement("span");
      ruler.className = "mlog-ruler";
      ruler.textContent = "0".repeat(50);
      this.paint.append(ruler);
      const box = ruler.getBoundingClientRect();
      const style = getComputedStyle(this.paint);
      this.cell = {
        width: box.width / 50,
        height: box.height,
        left: parseFloat(style.paddingLeft),
        top: parseFloat(style.paddingTop),
      };
      ruler.remove();
    }
    return this.cell;
  }

  close() {
    this.suggest.hidden = true;
    this.found = null;
  }

  /** Put the chosen text in place of what was typed. */
  accept(entry) {
    if (!entry || !this.place) return;
    const { caret, typed } = this.place;

    this.input.setRangeText(entry.text, caret - typed.length, caret, "end");
    /* A space after an instruction, because the next thing typed is always an operand and
       nobody thanks an editor for making them press space. Not after an operand: it may
       well have been the last one. */
    if (this.place.index === 0) this.input.setRangeText(" ", this.input.selectionStart,
                                                        this.input.selectionStart, "end");
    this.close();
    this.refresh();
  }

  onKey(event) {
    if (event.key === "Escape" && !this.suggest.hidden) {
      event.preventDefault();
      return this.close();
    }

    if (event.key === " " && event.ctrlKey) {
      event.preventDefault();
      return this.offer();
    }

    if (this.suggest.hidden || !this.found) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      this.chosen = (this.chosen + step + this.found.length) % this.found.length;
      return this.draw();
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      return this.accept(this.found[this.chosen]);
    }
  }
}

/** Keep a coordinate inside its box. */
const clamp = (value, low, high) => Math.max(low, Math.min(value, Math.max(low, high)));
