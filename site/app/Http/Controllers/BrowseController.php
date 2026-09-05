<?php

namespace App\Http\Controllers;

use App\Models\Schematic;
use App\Models\SchematicItem;
use App\Services\BlockCatalogue;
use App\Support\Remarks;
use App\Support\Thing;
use App\Support\Vitrine;
use Illuminate\Http\Request;
use Illuminate\View\View;

/**
 * Finding a schematic by what it does, which is the thing no other Mindustry site can do.
 *
 * Every one of them searches names and hand-typed tags, because that is all they hold. A
 * player looking for "a hundred graphite a minute under thirty blocks" has to read
 * pictures until one looks right. Here what a schematic produces is indexed row by row, so
 * that sentence is a query.
 *
 * The ordering carries as much weight as the filter, and it has to mean something. It used
 * to rank on net power, which scored every real factory below zero: a silicon smelter
 * consumes electricity, so it sorted beneath an empty schematic, and the default view of a
 * site whose promise is "search by what it makes" showed power plants and nothing else.
 *
 * Electricity is not a debt a schematic carries. A player pasting a factory into their
 * base already has power, or can run a wire; it is a prerequisite to state, not something
 * to be marked down for. So consumption is said plainly on the schematic's page and used
 * nowhere in any ranking, while production is simply one more thing a schematic makes,
 * searchable like graphite.
 *
 * What follows from that is that "les mieux faits" needs an item before it means
 * anything. Ranking forty graphite a minute against twenty-five silicon a minute would be
 * declaring that one graphite is worth one silicon, which is false and would be invisible.
 * So without a chosen item the listing sorts by date and says so, and offers the choice.
 */
class BrowseController extends Controller
{
    /** How a listing can be ordered, and what each means. */
    private const ORDERS = [
        'best' => 'Les mieux faits (par bloc posé)',
        'dense' => 'Les plus denses (par tuile de sol)',
        'output' => 'Ceux qui produisent le plus',
        /*
         * A sort of its own, and never merged into the two above.
         *
         * A ceiling and a declared throughput answer different questions: one is what the
         * machines could do fed flat out, the other is what a player says the plan does as
         * branched. Ranked in one column, a ceiling of 120 beats a declared 90 that may
         * well be the larger real number, and a vote would be able to move a schematic
         * inside a ranking that claims to be computed. Two lists, each comparing like
         * with like.
         */
        'declare' => 'Ceux qui produisent le plus (débit déclaré)',
        'small' => 'Les plus compacts',
        'new' => 'Les plus récents',
        'seen' => 'Les plus vus',
        // A single quantity, comparable between any two schematics whatsoever: a like is
        // a like. That is why this sort does not need a chosen item where the three that
        // compare production do.
        'aimes' => 'Les plus aimés',
        // Only makes sense under the favorites filter, and is only offered there:
        // elsewhere it would sort on a date the list does not carry. Asymmetry accepted.
        'garde' => "Dans l'ordre où tu les as gardés",
    ];

    /** The four that compare schematics on their output, so the four that need an item. */
    private const NEEDS_AN_ITEM = ['best', 'dense', 'output', 'declare'];

    /**
     * How many fit on one page, and the size of the crowd a leaderboard needs.
     *
     * One constant rather than two, because the second is the first: a ranking that cannot
     * fill its own first screen is not a ranking. Written as a derivation rather than as a
     * second literal, so that raising the page size cannot leave a comment behind saying
     * twenty-four for a reason that stopped being true.
     */
    private const PER_PAGE = 24;

    /** The two worlds, which do not share a build menu. */
    private const PLANETS = ['serpulo', 'erekir'];

    /** The widest a schematic can be, matching the column the analysis writes into. */
    private const MAX_SIDE = 4096;

    /** What an item name is allowed to look like, so a filter cannot be a paragraph. */
    private const ITEM = '/^[a-z][a-z-]{0,39}$/';

