<?php

namespace app\modules\api\v1\controllers;

use app\components\ApiController;
use app\components\ApiException;
use app\services\LabService;
use Yii;

/**
 * Service-to-service endpoints, authenticated with X-Service-Token (K-7), not a user JWT.
 * The only caller is the Node integration service.
 */
class InternalController extends ApiController
{
    protected array $publicActions = ['lab-results'];

    /**
     * Result of an external lab, already stored in Node's inbox.
     * Body: {external_id, order_no, results: [{test_code, value, flag?, note?}]}
     */
    public function actionLabResults(): array
    {
        $this->assertServiceToken();
        $body = $this->body();
        $orderNo = trim((string) ($body['order_no'] ?? ''));
        $results = $body['results'] ?? null;
        if ($orderNo === '' || !is_array($results)) {
            throw new ApiException(422, 'VALIDATION_FAILED', 'Data tidak valid', [['field' => 'order_no', 'message' => 'order_no dan results wajib diisi']]);
        }
        $lab = new LabService();
        $orderId = $lab->idByOrderNo($orderNo);
        if ($orderId === null) {
            throw new ApiException(404, 'NOT_FOUND', "Permintaan lab $orderNo tidak ditemukan");
        }
        $order = $lab->recordResult($orderId, $results, 'LIS', null);
        return $this->ok(['order_no' => $order['order_no'], 'status' => $order['status']]);
    }

    private function assertServiceToken(): void
    {
        $expected = (string) getenv('SERVICE_TOKEN');
        $given = (string) Yii::$app->request->headers->get('X-Service-Token', '');
        if ($expected === '' || !hash_equals($expected, $given)) {
            throw new ApiException(401, 'UNAUTHORIZED', 'Service token tidak valid');
        }
    }
}
