<?php

namespace app\components;

use Yii;
use yii\base\Model;
use yii\db\IntegrityException;
use yii\web\Controller;
use yii\web\Response;

/**
 * Base for all authenticated API controllers: JWT auth, RBAC check, envelope helpers.
 * Controllers stay thin (validate input, call a service/model, shape the response).
 */
abstract class ApiController extends Controller
{
    public $enableCsrfValidation = false;

    /** Action ids reachable without a token. */
    protected array $publicActions = [];

    public function behaviors(): array
    {
        return [
            'authenticator' => ['class' => JwtAuth::class, 'except' => $this->publicActions],
        ];
    }

    public function beforeAction($action): bool
    {
        $response = Yii::$app->response;
        $response->format = Response::FORMAT_JSON;
        $response->getHeaders()->set('X-Request-Id', ApiResponse::requestId());
        return parent::beforeAction($action);
    }

    protected function ok($data = null, ?array $meta = null): array
    {
        return ApiResponse::success($data, $meta);
    }

    protected function created($data = null): array
    {
        Yii::$app->response->setStatusCode(201);
        return ApiResponse::success($data);
    }

    protected function body(): array
    {
        $body = Yii::$app->request->getBodyParams();
        return is_array($body) ? $body : [];
    }

    protected function authorize(string $permission): void
    {
        if (!Yii::$app->user->can($permission)) {
            throw new ApiException(403, 'FORBIDDEN', 'Peran Anda tidak berhak mengakses fitur ini');
        }
    }

    protected function validationFailed(Model $model): ApiException
    {
        $details = [];
        foreach ($model->getErrors() as $attribute => $messages) {
            $details[] = ['field' => $attribute, 'message' => $messages[0]];
        }
        return new ApiException(422, 'VALIDATION_FAILED', 'Data tidak valid', $details);
    }

    /** Maps a PostgreSQL integrity failure to a clear API error (the DB stays the last guard). */
    protected function translateDbError(\Throwable $e, string $operation = 'save'): \Throwable
    {
        if (!$e instanceof IntegrityException) {
            return $e;
        }
        $state = $e->errorInfo[0] ?? '';
        return match ($state) {
            '23505' => new ApiException(409, 'DUPLICATE', 'Data duplikat: nilai yang harus unik sudah dipakai', [], $e),
            '23503' => $operation === 'delete'
                ? new ApiException(409, 'IN_USE', 'Data sudah dipakai data lain dan tidak dapat dihapus. Nonaktifkan data ini sebagai gantinya (is_active = false)', [], $e)
                : new ApiException(422, 'REFERENCE_INVALID', 'Data yang dirujuk tidak ditemukan', [], $e),
            '23P01' => new ApiException(409, 'RANGE_CONFLICT', 'Data bentrok dengan data yang sudah ada (jadwal tumpang tindih)', [], $e),
            '23514' => new ApiException(422, 'CHECK_VIOLATION', 'Data melanggar aturan integritas database', [], $e),
            default => $e,
        };
    }
}
