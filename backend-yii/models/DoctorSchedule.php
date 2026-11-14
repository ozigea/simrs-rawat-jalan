<?php

namespace app\models;

class DoctorSchedule extends BaseRecord
{
    public static function tableName(): string
    {
        return 'doctor_schedule';
    }

    public function rules(): array
    {
        $time = '/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/';
        return [
            [['doctor_id', 'polyclinic_id', 'day_of_week', 'start_time', 'end_time', 'quota'], 'required'],
            ['doctor_id', 'integer'],
            ['doctor_id', 'exist', 'targetClass' => MedicalStaff::class, 'targetAttribute' => 'id',
                'filter' => ['staff_type' => 'DOCTOR', 'is_active' => true], 'message' => 'Dokter tidak ditemukan atau tidak aktif'],
            ['polyclinic_id', 'integer'],
            ['polyclinic_id', 'exist', 'targetClass' => Polyclinic::class, 'targetAttribute' => 'id',
                'filter' => ['is_active' => true], 'message' => 'Poli tidak ditemukan atau tidak aktif'],
            ['day_of_week', 'integer', 'min' => 1, 'max' => 7],
            [['start_time', 'end_time'], 'match', 'pattern' => $time, 'message' => 'Format jam HH:MM'],
            ['end_time', 'validateRange'],
            ['quota', 'integer', 'min' => 1],
            ['is_active', 'boolean'],
        ];
    }

    public function validateRange(string $attribute): void
    {
        if ($this->start_time && $this->end_time && substr($this->end_time . ':00', 0, 8) <= substr($this->start_time . ':00', 0, 8)) {
            $this->addError($attribute, 'Jam selesai harus setelah jam mulai');
        }
    }

    public function getDoctor()
    {
        return $this->hasOne(MedicalStaff::class, ['id' => 'doctor_id']);
    }

    public function getPolyclinic()
    {
        return $this->hasOne(Polyclinic::class, ['id' => 'polyclinic_id']);
    }

    public function fields(): array
    {
        return array_merge(parent::fields(), [
            'doctor_name' => fn () => $this->doctor?->name,
            'polyclinic_name' => fn () => $this->polyclinic?->name,
        ]);
    }

    public function attributeLabels(): array
    {
        return ['doctor_id' => 'Dokter', 'polyclinic_id' => 'Poli', 'day_of_week' => 'Hari', 'start_time' => 'Jam mulai',
            'end_time' => 'Jam selesai', 'quota' => 'Kuota', 'is_active' => 'Status aktif'];
    }
}
