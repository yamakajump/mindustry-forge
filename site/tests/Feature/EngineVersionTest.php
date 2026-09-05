<?php

use App\Services\EngineVersion;

/** A relative import, as a path under `public/forge`, with `.` and `..` folded away. */
function resolveImport(string $directory, string $relative): string
{
    $parts = [];
    foreach (explode('/', ($directory === '.' ? '' : $directory.'/').$relative) as $part) {
        if ($part === '..') {
            array_pop($parts);
        } elseif ($part !== '' && $part !== '.') {
            $parts[] = $part;
        }
    }

    return implode('/', $parts);
}

/**
 * The engine version has to cover the whole engine.
 *
 * This is the silent failure the class exists to prevent, and it happened: four engine
 * files were added over four commits and none of them reached the list, so the version
 * stayed put while the answers changed. Fifteen thousand stored figures would have read as
 * current and none of them would have been.
 *
 * Checked against the directory rather than against a second list, because a second list
 * goes stale the same way the first one did.
 */
it('covers every file of the engine', function () {
    $reflected = new ReflectionClass(EngineVersion::class);
    $listed = $reflected->getConstant('SOURCES');

    $dir = public_path('forge/engine');
    $found = collect(scandir($dir))
        ->filter(fn ($name) => str_ends_with($name, '.js'))
        ->map(fn ($name) => "engine/{$name}")
        ->values()
        ->all();

    expect($found)->not->toBeEmpty();
    expect(array_diff($found, $listed))->toBe([], 'an engine file is missing from EngineVersion::SOURCES');
});

/**
 * Everything the analysis can reach, and not everything that sits in one directory.
 *
 * Scanning `engine/` caught the four files that were added there and forgotten, and missed
 * `geometry.js`, which is not in that directory and decides where every block sits: the
 * mass driver measures its range through it. It was outside the list, so a correction to
 * that formula would have changed every stored answer without ageing one of them.
 *
 * Walking the imports is the only version of this check that cannot go stale: a file that
 * the entry point can reach is a file whose contents decide an answer, whatever directory
 * it happens to live in.
 */
it('covers everything the analysis imports', function () {
    $reflected = new ReflectionClass(EngineVersion::class);
    $listed = $reflected->getConstant('SOURCES');

    $root = public_path('forge');
    $seen = [];
    $queue = ['bilan.js'];

    while ($queue !== []) {
        $file = array_shift($queue);
        if (isset($seen[$file])) {
            continue;
        }
        $seen[$file] = true;

        $path = $root.DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $file);
        expect(is_file($path))->toBeTrue("{$file} is imported and does not exist");

        preg_match_all('/\bfrom\s+"(\.[^"]+)"/', (string) file_get_contents($path), $matches);
        foreach ($matches[1] as $relative) {
            // Resolved against the importing file's own directory: `engine/carriers.js`
            // says `./core.js` and means `engine/core.js`, not `core.js`.
            $queue[] = resolveImport(dirname($file), $relative);
        }
    }

    $reached = array_keys($seen);
    expect(count($reached))->toBeGreaterThan(10);
    expect(array_diff($reached, $listed))->toBe([],
        'a file the analysis imports is missing from EngineVersion::SOURCES');
});

it('changes when a source changes', function () {
    $before = EngineVersion::current();

    $path = public_path('forge/engine/core.js');
    $kept = file_get_contents($path);
    try {
        file_put_contents($path, $kept."\n// touched by a test\n");
        cache()->flush();
        expect(EngineVersion::current())->not->toBe($before);
    } finally {
        file_put_contents($path, $kept);
        cache()->flush();
    }

    expect(EngineVersion::current())->toBe($before);
});

/**
 * The stamp has to cover the pass as well as the engine.
 *
 * A field the analysis computes and the ingestion pass drops is a field nobody has, and
 * for a whole evening that was true of the item ceiling: `potentialPerMinute` reached no
 * column, the version did not move because only `public/forge` was hashed, and fifteen
 * thousand rows read as current while two per cent of them carried the figure the site
 * sells. Editing the pass has to age the catalogue, or the next omission hides the same
 * way.
 */
it('changes when the sieve of the ingestion pass changes', function () {
    $before = EngineVersion::current();

    $path = dirname(base_path()).DIRECTORY_SEPARATOR.'tools'.DIRECTORY_SEPARATOR.'ingest.mjs';
    expect(is_file($path))->toBeTrue('tools/ingest.mjs not found');

    $kept = file_get_contents($path);
    try {
        file_put_contents($path, $kept.'
// touched by a test
');
        cache()->flush();
        expect(EngineVersion::current())->not->toBe($before);
    } finally {
        file_put_contents($path, $kept);
        cache()->flush();
    }

    expect(EngineVersion::current())->toBe($before);
});
