# Ce qu'il reste à faire

Tenu ici plutôt que dans un gestionnaire de tâches, parce que la session n'en a pas et
qu'une liste que Corentin ne peut pas lire ne sert à rien. Une ligne par chose, dans
l'ordre où je compte les faire, avec ce qui a été dit pour la demander.

## À faire

### 1. L'audit, deux fois

Le rapport d'origine est dans `docs/audit-2026-08.md` : 39 défauts survivants sur 50
proposés. **Tous corrigés.**

Relancé ensuite sur le code écrit dans la foulée, qui n'avait été relu par personne, il en
a rendu **six de plus**, et c'est la leçon à retenir plutôt que la liste :

- Le mass driver n'était porté qu'à moitié. La simulation était exacte et la page annonçait
  zéro, parce que `tools/compare.mjs` ne compare que la simulation et ne peut pas voir
  l'analyse. Quatre tests neufs dans `analyse.test.js` bouchent ce trou pour ce bloc ; il
  reste ouvert pour tous les autres.
- `Edges.getFacingEdge` manquait complètement. Le jeu mesure toujours à la case de bordure
  du voisin, jamais à sa case de rangement, et pour un bloc de taille paire les deux ne
  disent pas la même chose sur les coins.
- `items.take()` est un curseur qui tourne sur les identifiants, pas un premier trouvé.
- Un lien enregistré dans un schéma n'est pas un lien : le jeu le revalide, des deux côtés.
- Deux boucles `while` étaient devenues des modulos, ce qui ne se voit que sous surcharge.
- Une usine affamée demandait quand même son courant, et une foreuse à côté en payait le
  prix au carré.

Deux corrections restent invérifiables et il faut le dire plutôt que le laisser croire :

- **L'ordre de `dump(null)`.** Transcrit parce que c'est ce que fait le jeu, mais aucune
  forme que le banc sait construire ne le distingue : un séparateur ne retient jamais deux
  objets à la fois tant que sa sortie bouge, et dès qu'elle se ferme plus rien ne part.
- **La chaleur transmise d'un réacteur au thorium.** `heatProgress` vaut `heat × 15`. Juste
  et invérifiable : un réacteur refroidi voit sa chaleur ramenée à zéro à chaque image, donc
  il n'en transmet aucune, et un réacteur qui en transmet vraiment est en train d'exploser.

### 2. Le banc n'a plus d'écart

Les deux qui traînaient sont tombés le 27/08/2026, et tous les deux étaient la même chose
sous deux visages : **le jeu compte en simple précision et le portage comptait en double**.

- Une source verse cent objets par seconde dans soixante images, donc son compteur dépense
  six dixièmes d'image à la fois, et `0.6f` vaut un cheveu de plus que six dixièmes. En
  double le compteur revient exactement à 0,6 la troisième image et le dépense une fois de
  trop : un objet toutes les trois images, depuis le bloc qui alimente presque tous les
  scénarios du banc.
- Une machine ajoute un quatre-vingt-dixième quatre-vingt-dix fois, ce qui tombe juste sous
  un en double et juste au-dessus en float.
- Un tapis prend un troisième objet quand celui de derrière a bougé d'exactement
  `itemSpace`.
- Et un liquide passe d'un bloc à l'autre comme une fraction de lui-même soixante fois par
  seconde, donc l'arrondi s'accumule jusqu'à une unité entière au bout d'une course.

Deux autres choses sont sorties de la même enquête, et elles n'ont rien à voir avec les
flottants : **un tapis vide s'endort au bout d'une seconde**, et la liste de mise à jour du
jeu est **non ordonnée**, donc en sortir un bloc y ramène le dernier à sa place. Deux tapis
qui s'endorment sur la même image remontent une presse de trois rangs, et cette presse lit
désormais le stock de l'image d'avant.

L'outil qui a trouvé tout ça est `node tools/trace.mjs <scenario>` avec la commande `trace`
du banc en face : une ligne par image des deux côtés, et la première qui diffère. Un total
après mille huit cents images ne sait pas dire laquelle a divergé. Il sert pour la suite.

### 3. Ce que le moteur ne modélise pas du tout

