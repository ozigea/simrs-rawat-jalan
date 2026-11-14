<?php

namespace app\models;

use Yii;
use yii\web\IdentityInterface;

/**
 * @property int $id
 * @property string $username
 * @property string $password_hash
 * @property string $full_name
 * @property int|null $staff_id
 * @property bool $is_active
 */
class AppUser extends BaseRecord implements IdentityInterface
{
    public const ROLES = ['admin', 'pendaftaran', 'dokter', 'farmasi', 'lab', 'kasir'];

    public ?string $password = null;
    public ?string $role = null;

    public static function tableName(): string
    {
        return 'app_user';
    }

    public function rules(): array
    {
        return [
            [['username'], 'filter', 'filter' => static fn ($v) => is_string($v) ? strtolower(trim($v)) : $v],
            [['username', 'full_name'], 'required'],
            ['username', 'match', 'pattern' => '/^[a-z0-9._-]{3,50}$/', 'message' => 'Username 3-50 karakter: huruf kecil, angka, titik, garis bawah, atau strip'],
            ['username', 'unique'],
            ['full_name', 'string', 'max' => 150],
            ['password', 'required', 'when' => fn () => $this->isNewRecord, 'message' => 'Password wajib diisi'],
            ['password', 'string', 'min' => 8, 'max' => 72, 'skipOnEmpty' => true],
            ['role', 'required', 'when' => fn () => $this->isNewRecord, 'message' => 'Peran wajib diisi'],
            ['role', 'in', 'range' => self::ROLES, 'skipOnEmpty' => true],
            ['staff_id', 'filter', 'filter' => [self::class, 'emptyToNull']],
            ['staff_id', 'integer'],
            ['staff_id', 'exist', 'targetClass' => MedicalStaff::class, 'targetAttribute' => 'id', 'skipOnEmpty' => true, 'message' => 'Tenaga medis tidak ditemukan'],
            ['staff_id', 'unique', 'skipOnEmpty' => true, 'message' => 'Tenaga medis ini sudah punya akun'],
            ['is_active', 'boolean'],
        ];
    }

    public function attributeLabels(): array
    {
        return ['username' => 'Username', 'full_name' => 'Nama lengkap', 'password' => 'Password', 'role' => 'Peran',
            'staff_id' => 'Tenaga medis', 'is_active' => 'Status aktif'];
    }

    public function beforeSave($insert): bool
    {
        if ($this->password !== null && $this->password !== '') {
            $this->password_hash = Yii::$app->security->generatePasswordHash($this->password);
        }
        return parent::beforeSave($insert);
    }

    public function getStaff()
    {
        return $this->hasOne(MedicalStaff::class, ['id' => 'staff_id']);
    }

    public function fields(): array
    {
        return [
            'id', 'username', 'full_name', 'staff_id', 'is_active', 'last_login_at', 'role',
            'staff_name' => fn () => $this->staff?->name,
        ];
    }

    /** @return string[] role names assigned in RBAC */
    public function roleNames(): array
    {
        return array_keys(Yii::$app->authManager->getRolesByUser($this->id));
    }

    // IdentityInterface -------------------------------------------------------------------
    public static function findIdentity($id)
    {
        return static::findOne(['id' => $id, 'is_active' => true]);
    }

    /** Token is verified (RS256 + expiry), then the user must still exist and be active. */
    public static function findIdentityByAccessToken($token, $type = null)
    {
        $claims = Yii::$app->jwt->parse((string) $token);
        return $claims ? static::findIdentity((int) $claims->sub) : null;
    }

    public function getId()
    {
        return $this->id;
    }

    public function getAuthKey()
    {
        return null;
    }

    public function validateAuthKey($authKey)
    {
        return false;
    }
}
