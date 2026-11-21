// Tanda tangan webhook JagoAI Pay -> app. Format header mengikuti kontrak final:
//   X-JagoaiPay-Signature: t=<unix>,v1=<hex hmac-sha256 atas "<t>.<rawBody>">
// Memakai webhookSecret app, TERPISAH dari API key app. App menolak bila HMAC tidak cocok atau
// selisih waktunya lebih dari 300 detik (spec: Webhook Kontrak).
import crypto from 'crypto';

export const TOLERANSI_DETIK = 300;

export function hitungTandaTangan(secret: string, timestampDetik: number, rawBody: string): string {
  return crypto.createHmac('sha256', secret).update(`${timestampDetik}.${rawBody}`, 'utf8').digest('hex');
}

export function headerTandaTangan(secret: string, rawBody: string, sekarangMs = Date.now()): string {
  const t = Math.floor(sekarangMs / 1000);
  return `t=${t},v1=${hitungTandaTangan(secret, t, rawBody)}`;
}

// Dipakai app (dan oleh uji) untuk memverifikasi header yang kita kirim.
export function verifikasiTandaTangan(
  secret: string,
  header: string,
  rawBody: string,
  sekarangMs = Date.now(),
  toleransiDetik = TOLERANSI_DETIK
): boolean {
  const bagian = String(header || '').split(',').reduce<Record<string, string>>((acc, potongan) => {
    const [k, v] = potongan.split('=');
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});
  const t = Number(bagian.t);
  const v1 = bagian.v1;
  if (!Number.isFinite(t) || !v1) return false;
  if (Math.abs(Math.floor(sekarangMs / 1000) - t) > toleransiDetik) return false;
  const harapan = hitungTandaTangan(secret, t, rawBody);
  const a = Buffer.from(harapan, 'utf8');
  const b = Buffer.from(v1, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
