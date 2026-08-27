<?php

namespace App\Http\Controllers;

use App\Models\Schematic;
use App\Services\Cards\SchematicCard;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;

/**
 * La vignette d'une schematique, composee a la demande et gardee sur disque.
 *
 * A la demande plutot qu'a l'enregistrement, pour trois raisons. Les schematiques deja en
 * base en profitent sans qu'on ait a rejouer quoi que ce soit. Changer la mise en page de
 * la carte ne demande pas de migration, seulement de vider un dossier. Et surtout, ces
 * cartes ne sont demandees que par les services qui deplient un lien : en fabriquer une
 * pour chaque schematique importee serait des milliers d'images que personne ne regarde.
 */
class SocialCardController extends Controller
{
    /** Ou vivent les cartes deja composees, sous le disque public deja monte. */
    private const CACHE = 'cartes';

    public function show(Schematic $schematic): Response
    {
        /* Un deplieur de lien n'est jamais authentifie : il arrive avec le lien et rien
           d'autre. `visibleTo(null)` laisse donc passer le public et le non-liste, qui est
           exactement ce qu'un lien partage doit montrer, et refuse le prive. */
        abort_unless($schematic->visibleTo(null), 404);

        $disk = Storage::disk('public');
        $path = self::CACHE."/{$schematic->slug}.jpg";

        if (! $this->fresh($schematic, $path)) {
            $disk->put($path, $this->compose($schematic));
        }

        return response($disk->get($path), 200, [
            'Content-Type' => 'image/jpeg',
            /* Une semaine, et pas plus : l'adresse ne porte pas d'empreinte, donc une
               schematique renommee garderait sinon son ancienne vignette dans les caches
               de Discord bien apres qu'on ait cesse de comprendre pourquoi. */
            'Cache-Control' => 'public, max-age=604800',
        ]);
    }

    /**
     * Si la carte gardee est encore d'accord avec la schematique.
     *
     * Comparee a `updated_at` plutot qu'a une simple existence : un nom corrige ou une
     * analyse refaite doit se voir dans la vignette, et une carte qui ne se regenere jamais
     * est une carte qui finit par annoncer un debit que la page ne dit plus.
     */
    private function fresh(Schematic $schematic, string $path): bool
    {
        $disk = Storage::disk('public');

        return $disk->exists($path)
            && $disk->lastModified($path) >= ($schematic->updated_at?->timestamp ?? 0);
    }

    private function compose(Schematic $schematic): string
    {
        $disk = Storage::disk('public');
        $preview = "apercus/{$schematic->slug}.png";

        $card = new SchematicCard(
            resource_path('fonts/forge.ttf'),
            resource_path('brand/mark-96.png'),
        );

        return $card->render(
            $schematic,
            $disk->exists($preview) ? $disk->path($preview) : null,
        );
    }
}
