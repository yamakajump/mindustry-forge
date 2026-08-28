<?php

namespace Database\Factories;

use App\Models\Space;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Space> */
class SpaceFactory extends Factory
{
    protected $model = Space::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'name' => 'Espace '.fake()->word(),
            'board' => ['tiles' => [], 'ground' => []],
            'opened_at' => now(),
        ];
    }
}
