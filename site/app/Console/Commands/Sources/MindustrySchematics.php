<?php

namespace App\Console\Commands\Sources;

use App\Models\Schematic;

/**
 * mindustryschematics.com, le petit des deux, et le plus facile.
 *
 * Deux mille neuf cent quarante-neuf entrees sur un site a l'abandon, sans conditions
 * d'utilisation : sa page `/info` contient trois liens et rien d'autre.
 *
 * Le plan de la place de marche annonce des `.msch` bruts a `/schematics/{id}.msch`. Il y
 * a mieux, releve en lisant ce que la page appelle vraiment : le listing lui-meme sert
 * deja le base64 dans son champ `text`, donc la schematique ne coute aucun appel a elle
 * seule.
 *
 *     /schematics.json?page=N        pages de vingt : _id, name, text (le base64)
 *     /schematics/{id}.json          description, tags, cout, leurs chiffres, creator_id
 *     /user/{id}.json                le pseudo
 *
 * Piege a ne pas reproduire : la page du site appelle ce detail avec `?increment=true`,
 * qui incremente leur compteur de telechargements. Le collecteur ne le passe pas. Gonfler
 * les statistiques de quelqu'un pour lire une page est une facon de mentir, meme petite,
 * et le mensonge resterait dans leur base a nous.
 */
class MindustrySchematics extends Catalogue
{
    private const BASE = 'https://mindustryschematics.com';

    /** Ce que la source annonce tenir, releve a la premiere page et garde. */
    private ?int $documents = null;

    private array $names = [];

    public function source(): string
    {
        return Schematic::MINDUSTRY_SCHEMATICS;
    }

    public function announced(): ?int
    {
        if ($this->documents === null) {
            $first = $this->http->json(self::BASE.'/schematics.json?page=1');
            $this->documents = is_array($first) ? (int) ($first['documents'] ?? 0) : null;
        }

        return $this->documents;
    }

    /**
     * Les cent quarante-huit pages, en s'arretant sur le nombre qu'elle annonce.
     *
     * Pas sur une page vide, comme l'autre source : celle-ci **borne** le numero de page.
     * Demander la page deux cents renvoie la page cent quarante-huit, avec un HTTP 200 et
     * vingt entrees parfaitement valables. Un collecteur qui attendrait le vide tournerait
     * en rond sur la derniere page jusqu'a la fin des temps, sans jamais rien ecrire de
     * nouveau, et sans qu'aucune erreur ne le signale.
     */
    public function pages(): iterable
    {
        $last = null;

        for ($page = 1; $last === null || $page <= $last; $page++) {
            $answer = $this->http->json(self::BASE."/schematics.json?page={$page}");
            if (! is_array($answer)) {
                return;
            }

            $last ??= (int) ($answer['pages'] ?? 0);
            $this->documents ??= (int) ($answer['documents'] ?? 0);

            $listed = (array) ($answer['schematics'] ?? []);
            if ($listed === []) {
                return;
            }

            yield $listed;
        }
    }

    public function idOf(array $listed): string
    {
        return (string) ($listed['_id'] ?? '');
    }

    public function fetch(array $listed): ?array
    {
        $id = $this->idOf($listed);
        $detail = $this->http->json(self::BASE."/schematics/{$id}.json");
        $detail = is_array($detail) ? $detail : [];

        // Le listing porte deja la schematique, donc une entree dont le detail a disparu
        // reste ingerable. C'est ce qui compte : le `.msch` est la chose, le reste est ce
        // qu'on en dit.
        $code = (string) ($detail['text'] ?? $listed['text'] ?? '');
        if ($code === '') {
            return null;
        }

        return [
            'name' => (string) ($detail['name'] ?? $listed['name'] ?? ''),
            'description' => $this->orNothing($detail['description'] ?? null),
            'code' => $code,
            'author' => $this->nameOf($detail['creator_id'] ?? null),
            // Sans `text` : il est deja dans `code`, entier, et deux mille neuf cent
            // quarante-neuf base64 gardes deux fois sont de la place perdue en double.
            // Tout le reste de leur reponse passe tel quel.
            'meta' => array_diff_key($detail, ['text' => null]),
        ];
    }

    /**
     * A page in two waves: the details together, then the authors they name.
     *
     * Cheaper than the other source, because the listing already carries the `.msch`:
     * there is never a third wave to go and fetch the schematic itself.
     */
    public function fetchMany(array $listed): array
    {
        $details = [];
        foreach ($this->http->all(array_map(
            fn ($id) => self::BASE."/schematics/{$id}.json",
            array_combine(array_keys($listed), array_keys($listed))
        )) as $id => $answer) {
            $found = $answer?->json();
            $details[$id] = is_array($found) ? $found : [];
        }

        $missing = [];
        foreach ($details as $detail) {
            $who = $detail['creator_id'] ?? null;
            if (is_string($who) && $who !== '' && ! array_key_exists($who, $this->names)) {
                $missing[$who] = self::BASE."/user/{$who}.json";
            }
        }
        foreach ($this->http->all($missing) as $who => $answer) {
            $user = $answer?->json();
            $this->names[$who] = is_array($user) ? $this->orNothing($user['username'] ?? null) : null;
        }

        $rows = [];
        foreach ($listed as $id => $one) {
            $detail = $details[$id] ?? [];
            // The listing already carries the schematic, so an entry whose detail is gone
            // is still worth taking: the `.msch` is the thing, the rest is what is said
            // about it.
            $code = (string) ($detail['text'] ?? $one['text'] ?? '');
            $rows[$id] = $code === '' ? null : [
                'name' => (string) ($detail['name'] ?? $one['name'] ?? ''),
                'description' => $this->orNothing($detail['description'] ?? null),
                'code' => $code,
                'author' => $this->names[$detail['creator_id'] ?? ''] ?? null,
                'meta' => array_diff_key($detail, ['text' => null]),
            ];
        }

        return $rows;
    }

    private function nameOf(?string $who): ?string
    {
        if ($who === null || $who === '') {
            return null;
        }
        if (array_key_exists($who, $this->names)) {
            return $this->names[$who];
        }

        $user = $this->http->json(self::BASE."/user/{$who}.json");

        return $this->names[$who] = is_array($user)
            ? $this->orNothing($user['username'] ?? null)
            : null;
    }
}
