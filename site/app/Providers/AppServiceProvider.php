<?php

namespace App\Providers;

use Illuminate\Pagination\Paginator;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        /* Laravel's own pagination view is written for Tailwind and this site has no
           Tailwind, so every class it sets falls flat. Its chevron, deprived of the
           `w-5 h-5` meant to constrain it, drew at the width of the page, and its
           `pagination.previous` key rendered as itself for want of a translation. Named
           here rather than published under `vendor/`, so there is one file to be wrong. */
        Paginator::defaultView('partials.pages');
        Paginator::defaultSimpleView('partials.pages');
    }
}
