<?php

namespace App\Http\Controllers;

use App\Models\Schematic;
use App\Models\SchematicItem;
use App\Support\Thing;
use App\Support\Vitrine;
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

    /** Under this many blocks, it is a tap or a curiosity rather than a build. */
    private const PLANCHER_BLOCS = 20;

    /** And under this share of its own frame, it is a copy accident. */
    private const PLANCHER_DENSITE = 0.05;

    /**
     * How big a code may be before the tile asks for it instead of carrying it.
     *
     * The same threshold the browse grid uses, and for the same measurement: 24 tiles cost
     * 44 kB of markup at a median of 1 kB each. Past it the tile carries its slug and
     * `apercu.js` fetches the code when the tile comes into view.
     */
    private const CODE_PORTABLE = 16384;

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
     * a handful of names, would trade the thing that works for the thing that is nice. The
     * cost of this catch is that a broken database looks like an empty catalogue here, so
     * it is logged rather than swallowed.
     */
    private function island(): string
    {
        try {
            $payload = [
                'total' => Schematic::listed()->count(),
                'schemas' => $this->showcase(),
            ];
        } catch (Throwable $e) {
            Log::warning('Accueil sans vitrine : '.$e->getMessage());
            $payload = ['total' => 0, 'schemas' => []];
        }

        $data = json_encode(
            $payload,
            JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
        );

        return '<script type="application/json" id="vitrine">'.$data.'</script>';
    }

    /**
     * What to put forward: one schematic per product, rather than the top six overall.
     *
     * The ranking used to be `rate_per_block` across the whole catalogue, and what came back
     * was two identical "Safe Reactor" entries, a schematic named "a", and six rows all
     * reading 6300 energy per second. It was not wrong, it answered "what is the very best"
     * on a page asking "what is in here". The catalogue holds 844 schematics that make
     * graphite and not one of them could ever appear.
     *
     * So the products come first, commonest first, and each contributes its best.
     *
     * DISTINCT PRODUCTS DO NOT MAKE DISTINCT SCHEMATICS, which is the correction this method
     * carries. A schematic that makes several things wins for several of them: live, `sand to
     * crucible 3.5` came top for both silicon and pyratite, and `17PhaseMD` for both water and
     * phase fabric, so a grid of six showed four plans and drew two of them twice. The design
     * had promised "no duplicate possible" and the test agreed with it, because the test gave
     * every product a schematic of its own. The page did not.
     *
     * So a schematic already shown is skipped and its product takes the next one down. Six
     * products and six schematics, not six products and whatever that yields.
     *
     * BOTH QUERIES CARRY THE SAME NATURE, and that is the point of taking the constant from
     * `Vitrine` rather than typing `PLAFOND` again here. The list of products is built on
     * ceilings because that is what the site can rank; a second query without the same
     * filter would return rows of the other nature, and there are enough measured rows to
     * fill a page plausibly rather than to leave it visibly empty.
     *
     * Sandbox taps disappear as a side effect rather than by a blacklist: those rows are
     * indexed for neither kind.
     */
    private function showcase(): array
    {
        $out = [];
        $deja = [];

        foreach (Vitrine::itemsOnOffer(self::MIS_EN_AVANT) as $item) {
            $best = Schematic::query()
                ->listed()
                /* Serpulo, because six tiles are a taste rather than a survey and that is
                   where most people play. */
                ->onPlanet('serpulo')
                /* And something a player would actually open.

                   Ranking on rate per block alone put a sandbox tap of one block at the top
                   of every list it appeared in: the fewer blocks, the better the ratio, so
                   the front door of this site showed "6 300 energie/s, 127 x 127, 1 blocs"
                   and "190 800 cryofluide/min". Both are real schematics and neither is a
                   factory.

                   Two floors rather than one, because they refuse different things. The
                   count refuses the single block. The density refuses the copy accident: a
                   frame 127 tiles wide holding one block is not a design, and Mindustry
                   caps a schematic at 128 a side, so this shape really does come in. Five
                   percent is deliberately low - a turret line is legitimately sparse, and
                   this is meant to catch the empty frame, not to have taste. */
                ->where('schematics.blocks', '>=', self::PLANCHER_BLOCS)
                ->whereRaw('schematics.blocks >= schematics.width * schematics.height * ?',
                    [self::PLANCHER_DENSITE])
                ->join('schematic_items', 'schematic_items.schematic_id', '=', 'schematics.id')
                ->where('schematic_items.item', $item)
                ->where('schematic_items.sens', SchematicItem::PRODUIT)
                ->where('schematic_items.kind', Vitrine::NATURE)
                ->where('schematic_items.rate', '>', 0)
                ->whereNotIn('schematics.id', $deja)
                ->select('schematics.*', 'schematic_items.item', 'schematic_items.rate')
                ->orderByDesc('schematic_items.rate_per_block')
                ->orderByDesc('schematics.id')
                ->first();

            if ($best !== null) {
                $deja[] = $best->id;
                $out[] = $this->tile($best);
            }
        }

        return $out;
    }

    /**
     * One tile, with everything it needs to be drawn and read.
     *
     * The plan is drawn in the browser by `apercu.js`, from the schematic's own code, with
     * the game's sprites. Nothing imported has a stored preview, so a picture the server
     * could serve does not exist for fifteen thousand of these; the renderer the analyser
     * already uses is what draws them, and the sprite sheet is downloaded by this page
     * either way.
     */
    private function tile(Schematic $s): array
    {
        $item = (string) $s->item;

        return [
            'slug' => $s->slug,
            'nom' => $s->displayName(),
            'blocs' => $s->blocks,
            'largeur' => $s->width,
            'hauteur' => $s->height,
            /* The game's name rather than the identifier, and the unit the value carries
               rather than a conversion. `rate` does not measure the same thing from one row
               to the next: per minute for an item, per second for power. Multiplying
               everything by sixty once gave water sixty times too fast. */
            'produit' => SchematicItem::nomAffiche($item),
            'debit' => round((float) $s->rate, 1),
            /* Named, every time. A ceiling announced without saying so is a figure that
               lies, and this is the mention the browse tile already carries. */
            'au-mieux' => __('schema.page.au-mieux'),
            'unite' => __(SchematicItem::parSeconde($item)
                ? 'schema.unite.par-seconde'
                : 'schema.unite.par-minute'),
            /* Power is neither an item nor a liquid: it has no sprite, and inventing one
               would be drawing something the game does not draw. The tile says so with a
               null rather than with a broken image. */
            'icone' => $item === SchematicItem::POWER
                ? null
                : '/icone/'.Thing::family($item).'/'.$item.'.png?t=32',
            /* Carried when it is small enough to travel, asked for when it is not. */
            'code' => strlen((string) $s->code) <= self::CODE_PORTABLE ? $s->code : null,
        ];
    }
}
