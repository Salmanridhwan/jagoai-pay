// Inti JagoAI Pay: tagihan, transisi status, dan penyambungan ke Duitku.
//
// Layanan ini BODOH SECARA DOMAIN. Ia tidak tahu apa itu learning path, kelas, atau langganan.
// Tugasnya cuma: "app X menagih Rp Y lewat channel Z, kabari kalau lunas". Semua perhitungan
// nominal yang rumit tetap di aplikasi pemiliknya.
//
// Semua tagihan lahir di satu project Duitku milik jamy, jadi merchantOrderId yang dikirim ke
// Duitku adalah payId itu sendiri (pendek dan unik). appOrderId milik aplikasi disimpan terpisah
// dan TIDAK dipakai sebagai kunci apa pun.
import { pool } from '../db';
import { DUITKU_CALLBACK_URL, GATEWAY_SIAP, PAY_PUBLIC_BASE_URL } from '../env';
import { getDuitkuConfig } from '../lib/duitkuConfig';
import { fetchDuitkuChannels, grupChannel, pilihChannelUtama, type DuitkuChannel, type GrupChannel } from '../lib/duitkuChannels';
import { checkDuitkuStatus, createDuitkuTransaction, verifyDuitkuCallback, type DuitkuCallbackBody } from '../lib/duitku';
import { persistDataUriImage } from '../lib/media';
import type { PayApp } from './apiKeyAuth';
import { newPayId, nowIso } from './ids';
import { antreEvent } from './webhookOut';

export type ChargeStatus = 'PENDING' | 'REVIEW' | 'PAID' | 'EXPIRED' | 'FAILED' | 'REJECTED';

export const FLOOR_NOMINAL = 10000;
export const CEILING_NOMINAL = 25000000;
export const CHANNEL_MANUAL = 'manual-transfer';

export class PayError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const AKTIF: ChargeStatus[] = ['PENDING', 'REVIEW', 'PAID'];

function barisKeCharge(row: any) {
  if (!row) return null;
  let metadata: any = null;
  try {
    metadata = row.metadata ? JSON.parse(String(row.metadata)) : null;
  } catch {
    metadata = null;
  }
  const grup = (row.channelGroup || null) as GrupChannel | null;
  return {
    payId: String(row.payId),
    appCode: String(row.appCode),
    appOrderId: String(row.appOrderId),
    status: String(row.status) as ChargeStatus,
    amount: Number(row.amount) || 0,
    fee: Number(row.fee) || 0,
    net: Number(row.net) || 0,
    channel: row.channelCode
      ? { code: String(row.channelCode), name: String(row.channelName || ''), group: grup }
      : null,
    payMethod: metodeBayar(row),
    checkoutUrl: `${PAY_PUBLIC_BASE_URL}/pay/${row.payId}`,
    description: row.description || '',
    metadata,
    expiresAt: row.expiresAt || null,
    paidAt: row.paidAt || null,
    createdAt: row.createdAt || null,
  };
}

function metodeBayar(row: any) {
  const grup = String(row.channelGroup || '');
  if (grup === 'qris' && row.qrisString) return { type: 'qris', qrisString: row.qrisString };
  if (grup === 'bank' && row.vaNumber) return { type: 'bank', vaNumber: row.vaNumber, paymentUrl: row.paymentUrl || null };
  if (grup === 'ewallet') return { type: 'ewallet', paymentUrl: row.paymentUrl || null };
  if (row.channelCode === CHANNEL_MANUAL) return { type: 'manual', instructions: 'Unggah bukti transfer lewat endpoint /proof.' };
  return { type: grup || 'lain', paymentUrl: row.paymentUrl || null };
}

async function ambilBaris(payId: string, appCode?: string): Promise<any | null> {
  const [rows]: any = appCode
    ? await pool.query('SELECT * FROM pay_charges WHERE payId = ? AND appCode = ?', [payId, appCode])
    : await pool.query('SELECT * FROM pay_charges WHERE payId = ?', [payId]);
  return rows && rows.length > 0 ? rows[0] : null;
}

async function ambilAktif(appCode: string, appOrderId: string): Promise<any | null> {
  const [rows]: any = await pool.query(
    `SELECT * FROM pay_charges
      WHERE appCode = ? AND appOrderId = ? AND status IN ('PENDING', 'REVIEW', 'PAID')
      ORDER BY createdAt DESC LIMIT 1`,
    [appCode, appOrderId]
  );
  return rows && rows.length > 0 ? rows[0] : null;
}

