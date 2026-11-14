<?php

$env = static fn (string $key, string $default = '') => getenv($key) !== false ? getenv($key) : $default;

return [
    'class' => 'yii\db\Connection',
    'dsn' => sprintf(
        'pgsql:host=%s;port=%s;dbname=%s',
        $env('DB_HOST', 'db'),
        $env('DB_PORT', '5432'),
        $env('DB_NAME', 'simrs')
    ),
    'username' => $env('DB_USER', 'simrs_core'),
    'password' => $env('DB_PASSWORD'),
    'charset' => 'utf8',
    'enableSchemaCache' => $env('APP_ENV', 'prod') === 'prod',
];