    public function index(Request $request): View
    {
        $makes = trim((string) $request->query('produit', ''));
        if ($makes !== '' && ! preg_match(self::ITEM, $makes)) {
            $makes = '';
        }

        $order = array_key_exists($request->query('tri'), self::ORDERS)
            ? $request->query('tri') : 'best';

        // Nothing to rank output against, so do not pretend to. Falling back to date is
        // the honest answer, and the page says which of the two it is doing.
        if ($makes === '' && in_array($order, self::NEEDS_AN_ITEM, true)) {
            $order = 'new';
        }

        /* Creative builds are set aside by default, and the page says so with a link that
           brings them back. Corentin asked for "a part", not "dehors": a catalogue that
           announces fifteen thousand schematics and quietly serves fourteen would be lying
           about its own size, which is the fault this repository spent a day closing.

           A schematic built for a sandbox server, or built to make one lag, is not a worse
           design - it is an answer to another question, and it sat at the top of the energy
           ranking ahead of every real factory. */
        $creative = $request->query('creatif') === 'oui';

        /* Which block it has to contain. The question a player actually asks - "show me
           what people build with a thorium reactor" - and the one the site could not answer
           at all until `schematic_blocks` stopped being empty.

           Matched against the catalogue rather than taken on trust: a name that is not a
           block returns nothing, and the page says so, where a free-text `LIKE` would have
           returned a plausible-looking wrong list for a typo. */
        $holds = (string) $request->query('bloc', '');
        if ($holds !== '' && ! BlockCatalogue::has($holds)) {
            $holds = '';
        }

        /* A family of blocks rather than one of them. "Show me schematics with a turret in
           them" is a question the catalogue could not be asked, and the block field could
           not answer it: it takes one identifier, and a player looking for a turret does
           not have one in mind. The categories are the game's own, the same ten the block
           wiki files by and the editor's palette shows as tabs.

           Dropped rather than refused when it names nothing, like every other filter here:
           a shared link that has aged badly shows the catalogue, not an error page. */
        $type = (string) $request->query('type', '');
        if ($type !== '' && ! array_key_exists($type, BlockCatalogue::CATEGORY_KEYS)) {
            $type = '';
        }

        /* The constraints, which are the half of this page no other Mindustry site has.
           "A hundred graphite a minute under thirty blocks" is the sentence this repository
           opens with, and until now not one of its three clauses could be typed.

           Every one is bounded rather than trusted: these arrive in a URL a stranger writes,
           and a width of nine million would be a full scan answering nothing. What does not
           parse is dropped rather than corrected, and the page then behaves as if it had not
           been asked, which is the only honest thing to do with a filter nobody can read. */
        $fitsWide = $this->positive($request->query('large'), self::MAX_SIDE);
        $fitsTall = $this->positive($request->query('haut'), self::MAX_SIDE);
        $atLeast = $this->positive($request->query('min'), 1_000_000_000);
        $atMostBlocks = $this->positive($request->query('blocs'), 65535);

        // Self sufficient in electricity. Both sides of this comparison come from
        // `analysis['potential']`, so it is a ceiling against a ceiling: what the layout
        // would make flat out against what it would then draw. Comparing a ceiling to a
        // measurement is the fault this repository keeps paying for, and it is not made here.
        $selfPowered = $request->query('autonome') === 'oui';

        // Only what the bench re-measured on a real server. A hundred and seventeen rows
        // carry a measurement against six thousand seven hundred carrying a ceiling, so this
        // filter empties most of the catalogue. That is the point of it, and the page says so.
        $measured = $request->query('verifie') === 'oui';

        $planet = in_array($request->query('planete'), self::PLANETS, true)
            ? $request->query('planete') : '';

        /* What is mine: my favorites, what I liked, what I published.

           Offered only to signed-in visitors, because a filter that always renders empty
           is worse than no filter at all. The check is here and not only in the view: an
           address can be typed by hand, and `favoris=oui` without a session must not
           filter on a null id. */
        /* What has to be brought to it: "I have coal, what can I run".

           Checked against what the catalogue actually asks for rather than taken at face
           value, like the block filter: a name nothing asks for would render an empty
           page without anything saying the fault is in the name. */
        $eats = (string) $request->query('consomme', '');
        $eatsOnOffer = Vitrine::eatsOnOffer();
        if ($eats !== '' && ! in_array($eats, $eatsOnOffer, true)) {
            $eats = '';
        }

        /* Comparing two plans, in two clicks and without a line of JavaScript.

           `/comparer` has existed for a long time and the showcase never fed it: a player
           who wanted to set two results against each other had to open two tabs and copy
           two addresses by hand. Checkboxes would have needed a script, and without one
           they would have done nothing at all, which is worse than having none.

           So it is a parameter. The first click keeps one schematic in the address, the
           second leaves for the comparison. Every step has its own address, so it can be
           shared, bookmarked and returned to with the back button. */
        $against = (string) $request->query('comparer', '');
        $held = $against === '' ? null
            : Schematic::query()->listed()->where('slug', $against)->first();
        if ($held === null) {
            $against = '';
        }

        $me = $request->user();
        $favorites = $me !== null && $request->query('favoris') === 'oui';
        $liked = $me !== null && $request->query('aimes') === 'oui';
        $mine = $me !== null && $request->query('miens') === 'oui';

        /* A personal list is not the catalogue, and so does not follow its rule.

           `ordinary()` sets aside what does not place in a normal game, which is fair for
           "what exists and what works". My favorites list answers "what did I keep", and
           that answer is not up for debate: I kept it, I see it again. Holds for all
           three, including what I published: an author has to find their own sandbox plan
           again in their own list.

           Written here rather than left to be inferred, because the next person to see a
           missing scope under a filter would put it back for consistency. */
        $personal = $favorites || $liked || $mine;

        /* Which rankings this page has the right to offer, and which it withdraws.

           "Les plus aimés" does not appear until a whole page's worth of schematics
           carries at least one like. Below that, the leaderboard does not fill its own
           first screen and ranks schematics most of which are worth zero: an exact figure,
           shown in the spot that answers another question, which this repository paid for
           six times in one day. The threshold IS the page size, derived from it rather
           than copied next to it, so that changing it leaves the reason true.

           "Dans l'ordre ou je les ai gardes" only lives under favorites: elsewhere the
           join table is not joined and the column does not exist in the query. */
        $leaderboard = Schematic::query()->listed()->where('likes', '>', 0)->count()
            >= self::PER_PAGE;

        /* Same rule for the declared throughput, and it comes from the same sentence: a
           sort that cannot fill its own first screen is not a sort. Counted on distinct
           schematics and not on rows, because a plan that declares four items would put
           in four and fill the threshold on its own. */
        $declared = SchematicItem::where('kind', SchematicItem::DECLARE)
            ->distinct()->count('schematic_id') >= self::PER_PAGE;

        $offered = self::ORDERS;
        if (! $leaderboard) {
            unset($offered['aimes']);
        }
        if (! $declared) {
            unset($offered['declare']);
        }
        if (! $favorites) {
            unset($offered['garde']);
        }

        if (! array_key_exists($order, $offered)) {
            // Falls back to what the page can actually do, and says so, rather than
            // rendering a list sorted otherwise than what its active tab announces.
            $order = $favorites ? 'garde' : 'new';
        } elseif ($favorites && $request->query('tri') === null) {
            // What I just kept, first: that is the question a personal list asks, and it
            // is not the catalogue's question.
            $order = 'garde';
        }

        // `items` loaded in one go: every tile reads its ceiling, and without this a page
        // of twenty-four would fire twenty-four extra queries.
        $query = Schematic::query()->with(['user', 'items'])->listed();
        if ($holds !== '') {
            $query->whereExists(fn ($sub) => $sub
                ->selectRaw('1')
                ->from('schematic_blocks')
                ->whereColumn('schematic_blocks.schematic_id', 'schematics.id')
                ->where('schematic_blocks.block', $holds));
        }

        /* The same test against a list rather than a name. The list comes from the
           catalogue in memory, so this stays one query: joining a category table would mean
           having one, and the category is a property of the game and not of this database. */
        if ($type !== '') {
            $ofType = array_keys(BlockCatalogue::byCategory()[$type] ?? []);
            $query->whereExists(fn ($sub) => $sub
                ->selectRaw('1')
                ->from('schematic_blocks')
                ->whereColumn('schematic_blocks.schematic_id', 'schematics.id')
                ->whereIn('schematic_blocks.block', $ofType));
        }

        /* The footprint, and it is strict on purpose: no rotation, no swapping the two
           sides. Checked in the game rather than assumed from a wiki - `Binding` exposes
           `schematicFlipX` and `schematicFlipY` and no rotate at all, and
           `Schematics.rotate()` is called only by `BaseBuilderAI` and `BaseGenerator`, the
           enemy base builder. A mirror does not change a bounding box, so a plan of 20 by 15
           never fits a gap of 15 by 20, and offering it would be an exact answer to a
           question the player did not ask. */
        if ($fitsWide > 0) {
            $query->where('schematics.width', '<=', $fitsWide);
        }
        if ($fitsTall > 0) {
            $query->where('schematics.height', '<=', $fitsTall);
        }

        if ($atMostBlocks > 0) {
            $query->where('schematics.blocks', '<=', $atMostBlocks);
        }

        if ($selfPowered) {
            $query->whereColumn('schematics.power_made', '>=', 'schematics.power_used');
        }

        if ($measured) {
            $query->where('schematics.verified', true);
        }

        if ($planet !== '') {
            $query->onPlanet($planet);
        }

        /* A join rather than a `whereExists` for favorites: the "dans l'ordre ou je les ai
           gardes" sort needs the `created_at` column from the join table, which an
           `exists` does not surface. The other two have nothing to read, so they stay
           existence checks. */
        if ($favorites) {
            $query->join('favorites', function ($join) use ($me) {
                $join->on('favorites.schematic_id', '=', 'schematics.id')
                    ->where('favorites.user_id', $me->id);
            })->select('schematics.*');
        }

        if ($liked) {
            $query->whereExists(fn ($sub) => $sub
                ->selectRaw('1')
                ->from('schematic_likes')
                ->whereColumn('schematic_likes.schematic_id', 'schematics.id')
                ->where('schematic_likes.user_id', $me->id));
        }

        if ($mine) {
            $query->where('schematics.user_id', $me->id);
        }

        /* An existence check and not a join: the join on `schematic_items` is already
           taken by the produced item, and a second one on the same table would multiply
           the rows without the displayed count saying so. */
        if ($eats !== '') {
            $query->whereExists(fn ($sub) => $sub
                ->selectRaw('1')
                ->from('schematic_items as besoins')
                ->whereColumn('besoins.schematic_id', 'schematics.id')
                ->where('besoins.item', $eats)
                ->where('besoins.sens', SchematicItem::CONSOMME)
                ->where('besoins.kind', Vitrine::NATURE));
        }

        if ($makes !== '') {
            // A join on the index rather than a key in a JSON blob: "graphite" must not
            // match a schematic that merely needs graphite to be built, and the answer
            // must not require reading every row on the site.
            $query->join('schematic_items', 'schematic_items.schematic_id', '=', 'schematics.id')
                ->where('schematic_items.item', $makes)
                /*
                 * The ceiling, and only the ceiling.
                 *
                 * Requiring a measurement left the catalogue mute: 117 schematics carry
                 * one against 6,775 that carry a ceiling, and neither graphite nor
                 * silicon had a single result even though 844 and 1,700 plans produce
                 * them. This is not an accident that will shrink over time: a schematic
                 * torn out of a base does not have the drill that fed it, so its measured
                 * throughput is zero and will stay zero.
                 *
                 * The ceiling alone, and not "ceiling or measurement", because a ranking
                 * that mixes the two natures is exactly the fault repaired on net power.
                 * And it excludes nobody: the ceiling is computed with an infinite feed,
                 * so it is always greater than or equal to the measurement, and any
                 * schematic with a nonzero measurement also has a ceiling. One nature in
                 * one ranking, without losing anything.
                 *
                 * The rule is not relaxed, it is applied: a ceiling is never shown without
                 * saying it is one. The sentence under the filters says so, and every tile
                 * repeats it next to its figure.
                 */
                ->where('schematic_items.sens', SchematicItem::PRODUIT)
                /* The sort decides the nature, and only one at a time: `declare` reads
                   what a player marked, every other sort reads the ceiling from
                   `Vitrine::NATURE`. A single clause, because two combine badly: `kind =
                   plafond` and `kind = declare` placed side by side return nothing, and an
                   empty list under an active sort reads as a catalogue with no answer
                   rather than as a query contradicting itself. */
                ->where('schematic_items.kind', $order === 'declare'
                    ? SchematicItem::DECLARE
                    : Vitrine::NATURE)
                ->select('schematics.*');

            /* "At least a hundred a second", which only means anything once a thing is
               chosen. Applied here rather than beside the other constraints for that reason:
               out here `schematic_items` is not joined, and a floor on a rate with nothing to
               rate would silently filter on whatever row the database happened to reach.

               THE FIELD IS PER SECOND AND THE COLUMN IS NOT. `schematic_items.rate` carries
               power per second and items per minute, a dual meaning nothing in its name
               gives away; the whole site now states per second, so what somebody types is
               per second and it is converted here. `?min=` therefore means something
               different from what it meant before this change - deliberately, since leaving
               the filter in minutes while every figure around it moved would be the same
               trap one layer down. */
            if ($atLeast > 0) {
                $floor = $makes === SchematicItem::POWER ? $atLeast : $atLeast * 60;
                $query->where('schematic_items.rate', '>=', $floor);
            }
        }

        /* Counted on the list the reader is looking at, filters and all, and not on the
           catalogue.

           It said 4,475 on every page, which is the right count of the whole catalogue and
           the wrong answer to "how many did this page set aside". On
           `?produit=power&tri=output` the true answer was zero: those schematics were
           already gone, dropped by the measured-versus-ceiling rule because their measured
           energy is nought, so this filter had nothing left to remove. A page that sets
           nothing aside announced four and a half thousand.

           Counted before the exclusion is applied rather than as the difference of two
           totals, and forwards through the block index, for the reason written where that
           first count was: a difference means two passes over the whole filtered set. */
        $setAside = ($creative || $personal) ? 0 : (clone $query)
            ->whereExists(fn ($sub) => $sub
                ->selectRaw('1')
                ->from('schematic_blocks')
                ->whereColumn('schematic_blocks.schematic_id', 'schematics.id')
                ->whereIn('schematic_blocks.block', Schematic::sandboxBlocks()))
            ->distinct()
            ->count('schematics.id');

        if (! $creative && ! $personal) {
            $query->ordinary();
        }

        $query = match ($order) {
            // How much it makes for the room it takes, which is what "well made" means and
            // what a date-sorted list can never surface.
            'best' => $query->orderByDesc('schematic_items.rate_per_block'),
            // What it makes for the ground it stands on, which is the question a player
            // asks in front of a gap in their base. Not the same question as `best`: a
            // layout spread wide with few blocks wins one and loses the other.
            'dense' => $query->orderByDesc('schematic_items.rate_per_tile'),
            'output' => $query->orderByDesc('schematic_items.rate'),
            'output', 'declare' => $query->orderByDesc('schematic_items.rate'),
            'small' => $query->orderBy('blocks'),
            'seen' => $query->orderByDesc('views'),
            'aimes' => $query->orderByDesc('schematics.likes'),
            'garde' => $query->orderByDesc('favorites.created_at'),
            default => $query->orderByDesc('schematics.created_at'),
        };

        /*
         * A last tiebreaker, so the ordering is total.
         *
         * Every one of these sorts has ties, and most have a lot of them: thousands of
         * schematics are twelve blocks. Rows that compare equal come back in whatever
         * order the database found convenient, and it has no reason to pick the same one
         * twice. Paging through then shows the same schematic on two pages and never shows
         * another at all, which reads as the site losing things rather than as a missing
         * ORDER BY.
         */
        $query->orderByDesc('schematics.id');

        $page = $query->paginate(self::PER_PAGE)->withQueryString();

        /* What the page says, on top of what it ranks.
         *
         * Computed here rather than in the view, and only once: every remark compares a
         * schematic against the others on the same page, so leaving it to the view would
         * mean passing the whole page to every tile.
         *
         * No extra query: the ceilings are already loaded by `with('items')`, and the
         * build cost is read from `analysis`, already on the row. Recomputing it from
         * `schematic_blocks` times the catalogue would be the same arithmetic written a
         * second time, on the figure a player checks against their own core before
         * pasting.
         */
        $shown = $page->getCollection();
        $unit = $makes === '' ? '' : ($makes === SchematicItem::POWER
            ? __('schema.unite.energie') : Thing::name($makes));

        // Per second on both sides now. The column still carries items per minute and
        // power per second under one name, which is why nothing here reads it directly:
        // `SchematicItem::debitAffiche` is the one place that conversion lives.
        $unitShort = $makes === '' ? '' : ($makes === SchematicItem::POWER
            ? __('vitrine.note.energie-seconde')
            // Written as one piece: the key is "/ s", space included, and concatenating it
            // rendered "Silicon/ s" on every chip.
            : Thing::name($makes).'/s');

        /* What the search currently carries, one chip per constraint, each with the link
           that removes it.

           A page reached from a shared link applies filters its reader never set, and the
           panel holding them is collapsed. Without these chips, the only way to know why
           the list is short is to open the panel and read six fields.

           The numbers are assembled here and never passed to a translation key: a missing
           key would render the key without substituting, and "at least 1,000" would
           become "at least", which is the one half of the sentence that means nothing on
           its own. */
        $chips = [];
        if ($fitsWide > 0 || $fitsTall > 0) {
            $chips[] = [
                'label' => __('vitrine.contraintes.tient-dans').' '
                    .($fitsWide > 0 ? self::plain($fitsWide) : '?').' × '
                    .($fitsTall > 0 ? self::plain($fitsTall) : '?'),
                'clear' => ['large' => null, 'haut' => null],
            ];
        }
        if ($atLeast > 0 && $makes !== '') {
            $chips[] = [
                'label' => __('vitrine.contraintes.au-moins').' '.self::plain($atLeast).' '.$unitShort,
                'clear' => ['min' => null],
            ];
        }
        if ($atMostBlocks > 0) {
            $chips[] = [
                'label' => __('vitrine.contraintes.au-plus').' '.self::plain($atMostBlocks).' '
                    .trans_choice('vitrine.contraintes.unite.bloc-compte', (int) $atMostBlocks),
                'clear' => ['blocs' => null],
            ];
        }
        if ($planet !== '') {
            $chips[] = ['label' => ucfirst($planet), 'clear' => ['planete' => null]];
        }
        if ($selfPowered) {
            $chips[] = ['label' => __('vitrine.contraintes.autonome'), 'clear' => ['autonome' => null]];
        }
        if ($measured) {
            $chips[] = ['label' => __('vitrine.contraintes.verifie'), 'clear' => ['verifie' => null]];
        }
        if ($holds !== '') {
            $chips[] = ['label' => Thing::name($holds), 'clear' => ['bloc' => null]];
        }
        if ($type !== '') {
            $chips[] = [
                'label' => __(BlockCatalogue::categoryKey($type)),
                'clear' => ['type' => null],
            ];
        }
        /* The three personal lists get their chip like everything else.

           Without it, `/mes-favoris` rendered a list without saying anywhere that it was
           filtered: the panel holding the checkboxes is collapsed, and the page title is
           the catalogue's. A reader saw an oddly short showcase, not their favorites. */
        if ($favorites) {
            $chips[] = ['label' => __('vitrine.a-moi.favoris'), 'clear' => ['favoris' => null]];
        }
        if ($liked) {
            $chips[] = ['label' => __('vitrine.a-moi.aimes'), 'clear' => ['aimes' => null]];
        }
        if ($mine) {
            $chips[] = ['label' => __('vitrine.a-moi.miens'), 'clear' => ['miens' => null]];
        }

        if ($eats !== '') {
            $chips[] = [
                'label' => __('vitrine.contraintes.consomme').' '.Thing::name($eats),
                'clear' => ['consomme' => null],
            ];
        }

        [$pageTitle, $pageSummary] = $this->titles($makes, $eats, $holds, $planet, $page->total());

        return view('browse', [
            'pageTitle' => $pageTitle,
            'pageSummary' => $pageSummary,
            'schematics' => $page,
            'winners' => Remarks::winners($shown, $makes, $unit),
            'notes' => $shown->mapWithKeys(
                fn (Schematic $s) => [$s->id => Remarks::about($s, $shown, $makes, $unit)]
            ),
            'makes' => $makes,
            'order' => $order,
            'creative' => $creative,
            // A page that says how many it is holding back is a page a reader can
            // disagree with - as long as the figure is this page's and not the catalogue's.
            'setAside' => $setAside,
            'orders' => $offered,
            // Offered rather than typed: the analysis already knows what exists, so a
            // player picks from what is actually there instead of guessing a spelling.
            'items' => Vitrine::itemsOnOffer(),
            'holds' => $holds,
            'type' => $type,
            // Offered from what is actually in the catalogue, same reason as the items: a
            // player picks a name that exists instead of guessing how it is spelled.
            'blocks' => Vitrine::blocksOnOffer(),
            'powerKey' => SchematicItem::POWER,
            // Rendered back into the form so a search survives being shared, bookmarked or
            // paged through. A field the page forgets is a filter the reader cannot see it
            // is still applying.
            'fitsWide' => $fitsWide,
            'fitsTall' => $fitsTall,
            'atLeast' => $atLeast,
            'atMostBlocks' => $atMostBlocks,
            'selfPowered' => $selfPowered,
            'measured' => $measured,
            'planet' => $planet,
            'planets' => self::PLANETS,
            'favorites' => $favorites,
            'liked' => $liked,
            'mine' => $mine,
            'signedIn' => $me !== null,
            'eats' => $eats,
            'eatsOnOffer' => $eatsOnOffer,
            'against' => $against,
            'held' => $held,
            'chips' => $chips,
            /* What "clear everything" has to clear, read off the chips rather than typed
               out beside them. Typed out, it was missing `consomme`, `favoris`, `aimes` and
               `miens`: pressing it left the ingredient filter on and took the chip saying
               so away with it, so the list stayed short with nothing left on screen to
               explain why. A second list of the same thing drifts from the first the day a
               filter is added, and this one had. */
            'clearAll' => collect($chips)->pluck('clear')
                ->reduce(fn (array $all, array $one) => $all + $one, ['page' => null]),
        ]);
    }

