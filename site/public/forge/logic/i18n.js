/**
 * Les mots de l'editeur de logique, en attendant le socle multilingue.
 *
 * Le module `forge/i18n.js` arrive par une autre voie. Les cles sont ecrites des maintenant
 * a la convention `<domaine>.<ecran>.<element>`, parce qu'une chaine ecrite en dur
 * aujourd'hui est une chaine que personne ne retrouve le jour ou on traduit.
 *
 * Ce relais sert le francais depuis la table ci-dessous, et rien d'autre. Il ne va pas
 * chercher `forge/i18n.js` s'il existe deja : le site ne livre qu'une langue, donc la
 * seule chose que cette detection apporterait est une facon de plus de se tromper.
 *
 * A la fusion : `FR` part dans `forge/lang/fr.json`, ce fichier est supprime, et les
 * imports passent de `./i18n.js` a `../i18n.js`. Rien d'autre a toucher.
 */

/**
 * Le francais, en clair.
 *
 * Les phrases des instructions ne sont pas ici : elles viennent des fichiers de traduction
 * du jeu, par `tools/build_logic_catalogue.py`. Un joueur qui lit « Controle un batiment »
 * dans Mindustry doit lire la meme phrase ici, et pas notre reformulation.
 */
export const FR = {
  "outils.logique.titre": "Editeur de logique",
  "outils.logique.sous-titre":
    "Ecris le programme d'un processeur, et repars avec la schematique a coller dans le jeu.",

  "outils.logique.programme": "Programme",
  "outils.logique.liens": "Liens",
  "outils.logique.processeur": "Processeur",
  "outils.logique.exemple": "Charger un exemple",

  "outils.logique.copier": "Copier la schematique",
  "outils.logique.copiee": "Copiee : colle-la dans le jeu",
  "outils.logique.telecharger": "Telecharger le .msch",
  "outils.logique.importer": "Ouvrir une schematique",
  "outils.logique.coller": "Coller une schematique",
  "outils.logique.import-refuse": "Rien lu : {raison}",
  "outils.logique.import-sans-processeur": "Cette schematique ne contient aucun processeur.",
  "outils.logique.importee": "{compte} instructions et {liens} liens repris de la schematique.",

  "outils.logique.lien-ajouter": "Ajouter un lien",
  "outils.logique.lien-nom": "Nom",
  "outils.logique.lien-dx": "Vers la droite",
  "outils.logique.lien-dy": "Vers le haut",
  "outils.logique.lien-retirer": "Retirer",
  "outils.logique.liens-vides":
    "Aucun lien. Un processeur ne peut lire et piloter que ce a quoi il est relie.",
  "outils.logique.liens-aide":
    "Le nom est celui que le programme emploie, et les deux nombres disent ou se trouve le "
    + "bloc par rapport au processeur, en cases.",

  "outils.logique.compte-instructions": "{compte} instructions",
  "outils.logique.compte-octets": "{octets} octets sur {maximum}",
  "outils.logique.aucun-probleme": "Le jeu lira ce programme tel quel.",
  "outils.logique.problemes": "{compte} a regarder",

  "outils.logique.verification": "Verification",
  "outils.logique.aide-texte":
    "Les instructions, leurs operandes et les listes de valeurs sont lues dans le jeu "
    + "lui-meme, {build}. Le programme n'est pas execute : cet outil est un editeur, "
    + "pas un moteur.",

  "outils.logique.completion-instruction": "instruction",
  "outils.logique.completion-valeur": "valeur",
  "outils.logique.completion-variable": "variable",
  "outils.logique.completion-etiquette": "etiquette",
  "outils.logique.completion-contenu": "contenu",
  "outils.logique.completion-lien": "lien",

  "outils.logique.monde": "processeur du monde",
  "outils.logique.ligne": "ligne {ligne}",

  // Les diagnostics. Ce que le jeu fait vraiment, mesure par `tools/build_logic_oracle.py`.
  "outils.logique.probleme.instruction-inconnue":
    "« {nom} » n'existe pas : le jeu remplace la ligne par un noop, sans rien dire.",
  "outils.logique.probleme.instruction-monde":
    "« {nom} » n'appartient qu'au processeur du monde. Dans une schematique, le jeu la "
    + "remplace par un noop, sans rien dire.",
  "outils.logique.probleme.valeur-inconnue":
    "« {valeur} » n'est pas une valeur de {liste} : le jeu remplace toute la ligne par un "
    + "noop, sans rien dire.",
  "outils.logique.probleme.operandes-en-trop":
    "{compte} operandes de trop, que le jeu jette.",
  "outils.logique.probleme.saut-hors-programme":
    "Ce saut vise la ligne {cible}, et le programme en compte {compte}.",
  "outils.logique.probleme.etiquette-absente":
    "Aucune etiquette « {nom} » : le jeu refuse le programme entier.",
  "outils.logique.probleme.etiquette-double":
    "L'etiquette « {nom} » est definie deux fois : le jeu refuse le programme entier.",
  "outils.logique.probleme.etiquettes-trop":
    "Plus de {maximum} etiquettes : le jeu refuse le programme entier.",
  "outils.logique.probleme.guillemet-ouvert":
    "Guillemet jamais referme : le jeu refuse le programme entier.",
  "outils.logique.probleme.espace-attendu":
    "Il manque une espace apres cette valeur : le jeu refuse le programme entier.",
  "outils.logique.probleme.lien-inconnu":
    "« {nom} » ne fait partie d'aucun lien de ce processeur.",
  "outils.logique.probleme.programme-trop-long":
    "{octets} octets de code, et le jeu en accepte {maximum}.",
  "outils.logique.probleme.liens-trop":
    "{compte} liens, et un processeur en accepte {maximum}.",
  "outils.logique.probleme.lien-sans-nom": "Un lien sans nom ne sert a rien.",
  "outils.logique.probleme.lien-double": "Deux liens portent le nom « {nom} ».",
};

/** Une chaine, avec ses `{parametres}` remplaces. */
export function t(key, params) {
  const line = FR[key];
  /* La cle elle-meme quand elle manque, plutot que du vide : une cle a l'ecran est un
     bug qu'on signale, une chaine vide est un bug que personne ne voit. */
  if (line === undefined) return key;
  if (params === undefined) return line;

  return line.replace(/\{(\w+)\}/g, (whole, name) =>
    params[name] === undefined ? whole : params[name]);
}
