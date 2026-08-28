<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One schematic one person wants to find again. */
class Favorite extends Model
{
    public $timestamps = false;

    protected $fillable = ['user_id', 'schematic_id', 'created_at'];
}
