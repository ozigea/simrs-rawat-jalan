<?php

$vendor = getenv('APP_VENDOR_DIR') ?: __DIR__ . '/../vendor';

defined('YII_DEBUG') or define('YII_DEBUG', filter_var(getenv('APP_DEBUG'), FILTER_VALIDATE_BOOLEAN));
defined('YII_ENV') or define('YII_ENV', getenv('APP_ENV') ?: 'prod');

require $vendor . '/autoload.php';
require $vendor . '/yiisoft/yii2/Yii.php';

$config = require __DIR__ . '/../config/web.php';

(new yii\web\Application($config))->run();
