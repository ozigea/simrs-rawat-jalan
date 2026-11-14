<?php

namespace app\modules\api\v1\controllers;

use app\components\ApiController;
use app\components\ApiException;
use app\services\LabService;
use app\services\VisitService;
use Yii;

class LabOrderController extends ApiController
{
    private LabService $lab;

    public function init()
    {
        parent::init();
        $this->lab = new LabService();
    }

    /** Lab worklist (lab, admin read-only). */
    public function actionIndex(): array
    {
        $this->authorize('lab.worklist');
        $req = Yii::$app->request;
        $page = max(1, (int) $req->get('page', 1));
        $perPage = min(100, max(1, (int) $req->get('per_page', 20)));
        $f = array_intersect_key($req->get(), array_flip(['status', 'date', 'q']));
        [$rows, $total] = $this->lab->list($f, $page, $perPage);
        return $this->ok($rows, ['page' => $page, 'per_page' => $perPage, 'total' => $total]);
    }

    public function actionView($id): array
    {
        $order = $this->lab->detail((int) $id);
        if (!Yii::$app->user->can('lab.worklist') && !Yii::$app->user->can('exam.read', ['visit' => ['doctor_id' => $order['doctor_id']]])) {
            throw new ApiException(403, 'FORBIDDEN', 'Anda tidak berhak mengakses permintaan lab ini');
        }
        return $this->ok($order);
    }

    /** Doctor (own visit): POST /visits/{id}/lab-orders */
    public function actionCreate($id): array
    {
        $visit = (new VisitService())->find((int) $id);
        $this->authorizeVisit('exam.write', $visit);
        return $this->created($this->lab->create((int) $id, $this->body()));
    }

    /** Lab analyst enters results by hand. Body: {results: [{item_id, value, flag?, note?}]} */
    public function actionResults($id): array
    {
        $this->authorize('lab.result');
        $results = $this->body()['results'] ?? null;
        return $this->ok($this->lab->recordResult((int) $id, is_array($results) ? $results : [], 'MANUAL', (int) Yii::$app->user->id));
    }
}
