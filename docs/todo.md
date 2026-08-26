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
- [x] **Superposition au défilement.** L'aperçu collant passait par-dessus le panneau de
      bloc. La colonne entière colle désormais, pas l'image seule.
- [x] Icônes des liquides et des pompes conseillées.
- [x] Ponts : embouts arrondis, transparence, largeur réelle, flèches répétées.
- [x] Clic sur un bloc pour le lire et le désigner comme entrée ou sortie.
- [x] Détection des prises par l'orientation et non par la position sur le bord.

## À faire

### 1. Mécanismes du jeu encore absents ou faux

- **Portes de trop-plein et de sous-flux** : modélisées comme des routeurs. Le jeu leur
  donne une priorité, tout droit d'abord, sur les côtés seulement si ça bloque.
- **Déverseur** : prend dans un conteneur, pas modélisé.
- **Munitions des tourelles** : elles ressortent en puits sans consommation.
- **Chaleur** (Erekir) : pas modélisée du tout.

### 3. Vérifier les chiffres contre le vrai jeu

Le banc existe et ne sert pas encore. Une schématique posée dans un serveur Mindustry,
mesurée quelques secondes, et comparée au calcul. C'est ce qui distingue ce site de tous
les autres, et `verified` reste faux tant que ça ne tourne pas.

### 4. Place de marché

- Recherche par besoin : « il me faut 100 graphite/min », pas par mot-clé.
- Classements : meilleur débit par bloc, par cuivre investi, sous N blocs.
- Comparer deux schématiques côte à côte.
- Étiquettes déduites de l'analyse plutôt que tapées.

### 5. Reste

- Les entrées et sorties définies à la main doivent être rejouées à l'ouverture d'une
  schématique gardée.
- Diagnostic explicite : « trois bandes reliées à rien », en tête plutôt qu'en bas.
