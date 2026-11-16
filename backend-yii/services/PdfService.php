<?php

namespace app\services;

use Mpdf\Mpdf;
use Yii;

/** Printable invoice and payment receipt (R-25) rendered with mPDF. */
class PdfService
{
    private const HOSPITAL = 'SIMRS Rawat Jalan';
    private const LABELS = [
        'REGISTRATION' => 'Pendaftaran', 'PROCEDURE' => 'Tindakan', 'LAB' => 'Laboratorium', 'MEDICINE' => 'Obat', 'ADJUSTMENT' => 'Penyesuaian',
    ];
    private const METHODS = ['CASH' => 'Tunai', 'DEBIT' => 'Kartu debit (simulasi)', 'CREDIT' => 'Kartu kredit (simulasi)', 'QRIS' => 'QRIS (simulasi)', 'TRANSFER' => 'Transfer (simulasi)'];
    private const STATUS = ['UNPAID' => 'BELUM DIBAYAR', 'PARTIAL' => 'DIBAYAR SEBAGIAN', 'PAID' => 'LUNAS', 'OVERPAID' => 'KELEBIHAN BAYAR'];

    public function invoice(array $inv): string
    {
        $rows = '';
        foreach ($inv['lines'] as $l) {
            $void = $l['status'] === 'VOID';
            $rows .= '<tr' . ($void ? ' class="void"' : '') . '><td>' . $this->e(self::LABELS[$l['source_type']] ?? $l['source_type']) . '</td><td>' . $this->e($l['description'])
                . ($void ? ' <i>(dibatalkan: ' . $this->e((string) $l['void_reason']) . ')</i>' : '') . '</td><td class="r">' . (int) $l['qty']
                . '</td><td class="r">' . $this->money($l['unit_price']) . '</td><td class="r">' . ($void ? '-' : $this->money($l['amount'])) . '</td></tr>';
        }
        $pays = '';
        foreach ($inv['payments'] as $p) {
            $pays .= '<tr><td>' . $this->e($p['payment_no']) . '</td><td>' . $this->e(date('d-m-Y H:i', strtotime($p['paid_at']))) . '</td><td>'
                . $this->e(self::METHODS[$p['method']] ?? $p['method']) . '</td><td class="r">' . $this->money($p['amount']) . '</td></tr>';
        }
        $html = $this->head() . '<h2>INVOICE</h2>'
            . '<table class="meta"><tr><td>No. Invoice</td><td>: <b>' . $this->e($inv['invoice_no']) . '</b></td><td>Status</td><td>: <b>' . $this->e(self::STATUS[$inv['status']] ?? $inv['status']) . '</b></td></tr>'
            . '<tr><td>Pasien</td><td>: ' . $this->e($inv['patient_name']) . ' (' . $this->e($inv['mrn']) . ')</td><td>Tanggal kunjungan</td><td>: ' . $this->e(date('d-m-Y', strtotime($inv['visit_date']))) . '</td></tr>'
            . '<tr><td>Poli</td><td>: ' . $this->e($inv['polyclinic_name']) . '</td><td>Dokter</td><td>: ' . $this->e($inv['doctor_name']) . '</td></tr>'
            . '<tr><td>No. Kunjungan</td><td>: ' . $this->e($inv['visit_no']) . '</td><td></td><td></td></tr></table>'
            . '<table class="grid"><thead><tr><th>Jenis</th><th>Rincian</th><th>Jml</th><th>Harga</th><th>Subtotal</th></tr></thead><tbody>' . $rows . '</tbody>'
            . '<tfoot><tr><td colspan="4" class="r"><b>Total</b></td><td class="r"><b>' . $this->money($inv['total_amount']) . '</b></td></tr>'
            . '<tr><td colspan="4" class="r">Dibayar</td><td class="r">' . $this->money($inv['paid_amount']) . '</td></tr>'
            . '<tr><td colspan="4" class="r"><b>Sisa</b></td><td class="r"><b>' . $this->money($inv['remaining']) . '</b></td></tr></tfoot></table>';
        if ($pays !== '') {
            $html .= '<h3>Riwayat pembayaran</h3><table class="grid"><thead><tr><th>No. Pembayaran</th><th>Waktu</th><th>Metode</th><th>Jumlah</th></tr></thead><tbody>' . $pays . '</tbody></table>';
        }
        return $this->render($html . '<p class="foot">Dicetak ' . date('d-m-Y H:i') . '</p>');
    }

