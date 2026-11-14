<?php

namespace app\modules\api\v1\controllers;

use app\components\ApiController;
use app\components\ApiException;
use app\services\PharmacyService;
use app\services\VisitService;
use Yii;

class PrescriptionController extends ApiController
{
    private PharmacyService $pharmacy;

    public function init()
    {
        parent::init();
        $this->pharmacy = new PharmacyService();
    }

    /** Pharmacy worklist (farmasi, admin read-only). */
    public function actionIndex(): array
    {
        $this->authorize('pharmacy.worklist');
        $req = Yii::$app->request;
        $page = max(1, (int) $req->get('page', 1));
        $perPage = min(100, max(1, (int) $req->get('per_page', 20)));
        $f = array_intersect_key($req->get(), array_flip(['status', 'date', 'q']));
        [$rows, $total] = $this->pharmacy->list($f, $page, $perPage);
        return $this->ok($rows, ['page' => $page, 'per_page' => $perPage, 'total' => $total]);
    }

    public function actionView($id): array
    {
        $rx = $this->pharmacy->detail((int) $id);
        $this->authorizeRead($rx);
        return $this->ok($rx);
    }

    /** Doctor (own visit): POST /visits/{id}/prescriptions */
    public function actionCreate($id): array
    {
        $visit = (new VisitService())->find((int) $id);
        $this->authorizeVisit('exam.write', $visit);
        $rx = $this->pharmacy->create((int) $id, $this->body());
        return $this->created($rx);
    }

    public function actionDispense($id): array
    {
        $this->authorize('pharmacy.dispense');
        return $this->ok($this->pharmacy->dispense((int) $id));
    }

    /** Pharmacist, or the prescribing doctor (own visit); only while NEW. */
    public function actionCancel($id): array
    {
        $rx = $this->pharmacy->detail((int) $id);
        if (!Yii::$app->user->can('pharmacy.dispense')) {
            $this->authorizeVisit('exam.write', ['doctor_id' => $rx['doctor_id']]);
        }
        return $this->ok($this->pharmacy->cancel((int) $id, $this->requiredReason()));
    }

    private function authorizeRead(array $rx): void
    {
        if (Yii::$app->user->can('pharmacy.worklist') || Yii::$app->user->can('exam.read', ['visit' => ['doctor_id' => $rx['doctor_id']]])) {
            return;
        }
        throw new ApiException(403, 'FORBIDDEN', 'Anda tidak berhak mengakses resep ini');
    }
}