// Transisi status yang aman dari balapan: UPDATE hanya berlaku kalau status sekarang masih salah
// satu dari `dari`. Hasil 0 baris berarti sudah ada yang memindahkannya lebih dulu (callback
// ganda, cron dan callback bersamaan) dan pemanggil tidak boleh menerbitkan event kedua.
async function transisi(payId: string, dari: ChargeStatus[], ke: ChargeStatus): Promise<boolean> {
  const placeholder = dari.map(() => '?').join(', ');
  const [hasil]: any = await pool.query(
    `UPDATE pay_charges SET status = ?, updatedAt = ?, paidAt = CASE WHEN ? = 'PAID' THEN ? ELSE paidAt END
      WHERE payId = ? AND status IN (${placeholder})`,
    [ke, nowIso(), ke, ke === 'PAID' ? nowIso() : null, payId, ...dari]
  );
  return Number(hasil?.affectedRows || 0) > 0;
}

async function terbitkan(appCode: string, payId: string, event: string) {
  const [rows]: any = await pool.query('SELECT * FROM pay_charges WHERE payId = ?', [payId]);
  if (!rows || rows.length === 0) return;
  const [appRows]: any = await pool.query('SELECT * FROM pay_apps WHERE code = ?', [appCode]);
  if (!appRows || appRows.length === 0) return;
  const r = appRows[0];
  const app: PayApp = {
    code: String(r.code),
    name: String(r.name || ''),
    webhookUrl: String(r.webhookUrl || ''),
    webhookSecret: String(r.webhookSecret || ''),
    allowedChannels: String(r.allowedChannels || '').split(',').map((c: string) => c.trim()).filter(Boolean),
    merchantCode: String(r.merchantCode || ''),
    allowDecisions: Number(r.allowDecisions) === 1 || r.allowDecisions === true,
    minAmount: Number(r.minAmount) || FLOOR_NOMINAL,
    maxAmount: Number(r.maxAmount) || CEILING_NOMINAL,
    status: String(r.status || 'ACTIVE'),
  };
  await antreEvent(app, payId, event, barisKeCharge(rows[0]));
}

function batasKedaluwarsa(grup: string | null, dimintaDetik: number): number {
  const bawaan = grup === 'qris' || grup === 'ewallet' ? 1800 : 86400;
  const maks = grup === 'qris' || grup === 'ewallet' ? 3600 : 86400;
  const diminta = Number.isFinite(dimintaDetik) && dimintaDetik > 0 ? Math.floor(dimintaDetik) : bawaan;
  return Math.min(Math.max(diminta, 60), maks);
}

async function daftarChannelTersedia(): Promise<DuitkuChannel[]> {
  const cfg = await getDuitkuConfig();
  const hasil = await fetchDuitkuChannels(cfg);
  return hasil.channels;
}

export interface CreateChargeInput {
  appOrderId?: string;
  amount?: number;
  channel?: string;
  description?: string;
  metadata?: Record<string, any>;
  expiresInSeconds?: number;
  customer?: { name?: string; email?: string };
}

