// Satu tempat untuk semua panggilan API console. Cookie sesi (HttpOnly) ikut otomatis karena
// console disajikan satu asal dengan API lewat proxy Vite di dev, dan di produksi lewat reverse
// proxy yang sama. Tidak ada token di localStorage — kalau sesi habis, semua permintaan 401 dan
// lapisan App mengembalikan pengguna ke halaman masuk.

export type Status = 'PENDING' | 'REVIEW' | 'PAID' | 'EXPIRED' | 'FAILED' | 'REJECTED';

export type Ringkasan = {
  total: { jumlah: number; nilaipaid: number; netpaid: number; jumlahpaid: number };
  hariIni: { jumlah: number; nilaipaid: number };
  apps: { jumlah: number; aktif: number; tanpahook: number };
  deliveries: { jumlah: number; terkirim: number; mati: number; menunggu: number };
  perStatus: { status: Status; jumlah: number; nilai: number }[];
  tren: { hari: string; jumlah: number; paid: number; nilai: number }[];
};

export type Charge = {
  payId: string;
  appCode: string;
  appOrderId: string;
  amount: number;
  fee: number;
  net: number;
  channelCode: string;
  channelName: string;
  channelGroup: string | null;
  status: Status;
  description: string | null;
  customerName: string | null;
  customerEmail: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  adabukti: boolean;
};

export type DetailDelivery = {
  deliveryId: string;
  event: string;
  status: string;
  attempt: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChargeDetail = Charge & {
  proofUrl?: string | null;
  qrisString?: string | null;
  vaNumber?: string | null;
  paymentUrl?: string | null;
  duitkuReference?: string | null;
  metadata?: string | null;
  deliveries?: DetailDelivery[];
};

export type App = {
  code: string;
  name: string;
  status: string;
  allowedChannels: string;
  webhookUrl: string | null;
  apiKeyPrefix: string;
  ownerEmail: string | null;
  allowDecisions: number;
  createdAt: string;
  totalcharge?: number;
  paidcharge?: number;
  nilaipaid?: number;
  terakhircharge?: string | null;
};

export type Delivery = {
  deliveryId: string;
  appCode: string;
  payId: string;
  event: string;
  status: string;
  attempt: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
};

export type Saya = { id: string; email: string; name: string; role: string };

const BASE = '';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function minta<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const teks = await res.text();
  let data: any = null;
  try {
    data = teks ? JSON.parse(teks) : null;
  } catch {
    data = { error: teks };
  }
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(
      typeof e === 'string' ? e : e?.message || `Permintaan gagal (${res.status}).`,
      res.status,
      typeof e === 'string' ? 'error' : e?.code || 'error',
    );
  }
  return data as T;
}

const q = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== 'semua') s.set(k, String(v));
  });
  const t = s.toString();
  return t ? `?${t}` : '';
};

export const api = {
  saya: () => minta<{ user: Saya }>('/api/auth/me').then((r) => r.user),

  masuk: (email: string, password: string) =>
    minta<{ user: Saya }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }).then(
      (r) => r.user,
    ),

  keluar: () => minta<{ ok: true }>('/api/auth/logout', { method: 'POST' }),

  ringkasan: () => minta<Ringkasan>('/api/console/summary'),

  charges: (p: { status?: string; app?: string; q?: string; limit?: number; offset?: number }) =>
    minta<{ rows: Charge[]; total: number; limit: number; offset: number }>(
      '/api/console/charges' + q(p as any),
    ),

  charge: (payId: string) =>
    minta<{ charge: ChargeDetail; deliveries: DetailDelivery[] }>(`/api/console/charges/${payId}`),

  putuskan: (payId: string, keputusan: 'approve' | 'reject', catatan?: string) =>
    minta<{ ok: true; status: Status }>(`/api/console/charges/${payId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision: keputusan, note: catatan || undefined }),
    }),

  apps: () => minta<{ rows: App[] }>('/api/console/apps'),

  buatApp: (body: { code: string; name: string; channels: string; webhookUrl?: string }) =>
    minta<{ app: App; apiKey: string }>('/api/console/apps', { method: 'POST', body: JSON.stringify(body) }),

  ubahApp: (code: string, body: { name?: string; channels?: string; webhookUrl?: string; status?: string }) =>
    minta<{ ok: true }>(`/api/console/apps/${code}`, { method: 'PATCH', body: JSON.stringify(body) }),

  putarKunci: (code: string) =>
    minta<{ apiKey: string }>(`/api/console/apps/${code}/rotate-key`, { method: 'POST' }),

  deliveries: (p: { status?: string; app?: string; limit?: number; offset?: number }) =>
    minta<{ rows: Delivery[]; total: number }>('/api/console/deliveries' + q(p as any)),

  putarUlang: (deliveryId: string) =>
    minta<{ ok: true }>(`/api/console/deliveries/${deliveryId}/replay`, { method: 'POST' }),

  // Halaman bayar publik: tanpa sesi, dibuka oleh pembayar.
  publikCharge: (payId: string) =>
    minta<{
      payId: string;
      appName: string;
      amount: number;
      status: Status;
      channelCode: string;
      channelName: string;
      description: string | null;
      customerName: string | null;
      qrisString: string | null;
      vaNumber: string | null;
      paymentUrl: string | null;
      expiresAt: string | null;
      paidAt: string | null;
      adabukti: boolean;
      fee: number;
      net: number;
    }>(`/api/public/charges/${payId}`),

  unggahBukti: (payId: string, dataUri: string) =>
    minta<{ ok: true; status: Status }>(`/api/public/charges/${payId}/proof`, {
      method: 'POST',
      body: JSON.stringify({ dataUri }),
    }),
};

// --- pembantu tampilan -------------------------------------------------------

export const rupiah = (n: number) =>
  'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(n) || 0);

export const rupiahPendek = (n: number) => {
  const v = Number(n) || 0;
  if (v >= 1_000_000_000) return 'Rp ' + (v / 1_000_000_000).toFixed(1).replace('.', ',') + ' M';
  if (v >= 1_000_000) return 'Rp ' + (v / 1_000_000).toFixed(1).replace('.', ',') + ' jt';
  if (v >= 1_000) return 'Rp ' + Math.round(v / 1_000) + ' rb';
  return rupiah(v);
};

// dd-mm-yyyy hh.mm — sama seperti konvensi tanggal di jamy, tapi ditulis lokal supaya paket ini
// tidak bergantung pada repo lain.
export const waktu = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}.${p(d.getMinutes())}`;
};

export const tanggalPendek = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}`;
};
