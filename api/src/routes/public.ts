// Permukaan publik: satu halaman bayar untuk pembeli, tanpa kunci app dan tanpa sesi.
//
// Yang dikembalikan sengaja hanya data yang memang perlu dilihat pembeli. metadata (payload app),
// appOrderId, dan hash apa pun tidak pernah keluar dari sini.
import { Router } from 'express';
import { pool } from '../db';
import { appDariBaris } from '../pay/appRow';
import { unggahBukti } from '../pay/service';

const router = Router();

router.get('/api/public/charges/:payId', async (req, res) => {
  try {
    const payId = String(req.params.payId);
    const [rows]: any = await pool.query(
      `SELECT payId, appCode, amount, channelCode, channelName, channelGroup, status, description,
              customerName, qrisString, vaNumber, paymentUrl, expiresAt, paidAt, createdAt
       FROM pay_charges WHERE payId = ?`,
      [payId],
    );
    if (!rows?.length) return res.status(404).json({ error: 'Tagihan tidak ditemukan.' });

    const r = rows[0];
    const [appRows]: any = await pool.query('SELECT name FROM pay_apps WHERE code = ?', [r.appCode]);

    let instruksi = '';
    if (String(r.channelGroup) === 'va' && r.vaNumber) instruksi = `Transfer ke nomor VA ${r.vaNumber}.`;
    else if (String(r.channelCode) === 'manual-transfer') instruksi = 'Transfer manual: unggah bukti lewat aplikasi asal.';
    else if (r.qrisString) instruksi = 'Pindai kode QRIS dengan aplikasi bank/e-wallet.';

    return res.json({
      payId: r.payId,
      appName: appRows?.[0]?.name || r.appCode,
      amount: Number(r.amount),
      status: r.status,
      channelCode: r.channelCode,
      channelName: r.channelName,
      channelGroup: r.channelGroup,
      description: r.description,
      customerName: r.customerName,
      qrisString: r.qrisString || null,
      vaNumber: r.vaNumber || null,
      paymentUrl: r.paymentUrl || null,
      expiresAt: r.expiresAt,
      paidAt: r.paidAt,
      instruksi,
    });
  } catch (e: any) {
    console.error('[public] detail tagihan gagal:', e?.message || e);
    return res.status(500).json({ error: 'Gagal memuat tagihan.' });
  }
});

// POST /api/public/charges/:payId/proof { dataUri }
// Pembayar mengunggah bukti transfer tanpa login. Tagihan harus PENDING dan channel-nya manual —
// untuk channel gateway, status lunas datang dari callback, bukan dari unggahan.
router.post('/api/public/charges/:payId/proof', async (req, res) => {
  try {
    const payId = String(req.params.payId);
    const [rows]: any = await pool.query('SELECT appCode, channelCode FROM pay_charges WHERE payId = ?', [payId]);
    if (!rows?.length) return res.status(404).json({ error: 'Tagihan tidak ditemukan.' });
    if (String(rows[0].channelCode) !== 'manual-transfer') {
      return res.status(409).json({ error: 'Tagihan ini dibayar lewat gateway, bukan transfer manual.' });
    }

    const [appRows]: any = await pool.query('SELECT * FROM pay_apps WHERE code = ?', [String(rows[0].appCode)]);
    if (!appRows?.length) return res.status(404).json({ error: 'App pemilik tagihan tidak ada.' });

    const charge = await unggahBukti(appDariBaris(appRows[0]), payId, req.body?.dataUri);
    return res.json({ payId, status: charge?.status || 'REVIEW' });
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    console.error('[public] unggah bukti gagal:', e?.message || e);
    return res.status(status).json({ error: e?.message || 'Gagal mengunggah bukti.' });
  }
});

export default router;
