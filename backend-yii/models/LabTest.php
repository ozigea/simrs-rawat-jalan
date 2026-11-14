<?php

namespace app\models;

class LabTest extends BaseRecord
{
    public static function tableName(): string
    {
        return 'lab_test';
    }

    public function rules(): array
    {
        return [
            [['code', 'name', 'tariff'], 'required'],
            [['unit', 'normal_range'], 'filter', 'filter' => [self::class, 'emptyToNull']],
            ['code', 'filter', 'filter' => 'trim'],
            ['code', 'string', 'max' => 20],
            ['code', 'unique'],
            ['name', 'string', 'max' => 150],
            ['tariff', 'number', 'min' => 0, 'max' => 999999999999.99],
            ['unit', 'string', 'max' => 30],
            ['normal_range', 'string', 'max' => 100],
            ['is_active', 'boolean'],
        ];
    }

    public function attributeLabels(): array
    {
        return ['code' => 'Kode', 'name' => 'Nama pemeriksaan', 'tariff' => 'Tarif', 'unit' => 'Satuan',
            'normal_range' => 'Nilai normal', 'is_active' => 'Status aktif'];
    }
}
