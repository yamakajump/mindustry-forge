<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One person's memo on one schematic, visible to nobody else. */
class SchematicNote extends Model
{
    protected $fillable = ['user_id', 'schematic_id', 'body'];
}
