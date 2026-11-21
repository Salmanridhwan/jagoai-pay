// Konfigurasi layanan. Semua rahasia masuk lewat env — tidak ada nilai yang di-hardcode di sini.
// Berbeda dari jamy, layanan ini TIDAK membaca kredensial Duitku dari tabel pengaturan: console
// punya env sendiri, jadi tidak ada jalur "admin menempel kunci" yang harus ikut dipindahkan.
import path from 'path';
import fs from 'fs';

const ROOT = path.resolve(process.cwd());
const varDir = path.join(ROOT, 'var');
if (!fs.existsSync(varDir)) fs.mkdirSync(varDir, { recursive: true });

export const PORT = Number(process.env.PORT) || 4010;
// Default hanya loopback: console keuangan tidak perlu bisa dihubungi dari jaringan lokal. Set HOST=0.0.0.0
// secara sadar kalau memang mau diakses dari perangkat lain.
export const HOST = process.env.HOST || '127.0.0.1';

// Alamat publik LAYANAN INI (dipakai menyusun returnUrl/callbackUrl untuk Duitku dan tautan
// halaman bayar yang dikirim ke aplikasi klien). Bukan alamat jamy.
export const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');

// Asal yang boleh memanggil API dari browser (console web). Dipisah koma.
export const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:4020')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const DATABASE_URL = process.env.DATABASE_URL || 'postgres://jagoai:jagoai_dev@127.0.0.1:5435/jagoai_pay';

// Duitku. Kosong = gateway tidak aktif: /channels menjawab daftar kosong dan pembuatan charge
// non-manual ditolak dengan pesan jelas, bukan error samar.
export const DUITKU_MERCHANT_CODE = process.env.DUITKU_MERCHANT_CODE || '';
export const DUITKU_API_KEY = process.env.DUITKU_API_KEY || '';
export const DUITKU_BASE_URL = process.env.DUITKU_BASE_URL || 'https://sandbox.duitku.com';
// Daftar kode channel yang dicentang (koma). Kosong = semua channel akun dipakai.
export const DUITKU_CHANNELS = (process.env.DUITKU_CHANNELS || 'SP,BR')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// URL callback Duitku untuk transaksi yang dibuat LAYANAN INI. Wajib diisi eksplisit dan wajib
// menunjuk ke layanan ini — bukan ke jamy. Project Duitku yang sekarang terdaftar adalah milik
// jamy dengan callback di jamy; memakai kredensial itu di sini akan membuat Duitku mengirim
// callback ke database jamy dan transaksi di sini tidak pernah lunas.
export const DUITKU_CALLBACK_URL = process.env.DUITKU_CALLBACK_URL || '';

// ─── Jembatan ke jamy (mode utama sejak 2026-11-21) ─────────────────────────
// Keputusan pemilik: pay TIDAK memegang kredensial Duitku dan tidak memanggil Duitku. Tagihan
// dititipkan ke jamy (merchant Duitku yang callback-nya sudah terdaftar), lalu jamy memberi tahu
// statusnya. DUITKU_* di atas hanya dipakai bila jembatan belum diisi (mode lama), supaya deployment
// yang sudah jalan tidak mendadak mati.
export const JAMY_BRIDGE_URL = (process.env.JAMY_BRIDGE_URL || '').replace(/\/+$/, '');
export const JAMY_BRIDGE_KEY = process.env.JAMY_BRIDGE_KEY || '';
// Token yang harus dibawa jamy saat memberi tahu perubahan status ke layanan ini.
export const JAMY_BRIDGE_CALLBACK_TOKEN = process.env.JAMY_BRIDGE_CALLBACK_TOKEN || '';

// jamy memanggil callback ini setelah status transaksi berubah. Kosong = hanya polling cron.
export const BRIDGE_CALLBACK_PATH = '/api/jagoai-pay/v1/bridge/callback';

export const BRIDGE_SIAP = Boolean(JAMY_BRIDGE_URL && JAMY_BRIDGE_KEY);

export type GatewayMode = 'bridge' | 'duitku' | 'off';
export const GATEWAY_MODE: GatewayMode = BRIDGE_SIAP
  ? 'bridge'
  : (DUITKU_MERCHANT_CODE && DUITKU_API_KEY && DUITKU_CALLBACK_URL ? 'duitku' : 'off');

// Gerbang gateway: true bila salah satu jalur siap. Tanpa ini, hanya manual-transfer yang bisa dipakai.
export const GATEWAY_SIAP = GATEWAY_MODE !== 'off';

// Alamat publik CONSOLE (bukan API). Dipakai menyusun tautan halaman bayar yang dikirim ke aplikasi
// klien, supaya pembeli melihat halaman milik console, bukan endpoint JSON.
export const PAY_PUBLIC_BASE_URL = (process.env.PAY_PUBLIC_BASE_URL || CORS_ORIGINS[0] || PUBLIC_BASE_URL).replace(/\/+$/, '');

export const VAR_DIR = varDir;
export const PROOF_DIR = path.join(varDir, 'proofs');

// Sesi console: cookie httpOnly, SameSite=Lax. Domain tidak di-set (host-only) kecuali
// COOKIE_DOMAIN diisi saat console dan api berada di subdomain berbeda.
export const SESSION_COOKIE = process.env.SESSION_COOKIE || 'jgp_console_session';
export const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
export const SESSION_TTL_HARI = Number(process.env.SESSION_TTL_HARI) || 7;
export const NODE_ENV = process.env.NODE_ENV || 'development';
