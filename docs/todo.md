# Ce qu'il reste à faire

Tenu ici plutôt que dans un gestionnaire de tâches, parce que la session n'en a pas et
qu'une liste que Corentin ne peut pas lire ne sert à rien. Une ligne par chose, dans
l'ordre où je compte les faire, avec ce qui a été dit pour la demander.

## À faire

### 1. L'audit est vidé

Le rapport complet est dans `docs/audit-2026-08.md` : 39 défauts survivants sur 50
proposés, chacun passé par trois sceptiques. **Tous sont corrigés**, dans l'ordre que le
rapport recommandait lui-même, et le banc est passé de 91 à 128 scénarios.

Deux d'entre eux sont corrigés sans être mesurés, et il faut le dire plutôt que le laisser
croire :

- **L'ordre de `dump(null)`.** Le jeu balaie `content.items()` par identifiant, le portage
  balayait une `Map` dans l'ordre d'arrivée. Transcrit parce que c'est ce que fait le jeu,
  mais aucune forme que le banc sait construire ne les distingue : un séparateur fabrique
  un objet toutes les trente-cinq images et en propose un toutes les cinq, donc il n'en
  retient jamais deux à la fois tant que sa sortie bouge, et dès qu'elle se ferme plus rien
  ne part du tout. `separator-jammed` mesure sa réserve bloquée, ce qui est déjà une chose
  de plus, mais pas l'ordre.
- **La chaleur transmise d'un réacteur au thorium.** `heatProgress` vaut `heat × 15` et
  c'est lui que lisent les voisins, pas le `heat` interne dans zéro-un. La correction est
  juste et invérifiable : un réacteur refroidi voit sa chaleur ramenée à zéro à chaque
  image, donc il n'en transmet aucune, et un réacteur qui en transmet vraiment est un
  réacteur en train d'exploser. Il faudrait modéliser le souffle pour mesurer ça.

Ce souffle est la seule chose que la mort d'un bloc laisse de côté ici : `kill()` vide le
bloc et le ferme, et un bloc mort n'accepte plus rien, mais le jeu emporte aussi une partie
de ce qui le touchait. `reactor-neoplasia-full` est construit autour de ce trou, avec juste
ce qui survit à la mesure.

### 2. Relancer l'audit sur ce qu'il n'a pas vu

Un audit multi-agent a relu le moteur classe par classe contre la source du jeu, avec
trois sceptiques par trouvaille. Il a tourné **avant** les charges utiles, le module
liquide à plusieurs cases, le concasseur de falaise, les foreuses d'Erekir et les pompes
solides. Tout ce code n'a donc jamais été relu par personne d'autre que celui qui l'a
écrit, et c'est exactement le genre de moment où le dépôt s'est déjà trompé.

À relancer sur les tranches `payloads.js`, `liquids.js` et la moitié `machines.js` qui a
bougé, plus le harnais, dont deux réglages ont changé depuis : le stock de départ
(objets et liquides) et l'appel à `placed()`.

Et sur tout ce que la correction de l'audit a écrit depuis, qui n'a été relu par personne
non plus : `massdriver.js` en entier, `checkAccept` et `checkDump` des ponts dans `core.js`,
l'overflow duct, l'usine d'unités passée par `moveOutPayload`, et les deux réacteurs.

### 3. Le reste de la famille des charges utiles

Le socle est là et mesuré : la cargaison glisse, les convoyeurs battent sur l'horloge de
la carte, le reconstructeur consomme, le constructeur fabrique. Ce qui manque demande une
chose que le moteur n'a pas encore : **une charge utile qui est elle-même un bâtiment
avec son contenu**.

- `PayloadLoader` et `PayloadUnloader` remplissent et vident le bloc transporté.
- `PayloadDeconstructor` le rend à ses matériaux.
- `PayloadMassDriver` le lance à distance.

Un `BuildPayload` porte aujourd'hui un nom ; il lui faudra porter des objets et des
liquides.

### 4. `UnitAssembler`

Transcrit à moitié et non coché, pour une raison précise. Ses quatre drones et son
énergie se mesurent en trente secondes ; l'unité qu'il assemble demande trois mille
images **et** que les drones soient en position, ce qui dépend de leur vol. Il faudrait
soit un modèle de vol minimal, soit un scénario plus long, et le banc accepte déjà une
durée par scénario.

### 5. Les processeurs : déclarer, pas simuler

Un processeur ne consomme rien du tout, ni énergie ni objets. Son seul effet sur un débit
passe par une instruction, `control`, sur les blocs qu'il pilote. Simuler tout
l'interpréteur pour savoir si un `control` part est le mauvais rapport effort/résultat, et
son mode de panne est silencieux : une propriété que Forge ne modélise pas renvoie null,
le programme branche ailleurs, et rien ne le dit.

Ce qu'il faut faire à la place, en deux temps :

1. Décoder la configuration et sortir la liste des liens. Forge dit alors « trois
   processeurs, sept blocs pilotés, ce qu'ils font n'est pas simulé ».
