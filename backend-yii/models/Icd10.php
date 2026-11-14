<?php

namespace app\models;

use yii\db\ActiveRecord;

/** Code is the primary key (e.g. "A01.0"); it cannot be changed after creation. */
class Icd10 extends ActiveRecord
{
    public static function tableName(): string
    {
        return 'icd10';
    }

    public static function primaryKey(): array
    {
        return ['code'];
    }

    public function rules(): array
    {
        return [
            ['code', 'filter', 'filter' => static fn ($v) => is_string($v) ? strtoupper(trim($v)) : $v],
            [['code', 'description'], 'required'],
            ['code', 'match', 'pattern' => '/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/', 'message' => 'Format kode ICD-10 tidak valid (contoh: A01.0)'],
            ['code', 'unique', 'on' => 'default', 'when' => fn () => $this->isNewRecord, 'message' => 'Kode ICD-10 sudah ada'],
            ['code', 'validateImmutable'],
            ['description', 'string', 'max' => 255],
            ['is_active', 'boolean'],
        ];
    }

    public function validateImmutable(string $attribute): void
    {
        if (!$this->isNewRecord && $this->isAttributeChanged($attribute)) {
            $this->addError($attribute, 'Kode ICD-10 tidak dapat diubah');
        }
    }

    public function attributeLabels(): array
    {
        return ['code' => 'Kode', 'description' => 'Deskripsi', 'is_active' => 'Status aktif'];
    }
}
