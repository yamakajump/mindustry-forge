# Ce qu'il reste à faire

Tenu ici plutôt que dans un gestionnaire de tâches, parce que la session n'en a pas et
qu'une liste que Corentin ne peut pas lire ne sert à rien. Une ligne par chose, dans
l'ordre où je compte les faire, avec ce qui a été dit pour la demander.

## À faire

### 1. Le simulateur

`simulate.js` contredit le flot maximal (presse à spores 20 %, générateurs 0 %, net -408
contre +2 402). Il n'est branché sur rien pour l'instant. Soit il est réparé et il devient
la référence, soit il dégage. Le jeu a confirmé le modèle analytique sur trois
schématiques, donc c'est le simulateur qui est faux.

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

### 3. Vérifier les chiffres contre le vrai jeu

Le banc existe et ne sert pas encore. Une schématique posée dans un serveur Mindustry,
mesurée quelques secondes, et comparée au calcul. C'est ce qui distingue ce site de tous
les autres, et `verified` reste faux tant que ça ne tourne pas.

### 4. Place de marché

- Comparer deux schématiques côte à côte.
- Filtrer sur ce dont elle a besoin : « j'ai du charbon, montre ce que je peux faire
  tourner ».
- Classement par cuivre investi et pas seulement par bloc.

### 5. Reste

- Les entrées et sorties définies à la main doivent être rejouées à l'ouverture d'une
  schématique gardée.
- Diagnostic explicite : « trois bandes reliées à rien », en tête plutôt qu'en bas.

## Corrigé

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
