<?php

namespace app\models;

use yii\base\Model;

/** Input validation for the examination record (R-13). */
class ExaminationForm extends Model
{
    public $anamnesis;
    public $chief_complaint;
    public $systolic;
    public $diastolic;
    public $pulse;
    public $resp_rate;
    public $temperature;
    public $spo2;
    public $weight_kg;
    public $height_cm;
    public $physical_exam;

    public const FIELDS = ['anamnesis', 'chief_complaint', 'systolic', 'diastolic', 'pulse', 'resp_rate',
        'temperature', 'spo2', 'weight_kg', 'height_cm', 'physical_exam'];

    public function rules(): array
    {
        return [
            [self::FIELDS, 'filter', 'filter' => static fn ($v) => is_string($v) && trim($v) === '' ? null : (is_string($v) ? trim($v) : $v), 'skipOnEmpty' => false],
            ['chief_complaint', 'required', 'message' => 'Keluhan utama wajib diisi'],
            [['anamnesis', 'chief_complaint', 'physical_exam'], 'string', 'max' => 5000],
            ['systolic', 'integer', 'min' => 30, 'max' => 300],
            ['diastolic', 'integer', 'min' => 20, 'max' => 200],
            ['pulse', 'integer', 'min' => 20, 'max' => 300],
            ['resp_rate', 'integer', 'min' => 5, 'max' => 80],
            ['temperature', 'number', 'min' => 25, 'max' => 45],
            ['spo2', 'integer', 'min' => 0, 'max' => 100],
            ['weight_kg', 'number', 'min' => 0.1, 'max' => 500],
            ['height_cm', 'number', 'min' => 1, 'max' => 300],
            ['diastolic', 'validateBloodPressure'],
        ];
    }

    public function validateBloodPressure(string $attribute): void
    {
        if ($this->systolic !== null && $this->diastolic !== null && (int) $this->diastolic >= (int) $this->systolic) {
            $this->addError($attribute, 'Diastolik harus lebih rendah dari sistolik');
        }
    }

    public function attributeLabels(): array
    {
        return ['anamnesis' => 'Anamnesis', 'chief_complaint' => 'Keluhan utama', 'systolic' => 'Sistolik', 'diastolic' => 'Diastolik',
            'pulse' => 'Nadi', 'resp_rate' => 'Napas', 'temperature' => 'Suhu', 'spo2' => 'SpO2', 'weight_kg' => 'Berat badan',
            'height_cm' => 'Tinggi badan', 'physical_exam' => 'Pemeriksaan fisik'];
    }
}
