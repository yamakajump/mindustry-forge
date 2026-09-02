/**
 * The block picker's grid, fetched the first time somebody opens it.
 *
 * The field it sits around is a plain text input with a `datalist`, and that is what posts:
 * this file never adds a form control, it only writes into the one that is already there.
 * With no JavaScript the panel opens on that field and the picker is exactly what it was
 * before, which is why none of this is guarded by a feature test.
 *
 * Nothing is loaded until the panel is opened. The catalogue is 254 blocks, four fields
 * each, 3.4 kB over the wire and cached for a day by the endpoint; the page that embeds it
 * would pay that on every visit for a panel most readers never open. That is the same
 * reasoning `blocks/index.blade.php` writes down for filtering on the server.
 */

const ENDPOINT = "/api/blocs";

/** The game's ten categories, in the order the block wiki and the editor's palette use. */
const FAMILLES = [
  ["turret", "Tourelles"], ["production", "Extraction"], ["distribution", "Transport"],
  ["liquid", "Liquides"], ["power", "Énergie"], ["crafting", "Usines"],
  ["defense", "Défense"], ["units", "Unités"], ["effect", "Stockage et effets"],
  ["logic", "Logique"],
];

const MONDES = [["", "Les deux"], ["serpulo", "Serpulo"], ["erekir", "Erekir"]];

let catalogue = null;
let enCours = null;

/** The catalogue, fetched once per page. A failure leaves the text field alone. */
function lireCatalogue() {
  if (catalogue) return Promise.resolve(catalogue);
  if (!enCours) {
    enCours = fetch(ENDPOINT, { headers: { Accept: "application/json" } })
      .then((answer) => (answer.ok ? answer.json() : []))
      .then((blocs) => (catalogue = blocs))
      .catch(() => (catalogue = []));
  }
  return enCours;
}

const escape = (texte) => String(texte).replace(/[<>&"]/g, (c) =>
  ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

/**
 * Which blocks a search matches.
 *
 * Both the French name and the identifier, because a player types either: "réacteur" from
 * the game, `thorium-reactor` from a wiki or from somebody else's message. Accents are
 * stripped from the search and from the name alike, so "reacteur" finds it too, which is
 * what somebody in a hurry types.
 */
const nu = (texte) => texte.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "");

export function retenus(blocs, cherche, monde) {
  const mot = nu(cherche.trim());
  return blocs.filter((bloc) => {
    if (monde && bloc.p && bloc.p !== monde) return false;
    if (!mot) return true;
    return nu(bloc.t).includes(mot) || bloc.n.includes(mot);
  });
}

/** The families a list of blocks fills, in the game's order, empty ones left out. */
export function parFamille(blocs) {
  return FAMILLES
    .map(([cle, nom]) => [nom, blocs.filter((bloc) => bloc.c === cle)])
    .filter(([, dedans]) => dedans.length > 0);
}

function dessiner(panneau, champ, monde) {
  const gardes = retenus(catalogue, champ.value, monde);

  panneau.querySelector("[data-mondes]").innerHTML = MONDES.map(([cle, nom]) =>
    `<button type="button" class="chip${cle === monde ? " on" : ""}" data-monde="${cle}"
       aria-pressed="${cle === monde}">${nom}</button>`).join("");

  panneau.querySelector("[data-familles]").innerHTML = parFamille(gardes).map(([nom, dedans]) =>
    `<section><h4>${escape(nom)} <span>${dedans.length}</span></h4><div class="bloc-cases">${
      dedans.map((bloc) => `<button type="button" class="choix-case" data-bloc="${escape(bloc.n)}"
        title="${escape(bloc.n)}"><img class="icone" src="/icone/bloc/${escape(bloc.n)}.png?t=32"
        width="24" height="24" loading="lazy" decoding="async" alt=""><span>${
        escape(bloc.t)}</span></button>`).join("")
    }</div></section>`).join("")
    || `<p class="empty">${escape("Aucun bloc ne correspond.")}</p>`;
}

export function mount(root = document) {
  for (const picker of root.querySelectorAll("[data-bloc-choix]")) {
    const panneau = picker.querySelector(".bloc-panneau");
    const champ = panneau.querySelector("input[name='bloc']");
    /* The chosen world is kept here and not on the panel. It was written to
       `panneau.dataset.monde`, and the click delegation walks up from what was pressed to
       that same panel: every click on a block found a `[data-monde]` above it, took the
       world branch and returned, so choosing a block did nothing at all once a world had
       been picked. Nothing in the markup showed it and no unit test reached it. */
    let monde = "";

    picker.addEventListener("toggle", async () => {
      if (!picker.open) return;
      await lireCatalogue();
      dessiner(panneau, champ, monde);
      champ.focus();
    });

    champ.addEventListener("input", () => { if (catalogue) dessiner(panneau, champ, monde); });

    panneau.addEventListener("click", (event) => {
      const choisi = event.target.closest("button[data-monde]");
      if (choisi) {
        monde = choisi.dataset.monde;
        dessiner(panneau, champ, monde);
        return;
      }
      const bloc = event.target.closest("[data-bloc]");
      if (!bloc) return;
      /* Written into the field rather than submitted: the reader may still want to set a
         size or a rate before asking, and a picker that submits on click takes that away. */
      champ.value = bloc.dataset.bloc;
      picker.open = false;
      picker.querySelector("summary b").textContent = bloc.querySelector("span").textContent;
    });
  }
}

if (typeof document !== "undefined" && document.querySelector("[data-bloc-choix]")) mount();