export async function buatCharge(app: PayApp, input: CreateChargeInput): Promise<{ charge: any; created: boolean }> {
  const appOrderId = String(input.appOrderId || '').trim();
  if (!appOrderId || appOrderId.length > 190) {
    throw new PayError('validation', 'appOrderId wajib diisi (maks 190 karakter).');
  }
  const amount = Number(input.amount);
  if (!Number.isInteger(amount)) {
    throw new PayError('validation', 'amount harus bilangan bulat rupiah.');
  }
  const batasBawah = Math.max(FLOOR_NOMINAL, app.minAmount);
  const batasAtas = Math.min(CEILING_NOMINAL, app.maxAmount);
  if (amount < batasBawah || amount > batasAtas) {
    throw new PayError('validation', `amount harus antara ${batasBawah} dan ${batasAtas} rupiah.`);
  }

  // Idempoten: pasangan (app, appOrderId) yang masih aktif mengembalikan tagihan yang sama.
  const sudahAda = await ambilAktif(app.code, appOrderId);
  if (sudahAda) {
    if (String(sudahAda.status) === 'PAID') {
      throw new PayError('already_paid', 'Tagihan dengan appOrderId ini sudah lunas.', 409);
    }
    return { charge: barisKeCharge(sudahAda), created: false };
  }

  // Gerbang keamanan sebelum menyentuh uang: transaksi gateway hanya boleh dibuat kalau layanan ini
  // punya kredensial SENDIRI beserta URL callback miliknya. Diperiksa SEBELUM daftar channel
  // diambil, supaya jawabannya "gateway belum aktif" — bukan "channel tidak tersedia", yang
  // menyesatkan orang ke arah konfigurasi yang salah.
  if (String(input.channel || 'auto') !== CHANNEL_MANUAL && !GATEWAY_SIAP) {
    throw new PayError(
      'gateway_off',
      'Gateway Duitku belum aktif di layanan ini. Isi DUITKU_MERCHANT_CODE, DUITKU_API_KEY, dan DUITKU_CALLBACK_URL milik layanan ini (bukan project akademi), atau pakai channel manual-transfer.',
      503,
    );
  }

  const tersedia = await daftarChannelTersedia();
  const diminta = String(input.channel || 'auto');
  let kodeChannel = diminta;
  if (diminta === 'auto') {
    kodeChannel = pilihChannelUtama(app.allowedChannels, tersedia, tersedia[0]?.code || 'SP');
  } else if (diminta !== CHANNEL_MANUAL) {
    if (app.allowedChannels.length > 0 && !app.allowedChannels.includes(diminta)) {
      throw new PayError('channel_unavailable', `Channel ${diminta} tidak diizinkan untuk app ini.`);
    }
    const ada = tersedia.some((c) => c.code === diminta);
    if (!ada) throw new PayError('channel_unavailable', `Channel ${diminta} tidak tersedia di akun Duitku.`);
  }

  const info = tersedia.find((c) => c.code === kodeChannel) || { code: kodeChannel, name: kodeChannel, fee: 0 };
  const grup = kodeChannel === CHANNEL_MANUAL ? null : grupChannel(info);
  const kedaluwarsaDetik = batasKedaluwarsa(grup, Number(input.expiresInSeconds));
  const payId = newPayId();
  const sekarang = nowIso();
  const expiresAt = new Date(Date.now() + kedaluwarsaDetik * 1000).toISOString();

  await pool.query(
    `INSERT INTO pay_charges
       (payId, appCode, appOrderId, amount, fee, net, channelCode, channelName, channelGroup, status,
        description, metadata, customerName, customerEmail, expiresAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?)`,
    [
      payId,
      app.code,
      appOrderId,
      amount,
      info.fee || 0,
      amount,
      kodeChannel,
      info.name,
      grup,
      String(input.description || '').slice(0, 500),
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.customer?.name || null,
      input.customer?.email || null,
      expiresAt,
      sekarang,
      sekarang,
    ]
  );

  if (kodeChannel === CHANNEL_MANUAL) {
    await terbitkan(app.code, payId, 'charge.created');
    return { charge: barisKeCharge(await ambilBaris(payId, app.code)), created: true };
  }

  try {
    const hasil = await createDuitkuTransaction({
      merchantOrderId: payId,
      amount,
      email: input.customer?.email || 'noreply@jagoai.dev',
      customerVaName: (input.customer?.name || app.name || 'Pembeli').slice(0, 60),
      productDetails: String(input.description || `Tagihan ${app.code}`).slice(0, 200),
      paymentMethod: kodeChannel,
      returnUrl: `${PAY_PUBLIC_BASE_URL}/pay/${payId}`,
      // Callback WAJIB milik layanan ini (env DUITKU_CALLBACK_URL). Jangan pernah mengarahkannya ke
      // callback jamy: di sana tidak ada baris pay_charges untuk transaksi ini.
      callbackUrl: DUITKU_CALLBACK_URL,
      expiryPeriod: Math.max(1, Math.round(kedaluwarsaDetik / 60)),
    });
    await pool.query(
      `UPDATE pay_charges
          SET paymentUrl = ?, duitkuReference = ?, qrisString = COALESCE(?, qrisString),
              vaNumber = COALESCE(?, vaNumber), updatedAt = ?
        WHERE payId = ?`,
      [hasil.paymentUrl || null, hasil.reference || null, (hasil as any).qrString || null, (hasil as any).vaNumber || null, nowIso(), payId]
    );
  } catch (error: any) {
    // Tagihan yang gagal dibuat di Duitku ditandai FAILED supaya appOrderId-nya bisa dipakai lagi.
    await transisi(payId, ['PENDING'], 'FAILED');
    throw new PayError('duitku_down', error?.message || 'Gagal membuat transaksi di Duitku.', 503);
  }

  await terbitkan(app.code, payId, 'charge.created');
  return { charge: barisKeCharge(await ambilBaris(payId, app.code)), created: true };
}

