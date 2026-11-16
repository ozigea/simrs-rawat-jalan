<?php

namespace app\modules\api\v1\controllers;

use app\components\ApiController;
use app\components\ApiException;
use app\services\ExaminationService;
use app\services\InvoiceService;
use app\services\VisitService;
use Yii;

/** Examination record, diagnoses and procedures of a visit. Doctors reach their own visits only. */
class ExaminationController extends ApiController
{
    private ExaminationService $exam;

    public function init()
    {
        parent::init();
        $this->exam = new ExaminationService();
    }

    private function visitFor(int $id): array
    {
        $visit = (new VisitService())->find($id);
        $this->authorizeVisit('exam.write', $visit);
        return $visit;
    }

    public function actionSave($id): array
    {
        $this->visitFor((int) $id);
        return $this->ok($this->exam->saveExamination((int) $id, $this->body()));
    }

    public function actionAddDiagnosis($id): array
    {
        $this->visitFor((int) $id);
        return $this->created($this->exam->addDiagnosis((int) $id, $this->body()));
    }

    public function actionVoidDiagnosis($id, $diagnosisId): array
    {
        $this->visitFor((int) $id);
        $this->exam->voidDiagnosis((int) $id, (int) $diagnosisId, $this->requiredReason());
        return $this->ok(null);
    }

    /** Body: {procedure_id, qty?} or {items: [{procedure_id, qty?}, ...]}. */
    public function actionAddProcedures($id): array
    {
        $override = $this->procedureAccess((int) $id);
        $body = $this->body();
        $items = isset($body['items']) && is_array($body['items']) ? $body['items'] : ($body ? [$body] : []);
        return $this->created($this->exam->addProcedures((int) $id, $items, $override, $override ? $this->requiredReason() : null));
    }

    public function actionVoidProcedure($id): array
    {
        $visitId = $this->exam->visitOfProcedure((int) $id);
        if ($visitId === null) {
            throw new \app\components\ApiException(404, 'NOT_FOUND', 'Tindakan tidak ditemukan');
        }
        $override = $this->procedureAccess($visitId);
        $this->exam->voidProcedure((int) $id, $this->requiredReason(), $override);
        return $this->ok(null);
    }

    /**
     * D-4 / O-6: once the invoice is fully paid, procedures are locked for everyone except the
     * Administrator (correction with a mandatory reason). Returns true for that override path.
     */
    private function procedureAccess(int $visitId): bool
    {
        if ((new InvoiceService())->isSettled($visitId)) {
            if (!Yii::$app->user->can('billing.adjustPaid')) {
                throw new ApiException(403, 'INVOICE_ALREADY_PAID', 'Tagihan kunjungan ini sudah lunas; tindakan tidak dapat diubah (hanya Administrator dengan alasan)');
            }
            return true;
        }
        $this->visitFor($visitId);
        return false;
    }
}
