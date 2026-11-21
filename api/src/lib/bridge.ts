// Jembatan ke jamy — SATU-SATUNYA jalan pay menyentuh gateway pembayaran.
//
// Sejak keputusan 2026-11-21, layanan ini tidak memegang merchant code / API key Duitku dan tidak
// pernah memanggil Duitku. Tagihan dititipkan ke jamy, yang membuat transaksi di merchant miliknya
// (callback-nya sudah terdaftar di dashboard Duitku). Akibatnya:
//   - uang & fee tercatat di akun merchant jamy; console ini hanya salinan per aplikasi;
//   - status tidak pernah datang dari Duitku langsung, melainkan dari jamy (push) atau dari polling;
//   - kredensial yang dipegang layanan ini hanya kunci jembatan, bukan rahasia uang.
//
// Kalau jembatan belum diisi, env GATEWAY_MODE jatuh ke 'duitku' (jalur lama) supaya deployment yang
// sudah berjalan tidak mati mendadak. Jalur baru ini tidak pernah aktif bersamaan dengan jalur lama.
import { JAMY_BRIDGE_KEY, JAMY_BRIDGE_URL } from '../env';

const TIMEOUT_MS = 15_000;

export interface HasilTagihan {
  orderId: string;
  payId: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REJECTED' | 'EXPIRED';
  amount: number;
  channel: string | null;
  reference: string | null;
  paymentUrl?: string | null;
  qrString?: string | null;
  vaNumber?: string | null;
  expiresInMinutes?: number;
}

export class BridgeError extends Error {
  kode: string;
  status: number;
  constructor(kode: string, message: string, status = 502) {
    super(message);
    this.kode = kode;
    this.status = status;
  }
}

async function panggil(path: string, init: RequestInit = {}): Promise<any> {
  const url = `${JAMY_BRIDGE_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Jagoai-Bridge-Key': JAMY_BRIDGE_KEY,
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error: any) {
    // Jaringan/timeout: jangan diteruskan sebagai 500 (itu bug kita). Kegagalan jembatan adalah
    // kondisi operasional yang harus terbaca sebagai "gateway sedang tidak tersedia".
    throw new BridgeError('bridge_down', `Jembatan pembayaran tidak merespons (${error?.message || 'timeout'}).`, 503);
  }

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const pesan = data?.error?.message || `Jembatan menolak permintaan (HTTP ${res.status}).`;
    const kode = data?.error?.code || 'bridge_error';
    // 400/404 dari jamy = kesalahan permintaan kita atau payId tidak dikenal: bukan gangguan.
    throw new BridgeError(kode, pesan, res.status >= 500 ? 503 : res.status);
  }
  return data;
}

export async function jembatanHidup(): Promise<boolean> {
  try {
    await panggil('/api/pay-bridge/health');
    return true;
  } catch {
    return false;
  }
}

export async function buatTagihanDiJamy(input: {
  payId: string;
  appCode: string;
  amount: number;
  channel: string;
  customerName?: string;
  customerEmail?: string;
  description?: string;
  expiresInSeconds?: number;
  returnUrl: string;
}): Promise<HasilTagihan> {
  return panggil('/api/pay-bridge/charges', { method: 'POST', body: JSON.stringify(input) });
}

export async function statusTagihanDiJamy(payId: string): Promise<HasilStatusJamy> {
  return panggil(`/api/pay-bridge/charges/${encodeURIComponent(payId)}`);
}

export interface HasilStatusJamy {
  orderId: string;
  payId: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REJECTED' | 'EXPIRED';
  statusJamy?: string;
  amount: number;
  channel: string | null;
  reference: string | null;
}

export interface ChannelJamy {
  code: string;
  name: string;
  fee: number;
  group: string;
}

let cacheChannel: { at: number; channels: ChannelJamy[] } | null = null;
const CACHE_CHANNEL_MS = 60_000;

// Daftar channel berasal dari akun Duitku milik jamy (jamy yang punya kredensial). Di-cache pendek
// supaya membuka checkout tidak selalu menambah satu perjalanan HTTP.
export async function daftarChannelJamy(paksa = false): Promise<ChannelJamy[]> {
  if (!paksa && cacheChannel && Date.now() - cacheChannel.at < CACHE_CHANNEL_MS) return cacheChannel.channels;
  const data = await panggil('/api/pay-bridge/channels');
  const channels: ChannelJamy[] = Array.isArray(data?.channels) ? data.channels : [];
  cacheChannel = { at: Date.now(), channels };
  return channels;
}
