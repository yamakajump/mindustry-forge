<?php

namespace App\Models;

use App\Services\BlockCatalogue;
use App\Services\EngineVersion;
use App\Services\GameMarkup;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * One saved schematic, with what the analysis said about it.
 *
 * The searchable figures are lifted out of the analysis on the way in rather than read out
 * of the JSON on the way out. "A hundred graphite a minute under thirty blocks" is a query
 * over columns; over a JSON blob it is a full scan of every row on the site.
 */
class Schematic extends Model
{
    use HasFactory;

    /**
     * Who can see it.
     *
     * `unlisted` is the one a boolean could not express and the one most drafts want: a
     * link that works for anybody it is given to, and a schematic that stays out of the
     * public list until its author says otherwise.
     */
    public const PRIVATE = 'private';

    public const UNLISTED = 'unlisted';

    public const PUBLIC = 'public';

    public const VISIBILITIES = [self::PRIVATE, self::UNLISTED, self::PUBLIC];

    /**
     * Where a schematic came from.
     *
     * Most of what this site will hold was not posted here, and pretending otherwise would
     * be the one thing that turns an aggregator into a theft. The origin travels with the
     * row and it is shown on the page.
     */
    public const UPLOAD = 'upload';

    public const MINDUSTRY_TOOL = 'mindustry-tool';

    public const MINDUSTRY_SCHEMATICS = 'mindustryschematics';

    /** What each source is called out loud, and where a schematic of theirs lives. */
    private const SOURCES = [
        self::MINDUSTRY_TOOL => [
            'name' => 'mindustry-tool.com',
            'page' => 'https://mindustry-tool.com/schematics/%s',
        ],
        self::MINDUSTRY_SCHEMATICS => [
            'name' => 'mindustryschematics.com',
            'page' => 'https://mindustryschematics.com/schematics/%s',
        ],
    ];

    protected $fillable = [
        'user_id', 'slug', 'name', 'description', 'code', 'visibility',
        'analysis', 'ground', 'width', 'height', 'blocks', 'power_made', 'power_used',
        'produces', 'needs',
        'source', 'source_id', 'author', 'fetched_at', 'source_meta',
        'hidden_at', 'hidden_reason',
        'analysed_at', 'engine_version',
    ];

    /**
     * The column default, repeated where the model can see it.
     *
     * A database default only applies on the way in, so a schematic that had just been
     * built and not read back had a null `source` and cheerfully reported itself as
     * imported. The origin has to be right on an object nobody has saved yet, because that
     * is the object the upload route works with.
     */
    protected $attributes = [
        'source' => self::UPLOAD,
    ];

    protected $casts = [
        'verified' => 'boolean',
        'analysis' => 'array',
        'ground' => 'array',
        'produces' => 'array',
        'needs' => 'array',
        'source_meta' => 'array',
        'fetched_at' => 'datetime',
        'analysed_at' => 'datetime',
        'hidden_at' => 'datetime',
    ];

    /** In the public list. Unlisted schematics are reachable and not listed. */
    public function scopeListed($query)
    {
        // Hidden goes here rather than at each of the ten call sites, because that is the
        // property this scope exists to hold: everything that shows a schematic to somebody
        // who did not ask for it by name goes through here, and a hiding that covered only
        // the listing would leave the picture reachable from the home page, the block pages
        // and the comparison.
        return $query->where('visibility', self::PUBLIC)->whereNull('hidden_at');
    }

    /**
     * Whether this user may open its page at all.
     *
     * The null check on `user_id` is not decoration. Imported schematics have no account
     * here, and they land private until the catalogue is deliberately published; without
     * it, a private import (`user_id` null) compared against a signed-out visitor
     * (`$user?->id` null) matched, and the entire unpublished catalogue was readable by
     * anybody not logged in. Nullable columns compare equal to absent users.
     */
    public function visibleTo(?User $user): bool
    {
        /*
         * Hidden outranks everything, including being your own.
         *
         * The author keeping access would be kinder, and it would also mean the address
         * they pasted into a Discord thread still answers for the one person most likely
         * to paste it again. A hiding that the author can route around is a hiding that
         * only stops strangers, and strangers are not the problem.
         *
         * The moderator sees it, because somebody has to look at what was reported before
         * deciding, and half of what gets reported is fine.
         */
        if ($this->hidden_at !== null) {
            return (bool) $user?->moderator;
        }

        return $this->visibility !== self::PRIVATE
            || ($this->user_id !== null && $this->user_id === $user?->id)
            || (bool) $user?->moderator;
    }