    public function receipt(array $p): string
    {
        $cash = $p['method'] === 'CASH'
            ? '<tr><td>Uang diterima</td><td>: ' . $this->money($p['cash_received']) . '</td></tr><tr><td>Kembalian</td><td>: ' . $this->money($p['change_amount']) . '</td></tr>'
            : '<tr><td>No. referensi</td><td>: ' . $this->e((string) $p['reference_no']) . '</td></tr>';
        $html = $this->head() . '<h2>BUKTI PEMBAYARAN</h2>'
            . '<table class="meta"><tr><td>No. Pembayaran</td><td>: <b>' . $this->e($p['payment_no']) . '</b></td></tr>'
            . '<tr><td>Waktu</td><td>: ' . $this->e(date('d-m-Y H:i', strtotime($p['paid_at']))) . '</td></tr>'
            . '<tr><td>No. Invoice</td><td>: ' . $this->e($p['invoice_no']) . '</td></tr>'
            . '<tr><td>Pasien</td><td>: ' . $this->e($p['patient_name']) . ' (' . $this->e($p['mrn']) . ')</td></tr>'
            . '<tr><td>Metode</td><td>: ' . $this->e(self::METHODS[$p['method']] ?? $p['method']) . '</td></tr>'
            . '<tr><td>Jumlah dibayar</td><td>: <b>' . $this->money($p['amount']) . '</b></td></tr>' . $cash
            . '<tr><td>Total tagihan</td><td>: ' . $this->money($p['total_amount']) . '</td></tr>'
            . '<tr><td>Total dibayar</td><td>: ' . $this->money($p['paid_amount']) . '</td></tr>'
            . '<tr><td>Sisa tagihan</td><td>: <b>' . $this->money($p['remaining']) . '</b></td></tr>'
            . '<tr><td>Status tagihan</td><td>: ' . $this->e(self::STATUS[$p['invoice_status']] ?? $p['invoice_status']) . '</td></tr>'
            . '<tr><td>Kasir</td><td>: ' . $this->e($p['cashier_name']) . '</td></tr></table>'
            . '<p class="foot">Pembayaran non-tunai pada aplikasi ini hanya simulasi.</p>';
        return $this->render($html);
    }

    private function render(string $body): string
    {
        $dir = Yii::$app->runtimePath . '/mpdf';
        if (!is_dir($dir)) {
            mkdir($dir, 0777, true);
        }
        $mpdf = new Mpdf(['mode' => 'utf-8', 'format' => 'A4', 'tempDir' => $dir, 'margin_left' => 15, 'margin_right' => 15, 'margin_top' => 15, 'margin_bottom' => 15]);
        $mpdf->WriteHTML($this->css(), \Mpdf\HTMLParserMode::HEADER_CSS);
        $mpdf->WriteHTML($body, \Mpdf\HTMLParserMode::HTML_BODY);
        return $mpdf->Output('', 'S');
    }

    private function css(): string
    {
        return 'body{font-family:sans-serif;font-size:10pt} h1{font-size:15pt;margin:0} h2{font-size:13pt;margin:10px 0} h3{font-size:11pt;margin:14px 0 4px}'
            . ' .sub{color:#555} table{width:100%;border-collapse:collapse} .meta td{padding:2px 4px;vertical-align:top}'
            . ' .grid th{background:#eee;border:1px solid #999;padding:4px;text-align:left} .grid td{border:1px solid #bbb;padding:4px}'
            . ' .r{text-align:right} .void td{color:#888;text-decoration:line-through} .foot{margin-top:18px;color:#666;font-size:8pt}';
    }

    private function head(): string
    {
        return '<h1>' . self::HOSPITAL . '</h1><div class="sub">Pelayanan Rawat Jalan</div><hr>';
    }

    private function money($v): string
    {
        $n = (float) $v;
        return 'Rp ' . (fmod($n, 1.0) == 0.0 ? number_format($n, 0, ',', '.') : number_format($n, 2, ',', '.'));
    }

    private function e(string $s): string
    {
        return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    }
}
