<?php

declare(strict_types=1);

namespace Tests\Support\Helper;

use Codeception\Module;

/** Adds grabResponseCode() to the actor (the REST module only offers assertions on the status). */
final class Http extends Module
{
    public function grabResponseCode(): int
    {
        /** @var \Codeception\Module\REST $rest */
        $rest = $this->getModule('REST');
        return $rest->client->getInternalResponse()->getStatusCode();
    }
}
