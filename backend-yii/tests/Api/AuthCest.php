<?php

declare(strict_types=1);

namespace Tests\Api;

use Codeception\Attribute\DataProvider;
use Codeception\Example;
use Tests\Support\ApiTester;
use Tests\Support\Flow;

/** TC-01, TC-02, TC-22 (Yii side): authentication, role enforcement, uniform error envelope (R-27, C-4). */
final class AuthCest
{
    public function loginWithValidCredentials(ApiTester $I): void
    {
        [$status, $d] = (new Flow($I))->call('POST', '/auth/login', null, ['username' => 'kasir', 'password' => 'Simrs#2026']);
        $I->assertSame(200, $status);
        $I->assertTrue($d['success']);
        $I->assertNotEmpty($d['data']['access_token']);
        $I->assertContains('kasir', $d['data']['user']['roles']);
        $I->assertNotEmpty($d['request_id']);
    }

    public function loginWithWrongPasswordIs401InUniformFormat(ApiTester $I): void
    {
        [$status, $d] = (new Flow($I))->call('POST', '/auth/login', null, ['username' => 'kasir', 'password' => 'salah']);
        $I->assertSame(401, $status);
        $I->assertFalse($d['success']);
        $I->assertNull($d['data']);
        $I->assertArrayHasKey('code', $d['error']);
        $I->assertArrayHasKey('message', $d['error']);
        $I->assertNotEmpty($d['request_id']);
    }

    public function requestWithoutTokenIs401(ApiTester $I): void
    {
        [$status, $d] = (new Flow($I))->call('GET', '/patients');
        $I->assertSame(401, $status);
        $I->assertSame('UNAUTHORIZED', $d['error']['code']);
    }

    public function tamperedTokenIs401(ApiTester $I): void
    {
        $f = new Flow($I);
        $token = $f->token('admin');
        [$status] = $f->call('GET', '/auth/me', substr($token, 0, -3) . 'abc');
        $I->assertSame(401, $status);
    }

    public function unknownRouteIs404InUniformFormat(ApiTester $I): void
    {
        [$status, $d] = (new Flow($I))->call('GET', '/nope', (new Flow($I))->token('admin'));
        $I->assertSame(404, $status);
        $I->assertFalse($d['success']);
    }

    /** One forbidden endpoint per role (plan section 8). */
    #[DataProvider('forbidden')]
    public function roleCannotReachForbiddenEndpoint(ApiTester $I, Example $e): void
    {
        $f = new Flow($I);
        [$status, $d] = $f->call($e['method'], $e['path'], $f->token($e['user']), $e['method'] === 'GET' ? null : ($e['body'] ?? []));
        $I->assertSame(403, $status, "{$e['user']} {$e['method']} {$e['path']}");
        $I->assertSame('FORBIDDEN', $d['error']['code']);
    }

    protected function forbidden(): array
    {
        return [
            ['user' => 'kasir', 'method' => 'GET', 'path' => '/prescriptions'],
            ['user' => 'kasir', 'method' => 'POST', 'path' => '/patients', 'body' => ['name' => 'x']],
            ['user' => 'dokter1', 'method' => 'GET', 'path' => '/invoices'],
            ['user' => 'dokter1', 'method' => 'POST', 'path' => '/patients', 'body' => ['name' => 'x']],
            ['user' => 'farmasi', 'method' => 'GET', 'path' => '/invoices'],
            ['user' => 'lab', 'method' => 'GET', 'path' => '/prescriptions'],
            ['user' => 'pendaftaran', 'method' => 'GET', 'path' => '/payments'],
            ['user' => 'pendaftaran', 'method' => 'GET', 'path' => '/users'],
            ['user' => 'admin', 'method' => 'POST', 'path' => '/visits/1/invoice'],
        ];
    }
}
