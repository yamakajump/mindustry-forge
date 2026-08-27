<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Schematic;
use Illuminate\Support\Facades\DB;

function chrono(string $label, callable $fn): void {
    $t = microtime(true);
    $out = $fn();
    printf("%-46s %8s ms  %s\n", $label, round((microtime(true) - $t) * 1000, 1), $out);
}

foreach ([1, 100, 560] as $page) {
    chrono("tri best, page {$page}", function () use ($page) {
        return count(Schematic::query()->with('user')->listed()->orderByRaw(
            '(power_made - power_used) / CASE WHEN blocks = 0 THEN 1 ELSE blocks END DESC'
        )->orderByDesc('power_made')->paginate(24, ['*'], 'page', $page)->items()).' tuiles';
    });
    chrono("tri indexe (blocks), page {$page}", function () use ($page) {
        return count(Schematic::query()->with('user')->listed()
            ->orderBy('blocks')->paginate(24, ['*'], 'page', $page)->items()).' tuiles';
    });
}

echo "\n-- plan du tri best --\n";
foreach (DB::select("explain query plan select * from schematics where visibility = 'public'
    order by (power_made - power_used) / (case when blocks = 0 then 1 else blocks end) desc limit 24") as $r) {
    echo '   '.$r->detail."\n";
}
echo "\n-- plan du filtre par item --\n";
foreach (DB::select("explain query plan select count(*) from schematics
    where visibility = 'public' and json_extract(produces, '$.\"graphite\"') is not null") as $r) {
    echo '   '.$r->detail."\n";
}