    /**
     * A number a stranger typed, or zero meaning "not asked".
     *
     * Zero rather than null for absent, because every caller here treats "not asked" and
     * "asked for nothing" the same way, and a null would make five call sites carry a check
     * that means nothing. Anything that is not a positive number inside the bound is dropped
     * rather than clamped: clamping nine million to four thousand would answer a question
     * nobody asked, quietly, which is this repository's signature defect.
     */
    private function positive(mixed $raw, int $ceiling): float
    {
        if (! is_string($raw) && ! is_numeric($raw)) {
            return 0;
        }

        $value = is_numeric($raw) ? (float) $raw : 0;

        return $value > 0 && $value <= $ceiling ? $value : 0;
    }

    /** A bound as the reader typed it: 16 and not 16,00, 0,5 kept as 0,5. */
    private static function plain(float $value): string
    {
        return rtrim(rtrim(number_format($value, 2, ',', ' '), '0'), ',');
    }

    /**
     * What a filtered listing calls itself, in a browser tab and in a search result.
     *
     * Every listing answered to the same title, so `?produit=graphite`, `?bloc=router` and
     * `?planete=erekir` were three distinct sets of schematics that no reader could tell
     * apart in a list of results. The filters name real sets; the title had to say which.
     *
     * The name goes first and outside the translated phrase, which is two decisions. First
     * because it is the word somebody scanning results reads, and the only one separating
     * this page from every other listing. Outside because a missing key renders as the key
     * without substituting, and the name is the whole information here: "Graphite
     * vitrine.titre-page.produit" reports itself, a title with Graphite gone does not.
     *
     * One filter names the page even when several are set. A title that tried to say all of
     * them would be long before it was useful, and the first one set is the one a reader
     * came for.
     */
    private function titles(string $makes, string $eats, string $holds, string $planet, int $total): array
    {
        /* Written out one key at a time rather than assembled from a variable: AGENTS.md
           forbids a key built at render time, because a key glued together is a key no
           check ever sees. */
        [$name, $phrase] = match (true) {
            $makes !== '' => [Thing::name($makes), __('vitrine.titre-page.produit')],
            $eats !== '' => [Thing::name($eats), __('vitrine.titre-page.consomme')],
            $holds !== '' => [Thing::name($holds), __('vitrine.titre-page.bloc')],
            $planet !== '' => [ucfirst($planet), __('vitrine.titre-page.planete')],
            default => ['', ''],
        };

        if ($name === '') {
            return ['Schémas - Mindustry Forge', null];
        }

        return [
            $name.' : '.$phrase.' - Mindustry Forge',
            $name.' : '.$total.' '.__('vitrine.titre-page.analyses'),
        ];
    }
}