2. Lire le programme, qui est du texte en clair, assez pour séparer les liens **lus** des
   liens **écrits**. Un processeur qui ne fait que `sensor` et `print` ne change aucun
   débit, et c'est la majorité de ceux qu'on croise.

### 6. La longue traîne des blocs

`docs/blocs.md` tient le compte, généré depuis la liste de classes du jeu. Une case
cochée veut dire transcrite **et** mesurée dans un vrai serveur.

### 7. Place de marché

- Comparer deux schématiques côte à côte.
- Filtrer sur ce dont elle a besoin : « j'ai du charbon, montre ce que je peux faire
  tourner ».
- Classement par cuivre investi et pas seulement par bloc.

### 8. Reste

- Diagnostic explicite : « trois bandes reliées à rien », en tête plutôt qu'en bas.
- Marquer plusieurs blocs d'un coup (glisser sur une rangée de tuyaux).

## Corrigé

- [x] **Le vrai moteur, avec le banc.** 95 scénarios posés dans un serveur Mindustry
      v159.7 réel, 94 exacts à l'objet près, et la comparaison fait partie de `npm test`
      pour qu'une régression casse la construction. 67 classes sur 105 transcrites et
      mesurées. Le reste tient dans `docs/blocs.md`.
- [x] **La chaleur**, troisième réseau d'Erekir : de face à face, un producteur doit viser
      sa cible et un répartiteur doit viser ailleurs.
- [x] **Les charges utiles**, quatrième réseau : une unité ou un bloc transporté entier,
      qui glisse et met du temps à arriver.

- [x] **Le sol.** 107 sols et minerais sortis du jeu avec ce qui compte : `itemDrop`,
      `liquidDrop`, `liquidMultiplier`. Un pinceau à taille réglable, un curseur de
      transparence pour voir sous la schématique, et le calcul qui s'en sert : une foreuse
      annonce `60 × cases_couvertes / (drillTime + multiplicateur × dureté)` au lieu de
      « au mieux, sur une tache pleine ». Une foreuse à moitié sur la tache est deux fois
      plus lente, et une foreuse mécanique sur du titane ne creuse pas, elle ne peut pas.
- [x] **Une foreuse produisait zéro.** Le registre ne donne aucune sortie à une foreuse,
      parce que ce qu'elle fait dépend des cases sous elle : sans sol, une schématique de
      foreuses et de bandes s'analysait en silence.
- [x] **L'éditeur.** `schematic.js` sait écrire le format du jeu, pas seulement le lire.
      Tourner, retirer, poser, avec un pourtour qui s'ouvre pour poser au delà du bord.
- [x] **Marquer n'importe quel bloc**, pas seulement un transporteur : une bande venue de
      dehors finit sur une presse aussi bien que sur une autre bande.

- [x] **La devinette des entrées est supprimée, pas améliorée.** Forge choisissait le
      transporteur du bord le plus probable par ressource et alimentait la schématique par
      là ; tout le reste de la page découlait de ce choix. Sur une conception réelle c'est
      un coup de dé, l'image revenait sous quatorze anneaux verts dont un légèrement plus
      vif, et rien ne disait lequel était lequel. `ports.js` et son test sont supprimés,
      remplacés par `marks.js` : le joueur marque, Forge compte.
- [x] **Ce qui passe est dessiné sur la tuile**, l'icône de la ressource dans l'anneau. Un
      anneau dit « ici » ; un anneau avec une goutte d'eau dedans dit « de l'eau, ici ».
- [x] **Une fois l'entrée marquée**, la carte « il lui faut » dit ce que ce tuyau précis
      doit amener, et en combien de pompes ou de foreuses.
- [x] **Un tuyau ne « produit » pas de l'eau**, il la porte. Le même chiffre veut dire deux
      choses selon le bloc.
- [x] **Le panneau de bloc ne se referme plus** quand on marque : il fallait retrouver le
      bloc pour choisir la ressource.
- [x] **L'aperçu enregistré ne porte plus les annotations.** C'était une photo du canvas,
      anneaux compris, et c'est cette image qui part dans un lien Discord.

