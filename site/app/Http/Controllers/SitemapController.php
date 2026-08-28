<?php

namespace App\Http\Controllers;

use App\Models\Folder;
use App\Models\Schematic;
use App\Services\BlockCatalogue;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;

/**
 * The list of addresses this site would like a search engine to know about.
 *
 * Without it, the only way to reach a schematic page is to walk every page of `/schemas`
 * and follow each tile, which is the slowest path a crawler has and the first one it gives
 * up on. There are roughly five thousand pages here and no other way in.
 *
 * Neither `priority` nor `changefreq` is written. Google states it ignores both, and a
 * field nobody reads is a field that can only be wrong: a page marked `daily` that changes
 * twice a year teaches a crawler to trust the file less, not more.
 *
 * `lastmod` is written only where the row carries a real date. A block page has no date of
 * its own, since it is rendered from a catalogue whose version is not a timestamp, so those
 * entries carry no `lastmod` rather than an invented one.
 */
class SitemapController extends Controller
{
    /**
     * How long the built file is kept.
     *
     * The queries behind it are two counts and two column reads, so the cost is not the
     * reason. The reason is that a crawler asking for it does so in bursts, and a burst
     * should not be four thousand rows serialised four thousand times.
     */
    private const KEPT = 3600;

    /** The pages that exist whatever the database holds. */
    private const FIXED = ['/', '/schemas', '/blocs', '/comparer', '/dossiers',
        '/outils/planificateur', '/outils/logique'];

    public function show(): Response
    {
        $xml = Cache::remember('sitemap', self::KEPT, fn () => $this->build());

        return response($xml, 200, [
            'Content-Type' => 'application/xml; charset=UTF-8',
            'Cache-Control' => 'public, max-age='.self::KEPT,
        ]);
    }

    private function build(): string
    {
        $lines = ['<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];

        foreach (self::FIXED as $path) {
            $lines[] = $this->entry(url($path));
        }

        /* Only `listed()`. It is the scope every page that shows a schematic to somebody who
           did not ask for it by name already goes through, so a sitemap built on anything
           else would offer a crawler a page the site itself declines to show. */
        Schematic::listed()
            ->select('slug', 'updated_at')
            ->orderBy('id')
            ->chunk(500, function ($schematics) use (&$lines) {
                foreach ($schematics as $schematic) {
                    $lines[] = $this->entry(url('/s/'.$schematic->slug), $schematic->updated_at);
                }
            });

        foreach (array_keys(BlockCatalogue::all()) as $name) {
            $lines[] = $this->entry(url('/blocs/'.$name));
        }

        Folder::query()
            ->where('visibility', Schematic::PUBLIC)
            ->select('slug', 'updated_at')
            ->orderBy('id')
            ->chunk(500, function ($folders) use (&$lines) {
                foreach ($folders as $folder) {
                    $lines[] = $this->entry(url('/d/'.$folder->slug), $folder->updated_at);
                }
            });

        $lines[] = '</urlset>';

        return implode("\n", $lines)."\n";
    }

    /** One `<url>`, with a `lastmod` only when there is a real date to write. */
    private function entry(string $location, $changed = null): string
    {
        $entry = '  <url><loc>'.htmlspecialchars($location, ENT_XML1).'</loc>';

        if ($changed !== null) {
            $entry .= '<lastmod>'.$changed->toAtomString().'</lastmod>';
        }

        return $entry.'</url>';
    }
}
