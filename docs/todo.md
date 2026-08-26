# Ce qu'il reste à faire

Tenu ici plutôt que dans un gestionnaire de tâches, parce que la session n'en a pas et
qu'une liste que Corentin ne peut pas lire ne sert à rien. Une ligne par chose, dans
l'ordre où je compte les faire, avec ce qui a été dit pour la demander.

## Corrigé

- [x] **Superposition au défilement.** L'aperçu collant passait par-dessus le panneau de
      bloc. La colonne entière colle désormais, pas l'image seule.
- [x] Icônes des liquides et des pompes conseillées.
- [x] Ponts : embouts arrondis, transparence, largeur réelle, flèches répétées.
- [x] Clic sur un bloc pour le lire et le désigner comme entrée ou sortie.
- [x] Détection des prises par l'orientation et non par la position sur le bord.

## À faire

### 1. Le débit calculé est faux, et c'est le plus grave

« Branchée comme elle est » annonce 648 énergie/s là où la schématique en vaut 2 402. Le
chiffre a empiré en corrigeant les entrées, parce que nourrir une seule prise expose la
faiblesse du routage : une propagation itérative sur un réseau qui boucle perd du débit à
chaque tour.

Il faut un vrai calcul de flot maximal plutôt qu'une propagation. Tant que ce n'est pas
fait, ce chiffre ne doit pas être publié comme s'il était mesuré.

### 2. Mécanismes du jeu encore absents ou faux

- **Jonction** : modélisée comme diffusant aux quatre côtés. Le jeu la fait passer tout
  droit, entrée d'un côté, sortie du côté opposé.
- **Réservoir et citerne** : Corentin signale qu'ils redistribuent. À vérifier contre le
  jeu et corriger.
- **Portes de trop-plein et de sous-flux** : modélisées comme des routeurs. Le jeu leur
  donne une priorité, tout droit d'abord, sur les côtés seulement si ça bloque.
- **Trieur** : sa configuration dit quel objet il laisse passer, et elle est lue mais pas
  utilisée.
- **Déverseur** : prend dans un conteneur, pas modélisé.
- **Munitions des tourelles** : elles ressortent en puits sans consommation.

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