- [x] **Le simulateur, supprimé.** `simulate.js` disait -408 énergie/s là où le modèle
      analytique dit +2 402, avec les générateurs à 0 % sur une schématique qui s'appelle
      « Water power 2306 energy ». 307 lignes que rien n'importait et qu'aucun test ne
      couvrait, soit une deuxième implémentation de la même question : exactement
      l'échec que ce dépôt passe son temps à éviter. Le modèle analytique est corroboré
      trois fois (l'encart du jeu à l'unité près, les 2 306 mesurés par l'auteur contre
      2 402 calculés, les 53-55k annoncés par l'auteur de la ferme contre 55 382). Ce qui
      tranchera vraiment le débit réel, c'est le banc, pas une copie du moteur en
      JavaScript posée à côté du moteur.

- [x] **On demande les entrées avant de sortir des chiffres.** Deviner par où une
      schématique se branche est un coup de dé : une conception a une arrivée et douze
      tuyaux qui pourraient l'être. Se tromper ne donne pas un blanc, ça donne une page de
      débits qui ont l'air calculés et ne le sont pas. Trois réponses : « c'est ça »,
      « je marque moi-même », « rien n'entre ». Une construction posée sur ses propres
      sources de bac à sable a déjà répondu et n'est pas interrogée.
- [x] **Marquer un bloc à la main ne servait à rien** : `analyse` était appelée sans les
      marques. Elles étaient enregistrées, envoyées au serveur, et jamais utilisées.
- [x] **Un liquide bu était compté comme gaspillé.** Le calcul ne regardait que
      `block.input` : une schématique nourrie exactement de l'eau que ses cultivateurs
      boivent annonçait tout gaspiller, sur la page qui disait qu'ils tournaient à fond.
- [x] **Ce qui traverse un bloc** était absent : on lisait ce qui s'y arrêtait, donc toutes
      les bandes d'une ligne sauf la dernière disaient ne rien porter.
- [x] **Déverseurs et conteneurs.** 327 objets/s au lieu de 11, et une réserve inventée à
      côté de chaque conteneur. L'arête va maintenant du conteneur au déverseur.
- [x] **Douze sources promettaient chacune toute la demande**, donc douze fois trop, et le
      surplus sortait par le premier tuyau ouvert : 101 304 cryofluide/min de production
      sur une schématique qui n'en fabrique pas.
- [x] **Le contrôle de visibilité** est aux couleurs du site, avec le lien affiché et un
      bouton pour le copier.

- [x] **La gestion des schématiques sur le site.** Privée, par lien, publique, et
      supprimer, depuis la grille et depuis la page de la schématique. L'API existait
      depuis le premier jour et rien ne l'appelait. Plus un drapeau modérateur pour retirer
      de la vitrine ce qui ne va pas.
- [x] **Ponts à liquide sans portée** : chaque lien était jugé hors de portée et jeté, donc
      ni trait à l'écran ni arête dans le graphe.
- [x] **Tuyaux directionnels.** Un conduit pointe quelque part comme une bande
      (`moveLiquidForward`), et routeurs et jonctions à liquide partageaient son rôle.
- [x] **Couleur des ressources** sur les sources et les trieurs, avec le cadre nu du jeu et
      non le composite, dont le centre est la croix « rien de réglé ».
- [x] **Liens des pylônes** dessinés, `PowerNode.drawPlanConfigTop`.

- [x] **L'encart du jeu, à l'unité près.** Coût de construction et bilan électrique
      calculés avec les formules de `Schematic.requirements`, `powerProduction` et
      `powerConsumption`. Vérifié sur deux schématiques : 678 / 1 226 / 127 / 405 / 117 /
      353 et +2 970 / -568 d'un côté, 916 / 14 659 / 3 216 / 6 640 / 1 402 / 6 230 /
      10 024 / 210 / 115 et +36 921,6 / -1 674 de l'autre. Toutes les valeurs exactes.
- [x] **L'énergie comptée sur tous les blocs.** Elle était posée branche par branche : un
      convoyeur de phase consomme 0,3 par tick et est rangé dans les ponts, donc ses 18 par
      seconde manquaient. 144 d'écart sur une schématique de 334 blocs.
- [x] **Les accélérateurs.** Le jeu les ignore dans son propre encart : 41 réacteurs à
      thorium sous 5 accélérateurs valent 36 900 pour lui et 55 350 en vrai. L'auteur de la
      schématique avait écrit « 53-55k » dans sa description, contredit par son propre
      aperçu. Règle prise dans `OverdriveProjector.updateTile` et `BlockIndexer.eachBlock`.
- [x] **Les sources du bac à sable.** Classées « consommateur », les douze sources qui
      alimentaient une ferme de réacteurs ressemblaient à douze trous. Elles fournissent, et
      la liste des courses ne réclame plus une pompe à une schématique qui a la sienne.
- [x] **Ce qui arrive est réparti.** Un flot maximal peut remplir sept machines et en
      abandonner sept autres, et c'est ce qu'il faisait : 34 réacteurs à 100 % et 7 à 0 %,
      avec un réacteur parfaitement sain désigné comme goulot. Le jeu sert à tour de rôle,
      donc les 41 tournent à 78 %.
- [x] **Le registre des liquides** vient du jeu au lieu d'être déduit des recettes.
- [x] Le débit calculé : vrai flot maximal (Dinic) au lieu d'une propagation itérative.
- [x] Un tuyau ne porte qu'un liquide, règle vérifiée dans `acceptLiquid`.
- [x] Jonction : passe tout droit au lieu de diffuser aux quatre côtés.
- [x] Trieur : sa configuration est utilisée.
- [x] Tourelles : elles mangent leurs munitions.
- [x] Déverseur et conteneurs : début et fin de ligne.
- [x] Superposition au défilement de l'aperçu collant.
- [x] Icônes des liquides et des pompes conseillées.
- [x] Ponts : embouts arrondis, transparence, largeur réelle, flèches répétées.
- [x] Clic sur un bloc pour le lire et le désigner comme entrée ou sortie.
- [x] Détection des prises par l'orientation et non par la position sur le bord.
