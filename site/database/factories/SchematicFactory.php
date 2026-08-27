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
            'visibility' => 'private',
            'blocks' => fake()->numberBetween(4, 200),
        ];
    }

    /**
     * One collected from somewhere else, which is what most of this catalogue will be.
     *
     * No `user_id`: that is the whole point, and it is the case the tests have to keep
     * exercising, because a null owner is what made a private schematic readable by
     * signed-out visitors once already.
     */
    public function imported(string $source = Schematic::MINDUSTRY_TOOL): static
    {
        return $this->state(fn () => [
            'user_id' => null,
            'source' => $source,
            'source_id' => fake()->uuid(),
            'author' => fake()->userName(),
            'fetched_at' => now(),
        ]);
    }
}
