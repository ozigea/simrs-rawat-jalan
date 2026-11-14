<?php

$env = static fn (string $key, string $default = '') => getenv($key) !== false ? getenv($key) : $default;

return [
    'id' => 'simrs-api',
    'name' => 'SIMRS Rawat Jalan API',
    'basePath' => dirname(__DIR__),
    'runtimePath' => $env('APP_RUNTIME_PATH', dirname(__DIR__) . '/runtime'),
    'timeZone' => $env('APP_TIMEZONE', 'UTC'),
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
            'rules' => [],
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
