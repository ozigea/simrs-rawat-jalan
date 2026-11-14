<?php

namespace app\modules\api\v1\controllers;

use app\components\BaseMasterController;
use app\models\Medicine;
use app\services\StockService;
use Yii;
use yii\base\DynamicModel;
use yii\db\ActiveRecord;

class MedicineController extends BaseMasterController
{
    protected function modelClass(): string
    {
        return Medicine::class;
    }

    protected function resource(): string
    {
        return 'medicines';
    }

    protected function searchColumns(): array
    {
        return ['code', 'name'];
    }

    protected function sortColumns(): array
    {
        return ['id', 'code', 'name', 'price', 'stock_qty'];
    }

    /** Opening balance goes through the ledger like every other stock change. */
    protected function afterSaved(ActiveRecord $model, bool $isNew): void
    {
        if ($isNew && (int) $model->initial_stock > 0) {
            (new StockService())->apply($model->id, (int) $model->initial_stock, 'IN', 'Stok awal', 'MEDICINE', $model->id);
        }
    }

    public function actionStockAdjust($id): array
    {
        $this->authorize('master.medicines.stock_adjust');
        $medicine = $this->find($id);

        $form = DynamicModel::validateData(
            ['qty_change' => $this->body()['qty_change'] ?? null, 'reason' => trim((string) ($this->body()['reason'] ?? ''))],
            [
                ['qty_change', 'required', 'message' => 'Jumlah wajib diisi'],
                ['reason', 'required', 'message' => 'Alasan penyesuaian wajib diisi'],
                ['qty_change', 'integer', 'message' => 'Jumlah harus bilangan bulat'],
                ['qty_change', 'compare', 'compareValue' => 0, 'operator' => '!=', 'type' => 'number', 'message' => 'Jumlah tidak boleh 0'],
                ['reason', 'string', 'max' => 255],
            ]
        );
        if ($form->hasErrors()) {
            throw $this->validationFailed($form);
        }

        $delta = (int) $form->qty_change;
        $balance = (new StockService())->apply($medicine->id, $delta, 'ADJUST', $form->reason, 'ADJUSTMENT', null);
        return $this->ok(['medicine_id' => $medicine->id, 'qty_change' => $delta, 'stock_qty' => $balance]);
    }

    public function actionStockMovements($id): array
    {
        $this->authorize($this->permission('read'));
        $medicine = $this->find($id);
        $page = max(1, (int) Yii::$app->request->get('page', 1));
        $perPage = min(100, max(1, (int) Yii::$app->request->get('per_page', 20)));
        [$rows, $total] = (new StockService())->movements($medicine->id, $page, $perPage);
        return $this->ok($rows, ['page' => $page, 'per_page' => $perPage, 'total' => $total]);
    }
}
