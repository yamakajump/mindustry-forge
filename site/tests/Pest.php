<?php

use Illuminate\Foundation\Testing\TestCase;

/*
 * Feature tests get the framework; unit tests do not need it and are faster without.
 */
pest()->extend(TestCase::class)->in('Feature');
