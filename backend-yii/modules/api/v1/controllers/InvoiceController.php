<?php

namespace app\modules\api\v1\controllers;

use app\components\ApiController;
use app\components\ApiException;
use app\services\InvoiceService;
use app\services\PdfService;
use Yii;
use yii\web\Response;

class InvoiceController extends ApiController
{
    private InvoiceService $invoices;

    public function init()
    {
        parent::init();
        $this->invoices = new InvoiceService();
    }

    /** POST /visits/{id}/invoice - create (or return) the invoice of a finished visit. */
    public function actionGenerate($id): array
    {
        $this->authorize('billing.write');
        [$invoice, $created] = $this->invoices->generate((int) $id);
        $detail = $this->invoices->detail((int) $invoice['id']);
        return $created ? $this->created($detail) : $this->ok($detail);
    }

    public function actionIndex(): array
    {
        $this->authorize('billing.read');
        $req = Yii::$app->request;
        $page = max(1, (int) $req->get('page', 1));
        $perPage = min(100, max(1, (int) $req->get('per_page', 20)));
        $f = array_intersect_key($req->get(), array_flip(['status', 'patient_id', 'from', 'to', 'q']));
        $this->assertDates($f, ['from', 'to']);
        [$rows, $total] = $this->invoices->list($f, $page, $perPage);
        return $this->ok($rows, ['page' => $page, 'per_page' => $perPage, 'total' => $total]);
    }

    public function actionView($id): array
    {
        $this->authorize('billing.read');
        return $this->ok($this->invoices->detail((int) $id));
    }

    /** Printable invoice (R-25). Returns application/pdf, not the JSON envelope. */
    public function actionPdf($id)
    {
        $this->authorize('billing.read');
        $inv = $this->invoices->detail((int) $id);
        return $this->pdf((new PdfService())->invoice($inv), 'invoice-' . $inv['invoice_no'] . '.pdf');
    }

    private function pdf(string $content, string $filename): string
    {
        $r = Yii::$app->response;
        $r->format = Response::FORMAT_RAW;
        $r->getHeaders()->set('Content-Type', 'application/pdf')->set('Content-Disposition', 'inline; filename="' . $filename . '"')->set('Cache-Control', 'no-store');
        return $content;
    }

    private function assertDates(array $f, array $keys): void
    {
        foreach ($keys as $k) {
            if (!empty($f[$k]) && !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $f[$k])) {
                throw new ApiException(422, 'VALIDATION_FAILED', 'Data tidak valid', [['field' => $k, 'message' => 'Format tanggal YYYY-MM-DD']]);
            }
        }
    }
}
