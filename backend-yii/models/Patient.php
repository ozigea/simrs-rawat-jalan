<?php

namespace app\models;

class Patient extends BaseRecord
{
    public static function tableName(): string
    {
        return 'patient';
    }

    public function rules(): array
    {
        return [
            [['name', 'birth_date', 'gender'], 'required'],
            [['nik', 'phone', 'address'], 'filter', 'filter' => [self::class, 'emptyToNull'], 'skipOnEmpty' => false],
            ['nik', 'match', 'pattern' => '/^[0-9]{16}$/', 'message' => 'NIK harus 16 digit angka'],
            ['nik', 'unique', 'message' => 'NIK sudah terdaftar'],
            ['name', 'string', 'max' => 150],
            ['birth_date', 'date', 'format' => 'php:Y-m-d'],
            ['birth_date', 'compare', 'compareValue' => date('Y-m-d'), 'operator' => '<=', 'type' => 'string',
                'message' => 'Tanggal lahir tidak boleh di masa depan'],
            ['gender', 'in', 'range' => ['M', 'F']],
            ['phone', 'string', 'max' => 30],
            ['address', 'string'],
            ['is_active', 'boolean'],
        ];
    }

    public function attributeLabels(): array
    {
        return ['nik' => 'NIK', 'name' => 'Nama', 'birth_date' => 'Tanggal lahir', 'gender' => 'Jenis kelamin',
            'phone' => 'Telepon', 'address' => 'Alamat', 'is_active' => 'Status aktif'];
    }
}
