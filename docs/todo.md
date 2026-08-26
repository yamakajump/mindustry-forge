# Ce qu'il reste à faire

Tenu ici plutôt que dans un gestionnaire de tâches, parce que la session n'en a pas et
qu'une liste que Corentin ne peut pas lire ne sert à rien. Une ligne par chose, dans
l'ordre où je compte les faire, avec ce qui a été dit pour la demander.

## Corrigé

- [x] **Le débit calculé.** Remplacé par un vrai flot maximal (Dinic) au lieu d'une
      propagation itérative. La schématique de test passe de 648 à 2 402 énergie/s, ce qui
      est exactement ce que valent ses blocs, et le goulot fantôme a disparu.
- [x] **Un tuyau ne porte qu'un liquide.** Règle du jeu vérifiée dans `acceptLiquid` :
      une citerne annonçait 32 pétrole et 6 011 eau par minute sur les mêmes trois tuiles.
- [x] **Jonction** : passe tout droit, entrée d'un côté sortie de l'opposé, au lieu de
      diffuser aux quatre côtés et de mélanger les lignes qu'elle sert à croiser.
- [x] **Trieur** : sa configuration est enfin utilisée.
- [x] **Tourelles** : elles mangent leurs munitions au lieu d'être des puits sans
      consommation. Le débit est celui du tir ; à quelle fréquence elle tire n'est pas dans
      une image fixe, et le rapport le dit plutôt que de faire semblant.
- [x] **Déverseur et conteneurs** : un déverseur collé à un coffre est un début de ligne,
      et un coffre au bout d'une ligne est une destination.
- [x] **Superposition au défilement.** L'aperçu collant passait par-dessus le panneau de
      bloc. La colonne entière colle désormais, pas l'image seule.
- [x] Icônes des liquides et des pompes conseillées.
- [x] Ponts : embouts arrondis, transparence, largeur réelle, flèches répétées.
- [x] Clic sur un bloc pour le lire et le désigner comme entrée ou sortie.
- [x] Détection des prises par l'orientation et non par la position sur le bord.

## À faire

### 1. Mécanismes du jeu encore absents ou faux

- **Chaleur** (Erekir) : pas modélisée du tout. Toute la moitié Erekir du jeu en dépend.
- **Portes de trop-plein** : laissées en routeurs, et c'est un choix. Le jeu envoie tout
  droit si ça passe et sur les côtés sinon ; avec un flot maximal ce choix ne change pas
  le débit total, seulement quelle branche le porte. Ça deviendra faux le jour où le site
  dira *où* passe la matière et pas seulement combien.

### 3. Vérifier les chiffres contre le vrai jeu

Le banc existe et ne sert pas encore. Une schématique posée dans un serveur Mindustry,
mesurée quelques secondes, et comparée au calcul. C'est ce qui distingue ce site de tous
les autres, et `verified` reste faux tant que ça ne tourne pas.

### 4. Place de marché

- [x] **Vitrine publique** avec recherche par ce qu'une schématique produit, et tri par
      débit par bloc plutôt que par date. Un tri par date est un classement de qui a posté
      en dernier ; un tri par débit par bloc est un classement des bonnes.
- Comparer deux schématiques côte à côte.
- Filtrer aussi sur ce dont elle a besoin : « j'ai du charbon, montre ce que je peux
  faire tourner ».
- Classement par cuivre investi et pas seulement par bloc.

### 5. Reste

- Les entrées et sorties définies à la main doivent être rejouées à l'ouverture d'une
  schématique gardée.
- Diagnostic explicite : « trois bandes reliées à rien », en tête plutôt qu'en bas.
