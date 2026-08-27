<?php

namespace App\Console\Commands;

use App\Models\Schematic;
use App\Services\EngineVersion;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Process;

/**
 * Mesurer ce que le collecteur a ramene, avec le moteur du navigateur.
 *
 *     php artisan forge:analyser              tout ce que le moteur courant n a pas vu
 *     php artisan forge:analyser --lot=200    par paquets plus gros
 *     php artisan forge:analyser --tout       tout reprendre, meme ce qui est a jour
 *
 * Il n'y a qu'une implementation de l'analyse dans ce depot et c'est
 * `site/public/forge/analyse.js`. Executer ce fichier-la sous Node n'en fait pas une
 * deuxieme : c'est le meme fichier, avec le meme catalogue, qui rend les memes chiffres.
 * Le reecrire en PHP en ferait une deuxieme, et une deuxieme chose a avoir tort. Donc
 * l'orchestration et la base restent ici, l'arithmetique reste la-bas, et ce qui passe
 * entre les deux tient sur une ligne de JSON.
 *
 * Cette commande sert deux fois. Elle mesure ce qui vient d'arriver, et elle re-mesure tout
 * le catalogue le jour ou une correction du moteur atterrit : `Schematic::stale()` designe
 * exactement les lignes dont les chiffres ont ete produits par un moteur qui n'existe plus,
 * et sans elles le site continuerait de presenter les chiffres du mois dernier comme des
 * mesures. C'est la seule chose qu'il vend.
 */
class AnalyseSchematics extends Command
{
    protected $signature = 'forge:analyser
        {--lot=50 : Combien de schematiques par appel a Node}
        {--limite=0 : S arreter apres tant de schematiques}
        {--tout : Tout reprendre, et pas seulement ce qui est perime}';

    protected $description = 'Analyser les schematiques que le moteur courant n a pas vues';

    public function handle(): int
    {
        $script = dirname(base_path()).DIRECTORY_SEPARATOR.'tools'.DIRECTORY_SEPARATOR.'ingest.mjs';
        if (! is_file($script)) {
            $this->error("Introuvable : {$script}");

            return self::FAILURE;
        }

        $batch = max(1, (int) $this->option('lot'));
        $limit = (int) $this->option('limite');
        $engine = EngineVersion::current();

        $this->info("Moteur {$engine}");

        $done = $failed = 0;
        $after = 0;

        while (true) {
            $take = $limit > 0 ? min($batch, $limit - $done) : $batch;
            if ($take <= 0) {
                break;
            }

            $rows = $this->pending($after)->limit($take)->get();
            if ($rows->isEmpty()) {
                break;
            }
            $after = (int) $rows->max('id');

            $answers = $this->askNode($script, $rows);
            if ($answers === []) {
                // Node n'a pas repondu du tout. Estampiller ces cinquante lignes comme
                // illisibles serait bruler le catalogue sur une commande absente : le
                // moteur les marquerait vues, et plus rien ne les reprendrait.
                $this->error('Node n\'a rien rendu : rien n\'a ete ecrit, la file est intacte.');

                return self::FAILURE;
            }

            foreach ($rows as $schematic) {
                $answer = $answers[$schematic->id] ?? ['erreur' => 'aucune reponse de Node'];

                if (isset($answer['analyse'])) {
                    $this->apply($schematic, $answer['analyse']);
                    $done++;
                } else {
                    $this->giveUpOn($schematic, (string) $answer['erreur']);
                    $failed++;
                    $done++;
                }
            }

            $this->line("  {$done} analysees".($failed ? ", dont {$failed} illisibles" : ''));
        }

        $this->newLine();
        $this->info("{$done} analysees, {$failed} illisibles");

        return self::SUCCESS;
    }

    /**
     * La file, et deux facons de ne pas tourner en rond dedans.
     *
     * En marche normale le filtre se vide tout seul : une ligne analysee cesse d'etre
     * perimee, donc reprendre la tete de `stale()` a chaque tour avance forcement, et l'
     * ordre voulu - jamais analysee d'abord, puis la plus ancienne - est respecte.
     *
     * `--tout` n'a pas ce luxe : rien ne sort du filtre, donc reprendre la tete rendrait
     * eternellement les cinquante memes lignes. D'ou le curseur sur l'identifiant, qui ne
     * sert qu'a ce cas.
     */
    private function pending(int $after)
    {
        return $this->option('tout')
            ? Schematic::query()->where('id', '>', $after)->orderBy('id')
            : Schematic::stale();
    }

    /**
     * Un aller-retour avec Node : une ligne JSON par schematique, dans les deux sens.
     *
     * Un processus par lot plutot qu'un par schematique. Node met deux dixiemes de seconde
     * a demarrer et a relire le catalogue de blocs, ce qui ne se voit pas une fois et fait
     * cinquante minutes sur quinze mille.
     *
     * @return array<int, array{analyse?: array, erreur?: string}>
     */
    private function askNode(string $script, $rows): array
    {
        $asked = $rows
            ->map(fn (Schematic $one) => json_encode(['id' => $one->id, 'code' => $one->code]))
            ->implode("\n");

        $ran = Process::timeout(600)->input($asked)->run(['node', $script]);

        if (! $ran->successful()) {
            // Node absent, script casse : ca ne concerne pas une schematique en
            // particulier, et reessayer ligne par ligne ne ferait que le repeter.
            $this->error(trim($ran->errorOutput()) ?: 'node a echoue sans rien dire');

            return [];
        }

        $answers = [];
        foreach (preg_split('/\r?\n/', trim($ran->output())) as $line) {
            $said = json_decode($line, true);
            if (is_array($said) && isset($said['id'])) {
                $answers[(int) $said['id']] = $said;
            }
        }

        return $answers;
    }

    private function apply(Schematic $schematic, array $analysis): void
    {
        $schematic->fill(Schematic::fromAnalysis($analysis));
        $schematic->analysis = $analysis;
        // `saved` reconstruit `schematic_items` derriere, donc une schematique re-analysee
        // cesse d'apparaitre sous ce qu'elle ne produit plus.
        $schematic->save();
    }

    /**
     * Estampiller quand meme une schematique que le moteur n'a pas su lire.
     *
     * Sinon elle reste perimee pour toujours, la file ne se vide jamais, et la commande
     * repasse eternellement sur les memes cinquante `.msch` tordus. Elle **a** ete analysee
     * par ce moteur : la reponse est simplement qu'il n'y arrive pas, et c'est une reponse
     * qu'il faut garder. Le jour ou le moteur apprend le bloc de mod qui la bloquait, sa
     * version change et la ligne revient d'elle-meme dans la file.
     */
    private function giveUpOn(Schematic $schematic, string $why): void
    {
        $this->warn("  {$schematic->slug} : {$why}");

        $schematic->forceFill([
            'analysis' => ['erreur' => $why],
            'analysed_at' => now(),
            'engine_version' => EngineVersion::current(),
        ])->save();
    }
}
