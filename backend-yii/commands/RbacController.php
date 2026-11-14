<?php

namespace app\commands;

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

    /** role => permission names ("master.<resource>.<action>"). Admin additionally gets everything. */
    private function matrix(): array
    {
        $read = static fn (array $resources) => array_map(static fn ($r) => "master.$r.read", $resources);
        return [
            'admin' => null, // all permissions
            'pendaftaran' => array_merge(
                $read(['patients', 'polyclinics', 'schedules', 'staff']),
                ['master.patients.create', 'master.patients.update']
            ),
            'dokter' => $read(['patients', 'polyclinics', 'schedules', 'staff', 'procedures', 'medicines', 'lab_tests', 'icd10']),
            'farmasi' => array_merge($read(['medicines']), ['master.medicines.stock_adjust']),
            'lab' => $read(['lab_tests']),
            'kasir' => $read(['patients', 'polyclinics', 'procedures', 'medicines', 'lab_tests']),
        ];
    }

    public function actionInit(): int
    {
        $auth = Yii::$app->authManager;

        $all = ['master.medicines.stock_adjust'];
        foreach (self::RESOURCES as $resource) {
            foreach (self::ACTIONS as $action) {
                $all[] = "master.$resource.$action";
            }
        }
        foreach ($all as $name) {
            if (!$auth->getPermission($name)) {
                $auth->add($auth->createPermission($name));
            }
        }

        foreach ($this->matrix() as $roleName => $permissions) {
            $role = $auth->getRole($roleName);
            if (!$role) {
                $role = $auth->createRole($roleName);
                $auth->add($role);
            }
            foreach ($permissions ?? $all as $name) {
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
