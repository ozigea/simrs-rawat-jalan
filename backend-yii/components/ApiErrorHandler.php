<?php

namespace app\components;

use Yii;
use yii\web\HttpException;
use yii\web\Response;
use yii\base\UserException;

/**
 * Renders every uncaught error in the uniform envelope. Never leaks stack traces.
 */
class ApiErrorHandler extends \yii\web\ErrorHandler
{
    private const CODES = [
        400 => 'BAD_REQUEST',
        401 => 'UNAUTHORIZED',
        403 => 'FORBIDDEN',
        404 => 'NOT_FOUND',
        405 => 'METHOD_NOT_ALLOWED',
        409 => 'CONFLICT',
        422 => 'VALIDATION_FAILED',
        503 => 'DEPENDENCY_UNAVAILABLE',
    ];

    protected function renderException($exception)
    {
        $status = $exception instanceof HttpException ? $exception->statusCode : 500;
        $code = self::CODES[$status] ?? 'INTERNAL_ERROR';
        $message = ($exception instanceof HttpException || $exception instanceof UserException)
            ? $exception->getMessage()
            : 'Terjadi kesalahan internal';

        $details = [];
        if ($exception instanceof ApiException) {
            $code = $exception->errorCode;
            $details = $exception->details;
        }

        $response = Yii::$app->has('response', true) ? Yii::$app->getResponse() : new Response();
        $response->isSent = false;
        $response->stream = null;
        $response->content = null;
        $response->format = Response::FORMAT_JSON;
        $response->setStatusCode($status);
        $response->getHeaders()->set('X-Request-Id', ApiResponse::requestId());
        $response->data = ApiResponse::error($code, $message, $details);
        $response->send();
    }
}
