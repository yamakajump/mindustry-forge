# Refaire le moteur en JavaScript

Corentin, le 26/08/2026 : « tu peux pas reproduire justement tous les mécanismes de
Mindustry, refait en web ? j'en suis sûr, il n'y a pas besoin d'un serveur Mindustry ».

Il a raison, et l'argument que j'ai servi trois tours plus tôt en supprimant `simulate.js`
était mal posé. Ce document dit pourquoi, ce qui change, et à quelle condition ça ne
refait pas la même erreur.

## Ce que j'avais dit, et ce qui tient encore

J'ai écrit : « écrire une copie du moteur de Mindustry en JavaScript, à côté d'une copie
qui marche du moteur de Mindustry, c'est la mauvaise moitié du travail ».

**Ce qui tient** : `simulate.js` méritait d'être supprimé. Il était écrit à l'intuition,
pas depuis la source du jeu, aucun test ne le couvrait, et il annonçait -408 énergie/s là
où le vrai chiffre est +2 402, avec les générateurs à 0 %.

**Ce qui ne tient pas** : « donc un moteur en JavaScript est forcément la mauvaise idée ».
C'est faux, et pour deux raisons.

## Pourquoi c'est faisable

Ce n'est pas Mindustry qu'il faut refaire. C'est la boucle de production : pas d'unités,
pas de combat, pas de pathfinding, pas de vagues, pas de génération de carte, pas de
réseau. Mesuré dans la source de la v159.7, la logique de mise à jour qui compte :

| Classe | Fichier | Logique de mise à jour |
|---|---:|---:|
| `Conveyor` | 490 lignes | ~50 |
| `Conduit` | 269 | ~40 |
| `GenericCrafter` | 373 | ~50 |
| `Drill` | 401 | ~60 |
| `Unloader` | 284 | ~80 |
| `Router`, `Junction`, `OverflowGate`, `Sorter` | 520 | ~170 |
| `PowerGraph` | 389 | ~200 |
| `Building` (dump, moveLiquid, accept) | | ~200 |

Le reste de ces fichiers est du dessin et de l'autotuilage, que ce dépôt a **déjà**
réimplémenté pour le rendu. Total à transcrire : de l'ordre de **mille lignes**, pas un
moteur de jeu.

Et le décisif : **ça tourne chez le visiteur**. Pas de serveur, pas de file d'attente,
pas de coût. C'est la différence entre une fonctionnalité qui existe pour moi et une qui
existe pour tous ceux qui passent.

## La condition qui change tout

Ce n'est pas un modèle concurrent si c'est un **portage**, et un portage se juge à sa
fidélité, pas à sa plausibilité. Trois règles :

1. **Transcrit depuis la source, classe par classe, en la citant.** Pas « une bande
   avance à peu près à sa vitesse » mais les quinze lignes de `ConveyorBuild.updateTile`,
   avec `itemSpace = 0.4`, `capacity = 3`, et l'ordre de balayage de la fin vers le début.
2. **Au tick près.** 60 par seconde, `Time.delta`, `edelta()`, le même ordre de mise à
   jour, le même curseur tournant `cdump` sur `proximity` trié par angle comme `Edges`.
3. **Le banc devient l'oracle.** Le vrai jeu tourne la même schématique et les deux
   chiffres doivent se rejoindre, par type de bloc, à une tolérance près. Une divergence
   n'est plus une affaire d'opinion : c'est un bug dont la bonne réponse est connue.

C'est exactement ce qui manquait à `simulate.js`. Le banc ne devient pas inutile, il
devient ce qu'il aurait toujours dû être : le juge, pas le produit.

## Les tranches

1. **Le noyau et les transporteurs.** FAIT le 26/08/2026. `Build`, `proximity`, `dump()`
   en tourniquet, `acceptItem`, les positions d'objets sur une bande. Bande, jonction,
   routeur, trieur, trop-plein, sous-verse, pont, déverseur, coffre. Onze tests, et une
   bande sort **6,5 objets par seconde** sans qu'on lui ait jamais donné ce chiffre : il
   tombe de `speed = 0,046` par image et `itemSpace = 0,4`.

   Trois bugs trouvés par la transcription elle-même, qu'aucune intuition n'aurait vus :
   `Edges` s'indexe par `taille - 1` et pas par la taille ; `acceptItem` demande la
   direction **de la source vers la bande**, pas l'inverse, et prise à l'envers toute
   bande refusait tout ; et `dump` fige le curseur avant sa boucle, alors que le lire à
   chaque tour faisait sauter un voisin sur deux - un routeur à trois sorties en servait
   deux et jamais la troisième.
