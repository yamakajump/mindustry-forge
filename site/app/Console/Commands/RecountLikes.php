<?php

namespace App\Console\Commands;

use App\Models\Folder;
use App\Models\FolderLike;
use App\Models\Schematic;
use App\Models\SchematicLike;
use Illuminate\Console\Command;

/**
 * The price of the denormalised counter, paid in one command.
 *
 * A cache of a count drifts: a crash between the insert and the increment, a row removed by
 * hand, a restored backup. This recomputes every counter from the table that holds the
 * truth, and says how many were wrong rather than repairing in silence. A repair nobody can
 * see is a repair nobody can tell happened.
 */
class RecountLikes extends Command
{
    protected $signature = 'forge:recount-likes';

    protected $description = 'Recompute every like counter from the join table';

    public function handle(): int
    {
        /* One grouped read rather than a count per schematic. Only liked schematics appear
           here, so a counter whose rows have all gone reads as absent and is repaired to
           zero, which is the case a per-row count would have skipped entirely. */
        $counts = SchematicLike::query()
            ->selectRaw('schematic_id, count(*) as n')
            ->groupBy('schematic_id')
            ->pluck('n', 'schematic_id');

        $repaired = 0;

        Schematic::query()->select(['id', 'likes'])->chunkById(500, function ($rows) use ($counts, &$repaired) {
            foreach ($rows as $row) {
                $true = (int) ($counts[$row->id] ?? 0);

                if ($true !== (int) $row->likes) {
                    Schematic::whereKey($row->id)->update(['likes' => $true]);
                    $repaired++;
                }
            }
        });

        $this->info("{$repaired} schematic counters repaired.");

        /* A second pass rather than a second command: two commands doing the same repair
           on two tables is a command somebody forgets to run. The two figures are reported
           separately, because a total mixing two tables would not say where the drift is. */
        $folderCounts = FolderLike::query()
            ->selectRaw('folder_id, count(*) as n')
            ->groupBy('folder_id')
            ->pluck('n', 'folder_id');

        $folders = 0;
        Folder::query()->select(['id', 'likes'])->chunkById(500, function ($rows) use ($folderCounts, &$folders) {
            foreach ($rows as $row) {
                $true = (int) ($folderCounts[$row->id] ?? 0);

                if ($true !== (int) $row->likes) {
                    Folder::whereKey($row->id)->update(['likes' => $true]);
                    $folders++;
                }
            }
        });

        $this->info("{$folders} folder counters repaired.");

        return self::SUCCESS;
    }
}
