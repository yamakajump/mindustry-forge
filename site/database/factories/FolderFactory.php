<?php

namespace Database\Factories;

use App\Models\Folder;
use App\Models\Schematic;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Folder> */
class FolderFactory extends Factory
{
    protected $model = Folder::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'name' => 'Dossier '.fake()->word(),
            'parent_id' => null,
            'visibility' => Schematic::PRIVATE,
        ];
    }
}
