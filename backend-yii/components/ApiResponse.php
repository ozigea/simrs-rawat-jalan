<?php

namespace app\components;

use Yii;

/**
 * Uniform response envelope shared with the Node service (see docs: format respons).
 */
class ApiResponse
{
    private static ?string $requestId = null;

    public static function requestId(): string
    {
        if (self::$requestId === null) {
            $incoming = Yii::$app->has('request') && Yii::$app->request instanceof \yii\web\Request
                ? Yii::$app->request->headers->get('X-Request-Id')
                : null;
            self::$requestId = ($incoming !== null && preg_match('/^[A-Za-z0-9._-]{1,64}$/', $incoming))
                ? $incoming
                : bin2hex(random_bytes(8));
        }
        return self::$requestId;
    }

    public static function success($data = null, ?array $meta = null): array
    {
        return [
            'success' => true,
            'data' => $data,
            'meta' => $meta,
            'error' => null,
            'request_id' => self::requestId(),
        ];
    }

    public static function error(string $code, string $message, array $details = []): array
    {
        return [
            'success' => false,
            'data' => null,
            'meta' => null,
            'error' => ['code' => $code, 'message' => $message, 'details' => $details],
            'request_id' => self::requestId(),
        ];
    }
}
