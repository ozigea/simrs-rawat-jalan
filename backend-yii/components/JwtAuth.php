<?php

namespace app\components;

use yii\filters\auth\HttpBearerAuth;

class JwtAuth extends HttpBearerAuth
{
    public function handleFailure($response)
    {
        throw new ApiException(401, 'UNAUTHORIZED', 'Token tidak ada, tidak valid, atau sudah kedaluwarsa');
    }
}
