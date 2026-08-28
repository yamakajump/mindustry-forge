<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One person saying once that one folder is a good folder. */
class FolderLike extends Model
{
    public $timestamps = false;

    protected $fillable = ['user_id', 'folder_id', 'created_at'];
}
