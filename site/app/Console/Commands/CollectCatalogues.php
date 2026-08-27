<?php

namespace App\Console\Commands;

use App\Console\Commands\Sources\Catalogue;
use App\Console\Commands\Sources\MindustrySchematics;
use App\Console\Commands\Sources\MindustryTool;
use App\Console\Commands\Sources\PoliteClient;
use App\Models\Schematic;
use Illuminate\Console\Command;
use Illuminate\Database\QueryException;
use Throwable;

/**
 * Ramener les deux catalogues existants, sans rien casser chez eux.
 *
 *     php artisan forge:collecter                     les deux, une seconde entre chaque appel
 *     php artisan forge:collecter mindustry-tool      une seule
 *     php artisan forge:collecter --limite=20         un essai
 *
 * Collecter et publier sont deux gestes distincts. Tout arrive en `private`, sans
 * proprietaire, et le catalogue reste mesurable, requetable et invisible jusqu'au jour ou
 * quelqu'un decide le contraire. La publication sera un UPDATE en masse ; elle attend
 * qu'un message soit parti au mainteneur d'en face, ce qui coute cinq minutes avant et ne
 * vaut plus rien apres.
 *
 * **La reprise n'a pas d'etat.** Pas de curseur, pas de fichier de position, pas de table
 * d'avancement : avant de payer les deux appels que coute une entree, on demande a la base
 * si elle la tient deja. Couper au dixieme mille et relancer re-parcourt les listings, ce
 * qui prend deux minutes, et ne redemande que ce qui manque. Un curseur, lui, est faux des
 * qu'une entree est deposee chez eux pendant la collecte, et il est faux en silence.
 *
 * Rien n'est analyse ici. Une ligne collectee sort avec `engine_version` a null, donc elle
 * est perimee par construction et `forge:analyser` la prendra. Les deux passes echouent
 * differemment - l'une sur le reseau de quelqu'un d'autre, l'autre sur un `.msch` tordu -
 * et une seule commande qui ferait les deux obligerait a tout recommencer pour la mauvaise
 * moitie.
 */
class CollectCatalogues extends Command
{
    protected $signature = 'forge:collecter
        {source? : mindustry-tool, mindustryschematics, ou rien pour les deux}
        {--pause=1000 : Millisecondes entre deux appels, la politesse qui fait aboutir}
        {--essais=4 : Combien de fois insister avant d abandonner un appel}
        {--limite=0 : S arreter apres tant de nouvelles entrees, pour essayer}';

    protected $description = 'Ingerer les catalogues existants, en prive, sans les analyser';

    /**
     * Combien d'echecs de suite avant de considerer que ce n'est plus la faute des donnees.
     *
     * Une schematique retiree, un detail casse, un `.msch` vide : ca arrive et ca se saute.
     * Vingt d'affilee ne sont pas vingt accidents, c'est le serveur qui a change d'avis sur
     * nous, et continuer a taper serait exactement la mauvaise reponse.
     */
    private const GIVE_UP_AFTER = 20;

    public function handle(): int
    {
        $client = new PoliteClient(
            pauseMs: (int) $this->option('pause'),
            tries: (int) $this->option('essais'),
            tell: fn (string $said) => $this->warn("  {$said}"),
        );

        $wanted = $this->argument('source');
        $catalogues = array_filter(
            [new MindustryTool($client), new MindustrySchematics($client)],
            fn (Catalogue $one) => $wanted === null || $one->source() === $wanted,
        );

        if ($catalogues === []) {
            $this->error("Source inconnue : {$wanted}");
            $this->line('Attendu : '.Schematic::MINDUSTRY_TOOL.', '.Schematic::MINDUSTRY_SCHEMATICS);

            return self::INVALID;
        }

        foreach ($catalogues as $catalogue) {
            try {
                $this->walk($catalogue);
            } catch (Throwable $stopped) {
                $this->error("{$catalogue->source()} : {$stopped->getMessage()}");
                $this->line('Rien n\'est perdu : relancer la commande reprend ou elle en etait.');

                return self::FAILURE;
            }
        }

        return self::SUCCESS;
    }

    private function walk(Catalogue $catalogue): void
    {
        $source = $catalogue->source();
        $announced = $catalogue->announced();

        $this->newLine();
        $this->info($source.($announced ? " : {$announced} annoncees" : ''));

        $taken = $held = $gone = $failed = 0;
        $inARow = 0;
        $limit = (int) $this->option('limite');

        foreach ($catalogue->pages() as $listedPage) {
            // Une requete pour toute la page plutot qu'une par entree. C'est ce qui rend la
            // reprise gratuite : sur un deuxieme passage, cent entrees deja connues coutent
            // un `select` et zero appel reseau.
            $known = Schematic::where('source', $source)
                ->whereIn('source_id', array_map($catalogue->idOf(...), $listedPage))
                ->pluck('source_id')
                ->flip();

            foreach ($listedPage as $listed) {
                $id = $catalogue->idOf($listed);
                if ($id === '' || $known->has($id)) {
                    $held++;

                    continue;
                }

                try {
                    $row = $catalogue->fetch($listed);
                } catch (Throwable $broke) {
                    $failed++;
                    $this->warn("  {$id} : {$broke->getMessage()}");
                    if (++$inARow >= self::GIVE_UP_AFTER) {
                        throw $broke;
                    }

                    continue;
                }

                $inARow = 0;

                if ($row === null) {
                    $gone++;

                    continue;
                }

                $taken += $this->keep($source, $id, $row) ? 1 : 0;

                if ($taken % 50 === 0 && $taken > 0) {
                    $this->line("  {$taken} prises, {$held} deja tenues");
                }

                if ($limit > 0 && $taken >= $limit) {
                    $this->line("  limite de {$limit} atteinte");
                    break 2;
                }
            }
        }

        $this->table(
            ['prises', 'deja tenues', 'disparues', 'echecs'],
            [[$taken, $held, $gone, $failed]],
        );
    }

    /**
     * Ecrire la ligne, et laisser la base refuser un doublon plutot que de le prevoir.
     *
     * La verification de page ne couvre pas tout : deux entrees du meme identifiant dans
     * une meme page, ou une deuxieme collecte lancee en parallele, passent a travers. La
     * contrainte d'unicite sur (source, source_id) est la vraie garantie, et elle est du
     * cote qui ne peut pas se tromper. On la laisse parler.
     */
    private function keep(string $source, string $id, array $row): bool
    {
        try {
            Schematic::create([
                'user_id' => null,
                'slug' => Schematic::freshSlug(),
                'source' => $source,
                'source_id' => $id,
                'name' => mb_substr(trim($row['name']) ?: 'sans nom', 0, 120),
                'description' => $row['description'],
                // Meme nettoyage que la route d'envoi : le jeu colle du base64 sur une
                // ligne, et un retour chariot glisse par un serveur en fait deux chaines
                // differentes pour la meme schematique.
                'code' => preg_replace('/\s+/', '', $row['code']),
                'visibility' => Schematic::PRIVATE,
                'author' => $row['author'] === null ? null : mb_substr($row['author'], 0, 80),
                'fetched_at' => now(),
                'source_meta' => $row['meta'],
            ]);

            return true;
        } catch (QueryException $refused) {
            // Seulement le doublon. Une colonne trop courte, une base pleine ou une
            // connexion coupee levent la meme exception, et les avaler ferait une collecte
            // qui annonce quinze mille lignes en en ayant ecrit trois mille.
            if ($refused->getCode() !== '23000') {
                throw $refused;
            }

            return false;
        }
    }
}