2. **Les machines.** Usines, foreuses, pompes, liquides et `moveLiquid`.
3. **L'électricité.** `PowerGraph` : satisfaction, batteries, équilibre.
4. **L'oracle.** Porter le pont de `mindustry-ai` dans `bench/`, comparer par type.
5. **Le direct.** Les objets qui bougent vraiment sur les bandes, à l'écran, avec le
   moteur de rendu qui existe déjà.

Le calcul analytique ne disparaît pas : il répond en millisecondes et il est validé trois
fois contre le jeu. La simulation répond à ce qu'il ne peut pas dire, les transitoires,
les tampons qui se remplissent, la file qui bouchonne. Les deux doivent se rejoindre en
régime établi, et ils se surveillent l'un l'autre.

## L'oracle tourne, et il a tranché

Fait le 26/08/2026. `bench/src/mindustryforge/Measure.java` pose une schématique dans un
vrai serveur v159.7, la fait tourner trente secondes et écrit ce que ses coffres
contiennent. Le pas de temps est figé et la boucle ne dort plus, donc trente secondes de
jeu prennent une fraction de seconde réelle. `npm run oracle:measure` rejoue les scénarios,
`npm run oracle` compare, et `tests/js/oracle.test.js` refait la comparaison à chaque
`npm test`.

Les scénarios se suffisent : une source de bac à sable d'un côté, un coffre de l'autre.
La même chaîne entre dans les deux moteurs, et on compte **en objets** et pas en débits.
« 182 des deux côtés » ne laisse nulle part où se cacher, « environ six et demi » cache
une erreur de six pour cent.

| scénario | portage | jeu |
|---|---:|---:|
| bande de cuivre | 182 | 182 |
| bande en titane | 320 | 320 |
| bande en plastanium | 570 | 570 |
| bande courte, bande longue | 196, 154 | 196, 154 |
| routeur à trois sorties | 196 | 196 |
| trop-plein | 196 | 196 |
| jonction croisée | 193 + 193 | 193 + 193 |
| pont | 196 | **187** |

Trois bugs trouvés par la mesure, qu'aucun test écrit à la main n'aurait vus :

- **`nextMax` manquait.** Deux bandes alignées sont une seule ligne, et le jeu les couple :
  l'objet en tête d'une bande ne peut pas atteindre le bout tant que celui en queue de la
  suivante est en travers. Sans ça, une ligne en cuivre tombait juste et une ligne en
  titane allait 6,6 % trop vite.
- **Le convoyeur en plastanium était classé « consommateur ».** `StackConveyor` ne descend
  pas de `Conveyor` : il ne partage aucun ancêtre avec lui et passait à travers toutes les
  branches du dumper. Chaque convoyeur en plastanium de chaque schématique était un trou
  noir, dans la simulation **et dans le calcul analytique**.
- **Le minuteur d'un pont** ne comptait que les tentatives, pas le temps.

Reste **le pont, à 4,8 %**. Nommé dans un test avec son écart plutôt que passé sous
silence.

## Un désaccord déjà trouvé, et laissé visible

Trois réponses candidates, et une seule vraie. Une bande en titane calcule à **12,02**
objets par seconde depuis ses constantes, sa fiche annonce **10**, et le moteur en livre
**10,67**. Aucune des trois ne concorde.

Le moteur a raison, et la raison pour laquelle le plafond n'est jamais atteint est
`nextMax`. Sans l'oracle, j'aurais choisi entre 12,02 et 10 avec un argument, et les deux
étaient faux.

## Ce qui reste vrai sur le serveur

Rien de ce qui précède n'a besoin d'un serveur. Le banc en a un, mais il ne sert plus
qu'à vérifier le portage une fois, pas à répondre à un visiteur.
