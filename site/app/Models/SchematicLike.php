<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One person saying once that one schematic is good.
 *
 * No `updated_at`: there is nothing to update. A like exists or it does not, and changing
 * one's mind deletes the row rather than editing it.
 */
class SchematicLike extends Model
{
    public $timestamps = false;

    protected $fillable = ['user_id', 'schematic_id', 'created_at'];
}