    /**
     * Whether this user may change or remove it.
     *
     * Its author, and whoever keeps the showcase. A public list anyone can post to needs
     * somebody able to take something out of it, and the alternative was opening the
     * database by hand.
     */
    public function managedBy(?User $user): bool
    {
        return $user !== null && ($this->user_id === $user->id || $user->moderator);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Keep the searchable indexes in step with the schematic itself.
     *
     * Rebuilt on the way out, whatever wrote the row: the upload route, a moderator fixing
     * a name, the ingestion pass, a factory in a test. Doing it only where the analysis
     * arrives would leave every other write path with a schematic listed under something
     * it no longer makes, or built from a block it no longer holds.
     */
    protected static function booted(): void
    {
        static::saved(function (self $schematic) {
            $schematic->indexWhatItMakes();
            // Le plafond passe par le meme crochet et pour la meme raison : la route
            // d'envoi, un moderateur qui corrige un nom et la passe d'analyse ecrivent
            // toutes les trois par ici, et n'en cabler qu'une laisserait les deux autres
            // avec un index qui ne dit plus la meme chose que la schematique.
            $schematic->indexWhatItCouldMake();
            // Which blocks it is built from, for the wiki. A different table, so the two
            // rebuilds never touch each other's rows.
            $schematic->indexWhatItHolds();
            // Et ce qu'il reclame de l'exterieur, qui est la question posee dans l'autre
            // sens : « j'ai du charbon, qu'est-ce que je peux faire tourner ».
            $schematic->indexWhatItNeeds();
        });
    }

    /**
     * Write out one row per thing this schematic produces.
     *
     * Wholesale rather than a diff: a corrected schematic that stopped making silicon has
     * to stop turning up under silicon, and reconciling two lists is how one of them ends
     * up with a leftover nobody notices until a player opens a page that promised silicon.
     *
     * Power sits in here alongside the items, because a reactor produces energy the way a
     * press produces graphite. What it *consumes* is deliberately absent: electricity is
     * something a base already has, so it is a prerequisite the page states, never a debt
     * that pushes a working factory down a ranking.
     */
    /**
     * The ground it stands on, which is not the number of blocks it is made of.
     *
     * The bounding box rather than the count of occupied tiles, and deliberately: a
     * schematic is pasted as a rectangle, so a hole inside it is still ground the player
     * cannot use for anything else. Floored at one so a malformed row divides by something.
     */
    public function tiles(): int
    {
        return max(1, (int) $this->width * (int) $this->height);
    }

    public function indexWhatItMakes(): void
    {
        $blocks = max(1, (int) $this->blocks);
        $tiles = $this->tiles();

        /* Nothing at all is indexed for a schematic fed by a sandbox tap, and that is the
           narrow claim: it is not that such a layout is uninteresting, it is that whatever
           it hands out came from a tap rather than from the blocks in it. Ranked among the
           producers it takes the top of every list it appears in - 1,246 of them did, and
           an energy ranking led by 479 million tells a reader nothing except that the
           ranking is not to be trusted.

           It stays visible, searchable and analysable. It is simply not a measurement of
           production, so it is not filed as one. */
        if ($this->fedBySandbox()) {
            $this->items()
                ->where('sens', SchematicItem::PRODUIT)
                ->where('kind', SchematicItem::MESURE)
                ->delete();

            return;
        }

        $rows = [];
        foreach ((array) $this->produces as $item => $rate) {
            if (is_string($item) && is_numeric($rate) && $rate > 0) {
                $rows[substr($item, 0, 40)] = (float) $rate;
            }
        }
        // Energy is indexed on what is left over, not on what the generators put out. A
        // plant that makes six thousand and burns thirteen hundred of it on its own pumps
        // hands the base four thousand seven hundred, and that is the number somebody
        // comparing two reactors is comparing. Note this is not the consumption rule in
        // reverse: a factory's power draw never touches its ranking on graphite. It is
        // that when energy is the product, the product is the surplus.
        /* Read from the measured budget, not from `powerSpare()`.
         *
         * `power_made` is filled from `analysis['potential']`, which is the ceiling: what
         * the layout would make fed flat out. Indexed here it became a `mesure` row, and
         * the listing filters on exactly that kind - with a comment saying that mixing a
         * ceiling into a measured ranking would be lying without saying so. It was, and
         * nothing said so: 195 rows carried the same number twice, once honestly as a
         * ceiling and once falsely as a measurement, and "the ones that produce the most"
         * was ranking on ceilings while believing it ranked on measurements.
         *
         * A reactor farm with no fuel declared measures zero, and zero is the true answer
         * to "what does this plan produce as given". Its ceiling is written by
         * `indexWhatItCouldMake`, under the kind that says what it is.
         */
        $analysis = (array) $this->analysis;
        $measured = (array) ($analysis['power'] ?? []);
        $spare = (float) ($measured['made'] ?? 0) - (float) ($measured['spent'] ?? 0);
        if ($spare > 0) {
            $rows[SchematicItem::POWER] = $spare;
        }

        // Only the measured output is rebuilt here. Ceilings and consumption are written
        // by whoever works them out, and wiping them from this method would mean a save
        // that renamed a schematic silently dropped what another pass had established.
        $mine = $this->items()
            ->where('sens', SchematicItem::PRODUIT)
            ->where('kind', SchematicItem::MESURE);

        (clone $mine)->whereNotIn('item', array_keys($rows) ?: [''])->delete();

        foreach ($rows as $item => $rate) {
            $this->items()->updateOrCreate(
                ['item' => $item, 'sens' => SchematicItem::PRODUIT, 'kind' => SchematicItem::MESURE],
                ['rate' => $rate, 'rate_per_block' => $rate / $blocks,
                    'rate_per_tile' => $rate / $tiles],
            );
        }
    }

    /**
     * Ce qu'il faut lui amener, indexe comme ce qu'il rend.
     *
     * L'autre moitie de la promesse du site, et l'autre sens de la meme question. « Qu'est-ce
     * qui fait du graphite » est une liste de courses ; « qu'est-ce qui mange du charbon » est
     * la reponse a « j'ai une mine qui tourne, que puis-je construire maintenant », qui est la
     * façon dont un joueur choisit sa prochaine usine.
     *
     * La colonne `needs` porte deja la reponse depuis le premier jour, ecrite par l'analyse :
     * ce que le plan reclame de l'exterieur, par minute, une fois deduit ce qu'il produit
     * lui-meme. Rien n'est recalcule ici, la ligne est seulement rendue interrogeable.
     *
     * Range en `plafond` et non en `mesure`, parce que c'est ce qu'elle est : la demande d'un
     * plan tournant a plein regime, pas un releve. Melanger les deux natures dans une meme
     * colonne est la faute que ce depot a passe une journee a defaire du cote production, et
     * elle serait aussi silencieuse de ce cote-ci.
     *
     * Les cles categorielles sont ecartees. Un generateur qui brule « n'importe quoi » ne
     * nomme pas de ressource et sort sous `*combustible` : 267 lignes sur 3 000 dans le
     * catalogue actuel. Savoir si du charbon couvre cette faim demande la liste `accepts` que
     * le jeu tient par bloc, et que `needs.js` lit deja dans le navigateur. La resoudre une
     * seconde fois ici serait la deuxieme implementation que ce depot passe son temps a
     * eviter ; et un nom qu'aucun joueur ne peut taper n'est de toute façon pas un filtre.
     */
    public function indexWhatItNeeds(): void
    {
        $rows = [];
        foreach ((array) $this->needs as $item => $rate) {
            if (! is_string($item) || $item === '' || $item[0] === '*') {
                continue;
            }
            if (is_numeric($rate) && $rate > 0) {
                $rows[substr($item, 0, 40)] = round((float) $rate, 2);
            }
        }

        $blocks = max(1, (int) $this->blocks);
        $tiles = $this->tiles();

        $mine = $this->items()
            ->where('sens', SchematicItem::CONSOMME)
            ->where('kind', SchematicItem::PLAFOND);

        (clone $mine)->whereNotIn('item', array_keys($rows) ?: [''])->delete();

        foreach ($rows as $item => $rate) {
            $this->items()->updateOrCreate(
                ['item' => $item, 'sens' => SchematicItem::CONSOMME, 'kind' => SchematicItem::PLAFOND],
                ['rate' => $rate, 'rate_per_block' => $rate / $blocks, 'rate_per_tile' => $rate / $tiles],
            );
        }
    }

    /**
     * The contributed marking currently in force, if a player supplied one.
     *
     * @return BelongsTo<Contribution, $this>
     */
    public function contribution(): BelongsTo
    {
        return $this->belongsTo(Contribution::class);
    }

    /**
     * What a contributed marking says it makes, filed under a kind that says whose word it is.
     *
     * The same arithmetic as `indexWhatItMakes`, from an analysis that arrived the same way,
     * through the same code in a browser. What differs is one thing and it is not a number:
     * the author said where their own plan is fed, and here a stranger did. That is a
     * different claim, so it is a different `kind`, and never `mesure`.
     *
     * The sandbox rule carries over untouched. A layout fed by a tap hands out what a tap
     * poured in, and marking its belts by hand does not change where it came from.
     */
    public function indexWhatWasDeclared(array $analysis): void
    {
        $blocks = max(1, (int) $this->blocks);

        $rows = [];
        if (! $this->fedBySandbox()) {
            foreach ((array) ($analysis['perMinute'] ?? []) as $item => $rate) {
                if (is_string($item) && is_numeric($rate) && $rate > 0) {
                    $rows[substr($item, 0, 40)] = (float) $rate;
                }
            }

            // Energy on the surplus, exactly as the measured pass does it, and read from
            // the measured budget rather than the ceiling for the same reason: a plant that
            // burns part of its own output hands the base the rest.
            $power = (array) ($analysis['power'] ?? []);
            $spare = (float) ($power['made'] ?? 0) - (float) ($power['spent'] ?? 0);
            if ($spare > 0) {
                $rows[SchematicItem::POWER] = $spare;
            }
        }

        $mine = $this->items()
            ->where('sens', SchematicItem::PRODUIT)
            ->where('kind', SchematicItem::DECLARE);

        (clone $mine)->whereNotIn('item', array_keys($rows) ?: [''])->delete();

        foreach ($rows as $item => $rate) {
            $this->items()->updateOrCreate(
                ['item' => $item, 'sens' => SchematicItem::PRODUIT, 'kind' => SchematicItem::DECLARE],
                ['rate' => $rate, 'rate_per_block' => $rate / $blocks],
            );
        }
    }

    /**
     * Ce qu'elle pourrait faire si on l'alimentait, indexe a cote de ce qu'elle fait.
     *
     * Deux lignes pour une meme schematique et un meme objet, et c'est voulu : `mesure` est
     * ce qu'elle rend branchee comme son auteur l'a decrite, `plafond` est ce que ses
     * machines sortiraient a plein regime. Les melanger classerait une promesse a cote d'un
     * fait, ce qui est l'erreur que ce depot passe ses journees a defaire.
     *
     * Sans ca, la moitie de l'argument du site ne tient pas : quinze mille schematiques
     * collectees ailleurs que personne ne marquera jamais une par une n'ont pas de mesure,
     * donc « trouve-moi une usine a silicium » ne les trouve pas. Sur les quarante
     * premieres entrees reelles, cinq portaient un chiffre.
     *
     * Ne touche a rien quand l'analyse ne dit rien du plafond, plutot que de conclure qu'il
     * est vide. Une schematique renommee par un moderateur passe par ici avec l'analyse
     * qu'elle avait ; si ce silence effacait les lignes, un changement de nom supprimerait
     * le travail de la passe d'analyse sans que rien ne le signale. C'est exactement le
     * piege repare dans la methode d'a cote, dans l'autre sens.
     */
    public function indexWhatItCouldMake(): void
    {
        $analysis = (array) $this->analysis;
        if (! array_key_exists('potentialPerMinute', $analysis)
            && ! array_key_exists('potential', $analysis)) {
            return;
        }

        $blocks = max(1, (int) $this->blocks);
        $tiles = $this->tiles();

        // The ceiling is a tap's ceiling too, and just as meaningless. Same rule as above.
        if ($this->fedBySandbox()) {
            $this->items()
                ->where('sens', SchematicItem::PRODUIT)
                ->where('kind', SchematicItem::PLAFOND)
                ->delete();

            return;
        }

        $rows = [];
        foreach ((array) ($analysis['potentialPerMinute'] ?? []) as $item => $rate) {
            if (is_string($item) && is_numeric($rate) && $rate > 0) {
                $rows[substr($item, 0, 40)] = round((float) $rate, 2);
            }
        }

        // L'energie suit la meme regle que du cote mesure : ce qui reste une fois que la
        // schematique s'est servie. Un plafond de production brute classerait une centrale
        // qui brule la moitie de ce qu'elle fait au-dessus de celle qui la rend.
        $spare = (float) ($analysis['potential']['made'] ?? 0)
            - (float) ($analysis['potential']['spent'] ?? 0);
        if ($spare > 0) {
            $rows[SchematicItem::POWER] = $spare;
        }

        $mine = $this->items()
            ->where('sens', SchematicItem::PRODUIT)
            ->where('kind', SchematicItem::PLAFOND);

        (clone $mine)->whereNotIn('item', array_keys($rows) ?: [''])->delete();

        foreach ($rows as $item => $rate) {
            $this->items()->updateOrCreate(
                ['item' => $item, 'sens' => SchematicItem::PRODUIT, 'kind' => SchematicItem::PLAFOND],
                ['rate' => $rate, 'rate_per_block' => $rate / $blocks,
                    'rate_per_tile' => $rate / $tiles],
            );
        }
    }

    /**
     * The name as a reader should see it, with the game's colour markup taken out.
     *
     * `name` stays exactly as the source wrote it, and this is the only thing any surface
     * should print. Not stripped on the way in: a stripper we get wrong once would already
     * have eaten the original by the time we notice, and correcting it would mean
     * re-collecting fifteen thousand entries. Not stripped surface by surface either -
     * that is the arrangement that produced the defect, where the listing and the page
     * remembered and the share card did not.
     *
     * The edit form is the one place that deliberately shows the raw name: somebody
     * renaming their own schematic must see what they wrote, or saving would quietly
     * destroy the colours they chose.
     */
    public function displayName(): string
    {
        return GameMarkup::strip((string) $this->name);
    }

    /**
     * What a tile should print about what it makes, biggest first.
     *
     * The ceiling when there is one, because that is what the listing filters and ranks on:
     * a tile showing a measurement under a ranking made on something else says one thing
     * while the list beside it says another.
     *
     * The measurement when there is no ceiling, which production says is a net under an
     * empty stretch: of fourteen thousand eight hundred ceilings there are four hundred and
     * nineteen measurements, on five things and no solid item at all, and every one of them
     * sits on something that also carries a ceiling. An imported schematic has no marked
     * input, so the analysis states no throughput, so no measured row is written.
     *
     * Kept anyway, and kept loud. The alternative is a tile that prints a name and no figure
     * on a listing whose whole argument is its figures, and the day the analysis learns to
     * measure an imported line, that tile appears without anybody having decided it should.
     * The view names which of the two it is printing, both ways round: a measurement left
     * unlabelled would read as the ceiling on the tile beside it.
     *
     * Read off the relation rather than queried per tile, so a page of twenty-four costs one
     * eager load and not twenty-four round trips.
     *
     * @return array<string, array{rate: float, kind: string}>
     */
    public function chiffresMontres(?string $prefer = null): array
    {
        /*
         * Quelle nature la tuile montre quand la schematique en porte plusieurs.
         *
         * Le plafond par defaut, parce que la vitrine classe sur lui. Mais la page classe
         * desormais sur le debit declare quand on le lui demande, et une tuile qui
         * montrerait le plafond sous ce classement-la dirait autre chose que la liste qui
         * l'a rangee : le chiffre serait juste et repondrait a la question d'a cote. C'est
         * pour ca que l'appelant passe ce qu'il classe, au lieu que ce soit fige ici.
         */
        $prefer ??= SchematicItem::PLAFOND;
        $produced = $this->items->where('sens', SchematicItem::PRODUIT);

        $rows = [];
        foreach ($produced->sortByDesc('rate') as $row) {
            // La nature preferee gagne quand plusieurs existent, et le tri par debit
            // decroissant ferait passer la plus grande en premier : on force, plutot que
            // de dependre de l'ordre.
            if (isset($rows[$row->item]) && $rows[$row->item]['kind'] === $prefer) {
                continue;
            }
            $rows[$row->item] = ['rate' => (float) $row->rate, 'kind' => $row->kind];
        }

        uasort($rows, fn ($a, $b) => $b['rate'] <=> $a['rate']);

        return $rows;
    }

    /** Everything it makes, one row each, indexed so the listing can search and rank on it. */
    public function items(): HasMany
    {
        return $this->hasMany(SchematicItem::class);
    }

    /**
     * Write out one row per kind of block this schematic is built from.
     *
     * The block wiki asks the question this answers: which layouts actually use a silicon
     * smelter. It reads the stored analysis rather than parsing the `.msch` again, because
     * the analysis already walked every tile and a second walk in a second language is a
     * second thing to have wrong.
     *
     * Two queries, whatever the schematic holds, and that is not incidental. The ingestion
     * pass will run this fifteen thousand times; a row-at-a-time write of the fifty-odd
     * block kinds in a large layout would be the difference between an ingestion that takes
     * an hour and one that takes a night.
     */
    public function indexWhatItHolds(): void
    {
        $counts = self::countBlocks($this->analysis);

        $this->blocksHeld()->delete();

        if ($counts === []) {
            return;
        }

        $this->blocksHeld()->insert(array_map(
            fn ($block, $count) => [
                'schematic_id' => $this->id,
                'block' => $block,
                'count' => $count,
            ],
            array_keys($counts),
            $counts,
        ));
    }

    /**
     * Count each kind of block in an analysis, defensively.
     *
     * The analysis arrives from a browser and a browser can send anything, so this coerces
     * and drops rather than trusting, exactly as `fromAnalysis` does. A name is cut to the
     * column width and a count is capped: neither is expected to be hit by a real
     * schematic, and both stop a hand-made payload from becoming a database error.
     */
    public static function countBlocks(mixed $analysis): array
    {
        $counts = [];

        /* `held` first, `detail` after, and both on purpose.
         *
         * `held` is the compact inventory the analysis now returns, and it is the only one
         * that survives `tools/ingest.mjs`: its whitelist never carried `detail`, so every
         * collected schematic stored an analysis without it and `schematic_blocks` was
         * empty on all 15,533 rows. The browser posts the whole report, `detail` included,
         * so that path always worked - which is why nothing looked broken.
         *
         * The fallback stays for exactly that reason: an analysis stored before this
         * change, or posted by a page that has not been reloaded, still has to be read.
         */
        foreach ((array) ($analysis['held'] ?? []) as $name => $count) {
            if (is_string($name) && $name !== '' && is_numeric($count) && $count > 0) {
                $counts[substr($name, 0, 40)] = (int) $count;
            }
        }

        if ($counts === []) {
            foreach ((array) ($analysis['detail'] ?? []) as $tile) {
                $name = is_array($tile) ? ($tile['name'] ?? null) : null;
                if (is_string($name) && $name !== '') {
                    $key = substr($name, 0, 40);
                    $counts[$key] = ($counts[$key] ?? 0) + 1;
                }
            }
        }

        return array_map(fn ($count) => min(65535, $count), $counts);
    }

    /**
     * The sandbox taps it holds, if any, named rather than counted.
     *
     * A `power-source` hands out 999,999.94 energy a second, which is the game's way of
     * writing "as much as you like". Subtracted from what the schematic burns it came out
     * as 479,999,971, and the page printed that in green as the surplus left over for the
     * rest of your base. The arithmetic was right. The sentence was a lie, on a site whose
     * whole argument is that its figures can be checked instead of believed.
     *
     * A `liquid-source` is worse and quieter: 600,000 a second reads like a number.
     *
     * Recognised by `build_visibility`, which the game itself writes, rather than by a list
     * of names typed here. A list would be right until the next release adds a block to the
     * sandbox category, and wrong silently after that.
     */
    public function sandboxTaps(): array
    {
        if ($this->sandboxTaps !== null) {
            return $this->sandboxTaps;
        }

        $found = [];
        foreach (array_keys(self::countBlocks($this->analysis)) as $name) {
            $block = BlockCatalogue::find($name);
            if ($block?->visibility() !== 'sandboxOnly') {
                continue;
            }

            /* Sources only, and told apart by what they hand out rather than by their name.
               `power-source` has the role `power` and `heat-source` the role `crafter`, so
               a rule written on the word "source" catches neither: the first version of
               this method looked right and matched nothing at all.

               A `power-void` or an `item-void` is a sandbox block too and it swallows
               rather than pours. It inflates what a schematic appears to *need*, which is a
               different sentence on a different card, and it never puts one at the top of a
               producers' ranking. A `thruster` hands out nothing whatsoever. */
            $gives = (float) $block->get('power_out', 0) > 0
                || (float) $block->get('output_per_second', 0) > 0
                || (float) $block->get('heat_output', 0) > 0
                || $block->get('role') === 'payload-source';
            if ($gives) {
                $found[] = $name;
            }
        }
        sort($found);

        return $this->sandboxTaps = $found;
    }

    /** Worked out once per row: the listing asks twenty-four times on one page. */
    private ?array $sandboxTaps = null;

    /** Whether anything it claims to produce comes out of one of those taps. */
    public function fedBySandbox(): bool
    {
        return $this->sandboxTaps() !== [];
    }

    /**
     * What it costs to put down, item by item, in the order the game lists them.
     *
     * Read from the analysis rather than recomputed from `schematic_blocks` times the
     * catalogue. The analysis already worked it out from `Block.requirements`, which is the
     * same arithmetic, and a second implementation would be a second thing to have wrong -
     * on the figure a player checks against their own core before pasting.
     *
     * Sorted by the game's own item id, so copper comes before lead and titanium before
     * thorium, which is the order a player reads on every panel in the game. Alphabetical
     * would put beryllium first on a Serpulo build.
     */
    public function cost(): array
    {
        $cost = [];
        // Parenthesised, because a cast binds tighter than `??` and the same slip cost a
        // round trip an hour ago on `analysis['power']`.
        $analysis = (array) $this->analysis;
        foreach ((array) ($analysis['cost'] ?? []) as $item => $amount) {
            /* An empty name passes `is_string`, which is exactly the shape a hand-made
               payload takes. A name the catalogue has never heard of is kept, though: a
               mod item dropped in silence would understate what the layout costs, which is
               the same fault as dropping a mod block from the inventory. Its icon will
               404 and its figure will be right, which is the better half to keep. */
            if (is_string($item) && $item !== '' && is_numeric($amount) && $amount > 0) {
                $cost[substr($item, 0, 40)] = (int) $amount;
            }
        }

        return BlockCatalogue::inGameOrder($cost);
    }

    /**
     * Every block the game only hands out in a sandbox, named by the game and not by us.
     *
     * Ten of them: the four sources, the four voids, the heat source and the thruster. A
     * schematic holding one cannot be built in an ordinary game, which is a fact rather
     * than a matter of taste - and the reason the test is on blocks and never on a name.
     * `Def Mega Base (sandbox)` gives itself away; `useless box` and `Server lagger` do
     * not, and they are the same lot.
     *
     * Cached statically because it is a property of the catalogue, not of a row.
     */
    public static function sandboxBlocks(): array
    {
        static $names = null;
        if ($names !== null) {
            return $names;
        }

        $names = [];
        foreach (BlockCatalogue::all() as $name => $block) {
            if ($block->visibility() === 'sandboxOnly') {
                $names[] = $name;
            }
        }

        return $names;
    }

    /**
     * Every block the game only offers on one of its two worlds.
     *
     * Serpulo and Erekir share almost nothing, and a plan built from one cannot be pasted on
     * the other: the blocks are simply not in the player's build menu there. So this is not a
     * matter of taste like the sandbox rule, it is the difference between a result a player
     * can use and one they cannot place at all.
     *
     * Read off the catalogue the bench printed out of a running game, never a hand-kept list:
     * the day the game adds a block, a typed list starts lying and nothing says so.
     */
    public static function blocksAwayFrom(string $planet): array
    {
        static $cache = [];
        if (isset($cache[$planet])) {
            return $cache[$planet];
        }

        $names = [];
        foreach (BlockCatalogue::all() as $name => $block) {
            $its = $block->planet();
            // A block belonging to no tree at all - a floor, a sandbox block - excludes
            // nobody. Treating "unknown" as "the other world" would empty every result.
            if ($its !== null && $its !== $planet) {
                $names[] = $name;
            }
        }

        return $cache[$planet] = $names;
    }

    /** Only what can actually be pasted on that world, said in SQL. */
    public function scopeOnPlanet($query, string $planet)
    {
        return $query->whereNotExists(fn ($sub) => $sub
            ->selectRaw('1')
            ->from('schematic_blocks')
            ->whereColumn('schematic_blocks.schematic_id', 'schematics.id')
            ->whereIn('schematic_blocks.block', self::blocksAwayFrom($planet)));
    }

    /**
     * Whether it is a creative build rather than something to put in a base.
     *
     * Read off the inventory, so it costs no analysis: `schematic_blocks` is the table the
     * whole of this hangs on, and it was empty until the analysis started returning one.
     */
    public function creative(): bool
    {
        return $this->blocksHeld()
            ->whereIn('block', self::sandboxBlocks())
            ->exists();
    }

    /** The listing's half of the same question, answered in SQL rather than row by row. */
    public function scopeOrdinary($query)
    {
        return $query->whereNotExists(fn ($sub) => $sub
            ->selectRaw('1')
            ->from('schematic_blocks')
            ->whereColumn('schematic_blocks.schematic_id', 'schematics.id')
            ->whereIn('schematic_blocks.block', self::sandboxBlocks()));
    }

    /** Which blocks it is built from, one row per kind, indexed so the wiki can search it. */
    public function blocksHeld(): HasMany
    {
        return $this->hasMany(SchematicBlock::class);
    }

    /**
     * What has to be plugged into it before it does anything, in energy per second.
     *
     * Nobody builds a factory expecting it to bring its own reactor, so this is not held
     * against it anywhere. It is said on the page, because a player who pastes a silicon
     * line into an unpowered corner of their base and watches it sit there deserved to be
     * told, and until now the page mentioned power only when there was a surplus.
     */
    public function powerNeeded(): float
    {
        return max(0.0, (float) $this->power_used);
    }

    /** Whether it hands back more energy than it takes, which makes it a power plant. */
    public function powerSpare(): float
    {
        return (float) $this->power_made - (float) $this->power_used;
    }

    /** Whether it was collected from somewhere else rather than posted here. */
    public function imported(): bool
    {
        return $this->source !== self::UPLOAD;
    }

    /**
     * Who to credit, whoever they are and wherever they posted.
     *
     * A member's name, or the name the source recorded, or an admission. The admission
     * matters: some entries on both catalogues have no author recorded at all, and writing
     * "anonyme" is honest where quietly printing nothing reads like the site claiming it.
     */
    public function credit(): string
    {
        return $this->user?->name
            ?? ($this->author !== null && trim($this->author) !== ''
                ? $this->author
                : 'auteur inconnu');
    }

    /** What the source is called out loud, for a page that has to name it. */
    public function sourceName(): ?string
    {
        return self::SOURCES[$this->source]['name'] ?? null;
    }

    /**
     * The schematic's own page at the source it came from.
     *
     * A credit that cannot be followed is not a credit. Both patterns were checked against
     * the live sites rather than guessed: mindustry-tool answers a redirect to its locale
     * from the bare path, so the bare path is what is stored here and it survives them
     * changing locales.
     */
    public function sourceUrl(): ?string
    {
        $page = self::SOURCES[$this->source]['page'] ?? null;

        return $page !== null && $this->source_id !== null
            ? sprintf($page, rawurlencode($this->source_id))
            : null;
    }

    /**
     * Whether the stored figures came out of an engine that no longer exists.
     *
     * A schematic analysed before this column existed answers true, because nothing
     * recorded which engine produced its numbers and a site selling measurements does not
     * get to assume.
     */
    public function analysisIsStale(): bool
    {
        return $this->engine_version !== EngineVersion::current();
    }

    /** What the re-analysis pass reaches for: everything the current engine has not seen. */
    public function scopeStale($query)
    {
        return $query->where(fn ($q) => $q
            ->where('engine_version', '!=', EngineVersion::current())
            ->orWhereNull('engine_version'))
            ->orderByRaw('analysed_at is not null, analysed_at asc');
    }

    public function getRouteKeyName(): string
    {
        return 'slug';
    }

    /**
     * A short, unguessable id.
     *
     * Not the row number. A sequential url tells anybody how many schematics the site has
     * and lets them walk every private one that ever slipped through, and it makes the
     * first day of a new site look like its last.
     */
    public static function freshSlug(): string
    {
        do {
            $slug = Str::lower(Str::random(10));
        } while (static::where('slug', $slug)->exists());

        return $slug;
    }

    /**
     * Pull the figures worth searching on out of a browser's analysis.
     *
     * Defensive on purpose: this arrives from a page, and a page can send anything. Every
     * field is coerced and bounded rather than trusted, and what does not fit is dropped
     * instead of stored as a surprise for whatever reads it next.
     */
    public static function fromAnalysis(array $analysis): array
    {
        $produces = [];
        foreach ((array) ($analysis['perMinute'] ?? []) as $item => $rate) {
            if (is_string($item) && is_numeric($rate) && $rate > 0) {
                $produces[substr($item, 0, 40)] = round((float) $rate, 2);
            }
        }

        $needs = [];
        foreach ((array) ($analysis['needs'] ?? []) as $need) {
            $name = $need['resource'] ?? null;
            if (is_string($name) && is_numeric($need['perMinute'] ?? null)) {
                $needs[substr($name, 0, 40)] = round((float) $need['perMinute'], 2);
            }
        }

        $power = (array) ($analysis['potential'] ?? []);
        $made = max(0, (float) ($power['made'] ?? 0));
        $used = max(0, (float) ($power['spent'] ?? 0));
        $blocks = min(65535, max(0, (int) ($analysis['blocks'] ?? 0)));

        // Stamped here rather than by each caller. Every route that takes an analysis in
        // goes through this method, so this is the one place that cannot be forgotten, and
        // a figure stored without knowing which engine produced it is a figure this site
        // has no business calling measured.
        return [
            'analysed_at' => now(),
            'engine_version' => EngineVersion::current(),
            'width' => min(4096, max(0, (int) ($analysis['width'] ?? 0))),
            'height' => min(4096, max(0, (int) ($analysis['height'] ?? 0))),
            'blocks' => $blocks,
            'power_made' => $made,
            'power_used' => $used,
            // What it makes is indexed into `schematic_items` on save rather than here, so
            // that every write path gets it and not just this one.
            'produces' => $produces,
            'needs' => $needs,
        ];
    }
}
