<?php

// REST resources share one rule class; {id} is numeric except for ICD-10 (code like A01.0).
$rest = static fn (array $controller, array $extra = [], array $tokens = []) => [
    'class' => 'yii\rest\UrlRule',
    'controller' => $controller,
    'pluralize' => false,
    'extraPatterns' => $extra,
    'tokens' => $tokens + ['{id}' => '<id:\d+>'],
];

return [
    'GET api/v1/health' => 'api/v1/health/index',
    'POST api/v1/auth/login' => 'api/v1/auth/login',
    'GET api/v1/auth/me' => 'api/v1/auth/me',

    $rest(['api/v1/patients' => 'api/v1/patient']),
    $rest(['api/v1/staff' => 'api/v1/staff']),
    $rest(['api/v1/polyclinics' => 'api/v1/polyclinic']),
    $rest(['api/v1/procedures' => 'api/v1/procedure']),
    $rest(['api/v1/lab-tests' => 'api/v1/lab-test']),
    $rest(['api/v1/users' => 'api/v1/user']),
    $rest(['api/v1/schedules' => 'api/v1/schedule'], ['GET available' => 'available']),
    $rest(['api/v1/medicines' => 'api/v1/medicine'], [
        'POST {id}/stock-adjustments' => 'stock-adjust',
        'GET {id}/stock-movements' => 'stock-movements',
    ]),
    $rest(['api/v1/icd10' => 'api/v1/icd10'], [], ['{id}' => '<id:[A-Za-z][0-9]{2}(\.[0-9A-Za-z]{1,4})?>']),
];
