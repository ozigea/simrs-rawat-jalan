<?php

namespace app\components;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use yii\base\Component;

/**
 * RS256 JWT (K-6): this service signs with the private key; the Node service only verifies with the
 * public key.
 */
class JwtService extends Component
{
    public string $privateKeyPath = '';
    public string $publicKeyPath = '';
    public int $ttl = 3600;
    public string $issuer = 'simrs-yii';

    /** @return array{0: string, 1: int} token and expires_in (seconds) */
    public function issue(int $userId, string $username, array $roles, ?int $staffId): array
    {
        $now = time();
        $payload = [
            'iss' => $this->issuer,
            'sub' => (string) $userId,
            'username' => $username,
            'roles' => array_values($roles),
            'staff_id' => $staffId,
            'iat' => $now,
            'exp' => $now + $this->ttl,
        ];
        $key = file_get_contents($this->privateKeyPath);
        if ($key === false) {
            throw new \RuntimeException('JWT private key not readable');
        }
        return [JWT::encode($payload, $key, 'RS256'), $this->ttl];
    }

    /** Returns the claims, or null when the token is malformed, tampered with or expired. */
    public function parse(string $token): ?object
    {
        try {
            $pub = file_get_contents($this->publicKeyPath);
            JWT::$leeway = 5;
            $claims = JWT::decode($token, new Key($pub, 'RS256'));
            return ($claims->iss ?? null) === $this->issuer ? $claims : null;
        } catch (\Throwable $e) {
            return null;
        }
    }
}
