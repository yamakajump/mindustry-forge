<?php

namespace App\Http\Controllers;

use App\Models\Schematic;
use App\Models\SchematicItem;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The home page, which is a file with a hole in it.
 *
 * The analyser stays `public/index.html`, served as it lies. Turning it into a Blade view
 * would have been free to parse -- it holds no `{{` and no directive on 1300 lines -- and
 * expensive everywhere else: three test suites read it at that path, the README documents
 * serving it off a static file server, and the key-coverage scan walks `public/`. That last
 * one is the reason. A file moved to `resources/views/` would fail no test at all; it would
 * simply leave the scanned tree, and the most string-heavy page on the site would stop
 * being checked without anything lighting up.
 *
 * So the data is injected instead, into a comment the page already carries. No marker, no
 * showcase, and a page that still works: it fails soft, which a conversion does not.
 */
class HomeController extends Controller
{
    /** How many to put forward. Enough to look like a catalogue, few enough to stay a taste. */
    private const MIS_EN_AVANT = 6;

    private const MARQUEUR = '<!--VITRINE-->';

    public function show()
    {
        $page = File::get(public_path('index.html'));

        return response(str_replace(self::MARQUEUR, $this->island(), $page))
            ->header('Content-Type', 'text/html; charset=utf-8');
    }

    /**
     * The data, as a script tag the page reads rather than executes.
     *
     * `JSON_HEX_TAG` is not decoration. These names come from collected catalogues, so they
     * are strings nobody here wrote, and one of them containing `</script>` would close the
     * tag and turn the rest of the page into markup.
     *
     * A database that will not answer costs the showcase and nothing else. The analyser is
     * the product and it computes in the browser; letting it go down with the database, for
     * a list of six names, would trade the thing that works for the thing that is nice. The
     * cost of this catch is that a broken database looks like an empty catalogue here, so
     * it is logged rather than swallowed.
     */
    private function island(): string
    {
        try {
            $payload = [
                'total' => Schematic::listed()->count(),
                'schematiques' => $this->showcase(),
            ];
        } catch (Throwable $e) {
            Log::warning('Accueil sans vitrine : '.$e->getMessage());
            $payload = ['total' => 0, 'schematiques' => []];
        }

        $data = json_encode(
            $payload,
            JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
        );

        return '<script type="application/json" id="vitrine">'.$data.'</script>';
    }

    /**
     * What to put forward, chosen on what the site alone can say.
     *
     * Not the most viewed: the column tops out at 7 across the whole catalogue, so it ranks
     * nothing. Not the newest either, which is the order they happened to be collected in.
     *
     * A schematic with a *measured* output, on the same criterion the browse page ranks by.
     * The sandbox entries drop out as a side effect rather than by a rule somebody has to
     * maintain: a schematic named `Fps Droper` produces nothing, so it cannot come up.
     */
    private function showcase(): array
    {
        return Schematic::query()
            ->listed()
            ->join('schematic_items', 'schematic_items.schematic_id', '=', 'schematics.id')
            ->where('schematic_items.sens', SchematicItem::PRODUIT)
            ->where('schematic_items.kind', SchematicItem::MESURE)
            ->where('schematic_items.rate', '>', 0)
            ->select('schematics.*', 'schematic_items.item', 'schematic_items.rate')
            ->orderByDesc('schematic_items.rate_per_block')
            ->orderByDesc('schematics.id')
            ->limit(self::MIS_EN_AVANT)
            ->get()
            ->map(fn (Schematic $s) => [
                'slug' => $s->slug,
                'nom' => $s->name,
                'blocs' => $s->blocks,
                'largeur' => $s->width,
                'hauteur' => $s->height,
                /* Le nom du jeu plutot que l'identifiant, et l'unite que la valeur porte
                   plutot qu'une conversion. `rate` ne mesure pas la meme chose selon la
                   ligne : par minute pour un objet, par seconde pour l'energie. Multiplier
                   tout par soixante donnait une eau soixante fois trop rapide et une
                   energie qui contredisait le reste du site. */
                'produit' => SchematicItem::nomAffiche($s->item),
                'debit' => round((float) $s->rate, 1),
                'unite' => __(SchematicItem::parSeconde($s->item)
                    ? 'schema.unite.par-seconde'
                    : 'schema.unite.par-minute'),
            ])
            ->all();
    }
}
