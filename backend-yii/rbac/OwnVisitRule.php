<?php

namespace app\rbac;

use Yii;
use yii\rbac\Rule;

/**
 * Plan section 8: a doctor reaches only visits of their own (visit.doctor_id = user.staff_id).
 * Needs the visit in the check params: can('exam.write', ['visit' => $visitRow]).
 */
class OwnVisitRule extends Rule
{
    public $name = 'isOwnVisit';

    public function execute($user, $item, $params): bool
    {
        $visit = $params['visit'] ?? null;
        if ($visit === null) {
            return false;
        }
        $doctorId = is_array($visit) ? ($visit['doctor_id'] ?? null) : ($visit->doctor_id ?? null);
        $staffId = Yii::$app->db->createCommand('SELECT staff_id FROM app_user WHERE id = :id', [':id' => $user])->queryScalar();
        return $doctorId !== null && $staffId !== false && $staffId !== null && (int) $staffId === (int) $doctorId;
    }
}
