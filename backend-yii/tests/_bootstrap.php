<?php

// app\* has no Composer autoload entry (Yii resolves it through the @app alias at runtime):
// map the namespace to the source folders so unit tests can load classes without booting the application.
spl_autoload_register(static function (string $class): void {
    if (strncmp($class, 'app\\', 4) !== 0) {
        return;
    }
    $file = dirname(__DIR__) . '/' . str_replace('\\', '/', substr($class, 4)) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

// Yii's helper class (components extend yii\base\*). No application is created: unit tests stay free of DB/HTTP.
require (getenv('APP_VENDOR_DIR') ?: dirname(__DIR__) . '/vendor') . '/yiisoft/yii2/Yii.php';
