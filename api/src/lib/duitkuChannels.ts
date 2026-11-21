// Daftar channel pembayaran yang tersedia di akun Duitku — diambil dari API Duitku sendiri, bukan
// diketik manual, supaya nama & biaya layanan (fee) selalu cocok dengan akun yang sedang dipakai.
//
// Alasan ada file ini: `GET /webapi/api/merchant/paymentmethod/getpaymentmethod` memakai tanda tangan
// SHA256(merchantCode + amount + datetime + apiKey) — BEDA dari inquiry (MD5, urutan lain). Kalau
// rumus ini salah, Duitku hanya menjawab "Invalid Signature." tanpa petunjuk apa pun.
//
// Hasilnya di-cache 10 menit: daftar channel jarang berubah, tapi memanggil Duitku di SETIAP
// pembukaan checkout berarti satu request HTTP tambahan sebelum halaman pembayaran tampil.
import crypto from 'crypto';
import { getDuitkuConfig, DuitkuConfig } from './duitkuConfig';

export interface DuitkuChannel {
  code: string;
  name: string;
  fee: number;
}

// Pengelompokan untuk tampilan checkout. Learner memilih jenis dulu (QRIS, transfer bank, dompet
// digital, gerai), karena daftar datar 20 channel membuat orang harus membaca semuanya. Nama channel
// dari Duitku sudah memuat jenisnya, jadi pengelompokan dibaca dari nama — bukan tabel kode yang
// harus ikut diperbarui setiap kali akun menambah channel.
export type GrupChannel = 'qris' | 'bank' | 'ewallet' | 'gerai';

export const GRUP_CHANNEL_LABEL: Record<GrupChannel, string> = {
  qris: 'QRIS',
  bank: 'Transfer Bank',
  ewallet: 'Dompet Digital',
  gerai: 'Gerai Retail',
};

export function grupChannel(c: { code: string; name: string }): GrupChannel {
  const nama = String(c.name || '').toLowerCase();
  if (nama.includes('qris')) return 'qris';
  if (nama.includes('indomaret') || nama.includes('alfamart') || nama.includes('retail') || nama.includes('pos')) return 'gerai';
  // Duitku menamai channel bank dengan singkatan di ekor ("BRI VA", "MANDIRI VA H2H"), bukan
  // "Virtual Account" — tanpa pola ini semuanya salah masuk ke dompet digital.
  if (/\bva\b|virtual account|h2h/.test(nama)) return 'bank';
  return 'ewallet';
}

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { at: number; baseUrl: string; channels: DuitkuChannel[] } | null = null;

// 'account' = benar-benar dibaca dari akun Duitku; 'fallback' = permintaan ke Duitku ditolak/gagal
// sehingga yang dipakai daftar bawaan. Dibedakan supaya halaman admin tidak menampilkan 17 channel
// seakan-akan kredensialnya sehat padahal Duitku menolak tanda tangannya.
export type ChannelSource = 'account' | 'fallback';
export interface ChannelList { channels: DuitkuChannel[]; source: ChannelSource; }

// Cadangan bila Duitku tidak bisa dihubungi: kode dari akun ini (diambil 2026-09-21). Dipakai juga
// sebagai validasi saat admin hanya mencentang sebagian channel tanpa memanggil Duitku.
export const DUITKU_CHANNEL_CATALOG: DuitkuChannel[] = [
  // Sandbox (DS34795) — QRIS + e-wallet
  { code: 'SP', name: 'QRIS (ShopeePay)', fee: 0 },
  { code: 'NQ', name: 'QRIS (Nobu)', fee: 0 },
  { code: 'GQ', name: 'QRIS (Gudang Voucher)', fee: 0 },
  { code: 'LQ', name: 'QRIS (LinkAja)', fee: 0 },
  { code: 'OV', name: 'OVO', fee: 0 },
  { code: 'DA', name: 'DANA', fee: 0 },
  { code: 'SA', name: 'ShopeePay (aplikasi)', fee: 0 },
  { code: 'LA', name: 'LinkAja (aplikasi)', fee: 0 },
  { code: 'JP', name: 'Jenius Pay', fee: 0 },
  { code: 'BC', name: 'BCA Virtual Account', fee: 5000 },
  { code: 'FT', name: 'Retail (POS)', fee: 7500 },
  { code: 'IR', name: 'Indomaret', fee: 6000 },
  // Produksi (D24773) — hanya Virtual Account. Dipakai sebagai label saat Duitku tak bisa dihubungi;
  // daftar sebenarnya SELALU datang dari akun (getpaymentmethod).
  { code: 'BR', name: 'BRI Virtual Account', fee: 3000 },
  { code: 'NC', name: 'BNC Virtual Account', fee: 3000 },
  { code: 'B1', name: 'CIMB Niaga Virtual Account', fee: 3000 },
  { code: 'A1', name: 'ATM Bersama Virtual Account', fee: 3000 },
  { code: 'AG', name: 'Artha Graha Virtual Account', fee: 1500 },
  { code: 'S1', name: 'Sampoerna Virtual Account', fee: 1500 },
  { code: 'DM', name: 'Danamon Virtual Account', fee: 3000 },
  { code: 'I1', name: 'BNI Virtual Account', fee: 3000 },
  { code: 'M2', name: 'Mandiri Virtual Account', fee: 4000 },
  { code: 'BT', name: 'Permata Virtual Account', fee: 3000 },
  { code: 'BV', name: 'BSI Virtual Account', fee: 3000 },
  { code: 'VA', name: 'Maybank Virtual Account', fee: 3000 },
];

