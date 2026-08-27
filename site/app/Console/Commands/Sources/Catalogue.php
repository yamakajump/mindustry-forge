<?php

namespace App\Console\Commands\Sources;

/**
 * Un catalogue d'ou l'on ingere, et ce que le collecteur a besoin d'en savoir.
 *
 * Les deux sources ne se ressemblent pas. L'une expose une API versionnee, pagine par
 * decalage et sert le `.msch` en octets a une troisieme adresse ; l'autre est un site a
 * l'abandon dont le listing porte deja le base64 et dont le detail vit sous une extension
 * `.json` collee derriere l'identifiant. Une troisieme arrivera avec ses propres manieres.
 *
 * Ce qui ne change pas, c'est la marche : parcourir le listing, sauter ce qu'on tient
 * deja, aller chercher le reste. C'est ce que cette classe fixe, et c'est tout ce qu'elle
 * fixe. Chaque source garde ses bizarreries chez elle.
 */
abstract class Catalogue
{
    public function __construct(protected PoliteClient $http) {}

    /** Le nom sous lequel l'origine est stockee, cote `Schematic::SOURCES`. */
    abstract public function source(): string;

    /** Combien la source annonce en tenir, quand elle sait le dire. */
    abstract public function announced(): ?int;

    /**
     * Les entrees du listing, page par page.
     *
     * Un generateur plutot qu'un tableau : douze mille entrees tiennent en memoire, mais
     * la collecte doit pouvoir ecrire les premieres lignes avant d'avoir lu la derniere
     * page. Une collecte coupee au milieu a alors deja garde ce qu'elle avait pris.
     *
     * @return iterable<int, array<int, array<string, mixed>>>
     */
    abstract public function pages(): iterable;

    /** L'identifiant d'une entree chez elle, qui est ce qui rend l'ingestion idempotente. */
    abstract public function idOf(array $listed): string;

    /**
     * Tout ce qu'il faut pour ecrire la ligne, ou null si la source ne la rend plus.
     *
     * Retourne `name`, `description`, `code` (le `.msch` en base64), `author` et `meta`,
     * cette derniere etant la reponse de la source gardee entiere. Recrawler douze mille
     * pages coute des heures, donc le moment ou un champ ne coute rien a garder est celui
     * ou il arrive, bien avant que quiconque sache lesquels serviront.
     *
     * @return array{name: string, description: ?string, code: string, author: ?string, meta: array}|null
     */
    abstract public function fetch(array $listed): ?array;

    /**
     * A whole page at once, which is the only way to make this fast.
     *
     * One entry costs one or two round trips, and a round trip costs two hundred
     * milliseconds that no pause makes shorter. Asking one at a time means eighty minutes
     * of waiting for twelve thousand entries, even flat out. Asking together means two
     * hundred milliseconds for twenty-four.
     *
     * The default loops, so a source written later works without knowing any of this. The
     * two that exist replace it.
     *
     * @param  array<string, array>  $listed  The entries to take, by id.
     * @return array<string, ?array>
     */
    public function fetchMany(array $listed): array
    {
        $rows = [];
        foreach ($listed as $id => $one) {
            $rows[$id] = $this->fetch($one);
        }

        return $rows;
    }

    /** Une chaine vide n'est pas une description, c'est l'absence de description. */
    protected function orNothing(mixed $text): ?string
    {
        $text = is_string($text) ? trim($text) : '';

        return $text === '' ? null : $text;
    }
}
