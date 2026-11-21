// Helper murni untuk integrasi Duitku v2 (inquiry + callback). Terpisah dari HTTP handler supaya
// testable — lihat docs/PLAN_DUITKU_PAYMENT_GATEWAY.md §3 untuk referensi konsep, §5.1 untuk alasan
// file ini ada.
//
// Formula signature dicek ulang 2026-08-31: docs.duitku.com mengembalikan 403 ke fetch otomatis,
// jadi diverifikasi silang dari source resmi Duitku (github.com/duitkupg/duitku-ios-sdk,
// requestTransaction.php) + dokumentasi publik yang terindeks. Keduanya sepakat:
//   - Inquiry:  md5(merchantCode + merchantOrderId + paymentAmount + apiKey)
//   - Callback: md5(merchantCode + amount + merchantOrderId + apiKey)
//   Urutan field BERBEDA antara keduanya — jangan disatukan jadi satu fungsi tanpa parameter urutan.
// Ketiganya diverifikasi ULANG 2026-09-21 dengan inquiry nyata ke sandbox Duitku (statusCode 00).
//
// Sumber kredensial = app_settings lewat lib/duitkuConfig.ts (fallback .env). Setiap fungsi di sini
// menerima konfigurasi sebagai argumen, TIDAK membaca env sendiri — supaya admin bisa mengganti
// merchant code/API key dari halaman Pengaturan tanpa deploy ulang, dan supaya test tidak bergantung
// pada isi .env mesin yang menjalankannya.
import crypto from 'crypto';
import { getDuitkuConfig, DuitkuConfig } from './duitkuConfig';
import { getAppSetting } from './appSettings';

// (perf) Semua panggilan HTTP ke Duitku wajib punya batas waktu — tanpa ini satu koneksi yang
// menggantung (DNS/network Duitku lambat) menahan request user tanpa batas di event loop.
const DUITKU_FETCH_TIMEOUT_MS = 12_000;

// (perf 2026-09-09) Circuit breaker sederhana: bila Duitku gagal (timeout/network 3x berturut),
// sirkuit BUKA selama 5 detik — request berikutnya ditolak cepat (tanpa menunggu timeout 12s)
// sambil Duitku dipulihkan, lalu setengah-buka untuk retry. Mencegah deretan timeout 12s yang
// mengunci event loop ketika gateway payment down.
let failureStreak = 0;
let circuitOpenUntil = 0;
const FAIL_THRESHOLD = 3;
const RETRY_DELAY_MS = 5_000;

function circuitTersedia(): boolean {
  if (Date.now() < circuitOpenUntil) return false;
  return true;
}

function catatGagal(): void {
  failureStreak += 1;
  if (failureStreak >= FAIL_THRESHOLD) {
    circuitOpenUntil = Date.now() + RETRY_DELAY_MS;
    failureStreak = 0;
  }
}

function catatSukses(): void {
  failureStreak = 0;
  circuitOpenUntil = 0;
}

