<?php

namespace app\modules\api\v1\controllers;

use app\components\ApiController;
use app\components\ApiException;
use app\services\PaymentService;
use app\services\PdfService;
use Yii;
use yii\web\Response;

class PaymentController extends ApiController
{
    private PaymentService $payments;

    public function init()
    {
        parent::init();
        $this->payments = new PaymentService();
    }

    /** POST /invoices/{id}/payments - header Idempotency-Key is mandatory (D-3). */
    public function actionCreate($id): array
    {
        $this->authorize('billing.write');
        $key = Yii::$app->request->headers->get('Idempotency-Key');
        [$payment, $replayed] = $this->payments->pay((int) $id, $this->body(), $key);
        if ($replayed) {
            Yii::$app->response->getHeaders()->set('Idempotent-Replayed', 'true');
            return $this->ok($payment);
        }
        return $this->created($payment);
    }

    /** Payment history (R-25). */
    public function actionIndex(): array
    {
        $this->authorize('billing.read');
        $req = Yii::$app->request;
        $page = max(1, (int) $req->get('page', 1));
        $perPage = min(100, max(1, (int) $req->get('per_page', 20)));
        $f = array_intersect_key($req->get(), array_flip(['patient_id', 'invoice_id', 'method', 'from', 'to', 'q']));
        foreach (['from', 'to'] as $k) {
            if (!empty($f[$k]) && !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $f[$k])) {
                throw new ApiException(422, 'VALIDATION_FAILED', 'Data tidak valid', [['field' => $k, 'message' => 'Format tanggal YYYY-MM-DD']]);
            }
        }
        [$rows, $total] = $this->payments->list($f, $page, $perPage);
        return $this->ok($rows, ['page' => $page, 'per_page' => $perPage, 'total' => $total]);
    }

    public function actionReceipt($id)
    {
        $this->authorize('billing.read');
        $p = $this->payments->detail((int) $id);
        $r = Yii::$app->response;
        $r->format = Response::FORMAT_RAW;
        $r->getHeaders()->set('Content-Type', 'application/pdf')->set('Content-Disposition', 'inline; filename="kuitansi-' . $p['payment_no'] . '.pdf"')->set('Cache-Control', 'no-store');
        return (new PdfService())->receipt($p);
    }
}
