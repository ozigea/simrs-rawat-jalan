<?php

namespace app\models;

class Polyclinic extends BaseRecord
{
    public static function tableName(): string
    {
        return 'polyclinic';
    }

    public function rules(): array
    {
        return [
            [['code', 'name'], 'required'],
            ['code', 'filter', 'filter' => 'trim'],
            ['code', 'string', 'max' => 20],
            ['code', 'unique'],
            ['name', 'string', 'max' => 100],
            ['name', 'validateNameUnique'],
            ['registration_fee', 'number', 'min' => 0, 'max' => 999999999999.99],
            ['is_active', 'boolean'],
        ];
    }

    /** Case-insensitive, mirrors the UNIQUE (lower(name)) index. */
    public function validateNameUnique(string $attribute): void
    {
        $query = static::find()->where(['=', new \yii\db\Expression('lower(name)'), mb_strtolower((string) $this->$attribute)]);
        if (!$this->isNewRecord) {
            $query->andWhere(['<>', 'id', $this->id]);
        }
        if ($query->exists()) {
            $this->addError($attribute, 'Nama poli sudah dipakai');
        }
    }

    public function attributeLabels(): array
    {
        return ['code' => 'Kode', 'name' => 'Nama poli', 'registration_fee' => 'Biaya pendaftaran', 'is_active' => 'Status aktif'];
    }
}
