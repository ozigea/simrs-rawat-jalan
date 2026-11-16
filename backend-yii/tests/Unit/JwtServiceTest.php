<?php

declare(strict_types=1);

namespace Tests\Unit;

use app\components\JwtService;
use Codeception\Test\Unit;
use Firebase\JWT\JWT;

/** K-6: Yii signs RS256; a token is only accepted when signature, issuer and expiry are valid. */
final class JwtServiceTest extends Unit
{
    private string $dir;
    private string $otherPrivate;

    protected function _before(): void
    {
        $this->dir = sys_get_temp_dir() . '/jwt-' . bin2hex(random_bytes(4));
        mkdir($this->dir);
        [$priv, $pub] = self::keyPair();
        file_put_contents("{$this->dir}/private.pem", $priv);
        file_put_contents("{$this->dir}/public.pem", $pub);
        $this->otherPrivate = self::keyPair()[0];
    }

    protected function _after(): void
    {
        array_map('unlink', glob("{$this->dir}/*"));
        rmdir($this->dir);
    }

    private static function keyPair(): array
    {
        $res = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        openssl_pkey_export($res, $private);
        return [$private, openssl_pkey_get_details($res)['key']];
    }

    private function service(int $ttl = 3600): JwtService
    {
        return new JwtService(['privateKeyPath' => "{$this->dir}/private.pem", 'publicKeyPath' => "{$this->dir}/public.pem", 'ttl' => $ttl]);
    }

    public function testIssuedTokenCarriesIdentityAndRoles(): void
    {
        [$token, $expiresIn] = $this->service()->issue(7, 'kasir', ['kasir'], null);
        $claims = $this->service()->parse($token);
        $this->assertSame(3600, $expiresIn);
        $this->assertSame('7', $claims->sub);
        $this->assertSame('kasir', $claims->username);
        $this->assertSame(['kasir'], $claims->roles);
        $this->assertNull($claims->staff_id);
        $this->assertSame('simrs-yii', $claims->iss);
    }

    public function testTamperedPayloadIsRejected(): void
    {
        [$token] = $this->service()->issue(7, 'kasir', ['kasir'], null);
        [$h, $p, $s] = explode('.', $token);
        $payload = json_decode(base64_decode(strtr($p, '-_', '+/')), true);
        $payload['roles'] = ['admin'];
        $forged = $h . '.' . rtrim(strtr(base64_encode(json_encode($payload)), '+/', '-_'), '=') . '.' . $s;
        $this->assertNull($this->service()->parse($forged));
    }

    public function testTokenSignedByAnotherKeyIsRejected(): void
    {
        $forged = JWT::encode(['iss' => 'simrs-yii', 'sub' => '1', 'exp' => time() + 60], $this->otherPrivate, 'RS256');
        $this->assertNull($this->service()->parse($forged));
    }

    public function testExpiredTokenIsRejected(): void
    {
        [$token] = $this->service(-60)->issue(1, 'admin', ['admin'], null);
        $this->assertNull($this->service()->parse($token));
    }

    public function testForeignIssuerIsRejected(): void
    {
        $token = JWT::encode(['iss' => 'someone-else', 'sub' => '1', 'exp' => time() + 60], file_get_contents("{$this->dir}/private.pem"), 'RS256');
        $this->assertNull($this->service()->parse($token));
    }

    public function testGarbageIsRejectedWithoutException(): void
    {
        foreach (['', 'abc', 'a.b.c', 'eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.'] as $bad) {
            $this->assertNull($this->service()->parse($bad), "token: '$bad'");
        }
    }
}
