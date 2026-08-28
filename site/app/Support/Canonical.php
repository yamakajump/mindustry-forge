<?php

namespace App\Support;

use Illuminate\Http\Request;

/**
 * The one address a page wants to be known by.
 *
 * `/schemas` accepts sixteen query parameters and answers 200 to every combination of them,
 * so the same twenty-four tiles are reachable at a practically unbounded number of
 * addresses. Left alone, a crawler spends itself on those instead of the roughly four
 * thousand schematic pages that are the point of the site, and every one of them competes
 * with the others for the same words.
 *
 * The rule is a short allowlist rather than a blocklist. A parameter added later is
 * therefore invisible to search until somebody decides it names a different set of
 * schematics, which is the safe direction to be wrong in: a missing canonical variant costs
 * one page, a canonical that silently keeps a new ordering parameter costs the whole
 * listing again.
 */
class Canonical
{
    /**
     * Parameters that change which schematics a listing holds, in the order they are written.
     *
     * Fixed order on purpose: `?produit=graphite&planete=serpulo` and
     * `?planete=serpulo&produit=graphite` are the same page, and a canonical that echoed the
     * order it was given would declare them two.
     */
    private const KEPT = ['produit', 'consomme', 'bloc', 'planete', 'creatif', 'verifie',
        'autonome', 'large', 'haut', 'min', 'blocs', 'page'];

    /**
     * What is deliberately dropped, and why each one.
     *
     * `tri` reorders a set it does not change. `comparer` holds one schematic aside and is
     * interface state. `miens`, `favoris` and `aimes` need a signed-in reader, and a crawler
     * never is one, so those addresses serve the plain listing and should say so.
     */
    public static function of(Request $request): string
    {
        $kept = [];

        foreach (self::KEPT as $name) {
            $value = $request->query($name);

            if ($value === null || $value === '' || is_array($value)) {
                continue;
            }
            if ($name === 'page' && (string) $value === '1') {
                continue;
            }

            $kept[$name] = (string) $value;
        }

        $base = $request->url();

        return $kept === [] ? $base : $base.'?'.http_build_query($kept);
    }
}
