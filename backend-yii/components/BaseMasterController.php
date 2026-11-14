<?php

namespace app\components;

use Yii;
use yii\db\ActiveQuery;
use yii\db\ActiveRecord;

/**
 * Generic REST CRUD for master data (R-01..R-07). Concrete controllers only declare the model,
 * the permission slug and which columns may be searched / filtered / sorted.
 * Permissions: master.<resource>.{read,create,update,delete}.
 */
abstract class BaseMasterController extends ApiController
{
    /** @return class-string<ActiveRecord> */
    abstract protected function modelClass(): string;

    /** Permission slug, e.g. "patients". */
    abstract protected function resource(): string;

    /** Columns matched (ILIKE) by the free-text `q` parameter. */
    protected function searchColumns(): array
    {
        return [];
    }

    /** Exact-match filters: column => 'bool' | 'int' | 'string'. */
    protected function filterColumns(): array
    {
        return ['is_active' => 'bool'];
    }

    protected function sortColumns(): array
    {
        return ['id'];
    }

    protected function defaultSort(): string
    {
        return 'id';
    }

    /** Relations eager-loaded for list/detail (avoids N+1, D-6). */
    protected function with(): array
    {
        return [];
    }

    /** Hook: adjust serialized rows (e.g. attach roles) with one extra query for the whole page. */
    protected function decorate(array $rows): array
    {
        return $rows;
    }

    protected function afterSaved(ActiveRecord $model, bool $isNew): void
    {
    }

    protected function permission(string $action): string
    {
        return "master.{$this->resource()}.$action";
    }

    public function actionIndex(): array
    {
        $this->authorize($this->permission('read'));
        $class = $this->modelClass();
        $req = Yii::$app->request;

        $query = $class::find()->with($this->with());
        $this->applySearch($query, trim((string) $req->get('q', '')));
        $this->applyFilters($query);
        $this->applySort($query, (string) $req->get('sort', ''));

        $page = max(1, (int) $req->get('page', 1));
        $perPage = min(100, max(1, (int) $req->get('per_page', 20)));
        $total = (int) (clone $query)->count();
        $models = $query->offset(($page - 1) * $perPage)->limit($perPage)->all();

        $rows = $this->decorate(array_map(static fn ($m) => $m->toArray(), $models));
        return $this->ok($rows, ['page' => $page, 'per_page' => $perPage, 'total' => $total]);
    }

    public function actionView($id): array
    {
        $this->authorize($this->permission('read'));
        return $this->ok($this->decorate([$this->find($id)->toArray()])[0]);
    }

    public function actionCreate(): array
    {
        $this->authorize($this->permission('create'));
        $class = $this->modelClass();
        $model = new $class();
        $model->load($this->body(), '');
        if (!$model->validate()) {
            throw $this->validationFailed($model);
        }
        $this->persist($model, true);
        return $this->created($this->decorate([$model->toArray()])[0]);
    }

    public function actionUpdate($id): array
    {
        $this->authorize($this->permission('update'));
        $model = $this->find($id);
        $model->load($this->body(), '');
        if (!$model->validate()) {
            throw $this->validationFailed($model);
        }
        $this->persist($model, false);
        return $this->ok($this->decorate([$model->toArray()])[0]);
    }

    public function actionDelete($id): array
    {
        $this->authorize($this->permission('delete'));
        $model = $this->find($id);
        try {
            $model->delete();
        } catch (\Throwable $e) {
            throw $this->translateDbError($e, 'delete');
        }
        return $this->ok(null);
    }

    protected function find($id): ActiveRecord
    {
        $class = $this->modelClass();
        $model = $class::find()->with($this->with())->where($this->pkCondition($class, $id))->one();
        if (!$model) {
            throw new ApiException(404, 'NOT_FOUND', 'Data tidak ditemukan');
        }
        return $model;
    }

    private function pkCondition(string $class, $id): array
    {
        $pk = $class::primaryKey()[0];
        return [$pk => $pk === 'code' ? strtoupper((string) $id) : $id];
    }

    private function persist(ActiveRecord $model, bool $isNew): void
    {
        try {
            Yii::$app->db->transaction(function () use ($model, $isNew) {
                $model->save(false);
                $this->afterSaved($model, $isNew);
            });
        } catch (\Throwable $e) {
            throw $this->translateDbError($e);
        }
        $model->refresh();
    }

    private function applySearch(ActiveQuery $query, string $q): void
    {
        if ($q === '' || !$this->searchColumns()) {
            return;
        }
        $or = ['or'];
        foreach ($this->searchColumns() as $col) {
            $or[] = ['ilike', $col, $q];
        }
        $query->andWhere($or);
    }

    private function applyFilters(ActiveQuery $query): void
    {
        foreach ($this->filterColumns() as $col => $type) {
            $raw = Yii::$app->request->get($col);
            if ($raw === null || $raw === '') {
                continue;
            }
            $value = match ($type) {
                'bool' => filter_var($raw, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE),
                'int' => filter_var($raw, FILTER_VALIDATE_INT, FILTER_NULL_ON_FAILURE),
                default => (string) $raw,
            };
            if ($value === null) {
                throw new ApiException(422, 'VALIDATION_FAILED', 'Filter tidak valid', [['field' => $col, 'message' => 'Nilai filter tidak valid']]);
            }
            $query->andWhere([$col => $value]);
        }
    }

    /** `sort=-name,code`; only whitelisted columns, `id` always last for stable paging. */
    private function applySort(ActiveQuery $query, string $sort): void
    {
        $order = [];
        foreach (array_filter(explode(',', $sort !== '' ? $sort : $this->defaultSort())) as $part) {
            $desc = $part[0] === '-';
            $col = ltrim($part, '-');
            if (in_array($col, $this->sortColumns(), true)) {
                $order[$col] = $desc ? SORT_DESC : SORT_ASC;
            }
        }
        $pk = $this->modelClass()::primaryKey()[0];
        $order[$pk] ??= SORT_ASC;
        $query->orderBy($order);
    }
}
