# Ce qu'il reste à faire

Tenu ici plutôt que dans un gestionnaire de tâches, parce que la session n'en a pas et
qu'une liste que Corentin ne peut pas lire ne sert à rien. Une ligne par chose, dans
l'ordre où je compte les faire, avec ce qui a été dit pour la demander.

## À faire

### 1. Faire tourner le banc

C'est le seul point qui reste sur la justesse des chiffres, et c'est le vrai.

Le banc existe : `bench/` pose une schématique dans un serveur Mindustry v159.7 réel, avec
le vrai moteur. Il ne sert à rien pour l'instant. Une schématique posée, mesurée quelques
secondes, comparée au calcul : c'est ce qui distingue ce site de tous les autres, et
`verified` reste faux tant que ça ne tourne pas.

C'est aussi ce qui remplace le simulateur, supprimé plutôt que réparé. Écrire une copie du
moteur de Mindustry en JavaScript à côté d'une copie qui marche du moteur de Mindustry,
c'était la mauvaise moitié du travail.

### 2. Mécanismes du jeu encore absents

- **Chaleur** (Erekir) : pas modélisée du tout. Toute la moitié Erekir du jeu en dépend, et
  `reinforced-bridge-conduit` est classé « consommateur », ce qui est le symptôme.
- **Débit réel d'un tuyau.** Plafonné à la contenance du bloc par tick, qui est le plafond
  du jeu (`moveLiquid`) mais jamais atteint : en régime établi le gradient se resserre. Ça
  ne mord sur aucune disposition réelle, ça ne sert qu'à empêcher une source de bac à sable
  d'inonder le modèle. Le vrai débit demanderait de simuler la pression.
- **Portes de trop-plein** : laissées en routeurs, et c'est un choix. Le jeu envoie tout
  droit si ça passe et sur les côtés sinon ; avec un flot maximal ce choix ne change pas le
  débit total, seulement quelle branche le porte.
- **Matière de phase dans les accélérateurs** : le bonus n'est pas compté. Savoir si un
  accélérateur est alimenté dépend du calcul, qui dépend de la vitesse, qui dépend du
  bonus. Le chiffre nu est annoncé et le bonus est nommé à côté.

### 3. Place de marché

- Comparer deux schématiques côte à côte.
- Filtrer sur ce dont elle a besoin : « j'ai du charbon, montre ce que je peux faire
  tourner ».
- Classement par cuivre investi et pas seulement par bloc.

### 4. Reste

- Diagnostic explicite : « trois bandes reliées à rien », en tête plutôt qu'en bas.
- Marquer plusieurs blocs d'un coup (glisser sur une rangée de tuyaux).

## Corrigé

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
