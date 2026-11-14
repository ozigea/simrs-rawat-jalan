<?php

namespace app\modules\api\v1\controllers;

use app\components\ApiResponse;
use Yii;
use yii\web\Controller;
use yii\web\Response;

class HealthController extends Controller
{
    public function actionIndex(): array
    {
        $response = Yii::$app->response;
        $response->format = Response::FORMAT_JSON;
        $response->getHeaders()->set('X-Request-Id', ApiResponse::requestId());

        try {
            Yii::$app->db->createCommand('SELECT 1')->queryScalar();
        } catch (\Throwable $e) {
            Yii::error($e->getMessage(), __METHOD__);
            $response->setStatusCode(503);
            return ApiResponse::error('DEPENDENCY_UNAVAILABLE', 'Database tidak tersedia');
        }

        return ApiResponse::success([
            'service' => 'yii-core',
            'status' => 'UP',
            'db' => 'UP',
            'time' => date('c'),
        ]);
    }
}
