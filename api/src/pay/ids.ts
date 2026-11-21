// Id pendek milik JagoAI Pay. Kontrak v1: payId `pym_xxxxxxxx`, eventId `evt_xxxxxxxx`,
// deliveryId `dlv_xxxxxxxx`. Id internal aplikasi pemilik TIDAK dipakai sebagai kunci di sini —
// tersimpan terpisah di kolom appOrderId, jadi tidak ada lagi aturan "jangan pecah id di garis
// bawah pertama" seperti skema trx_* lama.
import crypto from 'crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function shortId(prefix: string, panjang = 8): string {
  const bytes = crypto.randomBytes(panjang);
  let keluar = '';
  for (let i = 0; i < panjang; i += 1) keluar += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix}_${keluar}`;
}

export const newPayId = () => shortId('pym', 10);
export const newEventId = () => shortId('evt', 10);
export const newDeliveryId = () => shortId('dlv', 10);

// Kunci API app: hanya hash-nya yang disimpan, jadi bocornya isi tabel pay_apps tidak langsung
// membocorkan kunci yang bisa dipakai memanggil layanan.
export const newApiKey = () => `jpk_${crypto.randomBytes(24).toString('hex')}`;
export const newWebhookSecret = () => `jps_${crypto.randomBytes(24).toString('hex')}`;

export function hashApiKey(kunci: string): string {
  return crypto.createHash('sha256').update(String(kunci).trim(), 'utf8').digest('hex');
}

export function prefixKunci(kunci: string): string {
  return String(kunci).slice(0, 12);
}

export const nowIso = () => new Date().toISOString();
