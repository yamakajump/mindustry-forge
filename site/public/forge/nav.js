/**
 * The header, once it can be pressed.
 *
 * The markup works without any of this: the links are links, the menus are `<details>`,
 * and a reader with no JavaScript gets a header that wraps onto two lines rather than
 * nothing at all. What is added here is the behaviour a header is expected to have -- one
 * menu open at a time, Escape and a click outside close it, and a button on a phone -- and
 * none of it is load-bearing.
 *
 * Loaded by the server-rendered pages and by the static analyser alike, which is also how
 * the analyser's header gets translated: it is the one header no server can rewrite.
 */

import { ready, translate } from "./i18n.js";

const header = document.querySelector("header");
const nav = document.getElementById("nav");
const deplier = document.querySelector(".deplier");

const menus = () => (nav ? [...nav.querySelectorAll("details.menu")] : []);

function closeMenus(except = null) {
  for (const menu of menus()) {
    if (menu !== except) menu.open = false;
  }
}

function collapse() {
  if (!deplier || !nav) return;
  nav.classList.remove("open");
  deplier.setAttribute("aria-expanded", "false");
}

if (nav) {
  /* `toggle` does not bubble, so it is caught on the way down instead. One open menu at a
     time: two overlapping panels in a header is a header nobody can read. */
  nav.addEventListener("toggle", (event) => {
    if (event.target.open) closeMenus(event.target);
  }, true);
}

if (deplier && nav) {
  /* Revealed here rather than in the markup: it is only worth showing to a reader who can
     press it, and a stylesheet cannot ask whether the script ran. */
  deplier.hidden = false;

  deplier.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    deplier.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) closeMenus();
  });
}

document.addEventListener("click", (event) => {
  if (header && !header.contains(event.target)) {
    closeMenus();
    collapse();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeMenus();
  collapse();
});

/* The static page is written in French and says so in `<html lang>`. This only has work to
   do once it says something else. */
ready.then(() => translate());
