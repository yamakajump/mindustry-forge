<?php

namespace App\Models;

use App\Services\EngineVersion;
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
    ];

    /** In the public list. Unlisted schematics are reachable and not listed. */
    public function scopeListed($query)
    {
        return $query->where('visibility', self::PUBLIC);
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
            $schematic->indexWhatItHolds();
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
    public function indexWhatItMakes(): void
    {
        $blocks = max(1, (int) $this->blocks);

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
        if ($this->powerSpare() > 0) {
            $rows[SchematicItem::POWER] = $this->powerSpare();
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
                ['rate' => $rate, 'rate_per_block' => $rate / $blocks],
            );
        }
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
        foreach ((array) ($analysis['detail'] ?? []) as $tile) {
            $name = is_array($tile) ? ($tile['name'] ?? null) : null;
            if (is_string($name) && $name !== '') {
                $key = substr($name, 0, 40);
                $counts[$key] = ($counts[$key] ?? 0) + 1;
            }
        }

        return array_map(fn ($count) => min(65535, $count), $counts);
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
