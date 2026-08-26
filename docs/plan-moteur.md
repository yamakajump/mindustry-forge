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

1. **Le noyau et les transporteurs.** `Build`, `proximity`, `dump()` en tourniquet,
   `acceptItem`, les positions d'objets sur une bande. Bande, jonction, routeur, trieur,
   trop-plein, sous-verse, pont, déverseur, coffre.
2. **Les machines.** Usines, foreuses, pompes, liquides et `moveLiquid`.
3. **L'électricité.** `PowerGraph` : satisfaction, batteries, équilibre.
4. **L'oracle.** Porter le pont de `mindustry-ai` dans `bench/`, comparer par type.
5. **Le direct.** Les objets qui bougent vraiment sur les bandes, à l'écran, avec le
   moteur de rendu qui existe déjà.

Le calcul analytique ne disparaît pas : il répond en millisecondes et il est validé trois
fois contre le jeu. La simulation répond à ce qu'il ne peut pas dire, les transitoires,
les tampons qui se remplissent, la file qui bouchonne. Les deux doivent se rejoindre en
régime établi, et ils se surveillent l'un l'autre.

## Ce qui reste vrai sur le serveur

Rien de ce qui précède n'a besoin d'un serveur. Le banc en a un, mais il ne sert plus
qu'à vérifier le portage une fois, pas à répondre à un visiteur.