// Poll ke Duitku saat callback tidak datang. Hanya untuk charge PENDING yang sudah lewat 60 detik
// dan bukan transfer manual (tidak ada yang bisa dipoll di sana).
async function sinkronkan(row: any): Promise<any> {
  const umurDetik = (Date.now() - new Date(String(row.createdAt || 0)).getTime()) / 1000;
  if (String(row.status) !== 'PENDING') return row;
  if (String(row.channelCode) === CHANNEL_MANUAL) return row;
  if (!Number.isFinite(umurDetik) || umurDetik < 60) return row;

  try {
    const hasil = await checkDuitkuStatus(String(row.payId));
    if (hasil.statusCode === '00') {
      if (await transisi(String(row.payId), ['PENDING', 'REVIEW'], 'PAID')) await terbitkan(String(row.appCode), String(row.payId), 'charge.paid');
    } else if (hasil.statusCode === '01') {
      if (await transisi(String(row.payId), ['PENDING'], 'FAILED')) await terbitkan(String(row.appCode), String(row.payId), 'charge.failed');
    }
  } catch {
    // Duitku tidak bisa dihubungi: biarkan PENDING, cron berikutnya mencoba lagi.
  }
  return (await ambilBaris(String(row.payId))) || row;
}

export async function ambilCharge(app: PayApp, payId: string): Promise<any> {
  const row = await ambilBaris(payId, app.code);
  if (!row) throw new PayError('not_found', 'Tagihan tidak ditemukan.', 404);
  return barisKeCharge(await sinkronkan(row));
}

export async function ambilChargeDariOrder(app: PayApp, appOrderId: string): Promise<any> {
  const [rows]: any = await pool.query(
    'SELECT * FROM pay_charges WHERE appCode = ? AND appOrderId = ? ORDER BY createdAt DESC LIMIT 1',
    [app.code, appOrderId]
  );
  if (!rows || rows.length === 0) throw new PayError('not_found', 'Tagihan tidak ditemukan.', 404);
  return barisKeCharge(await sinkronkan(rows[0]));
}

export async function daftarChannel(app: PayApp) {
  const tersedia = await daftarChannelTersedia();
  const diizinkan = app.allowedChannels.length === 0 ? tersedia : tersedia.filter((c) => app.allowedChannels.includes(c.code));
  const daftar = (diizinkan.length === 0 ? tersedia : diizinkan).map((c) => ({
    code: c.code,
    name: c.name,
    fee: c.fee,
    group: grupChannel(c),
  }));
  // Transfer manual selalu ditawarkan: itu jaring pengaman kalau akun Duitku bermasalah, dan
  // satu-satunya jalur yang tidak butuh kredensial gateway.
  return [...daftar, { code: CHANNEL_MANUAL, name: 'Transfer Manual', fee: 0, group: 'manual' }];
}

export async function unggahBukti(app: PayApp, payId: string, proof: any) {
  const row = await ambilBaris(payId, app.code);
  if (!row) throw new PayError('not_found', 'Tagihan tidak ditemukan.', 404);
  if (String(row.status) !== 'PENDING') {
    throw new PayError('charge_not_reviewable', 'Bukti hanya bisa diunggah untuk tagihan PENDING.', 409);
  }
  if (!proof) throw new PayError('validation', 'Bukti transfer wajib diisi (dataURI jpg/png, maks 1 MB).');
  let url = '';
  try {
    url = await persistDataUriImage(proof, 'payment-proofs');
  } catch (error: any) {
    throw new PayError('validation', error?.message || 'Bukti transfer tidak valid.', 400);
  }
  const berhasil = await transisi(String(row.payId), ['PENDING'], 'REVIEW');
  if (!berhasil) throw new PayError('charge_not_reviewable', 'Status tagihan sudah berubah.', 409);
  await pool.query('UPDATE pay_charges SET proofUrl = ?, updatedAt = ? WHERE payId = ?', [String(url || ''), nowIso(), payId]);
  await terbitkan(app.code, payId, 'charge.review');
  return barisKeCharge(await ambilBaris(payId, app.code));
}

