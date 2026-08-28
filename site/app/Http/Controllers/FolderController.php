<?php

namespace App\Http\Controllers;

use App\Models\Folder;
use App\Models\FolderLike;
use App\Models\Schematic;
use App\Services\BlockCatalogue;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

/**
 * Making a folder, changing it, and getting rid of it without taking a subtree along.
 */
class FolderController extends Controller
{
    /** How a gallery can be ordered. Literals, like `BrowseController::ORDERS`. */
    private const ORDERS = [
        'new' => 'Les plus récents',
        'garnis' => 'Les mieux garnis',
        'aimes' => 'Les plus aimés',
    ];

    /** La taille d'une page, et donc le seuil : voir `index()`. */
    private const PER_PAGE = 24;

    /**
     * The public folders, and the two thresholds that keep the page honest.
     *
     * The ordering waits for a page's worth of liked folders, derived from the page size
     * rather than written as a number so that changing one cannot leave a true-looking
     * sentence beside a stale threshold. There will be forty public folders in the first
     * month against fifteen thousand schematics: a ranking over forty rows all tied on zero
     * is not a smaller version of the catalogue's problem, it is the same problem where the
     * top of the page is the whole page.
     */
    public function index(Request $request): View
    {
        $public = Folder::query()->where('visibility', Schematic::PUBLIC);

        $ranked = (clone $public)->where('likes', '>', 0)->count() >= self::PER_PAGE;

        $orders = self::ORDERS;
        if (! $ranked) {
            unset($orders['aimes']);
        }

        $order = array_key_exists($request->query('tri'), $orders) ? $request->query('tri') : 'new';

        $public = match ($order) {
            'garnis' => $public->withCount('schematics')->orderByDesc('schematics_count'),
            'aimes' => $public->orderByDesc('likes'),
            default => $public->orderByDesc('created_at'),
        };

        return view('folders.index', [
            /* Un dernier depart, pour que l'ordre soit total : des milliers de dossiers
               seront a zero schema ou a un j'aime, et deux lignes egales reviennent dans
               l'ordre qui arrange la base, qui n'a aucune raison de choisir le meme deux
               fois. Sans ca, une page montre un dossier deux fois et un autre jamais. */
            'folders' => $public->withCount(['schematics', 'children'])
                ->with('user')->orderByDesc('id')
                ->paginate(self::PER_PAGE)->withQueryString(),
            'orders' => $orders,
            'order' => $order,
        ]);
    }

    public function mine(Request $request): View
    {
        return view('folders.mine', [
            'folders' => Folder::query()
                ->where('user_id', $request->user()->id)
                ->whereNull('parent_id')
                ->withCount(['children', 'schematics'])
                ->orderBy('name')
                ->paginate(24),
            /* Les icones offertes plutot que tapees : la personne choisit un nom qui
               existe au lieu d'en deviner l'orthographe, exactement comme la vitrine offre
               ses objets et ses blocs. Les objets seulement, pas les quatre cents blocs :
               une liste deroulante que personne ne fait defiler au-dela du premier ecran
               est une liste qui n'aide pas. */
            'icons' => array_keys(BlockCatalogue::items()),
        ]);
    }

    /**
     * One folder, to whoever is allowed to see it.
     *
     * The hard case is not the private folder, it is the public one holding schematics the
     * visitor cannot see: listing them leaks names and figures, hiding them silently makes
     * a folder of twelve read as a folder of four with no explanation. So they are withheld
     * and counted, and the owner is told separately, or they never learn that the folder
     * they shared is half invisible.
     */
    public function show(Request $request, Folder $folder): View
    {
        $mine = $request->user()?->id === $folder->user_id;
        abort_if($folder->visibility === Schematic::PRIVATE && ! $mine, 404);

        /* Counted on this folder's own contents and before the exclusion, never as the
           difference of two totals: a difference is two passes over the same set, and the
           figure has to be this folder's rather than the catalogue's. */
        $withheld = $folder->schematics()
            ->whereNot(fn ($q) => $q->listed())
            ->count();

        return view('folders.show', [
            'folder' => $folder,
            'mine' => $mine,
            'ancestors' => array_reverse($folder->ancestors()),
            'children' => $folder->children()
                ->when(! $mine, fn ($q) => $q->where('visibility', Schematic::PUBLIC))
                ->withCount(['children', 'schematics'])
                ->orderBy('name')->get(),
            'schematics' => $folder->schematics()->listed()
                ->with(['user', 'items'])
                ->orderByDesc('folder_items.created_at')
                ->paginate(24),
            'withheld' => $withheld,
            'aime' => $request->user() !== null && FolderLike::where('user_id', $request->user()->id)
                ->where('folder_id', $folder->id)->exists(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $fields = $this->validated($request);
        $parent = $this->parentFrom($request, null);

        $folder = Folder::create($fields + [
            'user_id' => $request->user()->id,
            'parent_id' => $parent?->id,
        ]);

        return response()->json([
            'slug' => $folder->slug,
            'url' => url("/d/{$folder->slug}"),
        ], 201);
    }

    public function update(Request $request, Folder $folder): JsonResponse
    {
        $this->owned($request, $folder);

        $fields = $this->validated($request);

        if ($request->has('parent')) {
            $fields['parent_id'] = $this->parentFrom($request, $folder)?->id;
        }

        $folder->update($fields);

        return response()->json(['slug' => $folder->slug]);
    }

    public function destroy(Request $request, Folder $folder): JsonResponse
    {
        $this->owned($request, $folder);

        /* The children move up rather than down with it. Written here rather than left to
           the foreign key's nullOnDelete, because "promoted to the parent" and "promoted to
           the root" are different outcomes and only one of them is what somebody deleting a
           middle folder expects. */
        $folder->children()->update(['parent_id' => $folder->parent_id]);
        $folder->delete();

        return response()->json(['supprime' => true]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['sometimes', 'string', 'max:80'],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'visibility' => ['sometimes', Rule::in(Schematic::VISIBILITIES)],
            /* Checked against what actually draws it rather than trusted: a name nothing
               can render would validate here and 404 on the page. */
            'icon' => ['sometimes', 'nullable', 'string', function ($attribute, $value, $fail) {
                if ($value !== null && ! IconController::draws($value)) {
                    $fail(__('dossiers.erreur.icone-inconnue'));
                }
            }],
        ]);
    }

    private function parentFrom(Request $request, ?Folder $moving): ?Folder
    {
        $slug = $request->input('parent');
        if ($slug === null || $slug === '') {
            return null;
        }

        $parent = Folder::where('slug', $slug)
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        if ($moving !== null && $moving->wouldCycle($parent)) {
            throw ValidationException::withMessages([
                'parent' => __('dossiers.erreur.boucle'),
            ]);
        }

        if ($parent->depth() >= Folder::MAX_DEPTH) {
            throw ValidationException::withMessages([
                'parent' => __('dossiers.erreur.trop-profond', ['max' => Folder::MAX_DEPTH]),
            ]);
        }

        return $parent;
    }

    private function owned(Request $request, Folder $folder): void
    {
        abort_unless($folder->user_id === $request->user()->id, 403);
    }
}
