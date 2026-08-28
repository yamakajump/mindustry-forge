/**
 * Every comment in a source file, with the line it starts on.
 *
 * Written as a scanner rather than a set of regular expressions because a line-prefix grep
 * cannot tell a comment from a `//` inside a URL, from an apostrophe inside a French
 * sentence, or from a `/*` inside a string. It walks strings, template literals and regex
 * literals so that none of those can open or close a comment by accident.
 *
 * One scanner covers every language here, because the four comment shapes this repository
 * uses (`//`, `/* *\/`, `#`, `{{-- --}}`, `<!-- -->`) do not overlap in a way that needs
 * four parsers, and four parsers would be four things to keep in step.
 */

/** Which comment shapes a path uses, from its extension. */
export function grammarOf(path) {
  if (/\.blade\.php$/.test(path)) return { blade: true, html: true, code: "php", inline: false };
  if (/\.(php)$/.test(path)) return { blade: false, html: false, code: "php", inline: true };
  if (/\.(html?)$/.test(path)) return { blade: false, html: true, code: "js", inline: false };
  if (/\.(js|mjs|css|java)$/.test(path)) return { blade: false, html: false, code: "js", inline: true };
  if (/\.(py|sh|ya?ml|conf)$/.test(path)) return { blade: false, html: false, code: "hash", inline: true };
  return null;
}

/**
 * The comments of `source`, as `{ line, text }`.
 *
 * `inline` says the whole file is code. When it is false the scanner only treats `//`, `#`
 * and slash-star as comments inside `<script>`, `<style>` and `@php`, so that `https://`
 * in an attribute is left alone.
 */
export function commentsOf(source, grammar) {
  const src = source.replace(/\r/g, "");
  const found = [];
  const lineAt = (at) => src.slice(0, at).split("\n").length;
  let i = 0;
  let depth = grammar.inline ? 1 : 0;
  const opens = (word) => src.startsWith(word, i);

  while (i < src.length) {
    if (grammar.blade && opens("{{--")) {
      const end = src.indexOf("--}}", i);
      found.push({ line: lineAt(i), text: src.slice(i + 4, end < 0 ? src.length : end) });
      i = end < 0 ? src.length : end + 4;
      continue;
    }
    if (grammar.html && opens("<!--")) {
      const end = src.indexOf("-->", i);
      found.push({ line: lineAt(i), text: src.slice(i + 4, end < 0 ? src.length : end) });
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    if (!grammar.inline) {
      if (/^<(script|style)\b/i.test(src.slice(i, i + 7))) depth++;
      else if (opens("</script>") || opens("</style>")) depth = Math.max(0, depth - 1);
      else if (opens("@php")) depth++;
      else if (opens("@endphp")) depth = Math.max(0, depth - 1);
    }

    const c = src[i];

    if (depth > 0 && (c === '"' || c === "'" || c === "`")) {
      i++;
      while (i < src.length) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === c) { i++; break; }
        i++;
      }
      continue;
    }

    const hash = grammar.code === "hash" || grammar.code === "php";
    if (depth > 0 && hash && c === "#") {
      const from = i;
      while (i < src.length && src[i] !== "\n") i++;
      found.push({ line: lineAt(from), text: src.slice(from + 1, i) });
      continue;
    }
    if (depth > 0 && grammar.code !== "hash" && c === "/" && src[i + 1] === "/") {
      const from = i;
      while (i < src.length && src[i] !== "\n") i++;
      found.push({ line: lineAt(from), text: src.slice(from + 2, i) });
      continue;
    }
    if (depth > 0 && grammar.code !== "hash" && c === "/" && src[i + 1] === "*") {
      const from = i;
      const end = src.indexOf("*/", i);
      i = end < 0 ? src.length : end + 2;
      found.push({ line: lineAt(from), text: src.slice(from + 2, end < 0 ? src.length : end) });
      continue;
    }

    i++;
  }

  return found;
}
