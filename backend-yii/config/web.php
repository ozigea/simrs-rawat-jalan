<?php

$env = static fn (string $key, string $default = '') => getenv($key) !== false ? getenv($key) : $default;

return [
    'id' => 'simrs-api',
    'name' => 'SIMRS Rawat Jalan API',
    'basePath' => dirname(__DIR__),
    'runtimePath' => $env('APP_RUNTIME_PATH', dirname(__DIR__) . '/runtime'),
    'timeZone' => $env('APP_TIMEZONE', 'UTC'),
    'language' => 'id',
    'bootstrap' => ['log'],
    'modules' => [
        'api' => ['class' => 'app\modules\api\Module'],
    ],
    'components' => [
        'request' => [
            'enableCsrfValidation' => false,
            'enableCookieValidation' => false,
            'parsers' => ['application/json' => 'yii\web\JsonParser'],
        ],
        'response' => [
            'format' => yii\web\Response::FORMAT_JSON,
        ],
        'urlManager' => [
            'enablePrettyUrl' => true,
            'showScriptName' => false,
            'enableStrictParsing' => true, // only the routes declared below exist
            'rules' => require __DIR__ . '/routes.php',
        ],
        'user' => [
            'identityClass' => 'app\models\AppUser',
            'enableSession' => false,
            'enableAutoLogin' => false,
            'loginUrl' => null,
        ],
        'authManager' => ['class' => 'yii\rbac\DbManager'],
        'jwt' => [
            'class' => 'app\components\JwtService',
            'privateKeyPath' => $env('JWT_PRIVATE_KEY_PATH'),
            'publicKeyPath' => $env('JWT_PUBLIC_KEY_PATH'),
            'ttl' => (int) $env('JWT_TTL_SECONDS', '3600'),
        ],
        'errorHandler' => ['class' => 'app\components\ApiErrorHandler'],
        'db' => require __DIR__ . '/db.php',
        'log' => [
            'targets' => [
                [
                    'class' => 'yii\log\FileTarget',
                    'levels' => ['error', 'warning'],
                ],
            ],
        ],
    ],
];
