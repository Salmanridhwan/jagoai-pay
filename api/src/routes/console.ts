// Permukaan console: baca-saja untuk dashboard + aksi terkontrol (putuskan bukti, putar ulang
// webhook, kelola app). Semuanya butuh sesi cookie console; `viewer` ditolak di jalur tulis.
//
// Berbeda dari versi di jamy, console di sini juga bisa MENDAFTARKAN app sendiri, karena tidak ada
// lagi skrip CLI yang menempel di repo aplikasi lain. Kunci API hanya keluar sekali, di respons
// pembuatan/rotasi — setelah itu yang tersimpan hanya hash-nya.
import crypto from 'crypto';
import { Router } from 'express';
import { pool } from '../db';
import { wajibLogin, wajibOperator } from '../auth';
import { putuskanBukti } from '../pay/service';
import { putarUlangDelivery } from '../pay/webhookOut';
import { hashApiKey } from '../pay/ids';
import { appDariBaris } from '../pay/appRow';
import type { PayApp } from '../pay/apiKeyAuth';

const router = Router();

async function appDariKode(code: string): Promise<PayApp | null> {
  const [rows]: any = await pool.query('SELECT * FROM pay_apps WHERE code = ?', [code]);
  if (!rows?.length) return null;
  return appDariBaris(rows[0]);
}

// Semua rute di router ini butuh sesi; router dipasang pada prefiks /api/console.
router.use(wajibLogin);

