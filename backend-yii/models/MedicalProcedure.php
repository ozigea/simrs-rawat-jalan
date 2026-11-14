<?php

namespace app\models;

class MedicalProcedure extends BaseRecord
{
    public static function tableName(): string
    {
        return 'medical_procedure';
    }

    public function rules(): array
    {
        return [
            [['code', 'name', 'tariff'], 'required'],
            ['code', 'filter', 'filter' => 'trim'],
            ['code', 'string', 'max' => 20],
            ['code', 'unique'],
            ['name', 'string', 'max' => 150],
            ['tariff', 'number', 'min' => 0, 'max' => 999999999999.99],
            ['is_active', 'boolean'],
        ];
    }

    public function attributeLabels(): array
    {
        return ['code' => 'Kode', 'name' => 'Nama tindakan', 'tariff' => 'Tarif', 'is_active' => 'Status aktif'];
    }
}
