<?php

namespace app\models;

class MedicalStaff extends BaseRecord
{
    public const TYPES = ['DOCTOR', 'NURSE', 'PHARMACIST', 'LAB_ANALYST'];

    public static function tableName(): string
    {
        return 'medical_staff';
    }

    public function rules(): array
    {
        return [
            [['code', 'name', 'staff_type'], 'required'],
            [['code', 'name', 'license_no', 'specialization', 'phone'], 'filter', 'filter' => [self::class, 'emptyToNull']],
            ['code', 'string', 'max' => 20],
            ['code', 'unique'],
            ['name', 'string', 'max' => 150],
            ['staff_type', 'in', 'range' => self::TYPES],
            ['license_no', 'string', 'max' => 50],
            ['license_no', 'unique', 'skipOnEmpty' => true],
            ['specialization', 'string', 'max' => 100],
            ['phone', 'string', 'max' => 30],
            ['is_active', 'boolean'],
        ];
    }

    public function attributeLabels(): array
    {
        return ['code' => 'Kode', 'name' => 'Nama', 'staff_type' => 'Jenis tenaga', 'license_no' => 'No. STR/SIP',
            'specialization' => 'Spesialisasi', 'phone' => 'Telepon', 'is_active' => 'Status aktif'];
    }
}