// GET /api/console/summary
router.get('/summary', async (req, res) => {
  try {
    // Jendela grafik bisa 7/14/30 hari. Dibatasi daftar putih: nilai lain kembali ke 14, jadi
    // parameter aneh (atau 10000) tidak membangkitkan deret panjang dan tidak mengubah bentuk jawaban.
    const minta = Number(req.query.hari);
    const hari = [7, 14, 30].includes(minta) ? minta : 14;
    const [perStatus]: any = await pool.query(`
      SELECT status, COUNT(*) AS jumlah, COALESCE(SUM(amount), 0) AS nilai
      FROM pay_charges GROUP BY status
    `);

    const [total]: any = await pool.query(`
      SELECT COUNT(*) AS jumlah,
             COALESCE(SUM(CASE WHEN status = 'PAID' THEN amount ELSE 0 END), 0) AS nilaipaid,
             COALESCE(SUM(CASE WHEN status = 'PAID' THEN net ELSE 0 END), 0) AS netpaid,
             COUNT(*) FILTER (WHERE status = 'PAID') AS jumlahpaid
      FROM pay_charges
    `);

    // "Hari ini" = hari kalender WIB, dan yang dihitung adalah tagihan yang DIBAYAR hari ini (paidAt),
    // bukan yang dibuat hari ini. Versi lama memakai createdAt sehingga pemasukan tercatat di tanggal
    // tagihan dibuat — tagihan kemarin yang dibayar pagi ini tidak masuk, tagihan hari ini yang dibayar
    // besok sudah dihitung duluan.
    const [hariIni]: any = await pool.query(`
      SELECT COUNT(*) AS jumlah,
             COALESCE(SUM(amount), 0) AS nilaipaid
      FROM pay_charges
      WHERE status = 'PAID'
        AND paidAt <> ''
        AND to_char(nullif(paidAt, '')::timestamptz AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')
            = to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')
    `);

    // Umur tagihan REVIEW tertua: dipakai kartu "butuh tindakan" supaya terlihat sejak kapan uang
    // pembeli tertahan. Dihitung dari createdAt, bukan paidAt (belum lunas).
    const [tertua]: any = await pool.query(
      `SELECT MIN(createdat) AS tertua FROM pay_charges WHERE status = 'REVIEW'`,
    );

    // Ringkasan per aplikasi. Hanya baris PAID yang dijumlahkan supaya "nilai" berarti uang masuk,
    // bukan potensi. Alias dikutip agar tidak diterjemahkan peta COLUMN_CASE.
    const [perApp]: any = await pool.query(`
      SELECT c.appCode AS "appCode",
             COALESCE(a.name, c.appCode) AS "nama",
             COUNT(*) AS "jumlah",
             COUNT(*) FILTER (WHERE c.status = 'PAID') AS "lunas",
             COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'PAID'), 0) AS "nilai",
             COALESCE(SUM(c.fee) FILTER (WHERE c.status = 'PAID'), 0) AS "biaya",
             COALESCE(SUM(c.net) FILTER (WHERE c.status = 'PAID'), 0) AS "net"
      FROM pay_charges c
      LEFT JOIN pay_apps a ON a.code = c.appCode
      GROUP BY c.appCode, a.name
      ORDER BY "nilai" DESC, c.appCode ASC
    `);

    // Median waktu buat→bayar: satu angka yang menjawab "pembeli biasanya bayar secepat apa".
    // Rata-rata mudah dirusak satu tagihan yang baru dibayar berhari-hari kemudian.
    const [median]: any = await pool.query(`
      SELECT percentile_cont(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (paidat::timestamptz - createdat::timestamptz)) / 60
             ) AS menit
      FROM pay_charges
      WHERE status = 'PAID' AND paidat <> '' AND createdat <> ''
    `);

    const [apps]: any = await pool.query(`
      SELECT COUNT(*) AS jumlah,
             COUNT(*) FILTER (WHERE status = 'ACTIVE') AS aktif,
             COUNT(*) FILTER (WHERE webhookUrl IS NULL OR webhookUrl = '') AS tanpahook
      FROM pay_apps
    `);

    // Kesehatan per aplikasi: satu "gagal permanen" global tidak memberi tahu app mana yang rusak.
    // Basisnya pay_apps (bukan pay_charges) supaya app tanpa tagihan tetap muncul dengan angka nol.
    const [perAppSehat]: any = await pool.query(`
      SELECT a.code AS "appCode",
             a.name AS "nama",
             (a.webhookUrl IS NULL OR a.webhookUrl = '') AS "tanpaHook",
             COUNT(d.deliveryid) FILTER (WHERE d.status = 'DELIVERED') AS "terkirim",
             COUNT(d.deliveryid) FILTER (WHERE d.status = 'DEAD') AS "mati",
             COUNT(d.deliveryid) FILTER (WHERE d.status IN ('PENDING', 'RETRY')) AS "menunggu"
      FROM pay_apps a
      LEFT JOIN pay_webhook_deliveries d ON d.appcode = a.code
      GROUP BY a.code, a.name, a.webhookUrl
      ORDER BY a.code ASC
    `);

    const [errorTerakhir]: any = await pool.query(`
      SELECT DISTINCT ON (appcode) appcode AS "appCode", lasterror AS "error"
      FROM pay_webhook_deliveries
      WHERE status = 'DEAD' AND COALESCE(lasterror, '') <> ''
      ORDER BY appcode, updatedat DESC
    `);

    const [deliveries]: any = await pool.query(`
      SELECT COUNT(*) AS jumlah,
             COUNT(*) FILTER (WHERE status = 'DELIVERED') AS terkirim,
             COUNT(*) FILTER (WHERE status = 'DEAD') AS mati,
             COUNT(*) FILTER (WHERE status IN ('PENDING', 'RETRY')) AS menunggu
      FROM pay_webhook_deliveries
    `);

    // Rangkaian hari dibangkitkan lebih dulu lalu di-LEFT JOIN, supaya hari tanpa tagihan tetap muncul
    // sebagai nol (grafik tidak bolong) dan jumlah batangnya tepat `hari`, bukan "hari yang kebetulan ada".
    const [tren]: any = await pool.query(
      `WITH hari AS (
         SELECT to_char(g, 'YYYY-MM-DD') AS hari
         FROM generate_series(
                ((now() AT TIME ZONE 'Asia/Jakarta')::date - (INTERVAL '1 day' * ?))::date,
                (now() AT TIME ZONE 'Asia/Jakarta')::date,
                INTERVAL '1 day') g
       )
       SELECT h.hari,
              COUNT(c.payid) AS jumlah,
              COUNT(c.payid) AS paid,
              COALESCE(SUM(c.amount), 0) AS nilai
       FROM hari h
       LEFT JOIN pay_charges c
         ON c.status = 'PAID'
        AND c.paidAt <> ''
        AND to_char(nullif(c.paidAt, '')::timestamptz AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') = h.hari
       GROUP BY h.hari
       ORDER BY h.hari ASC`,
      [hari - 1],
    );

    return res.json({
      total: total?.[0] || {},
      hariIni: hariIni?.[0] || {},
      apps: apps?.[0] || {},
      deliveries: deliveries?.[0] || {},
      perStatus: perStatus || [],
      tren: tren || [],
      perApp: perApp || [],
      perAppSehat: (perAppSehat || []).map((a: any) => ({
        ...a,
        errorTerakhir: (errorTerakhir || []).find((e: any) => e.appCode === a.appCode)?.error || null,
      })),
      hari,
      medianBayarMenit: median?.[0]?.menit === null || median?.[0]?.menit === undefined
        ? null
        : Math.round(Number(median[0].menit)),
      tindakan: { tertua: tertua?.[0]?.tertua || null },
    });
  } catch (e: any) {
    console.error('[console] summary gagal:', e?.message || e);
    return res.status(500).json({ error: 'Gagal memuat ringkasan.' });
  }
});