// Dipanggil saat admin menyimpan Pengaturan: daftar channel bisa berubah (mode sandbox <-> produksi
// punya kumpulan channel berbeda), jadi cache 10 menit tidak boleh bertahan melewati perubahan itu.
export function invalidateDuitkuChannels(): void {
  cache = null;
}

// Channel untuk alur yang TIDAK punya pilihan learner (event, sertifikasi, konsultasi). Diambil dari
// centang admin, tapi diurutkan biaya layanan TERKECIL lebih dulu: kalau admin mencentang BCA VA
// (fee Rp5.000) di urutan pertama, seluruh transaksi event akan dibebani fee itu tanpa ada yang
// memilihnya. Seri -> urutan centang dipertahankan (sort stabil).
export function pilihChannelUtama(channels: string[], tersedia: DuitkuChannel[], fallback: string): string {
  const dicentang = channels.length > 0 ? channels : tersedia.map((c) => c.code);
  const fee = (code: string) => tersedia.find((c) => c.code === code)?.fee ?? 0;
  return [...dicentang].sort((a, b) => fee(a) - fee(b))[0] || fallback;
}

export function namaChannel(code: string): string {
  return DUITKU_CHANNEL_CATALOG.find((c) => c.code === code)?.name || code;
}

// Endpoint Duitku mengharuskan `amount` dan `datetime` ikut ditandatangani, walau daftar channel
// tidak bergantung pada nominal. Nominal kecil + waktu sekarang sudah cukup untuk inquiry ini.
export async function fetchDuitkuChannels(cfg?: DuitkuConfig): Promise<ChannelList> {
  const config = cfg || (await getDuitkuConfig());
  if (!config.merchantCode || !config.apiKey) return { channels: [], source: 'fallback' };
  if (cache && cache.baseUrl === config.baseUrl && Date.now() - cache.at < CACHE_TTL_MS) {
    return { channels: cache.channels, source: 'account' };
  }

  const amount = 10000;
  const datetime = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const signature = crypto.createHash('sha256')
    .update(`${config.merchantCode}${amount}${datetime}${config.apiKey}`, 'utf8')
    .digest('hex');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`${config.baseUrl}/webapi/api/merchant/paymentmethod/getpaymentmethod`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantcode: config.merchantCode, amount, datetime, signature }),
      signal: controller.signal,
    });
    const data: any = await res.json().catch(() => ({}));
    const list: DuitkuChannel[] = Array.isArray(data?.paymentFee)
      ? data.paymentFee.map((m: any) => ({ code: String(m.paymentMethod), name: String(m.paymentName), fee: Number(m.totalFee) || 0 }))
      : [];
    // Pesan galat Duitku ("Invalid Signature." / "Merchant not found") jangan jadi daftar kosong di
    // UI — tapi juga jangan menyamar sebagai daftar akun: tandai source='fallback'.
    if (list.length === 0) return { channels: DUITKU_CHANNEL_CATALOG, source: 'fallback' };
    cache = { at: Date.now(), baseUrl: config.baseUrl, channels: list };
    return { channels: list, source: 'account' };
  } catch {
    return { channels: DUITKU_CHANNEL_CATALOG, source: 'fallback' };
  } finally {
    clearTimeout(timer);
  }
}

// Channel yang ditampilkan ke learner = irisan antara centang admin dan yang benar-benar tersedia di
// akun. Kalau admin belum mencentang apa pun, seluruh channel akun ditampilkan (perilaku lama yang
// paling longgar, bukan checkout yang mati).
// Channel yang dipakai untuk MENGUJI kredensial: harus dimiliki akun (kalau tidak, Duitku menjawab
// "Payment channel not available" dan admin salah menyimpulkan kredensialnya rusak).
export function channelUji(cfg: DuitkuConfig, tersedia: DuitkuChannel[]): string {
  return tersedia.find((c) => cfg.channels.includes(c.code))?.code || tersedia[0]?.code || cfg.primaryChannel;
}

export async function channelsUntukCheckout(cfg?: DuitkuConfig): Promise<DuitkuChannel[]> {
  const config = cfg || (await getDuitkuConfig());
  const { channels: tersedia, source } = await fetchDuitkuChannels(config);

  // Daftar akun tersedia (source='account'): centang admin HARUS diiris dengannya — akun produksi
  // (D24773) hanya punya Virtual Account, jadi centang 'SP' warisan sandbox akan ditolak Duitku
  // setelah learner memilih. Kalau irisan kosong (semua centang tidak dimiliki akun), tampilkan
  // daftar akun: itu satu-satunya pilihan yang benar-benar bisa dibayar.
  if (source === 'account') {
    const diizinkan = tersedia.filter((c) => config.channels.includes(c.code));
    return config.channels.length === 0 || diizinkan.length === 0 ? tersedia : diizinkan;
  }

  // Sedang fallback (Duitku tidak bisa dihubungi): centang admin dipakai apa adanya dengan label
  // dari katalog bawaan. JANGAN pernah mengembalikan seluruh katalog — itu menawarkan channel yang
  // belum tentu dimiliki akun.
  if (config.channels.length === 0) return tersedia;
  return config.channels.map((code) => tersedia.find((c) => c.code === code) || { code, name: code, fee: 0 });
}
