<?php

namespace app\modules\api\v1\controllers;

use app\components\ApiController;
use app\components\ApiException;
use app\models\AppUser;
use Yii;

class AuthController extends ApiController
{
    protected array $publicActions = ['login'];

    /** Valid bcrypt hash: unknown usernames still cost one verification (no user enumeration by timing). */
    private const DUMMY_HASH = '$2y$13$mj55p4qDfTR0u3nwaTbzCuI0seKbXq/jUT.cuT0zIbci8F2s8Wgjq';

    public function actionLogin(): array
    {
        $body = $this->body();
        $username = strtolower(trim((string) ($body['username'] ?? '')));
        $password = (string) ($body['password'] ?? '');

        $details = [];
        if ($username === '') {
            $details[] = ['field' => 'username', 'message' => 'Username wajib diisi'];
        }
        if ($password === '') {
            $details[] = ['field' => 'password', 'message' => 'Password wajib diisi'];
        }
        if ($details) {
            throw new ApiException(422, 'VALIDATION_FAILED', 'Data tidak valid', $details);
        }

        $user = AppUser::findOne(['username' => $username]);
        $valid = Yii::$app->security->validatePassword($password, $user->password_hash ?? self::DUMMY_HASH);
        if (!$user || !$valid || !$user->is_active) {
            throw new ApiException(401, 'INVALID_CREDENTIALS', 'Username atau password salah, atau akun nonaktif');
        }

        $user->updateAttributes(['last_login_at' => new \yii\db\Expression('now()')]);
        $roles = $user->roleNames();
        [$token, $expiresIn] = Yii::$app->jwt->issue($user->id, $user->username, $roles, $user->staff_id);

        return $this->ok([
            'access_token' => $token,
            'token_type' => 'Bearer',
            'expires_in' => $expiresIn,
            'user' => $this->profile($user, $roles),
        ]);
    }

    public function actionMe(): array
    {
        /** @var AppUser $user */
        $user = Yii::$app->user->identity;
        return $this->ok($this->profile($user, $user->roleNames()));
    }

    private function profile(AppUser $user, array $roles): array
    {
        return [
            'id' => $user->id,
            'username' => $user->username,
            'full_name' => $user->full_name,
            'staff_id' => $user->staff_id,
            'roles' => $roles,
            'permissions' => array_keys(Yii::$app->authManager->getPermissionsByUser($user->id)),
        ];
    }
}