// GET /api/console/charges?status=&app=&q=&limit=&offset=
router.get('/charges', async (req, res) => {
  try {
    const status = String(req.query.status || '').trim();
    const app = String(req.query.app || '').trim();
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const where: string[] = [];
    const args: any[] = [];
    if (status && status !== 'ALL') {
      // 'GAGAL' adalah saringan gabungan untuk satu pertanyaan: "uang mana yang tidak jadi masuk?".
      // Ketiga status ini beda arti (kedaluwarsa, ditolak gateway, bukti ditolak operator) tetapi
      // sama-sama tidak menghasilkan uang.
      if (status === 'GAGAL') {
        where.push(`status IN ('EXPIRED', 'FAILED', 'REJECTED')`);
      } else {
        where.push('status = ?');
        args.push(status);
      }
    }
    if (app && app !== 'ALL') {
      where.push('appCode = ?');
      args.push(app);
    }
    if (q) {
      where.push('(payId ILIKE ? OR appOrderId ILIKE ? OR customerName ILIKE ? OR description ILIKE ?)');
      const pola = `%${q}%`;
      args.push(pola, pola, pola, pola);
    }
    const klausa = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows]: any = await pool.query(
      `SELECT payId, appCode, appOrderId, amount, fee, net, channelCode, channelName, channelGroup,
              status, description, customerName, customerEmail, expiresAt, paidAt, createdAt, updatedAt,
              (proofUrl IS NOT NULL AND proofUrl <> '') AS adabukti
       FROM pay_charges ${klausa}
       ORDER BY createdAt DESC, payId DESC
       LIMIT ${limit} OFFSET ${offset}`,
      args,
    );
    const [hitung]: any = await pool.query(`SELECT COUNT(*) AS jumlah FROM pay_charges ${klausa}`, args);

    return res.json({ rows: rows || [], total: Number(hitung?.[0]?.jumlah || 0), limit, offset });
  } catch (e: any) {
    console.error('[console] daftar tagihan gagal:', e?.message || e);
    return res.status(500).json({ error: 'Gagal memuat tagihan.' });
  }
});

// GET /api/console/charges/:payId
router.get('/charges/:payId', async (req, res) => {
  try {
    const payId = String(req.params.payId);
    const [rows]: any = await pool.query('SELECT * FROM pay_charges WHERE payId = ?', [payId]);
    if (!rows?.length) return res.status(404).json({ error: 'Tagihan tidak ditemukan.' });
    const [deliveries]: any = await pool.query(
      `SELECT deliveryId, event, status, attempt, lastError, createdAt, updatedAt
       FROM pay_webhook_deliveries WHERE payId = ? ORDER BY createdAt ASC`,
      [payId],
    );
    return res.json({ charge: rows[0], deliveries: deliveries || [] });
  } catch (e: any) {
    console.error('[console] detail tagihan gagal:', e?.message || e);
    return res.status(500).json({ error: 'Gagal memuat detail tagihan.' });
  }
});

// POST /api/console/charges/:payId/decision { decision: 'approve' | 'reject' }
router.post('/charges/:payId/decision', wajibOperator, async (req, res) => {
  try {
    const payId = String(req.params.payId);
    const keputusan = String(req.body?.decision || '').trim();
    if (keputusan !== 'approve' && keputusan !== 'reject') {
      return res.status(400).json({ error: 'decision harus "approve" atau "reject".' });
    }
    const [rows]: any = await pool.query('SELECT appCode FROM pay_charges WHERE payId = ?', [payId]);
    if (!rows?.length) return res.status(404).json({ error: 'Tagihan tidak ditemukan.' });
    const app = await appDariKode(String(rows[0].appCode));
    if (!app) return res.status(404).json({ error: 'App pemilik tagihan tidak ada.' });

    console.log(`[console] ${req.consoleUser?.email} memutuskan ${keputusan} untuk ${payId} (app ${app.code})`);
    const hasil = await putuskanBukti({ ...app, allowDecisions: true }, payId, keputusan);
    return res.json(hasil);
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    console.error('[console] keputusan gagal:', e?.message || e);
    return res.status(status).json({ error: e?.message || 'Gagal memproses keputusan.' });
  }
});

