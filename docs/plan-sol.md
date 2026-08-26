# Le sol, et la simulation pour de vrai

Demandé le 26/08/2026 : « pouvoir créer un sol pour voir sur quoi ça se pose, choisir
nous-même les zones, faire des branchements, et une vraie simulation comme le jeu, en
direct ». Plus, dans la foulée : « une option pour faire disparaître le schéma avec une
progression de transparence, pour voir le sol sur lequel il est posé, voir l'eau etc ».

Écrit avant de coder, parce que la moitié de ce qui suit existe déjà ailleurs et que
s'en apercevoir après avoir réécrit une deuxième version serait le gâchis habituel.

## Ce qui existe déjà, et où

- **`mindustry-ai/bridge/`** : un greffon complet qui expose le jeu par une prise réseau.
  `BridgeServer` fait passer les messages du fil réseau au fil du jeu, `MapExporter` sort
  la carte entière en quatre plans binaires (sol, minerai, bâtiment, rotation) avec la
  palette des identifiants réellement présents, `ActionExecutor` pose et détruit,
  `StepLoop` avance le monde d'un nombre de ticks exact.
- **`mindustry-ai/viewer/dashboard.html`** : 2 700 lignes qui dessinent tout ça en direct
  avec les sprites du jeu, en interrogeant `terrain/N` et `scene/N?since=version`.
- **`mindustry-forge/bench/bridge.py`** : le client Python de cette prise, déjà écrit :
  `reset`, `step`, `place`, `demolish`, `map`, `region`, `give`, `clear_ore`, `scene`.
- **`mindustry-forge/bench/`** : le serveur Mindustry v159.7 provisionné, et un greffon
  qui ne sait pour l'instant que `dump-blocks`.

Autrement dit : le pont existe, le rendu en direct existe, le client existe. Ce qui manque
est le greffon côté forge et la partie navigateur.

## Étape A. Le sol dans le navigateur

Utile tout de suite, sans serveur, et ça enlève une devinette de plus.

1. **Sortir les sols du jeu.** `Floor` porte ce qu'il faut et rien n'est deviné :
   `itemDrop` (le minerai qu'une foreuse en tire), `liquidDrop` et `isLiquid` (ce qu'une
   pompe en tire), `playerUnmineable`, `hasSurface`. Aujourd'hui ils sont dans
   `bench/data/blocks.json` et jetés par `build_catalogue.py`, faute de rôle et de coût.
2. **Leurs sprites.** `build_sprites.py` ne prend que les blocs du catalogue trimmé. Les
   sols sont des sprites simples, sans variantes de bord pour commencer.
3. **Une couche sol dans le rendu.** `draw` reçoit une grille de sols, dessinée sous la
   schématique. Le fond hachuré du jeu reste là où il n'y a pas de sol peint.
4. **Un pinceau.** Même geste que la palette de blocs : on choisit un sol ou un minerai,
   on peint. Avec un pinceau de taille réglable, parce que peindre une tache de cuivre
   tuile par tuile est insupportable.
5. **La transparence.** Un curseur qui efface progressivement la schématique pour voir le
   sol dessous. C'est ce qui rend le pinceau utilisable : sans lui on peint à l'aveugle
   sous les blocs.
6. **Le calcul s'en sert.** C'est le vrai gain. Aujourd'hui une foreuse est annoncée « au
   débit maximal, posée sur une tache pleine », ce qui est un aveu : on ne sait pas sur
   quoi elle est. Avec un sol, la formule du jeu s'applique exactement :

       temps = (drillTime + hardnessDrillMultiplier * dureté) / nombre de tuiles de minerai
       débit = tuiles_de_minerai / temps * multiplicateur_de_liquide

   « cette foreuse couvre trois tuiles de cuivre sur quatre, donc 0,9 cuivre par seconde »
   au lieu de « au mieux 1,2 ». Pareil pour une pompe : `pumpAmount * tuiles_de_liquide`.

## Étape B. La simulation, avec le vrai moteur

C'est là qu'est la « dinguerie », et c'est aussi là qu'est le piège.

Le simulateur maison a été supprimé le 26/08/2026 et la raison vaut pour toute
réimplémentation : écrire une copie du moteur de Mindustry en JavaScript, à côté d'une
copie qui marche du moteur de Mindustry, c'est la mauvaise moitié du travail. Le sol peint
et la schématique partent donc au vrai jeu.

7. **Porter le pont dans `bench/`.** Même version du jeu, le code se transpose. Trois
   commandes suffisent : construire un monde depuis une grille de sols, poser une
   schématique, avancer de N ticks et rendre l'état.
8. **Un point d'entrée qui enchaîne** : carte, pose, chauffe, mesure. Ce que produit
   vraiment la schématique, mesuré par le moteur, comparé au calcul. C'est ce que le
   dépôt appelle `verified` depuis le début et qui est faux faute d'avoir tourné.
9. **Le direct.** Le viewer de `mindustry-ai` interroge `scene/N?since=version` et
   redessine. Le même rendu que la page d'analyse : ce sont les mêmes sprites et la même
   fonction `draw`.

### La limite qu'il faut dire tout de suite

Un visiteur de passage n'a pas de serveur Mindustry sous la main. L'étape B ne peut pas
tourner dans le navigateur de n'importe qui. Deux formes possibles, et il faudra choisir :

- **Vérification différée** : un bouton « faire vérifier », la schématique part dans une
  file, mon serveur la joue, et le résultat mesuré est enregistré avec elle. C'est ce qui
  fait qu'une schématique publiée porte un chiffre mesuré et pas seulement calculé, et
  c'est le seul argument qu'aucun autre site ne peut copier facilement.
- **Mode local** : celui qui a le dépôt lance le serveur et la page s'y branche, avec le
  direct complet. Gratuit à faire une fois le pont porté.

Les deux partagent tout sauf le déclencheur. On fait le pont d'abord, la file après.

## Ordre

A1 → A2 → A3 → A5 → A4 → A6, puis B7 → B8 → B9.

La transparence (A5) passe avant le pinceau (A4) parce qu'elle le rend utilisable, et le
calcul (A6) passe en dernier parce que c'est le seul morceau qui a besoin que tout le
reste soit là.
