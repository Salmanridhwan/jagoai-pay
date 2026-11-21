// Permukaan API v1 JagoAI Pay. Semua rute di sini memakai kunci API app (header X-JagoaiPay-Key),
// BUKAN sesi cookie, jadi sengaja tidak terdaftar di AUTHZ_POLICY dan otorisasinya hidup di
// apiKeyAuth + daftar beku authzCoverage.test.ts (preseden: callback Duitku).
//
// Kontrak lengkap: vault `Proyek/Kas Payment Service/Kas Payment Service.md` bagian
// "Permukaan API v1" dan `Webhook Kontrak.md`.
import crypto from 'crypto';
import { Router } from 'express';
import { JAMY_BRIDGE_CALLBACK_TOKEN } from '../env';
import { apiKeyAuth, appDariRequest } from '../pay/apiKeyAuth';
import { PayError, ambilCharge, ambilChargeDariOrder, buatCharge, daftarChannel, putuskanBukti, tanganiBridgeCallback, tanganiCallback, unggahBukti } from '../pay/service';
import { putarUlangDelivery } from '../pay/webhookOut';

const router = Router();

function balasError(res: any, error: any) {
  if (error instanceof PayError) {
    return res.status(error.status).json({ error: { code: error.code, message: error.message } });
  }
  console.error('[jagoai-pay] kesalahan tak terduga:', error?.message || error);
  return res.status(500).json({ error: { code: 'internal', message: 'Terjadi kesalahan di layanan pembayaran.' } });
}

// POST /api/jagoai-pay/v1/charges — buat tagihan. Idempoten per (app, appOrderId).
router.post('/api/jagoai-pay/v1/charges', apiKeyAuth, async (req, res) => {
  try {
    const hasil = await buatCharge(appDariRequest(req), req.body || {});
    return res.status(hasil.created ? 201 : 200).json(hasil.charge);
  } catch (error: any) {
    return balasError(res, error);
  }
});

// GET /api/jagoai-pay/v1/charges?appOrderId=... — cari tagihan berdasarkan id milik app.
router.get('/api/jagoai-pay/v1/charges', apiKeyAuth, async (req, res) => {
  try {
    const appOrderId = String(req.query.appOrderId || '').trim();
    if (!appOrderId) throw new PayError('validation', 'appOrderId wajib diisi.');
    return res.json(await ambilChargeDariOrder(appDariRequest(req), appOrderId));
  } catch (error: any) {
    return balasError(res, error);
  }
});

// GET /api/jagoai-pay/v1/charges/:payId — status + objek lengkap. Poll ke Duitku bila PENDING > 60s.
router.get('/api/jagoai-pay/v1/charges/:payId', apiKeyAuth, async (req, res) => {
  try {
    return res.json(await ambilCharge(appDariRequest(req), String(req.params.payId)));
  } catch (error: any) {
    return balasError(res, error);
  }
});

// GET /api/jagoai-pay/v1/channels — channel akun yang diizinkan untuk app ini.
router.get('/api/jagoai-pay/v1/channels', apiKeyAuth, async (req, res) => {
  try {
    return res.json({ channels: await daftarChannel(appDariRequest(req)) });
  } catch (error: any) {
    return balasError(res, error);
  }
});

// POST /api/jagoai-pay/v1/charges/:payId/proof — bukti transfer manual (maks 1 MB dataURI).
router.post('/api/jagoai-pay/v1/charges/:payId/proof', apiKeyAuth, async (req, res) => {
  try {
    const bukti = (req.body || {}).proof;
    return res.json(await unggahBukti(appDariRequest(req), String(req.params.payId), bukti));
  } catch (error: any) {
    return balasError(res, error);
  }
});

// POST /api/jagoai-pay/v1/charges/:payId/decision — approve/reject bukti (scope decisions).
router.post('/api/jagoai-pay/v1/charges/:payId/decision', apiKeyAuth, async (req, res) => {
  try {
    const keputusan = String((req.body || {}).decision || '');
    if (keputusan !== 'approve' && keputusan !== 'reject') {
      throw new PayError('validation', 'decision harus "approve" atau "reject".');
    }
    return res.json(await putuskanBukti(appDariRequest(req), String(req.params.payId), keputusan));
  } catch (error: any) {
    return balasError(res, error);
  }
});

// POST /api/jagoai-pay/v1/duitku/callback — PUBLIK, bukan untuk app. Keamanannya dari verifikasi
// tanda tangan Duitku, bukan dari kunci API. Duitku mengharapkan HTTP 200 dengan body "SUCCESS".
router.post('/api/jagoai-pay/v1/duitku/callback', async (req, res) => {
  try {
    const hasil = await tanganiCallback(req.body || {});
    if (!hasil.ok) return res.status(hasil.kode).send(hasil.kode === 401 ? 'Invalid signature' : 'Transaction not found');
    return res.status(200).send('SUCCESS');
  } catch (error: any) {
    console.error('[jagoai-pay] callback error:', error?.message || error);
    return res.status(500).send('Error');
  }
});

// Token jembatan dibandingkan dengan waktu konstan: perbandingan string biasa membocorkan panjang
// awalan yang cocok lewat waktu eksekusi.
function tokenJembatanSah(diberikan: string): boolean {
  const diharapkan = String(JAMY_BRIDGE_CALLBACK_TOKEN || '');
  if (!diharapkan) return false; // token belum diisi = jembatan tidak boleh dipercaya
  const a = Buffer.from(diberikan);
  const b = Buffer.from(diharapkan);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// POST /api/jagoai-pay/v1/bridge/callback — pemberitahuan status dari jembatan jamy.
// BUKAN untuk aplikasi klien: pemanggilnya jamy, dengan token bersama. Ini pengganti callback Duitku
// ketika gateway berjalan lewat jembatan (layanan ini tidak lagi memegang kredensial Duitku).
router.post('/api/jagoai-pay/v1/bridge/callback', async (req, res) => {
  try {
    if (!tokenJembatanSah(String(req.header('x-jagoai-pay-token') || ''))) {
      return res.status(401).json({ error: { code: 'unauthorized', message: 'Token jembatan tidak sah.' } });
    }
    const hasil = await tanganiBridgeCallback(req.body || {});
    if (!hasil.ok) {
      const peta: Record<number, { code: string; message: string }> = {
        404: { code: 'not_found', message: 'Tagihan tidak ditemukan.' },
        409: { code: 'amount_mismatch', message: 'Nominal di notifikasi tidak sama dengan tagihan.' },
      };
      const isi = peta[hasil.kode] || { code: 'validation', message: 'Notifikasi jembatan tidak valid.' };
      return res.status(hasil.kode).json({ error: isi });
    }
    return res.json({ ok: true });
  } catch (error: any) {
    return balasError(res, error);
  }
});

// POST /api/jagoai-pay/v1/deliveries/:deliveryId/replay — kirim ulang satu webhook milik app ini.
router.post('/api/jagoai-pay/v1/deliveries/:deliveryId/replay', apiKeyAuth, async (req, res) => {
  try {
    const berhasil = await putarUlangDelivery(appDariRequest(req), String(req.params.deliveryId));
    if (!berhasil) throw new PayError('not_found', 'Delivery tidak ditemukan.', 404);
    return res.json({ ok: true, deliveryId: String(req.params.deliveryId) });
  } catch (error: any) {
    return balasError(res, error);
  }
});

export default router;
