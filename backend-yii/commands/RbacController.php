<?php

namespace app\commands;

use app\rbac\OwnVisitRule;
use Yii;
use yii\console\Controller;
use yii\console\ExitCode;

/**
 * Defines roles and permissions (plan section 8). Idempotent: only creates what is missing and
 * never removes assignments, so it is safe on every container start.
 *   php yii rbac/init
 */
class RbacController extends Controller
{
    private const RESOURCES = ['patients', 'staff', 'polyclinics', 'schedules', 'procedures', 'medicines', 'lab_tests', 'icd10', 'users'];
    private const ACTIONS = ['read', 'create', 'update', 'delete'];

    /** Permissions that also need the doctor-owns-visit rule (plan section 8). */
    private const OWN_VISIT = ['visit.view' => 'visit.viewOwn', 'exam.read' => 'exam.readOwn', 'exam.write' => 'exam.writeOwn'];

    private const CLINICAL = ['visit.list', 'visit.view', 'visit.create', 'visit.cancel', 'exam.read', 'exam.write', 'queue.read', 'patient.history'];

    /** role => permission names ("master.<resource>.<action>"). Admin additionally gets everything. */
    private function matrix(): array
    {
        $read = static fn (array $resources) => array_map(static fn ($r) => "master.$r.read", $resources);
        return [
            // Admin: every master permission, and read-only access to the clinical flow.
            'admin' => array_merge($this->masterPermissions(), ['visit.list', 'visit.view', 'exam.read', 'queue.read', 'patient.history']),
            'pendaftaran' => array_merge(
                $read(['patients', 'polyclinics', 'schedules', 'staff']),
                ['master.patients.create', 'master.patients.update'],
                ['visit.list', 'visit.view', 'visit.create', 'visit.cancel', 'queue.read', 'patient.history']
            ),
            'dokter' => array_merge(
                $read(['patients', 'polyclinics', 'schedules', 'staff', 'procedures', 'medicines', 'lab_tests', 'icd10']),
                ['visit.list', 'visit.viewOwn', 'exam.readOwn', 'exam.writeOwn', 'queue.read', 'patient.history']
            ),
            'farmasi' => array_merge($read(['medicines']), ['master.medicines.stock_adjust']),
            'lab' => $read(['lab_tests']),
            'kasir' => array_merge($read(['patients', 'polyclinics', 'procedures', 'medicines', 'lab_tests']), ['visit.list', 'visit.view', 'queue.read']),
        ];
    }

    private function masterPermissions(): array
    {
        $all = ['master.medicines.stock_adjust'];
        foreach (self::RESOURCES as $resource) {
            foreach (self::ACTIONS as $action) {
                $all[] = "master.$resource.$action";
            }
        }
        return $all;
    }

    public function actionInit(): int
    {
        $auth = Yii::$app->authManager;

        $rule = $auth->getRule('isOwnVisit');
        if (!$rule) {
            $rule = new OwnVisitRule();
            $auth->add($rule);
        }

        $names = array_merge($this->masterPermissions(), self::CLINICAL);
        foreach ($names as $name) {
            if (!$auth->getPermission($name)) {
                $auth->add($auth->createPermission($name));
            }
        }
        // "...Own" variants: same permission, but only for the doctor's own visits (rule).
        foreach (self::OWN_VISIT as $base => $own) {
            $permission = $auth->getPermission($own);
            if (!$permission) {
                $permission = $auth->createPermission($own);
                $permission->ruleName = $rule->name;
                $auth->add($permission);
            }
            if (!$auth->hasChild($permission, $auth->getPermission($base))) {
                $auth->addChild($permission, $auth->getPermission($base));
            }
        }

        foreach ($this->matrix() as $roleName => $permissions) {
            $role = $auth->getRole($roleName);
            if (!$role) {
                $role = $auth->createRole($roleName);
                $auth->add($role);
            }
            foreach ($permissions as $name) {
                $permission = $auth->getPermission($name);
                if (!$auth->hasChild($role, $permission)) {
                    $auth->addChild($role, $permission);
                }
            }
        }

        $this->stdout('rbac: ' . count($auth->getRoles()) . ' roles, ' . count($auth->getPermissions()) . " permissions\n");
        return ExitCode::OK;
    }
}
