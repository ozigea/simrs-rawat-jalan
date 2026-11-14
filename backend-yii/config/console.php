<?php

$env = static fn (string $key, string $default = '') => getenv($key) !== false ? getenv($key) : $default;

return [
    'id' => 'simrs-console',
    'basePath' => dirname(__DIR__),
    'runtimePath' => $env('APP_RUNTIME_PATH', dirname(__DIR__) . '/runtime'),
    'timeZone' => $env('APP_TIMEZONE', 'UTC'),
    'controllerNamespace' => 'app\commands',
    'controllerMap' => [
        'migrate' => [
            'class' => 'yii\console\controllers\MigrateController',
            // Yii's stock RBAC tables (auth_*) + this project's migrations.
            'migrationPath' => ['@app/migrations', '@yii/rbac/migrations'],
        ],
    ],
    'components' => [
        'authManager' => ['class' => 'yii\rbac\DbManager'],
        'db' => require __DIR__ . '/db.php',
    ],
];
