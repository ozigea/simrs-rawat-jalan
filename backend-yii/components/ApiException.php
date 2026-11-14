<?php

namespace app\components;

use yii\web\HttpException;

/**
 * HTTP error carrying a machine-readable code and optional field details.
 * Rendered by ApiErrorHandler in the uniform envelope.
 */
class ApiException extends HttpException
{
    public string $errorCode;
    public array $details;

    public function __construct(int $status, string $errorCode, string $message, array $details = [], ?\Throwable $previous = null)
    {
        parent::__construct($status, $message, 0, $previous);
        $this->errorCode = $errorCode;
        $this->details = $details;
    }
}
