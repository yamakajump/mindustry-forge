# La place de marché : ce que la concurrence fait déjà

Relevé le 27 août 2026, sur pièces. Tous les chiffres viennent d'appels réels aux deux
sites, pas d'une page « à propos ». Ils vieilliront, la méthode pour les refaire est dans
chaque section.

## mindustry-tool.com

Ce n'est pas un site, c'est un écosystème tenu par une personne. `sharrlotte` signe 1314
des 1339 commits du mod ; le deuxième contributeur en a treize.

| | |
|---|---|
| schémas | 12 584 |
| cartes | 8 245 |
| serveurs | 1 028 |
| posts | 124 |

Relevés sur `https://api.mindustry-tool.com/api/v4/{schematics,maps,servers,posts}/count`,
qui répondent un entier nu, sans authentification.

Le vrai produit est le mod in-game, pas le site : 236 étoiles, environ 207 000
téléchargements cumulés, une version par semaine, et beaucoup plus que du parcours de
schémas. Il pilote l'unité du joueur en autoplay, dessine les chemins que prendront les
ennemis, affiche les portées de tourelles, et traduit le chat par Gemini ou DeepL.

Autour, une vingtaine de dépôts qui sont de la plomberie : des images Docker de serveurs,
un gestionnaire de serveurs en Java, un service de vignettes en Go, un relais de rooms en
Rust, trois plugins de mode de jeu.

### Ce qu'ils ne font pas

Leur API renvoie déjà, dans `meta`, un `powerConsumption`, un `powerProduction` et la
liste des `requirements`. C'est de l'analyse statique : un bilan de puissance et un coût
en ressources.

Il n'y a rien au-delà. Pas de débit, pas de goulot d'étranglement, pas de comportement
sous charge, pas d'optimisation. Leur « Ratio calculator » calcule un nombre de blocs,
c'est de l'arithmétique. Personne dans cet écosystème n'a construit de banc qui fait
tourner le jeu, parce que c'est la partie ingrate.

C'est exactement le trou dans lequel ce dépôt est assis.

## mindustryschematics.com

2 949 schémas, 148 pages de vingt. Le site est à l'abandon, il n'a aucune condition
d'utilisation : sa page `/info` contient trois liens et rien d'autre.

Les `.msch` sont servis bruts, sans authentification, à une adresse prévisible :
`/schematics/{id}.msch`, qui répond un `application/octet-stream` commençant par le magic
`msch`.

## Les licences, parce qu'elles ne disent pas toutes la même chose

Le frontend le plus récent qui soit public est `sharrlotte/MindustryToolNext`, en
**GPL-3.0**. `MindustryToolFrontend`, l'ancien, n'a **aucune licence**, donc tous droits
réservés. Le mod est en **MIT**. `ImageServer` et `PlayerConnectServer` n'ont pas de
licence non plus. **Le backend et l'API actuels sont privés** : il n'y a rien à en
reprendre.

Leur ToS, section 6, contredit frontalement leur propre GPL en interdisant tout travail
dérivé sans autorisation écrite. Pour le code déjà publié sous GPL, la GPL gagne : une
concession de droits ne se révoque pas par une page de conditions écrite après. Le ToS
couvre en revanche ce qui n'a jamais été publié, le nom et les logos.

## Ce qui encadre vraiment la récupération des schémas

Trois couches, et elles ne pointent pas dans la même direction.

**Les schémas ne leur appartiennent pas.** Leur propre section 4 le dit : les auteurs
gardent la propriété, le site n'a qu'une licence d'hébergement non exclusive, et le
contenu public doit être considéré comme partagé ouvertement dans la communauté.

**La base en tant que compilation, si.** Le droit sui generis du producteur de base de
données (articles L341-1 et suivants du code de la propriété intellectuelle) interdit
l'extraction d'une partie substantielle, indépendamment de qui possède les éléments.
Prendre 12 584 entrées sur 12 584 en est la définition. L'argument est solide pour
mindustry-tool, qui a investi dans la collecte, et faible pour mindustryschematics, qui
est à l'arrêt.

**Le contractuel.** mindustry-tool interdit les scripts et bots dans sa section 3.
mindustryschematics n'a aucune condition, donc rien à violer. Les deux portent le
robots.txt géré par Cloudflare, avec `ai-train=no` et une réserve expresse de droits au
titre de l'article 4 de la directive 2019/790.

Il y a donc deux gestes distincts, qu'il ne faut pas confondre. Constituer un corpus pour
mesurer et valider le moteur ne se republie pas, ne concurrence rien, et ne demande la
permission de personne. Monter une base publique alimentée par la leur est l'autre geste,
et c'est celui que le droit sui generis vise.

## Les décisions prises

**Licence : AGPL-3.0.** Choisie contre la GPL-3.0 parce que le produit est un service web,
et que la GPL ne se déclenche qu'à la distribution d'un binaire : n'importe qui pourrait
héberger une version fermée du moteur sans rien rendre. L'AGPL est la seule qui tienne
ici.

**L'origine est dans le modèle de données, pas à côté.** Chaque schéma porte sa source
(`mindustry-tool`, `mindustryschematics`, `upload`), son identifiant d'origine et son
auteur. Ajouté après coup, cela ne se retrouve jamais. C'est une contrainte de schéma, pas
une fonctionnalité.

**Les prévenir avant, pas après.** La communauté Mindustry tient sur un Discord et elle
est minuscule. Un message à `sharrlotte` annonçant un agrégateur libre qui crédite et qui
lie, avant la mise en ligne, coûte cinq minutes et change la nature de la chose. Après la
mise en ligne, c'est une excuse.

## Refaire ces mesures

```bash
B=https://api.mindustry-tool.com/api/v4
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150.0.0.0 Safari/537.36'
curl -s -A "$UA" "$B/schematics/count"
curl -s -A "$UA" "$B/schematics?page=0&size=20"
curl -s -A "$UA" "$B/schematics/{id}"          # métadonnées, dont meta.powerConsumption
curl -s -A "$UA" "$B/schematics/{id}/data"     # le .msch brut
curl -s -A "$UA" https://mindustryschematics.com/schematics/{id}.msch
```

Le site principal est derrière Cloudflare et refuse les agents connus ; son API ne l'est
pas et répond un simple `X-Powered-By: Express`, sans en-tête de quota.
