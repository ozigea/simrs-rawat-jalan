<?php

namespace app\modules\api\v1\controllers;

use app\components\ApiController;
use app\components\ApiException;
use app\services\ExaminationService;
use app\services\RegistrationService;
use app\services\VisitService;
use Yii;

class VisitController extends ApiController
{
    private VisitService $visits;

    public function init()
    {
        parent::init();
        $this->visits = new VisitService();
    }

    public function actionIndex(): array
    {
        $this->authorize('visit.list');
        $req = Yii::$app->request;
        $page = max(1, (int) $req->get('page', 1));
        $perPage = min(100, max(1, (int) $req->get('per_page', 20)));
        $filters = array_intersect_key($req->get(), array_flip(['date', 'date_from', 'date_to', 'polyclinic_id', 'doctor_id', 'patient_id', 'status', 'q']));
        foreach (['date', 'date_from', 'date_to'] as $d) {
            if (!empty($filters[$d]) && !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $filters[$d])) {
                throw new ApiException(422, 'VALIDATION_FAILED', 'Data tidak valid', [['field' => $d, 'message' => 'Format tanggal YYYY-MM-DD']]);
            }
        }
        [$rows, $total] = $this->visits->list($filters, $this->visitScope(), $page, $perPage, (string) $req->get('sort', ''));
        return $this->ok($rows, ['page' => $page, 'per_page' => $perPage, 'total' => $total]);
    }

    public function actionView($id): array
    {
        $visit = $this->visits->find((int) $id);
        $this->authorizeVisit('visit.view', $visit);
        // Clinical data only for roles that may read it (admin, the visit's own doctor).
        if (Yii::$app->user->can('exam.read', ['visit' => $visit])) {
            $visit['clinical'] = (new ExaminationService())->clinical((int) $id);
        }
        return $this->ok($visit);
    }

    /** R-09/R-10. Header `Idempotency-Key` makes client retries safe (D-1). */
    public function actionCreate(): array
    {
        $this->authorize('visit.create');
        $body = $this->body();
        $details = [];
        foreach (['patient_id', 'schedule_id'] as $f) {
            if (filter_var($body[$f] ?? null, FILTER_VALIDATE_INT) === false) {
                $details[] = ['field' => $f, 'message' => ($f === 'patient_id' ? 'Pasien' : 'Jadwal') . ' wajib dipilih'];
            }
        }
        $key = Yii::$app->request->headers->get('Idempotency-Key');
        if ($key !== null && !preg_match('/^[A-Za-z0-9._-]{8,64}$/', $key)) {
            $details[] = ['field' => 'Idempotency-Key', 'message' => 'Header harus 8-64 karakter: huruf, angka, titik, garis bawah, strip'];
        }
        if ($details) {
            throw new ApiException(422, 'VALIDATION_FAILED', 'Data tidak valid', $details);
        }

        [$visit, $replayed] = (new RegistrationService())->register(
            (int) $body['patient_id'],
            (int) $body['schedule_id'],
            (string) ($body['visit_date'] ?? date('Y-m-d')),
            $key,
            (int) Yii::$app->user->id
        );
        if ($replayed) {
            Yii::$app->response->getHeaders()->set('Idempotent-Replayed', 'true');
            return $this->ok($visit);
        }
        return $this->created($visit);
    }

    public function actionCall($id): array
    {
        $visit = $this->visits->find((int) $id);
        $this->authorizeVisit('exam.write', $visit);
        $this->visits->call((int) $id);
        return $this->ok($this->visits->find((int) $id));
    }

    public function actionFinish($id): array
    {
        $visit = $this->visits->find((int) $id);
        $this->authorizeVisit('exam.write', $visit);
        $this->visits->finish((int) $id);
        return $this->ok($this->visits->find((int) $id));
    }

    public function actionCancel($id): array
    {
        $this->authorize('visit.cancel');
        $this->visits->find((int) $id);
        $this->visits->cancel((int) $id, $this->requiredReason());
        return $this->ok($this->visits->find((int) $id));
    }
}