- ~~**Le souffle d'une explosion.**~~ Fait. Un bloc a des points de vie, il meurt à zéro, et
  sa mort part en vagues qui rayonnent depuis son centre. `Damage.tileDamage` n'est pas un
  rayon : chaque rayon **se dépense** sur ce qu'il traverse, donc un mur devant un réacteur
  encaisse à sa place et ce qui est derrière tient. C'est la raison pour laquelle on
  construit un banc de réacteurs avec des murs entre eux, et c'est un fait sur un plan
  qu'aucun débit ne dit.

  Deux surprises mesurées : le souffle propre d'un réacteur au thorium, dix-neuf cases de
  cinq mille dégâts, **épargne ta propre équipe** (`Damage.damage` prend en argument
  l'équipe à ne pas toucher), donc dans une schématique il ne touche rien. Ce qui blesse
  vraiment est le souffle générique, fait de ce que le bloc **tenait** : trente thoriums
  valent trente-huit d'explosivité en trois vagues de dix-neuf, ce qui tue une jonction
  collée à lui et laisse un convoyeur deux cases plus loin.

  Le banc compare désormais **ce qui reste debout**, ce qui manquait : les compteurs d'un
  bloc mort sont à zéro des deux côtés, et ça se lit comme un accord.
- **Le fret aérien, à moitié.** `cargo.js` fait voler l'unité, la charge et la décharge, et
  `units.js` porte la physique de vol du jeu. Ce qui manque n'est pas du code : au moment où
  l'unité naît, `AIController` tire `Mathf.random(40)` pour décaler son premier ciblage, et
  ce tirage vient du générateur partagé de la partie. Rien dans une schématique ne le
  détermine, donc la cadence d'un aller-retour ne peut pas être tenue contre le moteur image
  par image. `cargo-unset` mesure ce qui est certain : un point de déchargement que personne
  n'a réglé ne reçoit jamais rien. Les deux classes restent décochées pour cette raison.
- **Les unités au sol.** Une unité posée par une usine reste posée ici ; dans le jeu elle
  marche, et le jeu refuse une dépose tant qu'une autre unité chevauche encore la case.

### 4. Relancer l'audit une troisieme fois

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

### 5. Le reste de la famille des charges utiles

Le socle est là et mesuré : la cargaison glisse, les convoyeurs battent sur l'horloge de
la carte, le reconstructeur consomme, le constructeur fabrique. Ce qui manque demande une
chose que le moteur n'a pas encore : **une charge utile qui est elle-même un bâtiment
avec son contenu**.

- `PayloadLoader` et `PayloadUnloader` remplissent et vident le bloc transporté.
- `PayloadDeconstructor` le rend à ses matériaux.
- `PayloadMassDriver` le lance à distance.

Un `BuildPayload` porte aujourd'hui un nom ; il lui faudra porter des objets et des
liquides.

### 6. `UnitAssembler`

Transcrit à moitié et non coché, pour une raison précise. Ses quatre drones et son
énergie se mesurent en trente secondes ; l'unité qu'il assemble demande trois mille
images **et** que les drones soient en position, ce qui dépend de leur vol. Il faudrait
soit un modèle de vol minimal, soit un scénario plus long, et le banc accepte déjà une
durée par scénario.

### 7. Les processeurs : déclarés, pas simulés

**Fait.** Un processeur ne consomme rien du tout, ni énergie ni objets, et le banc le
mesure : `refuses-micro-processor` et `refuses-hyper-processor` montrent qu'un routeur qui
en touche un envoie tout son cuivre dans le coffre.

`site/public/forge/logic.js` décode la configuration : le programme, en clair, et la liste
des liens. Le rapport dit alors « trois processeurs, dont un qui pilote, et ce qu'il
pilote », parce que la seule instruction qui sorte d'un processeur est `control`. Un
processeur qui ne fait que `sensor` et `print` ne change aucun chiffre, et c'est la majorité
de ceux qu'on croise.

L'interpréteur n'est **pas** écrit et ne le sera pas. Le simuler pour savoir si un `control`
part est le mauvais rapport effort sur résultat, et son mode de panne est silencieux : une
propriété que le moteur ne modélise pas renverrait null, le programme brancherait ailleurs,
et rien ne le dirait.

### 8. La longue traîne des blocs

`docs/blocs.md` tient le compte, généré depuis la liste de classes du jeu. Une case
cochée veut dire transcrite **et** mesurée dans un vrai serveur. Soixante-dix-neuf classes
sur cent cinq.

Ce qui reste se range en trois tas, et le tri compte plus que la liste :

- **Un vrai comportement, portable tel quel** : `PowerVoid`, `ItemIncinerator`, `LaunchPad`,
  `Accelerator`, les deux tourelles continues.
- **Un comportement qui demande une machinerie que le moteur n'a pas** : toute la famille
  des charges utiles (§5), l'assembleur (§6), et les deux blocs de fret aérien, qui
  demandent une unité qui vole.
- **Rien du tout, et il faut le prouver plutôt que le supposer** : afficheurs, interrupteurs,
  toiles, portes, propulseurs, plateforme d'arrivée, centre de commande hérité, sols et murs
  colorés, algue. Chacun mérite un scénario qui montre qu'il ne change aucun chiffre, sinon
  la case cochée ne vaut rien.

### 9. Place de marché

- Comparer deux schématiques côte à côte.
- Filtrer sur ce dont elle a besoin : « j'ai du charbon, montre ce que je peux faire
  tourner ».
- Classement par cuivre investi et pas seulement par bloc.

### 10. L'image qui bouge : ce qu'elle couvre, et ce qu'elle ne couvre pas

`site/public/forge/live.js` fait tourner le schéma dans le navigateur et le redessine, à
partir du **même moteur** que le rapport et que le banc. C'est toute la valeur du bouton :
une bande animée sur `Date.now()` aurait exactement la même tête et ne voudrait rien dire.

Ce qui est porté, avec la source du jeu en face :

- Le défilement des bandes, `(Time.time * speed * 8 * efficiency) % 4` (`Conveyor.draw`),
  et l'arrêt sur image d'une bande bouchée (`clogHeat`).
- Les objets sur les bandes à leur position exacte, `xs` compris : un objet entré par le
  côté est plaqué contre ce côté et revient au milieu en un cinquième de seconde. Le
  décalage latéral et l'insertion **au milieu de la file** (`mid`) ont été ajoutés au
  moteur pour ça, et ne changent aucun débit mesuré.
- Les objets dans les ducts, interpolés du bord d'entrée au bord de sortie (`recDir`), ce
  qui fait qu'un objet tourne visiblement le coin au lieu de traverser en ligne droite.
- Le liquide dans les conduits et dans tout bloc qui a une image `-liquid` : teinte de ce
  qu'il contient, opacité égale à son remplissage (`Drawf.liquid`).
- Les rotors, tournés par le `warmup` réellement atteint (`Drill.draw`), et le minerai
  qu'une foreuse sort, teinté de sa couleur (`drawMineItem`).
- Les lueurs, les chaleurs et les flammes, **avec les constantes du bloc** et pas des
  constantes devinées. `bench/data/blocks.json` porte la chaîne de dessin du jeu à plat
  (`DrawGlowRegion`, `DrawHeatRegion`, `DrawHeatOutput`, `DrawFlame`, `DrawRegion`,
  `DrawLiquidRegion`), parce que la couleur vit dans le `DrawBlock` et nulle part ailleurs :
  l'électrolyseur est lilas, le four à chaux orangé, le four à silicium jaune pâle, et
  aucun nom de fichier ne le dit.
- Les drones d'un assembleur et d'un chargeur de fret, à leur position de vol.
- Un bloc qui meurt : il se désagrège une demi-seconde au lieu de disparaître entre deux
  images.

Ce qui **n'est pas** dessiné, et pourquoi :

- **La tourelle ne tourne pas.** Rien dans un schéma ne lui donne quoi que ce soit à viser.
  Un canon qui balaie pour faire joli serait la seule chose en mouvement sur l'image qui
  ment.
- **Les drones sortent souvent du cadre.** Le carré de travail d'un assembleur est à
  `(area_size + size) / 2` cases devant lui, donc hors de ce qui a été copié. Ce n'est pas
  un défaut de rendu : c'est là qu'ils sont.
- **Les textures de fluide animées** du jeu (`renderer.fluidFrames`) sont générées à
  l'exécution ; le conduit est teinté à la place, ce qui est la règle de tous les autres
  blocs à liquide.
- **Le tremblement d'une flamme.** `DrawFlame` ajoute un `Mathf.random` à son rayon et à son
  opacité à chaque image. Volontairement laissé de côté : ce serait la seule chose de cette
  image qui différerait entre deux passages de la même schématique, et tout le reste ici est
  rejouable.
- **Une teinte remplace la couleur au lieu de la multiplier.** Le jeu fait
  `Draw.color(c)` puis dessine, ce qui multiplie ; un canvas ne sait faire qu'un
  `source-in`, qui remplace. Sans écart visible sur les masques blancs que le jeu fournit
  pour ça, et c'est ce que sont toutes les couches teintées ici.
- **`clogHeat` n'est pas dans le moteur.** Il est recalculé par le rendu, parce que le
  `blendbits` dont il dépend est une notion de dessin. Conséquence à connaître : le jeu
  interdit à un déchargeur de puiser dans une bande bouchée (`canUnload`), et ça, le moteur
  ne le modélise pas.

### 11. Reste

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
- [x] **Le mode édition.** Un écran à lui, plein cadre, avec les mécaniques de pose du jeu
      relevées dans sa source et non de mémoire : ligne droite par défaut, escalier ou A\* en
      placement diagonal, remplissage de zone pour les murs, suivi de chaîne pour améliorer
      une ligne existante. Les ponts s'espacent de leur portée et se lient au suivant, un
      croisement pose une jonction, un obstacle se franchit en ponts automatiques par la
      programmation dynamique du jeu. Sélection avec déplacement, rotations, miroirs,
      presse-papiers dans les deux sens. Raccourcis relevés dans `Binding`. Limite de 64×64
      tenue à la pose. `docs/audit-pose.md` recense les 37 mécaniques et leur état.

- [x] **L'onglet sol.** Crayon, rectangle, pot de peinture, gomme, trois couches, et la
      transparence qui bascule toute seule pour qu'on ne peigne plus à l'aveugle. Le sol est
      gardé avec la schématique : sans ça, la rouvrir rendait ses foreuses muettes.
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

## Deux règles pour le combustible, et elles ne disent pas la même chose

Trouvé le 27/08 en écrivant le plafond de production, signalé sans être corrigé, ce qui
était le bon réflexe : corriger `needs` au passage, dans une correction qui parle d'autre
chose, c'est casser une mesure que le banc corrobore sans que personne ne relie les deux.

Un générateur qui brûle n'importe quoi ne déclare pas d'ingrédient, seulement une durée. La
schématique manque donc d'« un combustible » et pas de charbon, et les deux fichiers qui
répondent à cette question ne répondent pas pareil :

- `needs.js`, dans `demand()` : ce qui couvre le besoin de combustible est **la somme de
  tout ce que la schématique fabrique**, inflammable ou non.
- `marks.js`, dans `candidates()` : ce qui peut couvrir ce besoin est filtré sur
  `flammability > 0.1`, d'après ce que le jeu déclare.

Conséquence, sur une forme parfaitement banale : une chaîne qui fait du silicium et brûle du
charbon s'entend dire que son silicium nourrit ses brûleurs, donc « il lui faut » omet le
charbon. Le joueur colle la schématique, elle s'arrête, et la page lui avait dit qu'elle
tournerait.

La règle de `marks.js` est la bonne, c'est celle du jeu. À corriger dans sa propre
correction, avec un scénario de banc qui montre la différence : une schématique qui produit
quelque chose d'ininflammable **et** brûle autre chose.

## Deux fichiers de banc qui n'importent plus, et une commande qui ne prouve rien

Trouvé le 27/08 par la voie du dumpeur, vérifié plutôt que cru.

`bench/test_bench.py` et `bench/test_schematic_in_the_game.py` importent `forge.layout` et
`forge.bench`, le paquet supprimé au restart. Ils n'arrivent même pas à la collecte :

```
ModuleNotFoundError: No module named 'forge'
```

Et la commande que le `CLAUDE.md` présentait comme « le banc, qui fait tourner le vrai
jeu », `python -m pytest tests/ -q`, ramasse **huit tests de format de fichier et aucun test
qui lance quoi que ce soit**. Elle passe au vert en quatre centièmes de seconde, ce qui est
précisément ce qui la rendait trompeuse : elle avait l'air de tenir la deuxième règle du
dépôt.

**La règle est tenue, mais ailleurs** : par `npm run oracle` et ses scénarios enregistrés,
chacun mesuré trente secondes dans un vrai serveur v159.7 et comparé en objets comptés. Le
`CLAUDE.md` est corrigé et désigne maintenant la bonne commande.

Ce qui reste : les deux fichiers morts donnent l'illusion qu'il existe un chemin de
re-mesure automatisé en Python. Quelqu'un finira par ajouter un scénario en croyant qu'il
sera mesuré. Soit on les ranime, soit on les supprime, mais les laisser cassés est le pire
des trois.

## Le projecteur de surcharge accélère un bloc que le jeu laisserait tranquille

`analyse.js:428`, dans `speedUp` :

```js
if (Math.hypot(x - px, y - py) <= reach + half) {
```

Le jeu utilise `Mathf.within`, qui est **strict**. Un bloc posé pile à la limite est donc
accéléré ici et pas en jeu. Cas cheveu, effet réel : le bloc sort avec un débit majoré qui
ne se produira jamais.

Ce qui rend le signalement intéressant, c'est que c'est **la même forme** que la règle des
liens de processeur prouvée le 27/08 dans le bytecode de `LogicBlock.validLink` : rayon
plus demi-taille de la cible, entre centres. La même formule est écrite deux fois dans le
dépôt, une fois stricte et une fois non, et une seule des deux a été recoupée contre le
jeu. L'autre attend.

Vérifier `Mathf.within` sur `OverdriveProjector` avant de corriger, et écrire le scénario
du bloc posé pile à la limite : c'est un cas que seul un test au bord attrape, et il ne
coûte rien une fois qu'on sait où regarder.

Signalé par la voie du dumpeur en écrivant les liens de processeur, sans y toucher parce
que ce n'était pas son fichier.