// GET /api/console/apps
router.get('/apps', async (_req, res) => {
  try {
    const [rows]: any = await pool.query(`
      SELECT a.code, a.name, a.status, a.allowedChannels, a.webhookUrl, a.apiKeyPrefix, a.ownerEmail,
             a.allowDecisions, a.minAmount, a.maxAmount, a.createdAt,
             COALESCE(c.jumlah, 0) AS totalcharge,
             COALESCE(c.paid, 0) AS paidcharge,
             COALESCE(c.nilaipaid, 0) AS nilaipaid,
             COALESCE(c.terakhir, '') AS terakhircharge
      FROM pay_apps a
      LEFT JOIN (
        SELECT appCode,
               COUNT(*) AS jumlah,
               COUNT(*) FILTER (WHERE status = 'PAID') AS paid,
               COALESCE(SUM(CASE WHEN status = 'PAID' THEN amount ELSE 0 END), 0) AS nilaipaid,
               MAX(createdAt) AS terakhir
        FROM pay_charges GROUP BY appCode
      ) c ON c.appCode = a.code
      ORDER BY a.name ASC
    `);
    return res.json({ rows: rows || [] });
  } catch (e: any) {
    console.error('[console] daftar app gagal:', e?.message || e);
    return res.status(500).json({ error: 'Gagal memuat aplikasi.' });
  }
});

