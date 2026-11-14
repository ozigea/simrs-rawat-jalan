<?php

namespace app\models;

/**
 * stock_qty is deliberately not assignable: it changes only through StockService (ledger +
 * row lock). initial_stock is accepted on create and booked as the opening ledger entry.
 */
class Medicine extends BaseRecord
{
    public $initial_stock = 0;

    public static function tableName(): string
    {
        return 'medicine';
    }

    public function rules(): array
    {
        return [
            [['code', 'name', 'unit', 'price'], 'required'],
            ['code', 'filter', 'filter' => 'trim'],
            ['code', 'string', 'max' => 20],
            ['code', 'unique'],
            ['name', 'string', 'max' => 150],
            ['unit', 'string', 'max' => 30],
            ['price', 'number', 'min' => 0, 'max' => 999999999999.99],
            ['min_stock', 'integer', 'min' => 0],
            ['initial_stock', 'integer', 'min' => 0, 'when' => fn () => $this->isNewRecord],
            ['is_active', 'boolean'],
        ];
    }

    public function attributeLabels(): array
    {
        return ['code' => 'Kode', 'name' => 'Nama obat', 'unit' => 'Satuan', 'price' => 'Harga',
            'min_stock' => 'Stok minimum', 'initial_stock' => 'Stok awal', 'is_active' => 'Status aktif'];
    }
}