export async function putuskanBukti(app: PayApp, payId: string, keputusan: string) {
  if (!app.allowDecisions) {
    throw new PayError('unauthorized', 'App ini tidak punya scope decisions.', 403);
  }
  const row = await ambilBaris(payId, app.code);
  if (!row) throw new PayError('not_found', 'Tagihan tidak ditemukan.', 404);
  if (String(row.status) !== 'REVIEW') {
    throw new PayError('charge_not_reviewable', 'Hanya tagihan berstatus REVIEW yang bisa diputuskan.', 409);
  }
  const setuju = String(keputusan) === 'approve';
  const ke: ChargeStatus = setuju ? 'PAID' : 'REJECTED';
  const berhasil = await transisi(String(row.payId), ['REVIEW'], ke);
  if (!berhasil) throw new PayError('charge_not_reviewable', 'Status tagihan sudah berubah.', 409);
  await terbitkan(app.code, payId, setuju ? 'charge.paid' : 'charge.rejected');
  return barisKeCharge(await ambilBaris(payId, app.code));
}

// Callback Duitku. Verifikasi tanda tangan memakai fungsi yang sudah terbukti di produksi
// (server/lib/duitku.ts), bukan salinan baru.
export async function tanganiCallback(body: DuitkuCallbackBody): Promise<{ ok: boolean; kode: number }> {
  const sah = await verifyDuitkuCallback(body);
  if (!sah) return { ok: false, kode: 401 };

  const payId = String(body.merchantOrderId || '');
  const row = await ambilBaris(payId);
  if (!row) return { ok: false, kode: 404 };

  const status = String(row.status);
  if (status === 'PAID' || status === 'REJECTED') return { ok: true, kode: 200 };
  // resultCode 02 = masih pending. Jangan menurunkan status apa pun.
  if (String(body.resultCode) === '02') return { ok: true, kode: 200 };

  if (String(body.resultCode) === '00') {
    if (await transisi(payId, ['PENDING', 'REVIEW'], 'PAID')) await terbitkan(String(row.appCode), payId, 'charge.paid');
  } else if (await transisi(payId, ['PENDING'], 'FAILED')) {
    await terbitkan(String(row.appCode), payId, 'charge.failed');
  }
  return { ok: true, kode: 200 };
}

// Cron: tandai EXPIRED tepat waktu. Mengembalikan jumlah baris yang berubah supaya pemanggil bisa
// mencatatnya di log tanpa membongkar isi tabel.
export async function kedaluwarsakanCharge(): Promise<number> {
  const sekarang = nowIso();
  const [rows]: any = await pool.query(
    `SELECT payId, appCode FROM pay_charges
      WHERE status = 'PENDING' AND expiresAt IS NOT NULL AND expiresAt <= ?
      ORDER BY expiresAt ASC LIMIT 100`,
    [sekarang]
  );
  let jumlah = 0;
  for (const row of rows || []) {
    if (await transisi(String(row.payId), ['PENDING'], 'EXPIRED')) {
      await terbitkan(String(row.appCode), String(row.payId), 'charge.expired');
      jumlah += 1;
    }
  }
  return jumlah;
}

// Cron: poll charge PENDING yang mendekati kedaluwarsa ke Duitku, backstop saat callback hilang.
export async function rekonsiliasiPending(batas = 20): Promise<number> {
  const [rows]: any = await pool.query(
    `SELECT * FROM pay_charges WHERE status = 'PENDING' ORDER BY createdAt ASC LIMIT ?`,
    [batas]
  );
  let jumlah = 0;
  for (const row of rows || []) {
    const sebelum = String(row.status);
    const sesudah = await sinkronkan(row);
    if (sebelum !== String(sesudah.status)) jumlah += 1;
  }
  return jumlah;
}

export function daftarStatusAktif(): ChargeStatus[] {
  return [...AKTIF];
}
