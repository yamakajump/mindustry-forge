# Les chaines que le serveur ecrit

Un fichier par domaine, `<domaine>.<ecran>.<element>` pour les nommer. Les domaines sont
fixes : `nav`, `vitrine`, `schema`, `analyse`, `edition`, `outils`, `blocs`, `compte`. Un
chantier depose son fichier ici et ne touche pas a ceux des autres.

L'autre moitie du site est dans `public/forge/lang/`. L'analyseur et l'editeur sont des
pages statiques : elles ne rencontrent jamais PHP, donc leurs chaines ne peuvent pas venir
d'ici. Ce qui est ecrit par les deux moteurs, l'entete par exemple, existe des deux cotes,
et un test tient les deux versions d'accord.

Une seule langue est livree, le francais. Traduire une interface qui change toutes les
semaines revient a payer la traduction plusieurs fois.

## La cle s'ecrit en entier

```php
__('blocs.page.recette')          // oui
__("blocs.page.{$quoi}")          // non, les tests le refusent
```

Une cle assemblee a l'execution n'existe pour personne avant que la page tourne. Rien ne
peut verifier qu'elle a une traduction, et c'est precisement ce que les tests sont la pour
verifier.

## Aucun chiffre ne passe par un trou

```php
{{ $n }} {{ __('blocs.unite.cases') }}      // oui
{{ __('blocs.unite.cases', ['n' => $n]) }}  // non
```

Quand une cle manque, Laravel rend la cle **sans rien substituer**. Une chaine a trous fait
donc disparaitre le nombre, pas le mot : la page dit `blocs.unite.cases` et le lecteur a
perdu la seule chose qu'il etait venu chercher. Ecrite en mot nu, la page degradee dit
`160 blocs.unite.cases`, ce qui est illisible mais pas faux.

La regle s'arrete aux quantites. Dans une phrase, interpoler un nom est libre : son absence
se voit, alors que celle d'un chiffre ne se voit pas. Et forcer `{{ $n }} {{ __() }}`
partout figerait l'ordre nombre-puis-mot, qui n'est pas celui de toutes les langues.

## Le jour ou une deuxieme langue arrive

Un mot nu accole a un nombre suppose que la langue met l'unite apres le chiffre et ne
l'accorde pas. Ce n'est vrai ni partout, ni pour toutes les unites. **La sortie est alors
d'ajouter une cle par forme, pas de revenir aux trous.**

```php
'unite' => [
    'case' => 'case',
    'cases' => 'cases',
],
```

C'est plus verbeux, et c'est le prix a payer pour qu'un chiffre ne disparaisse jamais. Le
traducteur qui trouve la regle absurde et la contourne rendra silencieux un mode de panne
qui ne l'etait pas.

Deux tests tiennent la promesse quand ce jour arrive : chaque langue doit porter les memes
cles que le francais, et les memes trous dans chaque cle. Un traducteur qui oublie un `:n`
ne peut pas livrer.