// POST /api/console/apps { code, name, webhookUrl?, channels?, allowDecisions?, minAmount?, maxAmount? }
// Kunci + webhook secret dikembalikan SEKALI di sini; tidak ada endpoint yang bisa membacanya lagi.
router.post('/apps', wajibOperator, async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim();
    if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(code)) {
      return res.status(400).json({ error: 'Kode app: 2-32 karakter, huruf kecil/angka/strip.' });
    }
    if (!name) return res.status(400).json({ error: 'Nama app wajib diisi.' });

    const [ada]: any = await pool.query('SELECT code FROM pay_apps WHERE code = ?', [code]);
    if (ada?.length) return res.status(409).json({ error: 'Kode app sudah dipakai.' });

    const kunci = `jgp_${crypto.randomBytes(24).toString('base64url')}`;
    const secret = `whs_${crypto.randomBytes(24).toString('base64url')}`;
    const channels = String(req.body?.channels || 'SP,BR')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean)
      .join(',');

    await pool.query(
      `INSERT INTO pay_apps (code, name, apiKeyHash, apiKeyPrefix, webhookUrl, webhookSecret, allowedChannels,
                             allowDecisions, minAmount, maxAmount, status, createdAt, ownerEmail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
      [
        code,
        name,
        hashApiKey(kunci),
        kunci.slice(0, 12),
        String(req.body?.webhookUrl || ''),
        secret,
        channels,
        req.body?.allowDecisions ? 1 : 0,
        Number(req.body?.minAmount) || 10000,
        Number(req.body?.maxAmount) || 25000000,
        new Date().toISOString(),
        req.consoleUser?.email || '',
      ],
    );
    console.log(`[console] app ${code} didaftarkan oleh ${req.consoleUser?.email}`);
    return res.status(201).json({ code, name, apiKey: kunci, webhookSecret: secret, channels });
  } catch (e: any) {
    console.error('[console] daftar app gagal:', e?.message || e);
    return res.status(500).json({ error: 'Gagal mendaftarkan app.' });
  }
});

// PATCH /api/console/apps/:code — ubah webhook/channel/status/rentang. Tanpa menyentuh kunci.
router.patch('/apps/:code', wajibOperator, async (req, res) => {
  try {
    const code = String(req.params.code);
    const [ada]: any = await pool.query('SELECT code FROM pay_apps WHERE code = ?', [code]);
    if (!ada?.length) return res.status(404).json({ error: 'App tidak ditemukan.' });

    const set: string[] = [];
    const args: any[] = [];
    const isi = (kolom: string, nilai: any) => {
      set.push(`${kolom} = ?`);
      args.push(nilai);
    };
    if (typeof req.body?.webhookUrl === 'string') isi('webhookUrl', req.body.webhookUrl.trim());
    if (typeof req.body?.channels === 'string') isi('allowedChannels', req.body.channels.split(',').map((c: string) => c.trim().toUpperCase()).filter(Boolean).join(','));
    if (typeof req.body?.status === 'string') isi('status', req.body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE');
    if (req.body?.allowDecisions !== undefined) isi('allowDecisions', req.body.allowDecisions ? 1 : 0);
    if (req.body?.minAmount !== undefined) isi('minAmount', Number(req.body.minAmount) || 10000);
    if (req.body?.maxAmount !== undefined) isi('maxAmount', Number(req.body.maxAmount) || 25000000);
    if (!set.length) return res.status(400).json({ error: 'Tidak ada field yang diubah.' });

    args.push(code);
    await pool.query(`UPDATE pay_apps SET ${set.join(', ')} WHERE code = ?`, args);
    return res.json({ ok: true });
  } catch (e: any) {
    console.error('[console] ubah app gagal:', e?.message || e);
    return res.status(500).json({ error: 'Gagal mengubah app.' });
  }
});

// POST /api/console/apps/:code/rotate-key — kunci lama langsung mati.
router.post('/apps/:code/rotate-key', wajibOperator, async (req, res) => {
  try {
    const code = String(req.params.code);
    const [ada]: any = await pool.query('SELECT code FROM pay_apps WHERE code = ?', [code]);
    if (!ada?.length) return res.status(404).json({ error: 'App tidak ditemukan.' });
    const kunci = `jgp_${crypto.randomBytes(24).toString('base64url')}`;
    await pool.query('UPDATE pay_apps SET apiKeyHash = ?, apiKeyPrefix = ? WHERE code = ?', [hashApiKey(kunci), kunci.slice(0, 12), code]);
    console.log(`[console] kunci app ${code} diputar oleh ${req.consoleUser?.email}`);
    return res.json({ code, apiKey: kunci });
  } catch (e: any) {
    console.error('[console] putar kunci gagal:', e?.message || e);
    return res.status(500).json({ error: 'Gagal memutar kunci.' });
  }
});

// GET /api/console/deliveries?status=&app=&limit=
router.get('/deliveries', async (req, res) => {
  try {
    const status = String(req.query.status || '').trim();
    const app = String(req.query.app || '').trim();
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const where: string[] = [];
    const args: any[] = [];
    if (status && status !== 'ALL') {
      where.push('status = ?');
      args.push(status);
    }
    if (app && app !== 'ALL') {
      where.push('appCode = ?');
      args.push(app);
    }
    const klausa = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows]: any = await pool.query(
      `SELECT deliveryId, appCode, payId, event, status, attempt, nextAttemptAt, lastError, createdAt, updatedAt
       FROM pay_webhook_deliveries ${klausa} ORDER BY createdAt DESC LIMIT ${limit}`,
      args,
    );
    return res.json({ rows: rows || [] });
  } catch (e: any) {
    console.error('[console] daftar delivery gagal:', e?.message || e);
    return res.status(500).json({ error: 'Gagal memuat jejak webhook.' });
  }
});

// POST /api/console/deliveries/:deliveryId/replay
router.post('/deliveries/:deliveryId/replay', wajibOperator, async (req, res) => {
  try {
    const deliveryId = String(req.params.deliveryId);
    const [rows]: any = await pool.query('SELECT appCode FROM pay_webhook_deliveries WHERE deliveryId = ?', [deliveryId]);
    if (!rows?.length) return res.status(404).json({ error: 'Delivery tidak ditemukan.' });
    const app = await appDariKode(String(rows[0].appCode));
    if (!app) return res.status(404).json({ error: 'App pemilik delivery tidak ada.' });
    const ok = await putarUlangDelivery(app, deliveryId);
    if (!ok) return res.status(404).json({ error: 'Delivery tidak ditemukan untuk app ini.' });
    return res.json({ ok: true });
  } catch (e: any) {
    console.error('[console] replay gagal:', e?.message || e);
    return res.status(500).json({ error: 'Gagal memutar ulang delivery.' });
  }
});

export default router;
