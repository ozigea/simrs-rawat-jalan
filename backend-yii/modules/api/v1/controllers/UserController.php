<?php

namespace app\modules\api\v1\controllers;

use app\components\ApiException;
use app\components\BaseMasterController;
use app\models\AppUser;
use Yii;
use yii\db\ActiveRecord;

class UserController extends BaseMasterController
{
    protected function modelClass(): string
    {
        return AppUser::class;
    }

    protected function resource(): string
    {
        return 'users';
    }

    protected function searchColumns(): array
    {
        return ['username', 'full_name'];
    }

    protected function sortColumns(): array
    {
        return ['id', 'username', 'full_name', 'last_login_at'];
    }

    protected function with(): array
    {
        return ['staff'];
    }

    /** One query for the roles of the whole page. */
    protected function decorate(array $rows): array
    {
        $ids = array_column($rows, 'id');
        $map = [];
        if ($ids) {
            $assignments = (new \yii\db\Query())->select(['user_id', 'item_name'])->from('auth_assignment')
                ->where(['user_id' => array_map('strval', $ids)])->all();
            foreach ($assignments as $a) {
                $map[(int) $a['user_id']] = $a['item_name'];
            }
        }
        foreach ($rows as &$row) {
            $row['role'] = $map[$row['id']] ?? null;
        }
        return $rows;
    }

    protected function afterSaved(ActiveRecord $model, bool $isNew): void
    {
        /** @var AppUser $model */
        if ($model->role === null || $model->role === '') {
            return;
        }
        $auth = Yii::$app->authManager;
        $auth->revokeAll($model->id);
        $auth->assign($auth->getRole($model->role), $model->id);
    }

    public function actionUpdate($id): array
    {
        $this->authorize($this->permission('update'));
        $me = (int) Yii::$app->user->id;
        $body = $this->body();
        if ((int) $id === $me && array_key_exists('is_active', $body) && !filter_var($body['is_active'], FILTER_VALIDATE_BOOLEAN)) {
            throw new ApiException(422, 'VALIDATION_FAILED', 'Data tidak valid', [['field' => 'is_active', 'message' => 'Anda tidak dapat menonaktifkan akun sendiri']]);
        }
        return parent::actionUpdate($id);
    }

    public function actionDelete($id): array
    {
        $this->authorize($this->permission('delete'));
        if ((int) $id === (int) Yii::$app->user->id) {
            throw new ApiException(409, 'SELF_DELETE', 'Anda tidak dapat menghapus akun sendiri');
        }
        $result = parent::actionDelete($id);
        Yii::$app->authManager->revokeAll((int) $id);   // only after the row is really gone
        return $result;
    }
}
