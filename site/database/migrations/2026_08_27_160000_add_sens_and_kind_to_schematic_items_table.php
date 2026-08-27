<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Deux axes que la table ne savait pas dire, posés d'un coup.
 *
 * `schematic_items` a été écrite pour une seule question : combien cette schématique
 * produit-elle de cet objet, mesuré. Trois chantiers arrivent dessus en même temps et
 * chacun a besoin d'une distinction que la table ne porte pas.
 *
 * Le premier veut chercher par ce dont un joueur dispose, « j'ai du charbon, montre ce que
 * je peux faire tourner », donc il faut savoir si une ligne dit ce qui sort ou ce qui
 * entre. Le second veut indexer le débit d'un schéma que personne n'a marqué à la main,
 * qui est un plafond et non une mesure : les quinze mille entrées du catalogue arrivent
 * sans marquage, et le moteur refuse de deviner où elles se branchent, à juste titre.
 *
 * Les deux axes sont indépendants : un plafond de consommation se conçoit très bien. Ce
 * n'est donc pas un choix entre deux colonnes, ce sont deux colonnes, et il vaut mieux les
 * poser en un passage que de repasser sur une table qui portera quinze mille lignes fois
 * le nombre d'objets. Les défauts reconduisent exactement ce que les lignes existantes
 * disaient déjà, donc rien ne bouge pour elles.
 *
 * `kind` porte la règle de la journée : ce qui n'est pas mesuré ne doit jamais s'afficher
 * comme s'il l'était. Une colonne plutôt qu'une convention, parce qu'une convention se perd
 * et qu'un classement qui mélange un plafond et une mesure ment sans que rien ne le dise.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('schematic_items', function (Blueprint $table) {
            // Ce qui sort, ou ce qui doit entrer.
            $table->string('sens', 8)->default('produit')->after('item');

            // Un débit constaté, ou ce que la schématique ferait alimentée à fond.
            $table->string('kind', 8)->default('mesure')->after('sens');
        });

        Schema::table('schematic_items', function (Blueprint $table) {
            // La même chose peut désormais être dite quatre fois d'une schématique : ce
            // qu'elle produit et ce qu'elle consomme, mesuré et au mieux.
            $table->dropUnique(['schematic_id', 'item']);
            $table->unique(['schematic_id', 'item', 'sens', 'kind']);

            // Les deux tris du listing, une fois l'objet choisi. Les trois colonnes de
            // filtre passent devant celle de tri, sinon l'index ne sert que la moitié de
            // la requête et la base retrie derrière.
            $table->dropIndex(['item', 'rate_per_block']);
            $table->dropIndex(['item', 'rate']);
            $table->index(['item', 'sens', 'kind', 'rate_per_block']);
            $table->index(['item', 'sens', 'kind', 'rate']);
        });
    }

    public function down(): void
    {
        Schema::table('schematic_items', function (Blueprint $table) {
            $table->dropIndex(['item', 'sens', 'kind', 'rate_per_block']);
            $table->dropIndex(['item', 'sens', 'kind', 'rate']);
            $table->dropUnique(['schematic_id', 'item', 'sens', 'kind']);
        });

        // Sous l'ancienne forme une schématique ne peut avoir qu'une ligne par objet.
        // Celles qui disent autre chose que le débit produit et mesuré n'y ont pas de
        // place : les garder ferait échouer la contrainte, et en choisir une au hasard
        // serait pire.
        DB::table('schematic_items')
            ->where('sens', '!=', 'produit')
            ->orWhere('kind', '!=', 'mesure')
            ->delete();

        Schema::table('schematic_items', function (Blueprint $table) {
            $table->dropColumn(['sens', 'kind']);
            $table->unique(['schematic_id', 'item']);
            $table->index(['item', 'rate_per_block']);
            $table->index(['item', 'rate']);
        });
    }
};
