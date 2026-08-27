<?php

namespace App\Console\Commands\Sources;

use App\Models\Schematic;

/**
 * mindustry-tool.com, le gros des deux.
 *
 * Douze mille cinq cents schematiques derriere une API v4 sans quota ni authentification.
 * Trois adresses par entree, relevees sur pieces le 27 aout 2026 :
 *
 *     /schematics?page=N&size=S   le listing : id, nom, likes, telechargements
 *     /schematics/{id}            le detail : description, dimensions, auteur, leurs chiffres
 *     /schematics/{id}/data       le `.msch` en octets, `application/octet-stream`
 *
 * Le detail vaut ses deux cent millisecondes : il porte `meta.powerConsumption` et
 * `meta.powerProduction`, c'est-a-dire leur reponse a une question que ce depot pose
 * autrement. Douze mille comparaisons gratuites contre notre moteur, gardees dans
 * `source_meta` : partout ou les deux divergent, l'un des deux a tort, et ce depot tient
 * un banc capable de dire lequel.
 *
 * A une reserve, verifiee sur les quarante premieres entrees avant qu'elle ne coute une
 * demi-journee a quelqu'un : **leurs chiffres sont par tick, les notres par seconde**.
 * Leur reacteur au thorium annonce 15 la ou nous en disons 900, et 900 = 15 x 60. Les deux
 * catalogues font pareil. Une comparaison qui oublie le facteur soixante croit avoir
 * trouve douze mille desaccords ; il n'y en a aucun.
 *
 * La pagination est un decalage sur une liste rangee du plus recent au plus ancien, donc
 * une entree deposee pendant la collecte decale la fenetre. Ca ne se repare pas : ca se
 * relance. La contrainte d'unicite absorbe les doublons, et ce qui a glisse entre deux
 * pages sera pris au prochain passage.
 */
class MindustryTool extends Catalogue
{
    private const BASE = 'https://api.mindustry-tool.com/api/v4';

    /** Combien d'entrees par page de listing. Cent passe, et divise le trafic par cinq. */
    private const SIZE = 100;

    /**
     * De quoi arreter une boucle que la source ne fermerait pas.
     *
     * `pages()` s'arrete normalement sur une page vide. Une API qui repondrait la meme
     * page indefiniment tournerait sans fin, et une collecte sans fin sur le serveur de
     * quelqu'un d'autre est exactement ce qu'on s'est promis d'eviter.
     */
    private const MAX_PAGES = 1000;

    /** Les noms d'auteurs deja resolus, pour ne pas redemander mille fois le meme. */
    private array $names = [];

    public function source(): string
    {
        return Schematic::MINDUSTRY_TOOL;
    }

    public function announced(): ?int
    {
        $count = $this->http->json(self::BASE.'/schematics/count');

        return is_numeric($count) ? (int) $count : null;
    }

    public function pages(): iterable
    {
        for ($page = 0; $page < self::MAX_PAGES; $page++) {
            $listed = (array) $this->http->json(
                self::BASE."/schematics?page={$page}&size=".self::SIZE);

            if ($listed === []) {
                return;
            }

            yield $listed;
        }
    }

    public function idOf(array $listed): string
    {
        return (string) ($listed['id'] ?? '');
    }

    public function fetch(array $listed): ?array
    {
        $id = $this->idOf($listed);

        $detail = $this->http->json(self::BASE."/schematics/{$id}");
        if (! is_array($detail) || $detail === []) {
            return null;
        }

        // Le seul appel qui rapporte la schematique elle-meme. Sans lui il n'y a rien a
        // garder : le detail ne porte que ce qu'on dit d'elle.
        $code = $this->http->base64(self::BASE."/schematics/{$id}/data");
        if ($code === null || $code === '') {
            return null;
        }

        return [
            'name' => (string) ($detail['name'] ?? $listed['name'] ?? ''),
            'description' => $this->orNothing($detail['description'] ?? null),
            'code' => $code,
            'author' => $this->nameOf($detail['createdBy'] ?? null),
            'meta' => $detail,
        ];
    }

    /**
     * Le pseudo derriere l'identifiant que le detail donne.
     *
     * Le detail ne nomme pas l'auteur, il le numerote. Un credit qu'on ne peut pas lire
     * n'est pas un credit, donc on paie l'appel, une fois par personne : sur douze mille
     * schematiques il y a quelques centaines d'auteurs, et redemander a chaque ligne
     * ferait le tiers du trafic de la collecte pour rien.
     */
    private function nameOf(?string $who): ?string
    {
        if ($who === null || $who === '') {
            return null;
        }
        if (array_key_exists($who, $this->names)) {
            return $this->names[$who];
        }

        $user = $this->http->json(self::BASE."/users/{$who}");

        return $this->names[$who] = is_array($user)
            ? $this->orNothing($user['name'] ?? null)
            : null;
    }
}
