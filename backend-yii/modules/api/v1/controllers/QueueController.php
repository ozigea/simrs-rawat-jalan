<?php

namespace app\modules\api\v1\controllers;

use app\components\ApiController;
use app\components\ApiException;
use app\services\VisitService;
use Yii;

class QueueController extends ApiController
{
    /** R-10/R-12: queue board per schedule. Doctors only see their own schedules. */
    public function actionIndex(): array
    {
        $this->authorize('queue.read');
        $date = (string) Yii::$app->request->get('date', date('Y-m-d'));
        $d = \DateTime::createFromFormat('Y-m-d', $date);
        if (!$d || $d->format('Y-m-d') !== $date) {
            throw new ApiException(422, 'VALIDATION_FAILED', 'Data tidak valid', [['field' => 'date', 'message' => 'Format tanggal YYYY-MM-DD']]);
        }
        $poli = Yii::$app->request->get('polyclinic_id');
        $board = (new VisitService())->queueBoard($date, $poli ? (int) $poli : null, $this->visitScope());
        return $this->ok($board, ['date' => $date]);
    }
}
