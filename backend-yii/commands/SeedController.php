<?php

namespace app\commands;

use Yii;
use yii\console\Controller;
use yii\console\ExitCode;

/**
 * Loads demo data: SQL files from SEED_DIR (idempotent) and the demo users.
 *   php yii seed
 */
class SeedController extends Controller
{
    /** username => [full name, staff code or null] */
    private const USERS = [
        'admin'       => ['Administrator', null],
        'pendaftaran' => ['Petugas Pendaftaran', null],
        'dokter1'     => ['dr. Andi Pratama', 'DR-001'],
        'dokter2'     => ['dr. Dewi Anggraini, Sp.PD', 'DR-004'],
        'farmasi'     => ['Hendra Kusuma, S.Farm., Apt.', 'PH-001'],
        'lab'         => ['Indah Sari, A.Md.AK', 'LB-001'],
        'kasir'       => ['Petugas Kasir', null],
    ];

    private const ROLES = [
        'admin' => 'admin', 'pendaftaran' => 'pendaftaran', 'dokter1' => 'dokter', 'dokter2' => 'dokter',
        'farmasi' => 'farmasi', 'lab' => 'lab', 'kasir' => 'kasir',
    ];

    public function actionIndex(): int
    {
        $dir = getenv('SEED_DIR') ?: Yii::getAlias('@app/../database/seed');
        $files = glob($dir . '/*.sql') ?: [];
        sort($files);
        if (!$files) {
            $this->stderr("No seed files in $dir\n");
            return ExitCode::UNSPECIFIED_ERROR;
        }

        $db = Yii::$app->db;
        foreach ($files as $file) {
            $tx = $db->beginTransaction();
            $db->pdo->exec(file_get_contents($file));
            $tx->commit();
            $this->stdout('seeded ' . basename($file) . "\n");
        }

        $this->seedUsers();
        $this->assignRoles();
        return ExitCode::OK;
    }

    private function seedUsers(): void
    {
        $password = getenv('SEED_USER_PASSWORD') ?: 'Simrs#2026';
        $db = Yii::$app->db;
        $created = 0;
        foreach (self::USERS as $username => [$fullName, $staffCode]) {
            $exists = $db->createCommand('SELECT 1 FROM app_user WHERE username = :u', [':u' => $username])->queryScalar();
            if ($exists) {
                continue;
            }
            $db->createCommand(
                'INSERT INTO app_user (username, password_hash, full_name, staff_id)
                 VALUES (:u, :h, :n, (SELECT id FROM medical_staff WHERE code = :c))',
                [
                    ':u' => $username,
                    ':h' => Yii::$app->security->generatePasswordHash($password),
                    ':n' => $fullName,
                    ':c' => $staffCode,
                ]
            )->execute();
            $created++;
        }
        $this->stdout("users: $created created, " . (count(self::USERS) - $created) . " already present\n");
    }

    /** Needs `php yii rbac/init` first (roles must exist). */
    private function assignRoles(): void
    {
        $auth = Yii::$app->authManager;
        $assigned = 0;
        foreach (self::ROLES as $username => $roleName) {
            $id = Yii::$app->db->createCommand('SELECT id FROM app_user WHERE username = :u', [':u' => $username])->queryScalar();
            $role = $auth->getRole($roleName);
            if (!$id || !$role || $auth->getAssignment($roleName, $id)) {
                continue;
            }
            $auth->assign($role, $id);
            $assigned++;
        }
        $this->stdout("roles: $assigned assigned\n");
    }
}
