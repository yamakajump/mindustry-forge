<?php

namespace Database\Factories;

use App\Models\Schematic;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Schematic> */
class SchematicFactory extends Factory
{
    protected $model = Schematic::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'slug' => Schematic::freshSlug(),
            'name' => 'Schematique '.fake()->word(),
            'code' => 'bXNjaAF4nD'.fake()->lexify('??????'),
            'public' => false,
            'blocks' => fake()->numberBetween(4, 200),
        ];
    }
}