// fetch dengan batas waktu + circuit breaker. Melempar Error dengan pesan Indonesia yang bisa
// diteruskan formatBackendError ke frontend.
async function fetchDuitku(url: string, init: RequestInit): Promise<Response> {
  if (!circuitTersedia()) {
    throw new Error('Gateway pembayaran sedang tidak dapat dihubungi. Coba lagi sebentar lagi.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DUITKU_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    catatSukses();
    return res;
  } catch (err: any) {
    catatGagal();
    if (err?.name === 'AbortError') throw new Error('Gateway pembayaran tidak merespons (timeout).');
    throw new Error('Gagal menghubungi gateway pembayaran.');
  } finally {
    clearTimeout(timer);
  }
}

// Signature inquiry: merchantCode + merchantOrderId + paymentAmount + apiKey (urutan resmi v2).
export function buildInquirySignature(merchantOrderId: string, paymentAmount: number, cfg: DuitkuConfig): string {
  return md5(`${cfg.merchantCode}${merchantOrderId}${paymentAmount}${cfg.apiKey}`);
}

// Signature callback: merchantCode + amount + merchantOrderId + apiKey (urutan resmi v2, BEDA dari inquiry).
export function buildCallbackSignature(merchantOrderId: string, amount: string | number, cfg: DuitkuConfig): string {
  return md5(`${cfg.merchantCode}${amount}${merchantOrderId}${cfg.apiKey}`);
}

function md5(s: string): string {
  return crypto.createHash('md5').update(s, 'utf8').digest('hex');
}

export interface CreateDuitkuParams {
  merchantOrderId: string;
  amount: number; // integer rupiah
  email: string;
  customerVaName: string;
  phoneNumber?: string;
  productDetails: string;
  paymentMethod?: string; // kosong = channel utama dari halaman Pengaturan; diisi = channel yang dipilih learner
  additionalParam?: string;
  returnUrl: string;
  callbackUrl: string;
  expiryPeriod?: number; // menit
}

export interface CreateDuitkuResult {
  paymentUrl: string;
  reference: string;
  statusCode: string;
  statusMessage: string;
  // Dua field ini dibawa dari balasan Duitku apa adanya: QRIS mengirim `qrString` (payload EMVCo
  // yang dirender sendiri oleh app), VA mengirim `vaNumber`. Tanpa diteruskan, hub tidak bisa
  // mengirim `payMethod` yang benar dan app terpaksa membuka paymentUrl Duitku.
  qrString?: string;
  vaNumber?: string;
}

// POST {baseUrl}/webapi/api/merchant/v2/inquiry — lihat plan §3.1.
export async function createDuitkuTransaction(params: CreateDuitkuParams): Promise<CreateDuitkuResult> {
  const cfg = await getDuitkuConfig();
  const signature = buildInquirySignature(params.merchantOrderId, params.amount, cfg);
  const res = await fetchDuitku(`${cfg.baseUrl}/webapi/api/merchant/v2/inquiry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchantCode: cfg.merchantCode,
      paymentAmount: params.amount,
      merchantOrderId: params.merchantOrderId,
      productDetails: params.productDetails,
      email: params.email,
      customerVaName: params.customerVaName,
      phoneNumber: params.phoneNumber || undefined,
      additionalParam: params.additionalParam || undefined,
      paymentMethod: params.paymentMethod || cfg.primaryChannel,
      returnUrl: params.returnUrl,
      callbackUrl: params.callbackUrl,
      signature,
      expiryPeriod: params.expiryPeriod ?? 60,
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data.statusCode !== '00') {
    throw new Error(data.statusMessage || data.Message || `Duitku inquiry gagal (HTTP ${res.status}).`);
  }
  return { paymentUrl: data.paymentUrl, reference: data.reference, statusCode: data.statusCode, statusMessage: data.statusMessage, qrString: data.qrString, vaNumber: data.vaNumber };
}

export interface DuitkuCallbackBody {
  merchantCode?: string;
  amount?: string | number;
  merchantOrderId?: string;
  productDetail?: string;
  additionalParam?: string;
  paymentCode?: string;
  resultCode?: string;
  reference?: string;
  signature?: string;
  paymentStatusCode?: string;
  paymentStatusMessage?: string;
}

// Bandingkan waktu-konstan supaya tidak bocor lewat timing (§3.3 N1). String panjang beda pun tidak
// boleh melempar — timingSafeEqual mensyaratkan panjang buffer sama.
//
// PENGECUALIAN KREDENSIAL GANDA: saat admin baru menyimpan merchant code/API key baru, transaksi
// lama yang masih PENDING membawa tanda tangan dari kredensial LAMA. Kalau hanya kredensial aktif
// yang diterima, callback untuk transaksi itu selamanya 401 dan uang yang sudah masuk tidak pernah
// tercatat. Karena itu baris app_settings `duitkuApiKeyPrevious` (diisi otomatis oleh
// POST /api/admin/duitku/verify saat kredensial berubah) ikut diterima.
export async function verifyDuitkuCallback(body: DuitkuCallbackBody): Promise<boolean> {
  if (!body.merchantOrderId || !body.signature || body.amount === undefined) return false;
  const cfg = await getDuitkuConfig();
  const candidates = [cfg.apiKey];
  const previous = (await getAppSetting('duitkuApiKeyPrevious', '')).trim();
  if (previous && previous !== cfg.apiKey) candidates.push(previous);
  return candidates.some((apiKey) => {
    const expected = buildCallbackSignature(body.merchantOrderId!, body.amount!, { ...cfg, apiKey });
    const a = Buffer.from(expected.toLowerCase());
    const b = Buffer.from(String(body.signature).toLowerCase());
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  });
}

export async function checkDuitkuStatus(merchantOrderId: string): Promise<{ statusCode: string; statusMessage: string; reference?: string }> {
  const cfg = await getDuitkuConfig();
  const signature = md5(`${cfg.merchantCode}${merchantOrderId}${cfg.apiKey}`);
  const res = await fetchDuitku(`${cfg.baseUrl}/webapi/api/merchant/transactionStatus`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchantCode: cfg.merchantCode, merchantOrderId, signature }),
  });
  const data: any = await res.json().catch(() => ({}));
    return { statusCode: data.statusCode, statusMessage: data.statusMessage, reference: data.reference };
  }