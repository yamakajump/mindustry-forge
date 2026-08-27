<?php

use App\Services\EngineVersion;

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
it('couvre tous les fichiers du moteur', function () {
    $reflected = new ReflectionClass(EngineVersion::class);
    $listed = $reflected->getConstant('SOURCES');

    $dir = public_path('forge/engine');
    $found = collect(scandir($dir))
        ->filter(fn ($name) => str_ends_with($name, '.js'))
        ->map(fn ($name) => "engine/{$name}")
        ->values()
        ->all();

    expect($found)->not->toBeEmpty();
    expect(array_diff($found, $listed))->toBe([], 'un fichier du moteur manque a EngineVersion::SOURCES');
});

it('change quand une source change', function () {
    $before = EngineVersion::current();

    $path = public_path('forge/engine/core.js');
    $kept = file_get_contents($path);
    try {
        file_put_contents($path, $kept."\n// touche par un test\n");
        cache()->flush();
        expect(EngineVersion::current())->not->toBe($before);
    } finally {
        file_put_contents($path, $kept);
        cache()->flush();
    }

    expect(EngineVersion::current())->toBe($before);
});
