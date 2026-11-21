// Pengiriman event JagoAI Pay -> app. At-least-once, TANPA jaminan urutan.
//
// Satu baris pay_webhook_deliveries per event. Percobaan: segera, lalu 1m/5m/30m/2h/6h; sesudah
// 6 percobaan gagal statusnya DEAD (bisa diputar ulang lewat endpoint replay). Jejak ini yang
// membuat "webhook hilang" bisa diperiksa, bukan ditebak.
import { pool } from '../db';
import { newDeliveryId, newEventId, nowIso } from './ids';
import { headerTandaTangan } from './signature';
import type { PayApp } from './apiKeyAuth';

export const API_VERSION = '2026-11-01';
export const JEDA_RETRY_DETIK = [0, 60, 300, 1800, 7200, 21600];
const BATAS_WAKTU_KIRIM_MS = 8000;

export function bangunEnvelope(eventId: string, event: string, attempt: number, data: any, occurredAt = nowIso()) {
  return { apiVersion: API_VERSION, eventId, event, occurredAt, attempt, data };
}

// Mencatat event ke antrean. Dipanggil SESUDAH transisi status tersimpan, supaya app tidak pernah
// menerima kabar untuk keadaan yang belum ada di database.
export async function antreEvent(app: PayApp, payId: string | null, event: string, data: any): Promise<string> {
  const eventId = newEventId();
  const deliveryId = newDeliveryId();
  const sekarang = nowIso();
  await pool.query(
    `INSERT INTO pay_webhook_deliveries
       (deliveryId, appCode, payId, eventId, event, data, status, attempt, nextAttemptAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?, ?)`,
    [deliveryId, app.code, payId, eventId, event, JSON.stringify(data ?? null), sekarang, sekarang, sekarang]
  );
  return deliveryId;
}

async function ambilApp(appCode: string): Promise<PayApp | null> {
  const [rows]: any = await pool.query('SELECT * FROM pay_apps WHERE code = ?', [appCode]);
  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  return {
    code: String(r.code),
    name: String(r.name || ''),
    webhookUrl: String(r.webhookUrl || ''),
    webhookSecret: String(r.webhookSecret || ''),
    allowedChannels: String(r.allowedChannels || '')
      .split(',')
      .map((c: string) => c.trim())
      .filter(Boolean),
    merchantCode: String(r.merchantCode || ''),
    allowDecisions: Number(r.allowDecisions) === 1 || r.allowDecisions === true,
    minAmount: Number(r.minAmount) || 10000,
    maxAmount: Number(r.maxAmount) || 25000000,
    status: String(r.status || 'ACTIVE'),
  };
}

function jadwalBerikutnya(attempt: number): string | null {
  const detik = JEDA_RETRY_DETIK[attempt];
  if (detik === undefined) return null;
  return new Date(Date.now() + detik * 1000).toISOString();
}

// Mengirim semua delivery yang sudah jatuh tempo. Dipanggil cron tiap menit; aman dipanggil
// bersamaan karena setiap baris ditandai lewat UPDATE ... WHERE status masih PENDING.
export async function kirimYangJatuhTempo(batas = 20): Promise<{ terkirim: number; gagal: number; mati: number }> {
  const sekarang = nowIso();
  const [rows]: any = await pool.query(
    `SELECT * FROM pay_webhook_deliveries
      WHERE status = 'PENDING' AND (nextAttemptAt IS NULL OR nextAttemptAt <= ?)
      ORDER BY createdAt ASC LIMIT ?`,
    [sekarang, batas]
  );
  const hasil = { terkirim: 0, gagal: 0, mati: 0 };

  for (const row of rows || []) {
    const app = await ambilApp(String(row.appCode));
    const attempt = Number(row.attempt || 0) + 1;

    // Tandai dulu supaya tidak dikirim dua kali oleh tick cron berikutnya.
    const [klaim]: any = await pool.query(
      `UPDATE pay_webhook_deliveries SET attempt = ?, updatedAt = ?
        WHERE deliveryId = ? AND status = 'PENDING' AND attempt = ?`,
      [attempt, nowIso(), row.deliveryId, Number(row.attempt || 0)]
    );
    if (Number(klaim?.affectedRows || 0) === 0) continue;

    if (!app || !app.webhookUrl) {
      await tandai(row.deliveryId, attempt, 'DEAD', 'App tidak punya webhookUrl.');
      hasil.mati += 1;
      continue;
    }

    let data: any = null;
    try {
      data = row.data ? JSON.parse(String(row.data)) : null;
    } catch {
      data = null;
    }
    const body = JSON.stringify(bangunEnvelope(String(row.eventId), String(row.event), attempt, data));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BATAS_WAKTU_KIRIM_MS);
    try {
      const res = await fetch(app.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-JagoaiPay-Signature': headerTandaTangan(app.webhookSecret, body),
          'X-JagoaiPay-Event': String(row.event),
        },
        body,
        signal: controller.signal,
      });
      if (res.ok) {
        await tandai(row.deliveryId, attempt, 'DELIVERED', '');
        hasil.terkirim += 1;
      } else {
        await gagal(row.deliveryId, attempt, `HTTP ${res.status}`);
        hasil.gagal += 1;
      }
    } catch (error: any) {
      await gagal(row.deliveryId, attempt, error?.name === 'AbortError' ? 'timeout 8 detik' : String(error?.message || error));
      hasil.gagal += 1;
    } finally {
      clearTimeout(timer);
    }
  }

  return hasil;
}

async function tandai(deliveryId: string, attempt: number, status: string, error: string) {
  await pool.query(
    `UPDATE pay_webhook_deliveries SET status = ?, attempt = ?, lastError = ?, updatedAt = ?, nextAttemptAt = NULL
      WHERE deliveryId = ?`,
    [status, attempt, error || null, nowIso(), deliveryId]
  );
}

async function gagal(deliveryId: string, attempt: number, error: string) {
  const berikutnya = jadwalBerikutnya(attempt);
  if (!berikutnya) {
    await tandai(deliveryId, attempt, 'DEAD', error);
    return;
  }
  await pool.query(
    `UPDATE pay_webhook_deliveries SET attempt = ?, lastError = ?, nextAttemptAt = ?, updatedAt = ?
      WHERE deliveryId = ?`,
    [attempt, error, berikutnya, nowIso(), deliveryId]
  );
}

// Memutar ulang satu delivery milik app yang meminta. Hanya boleh untuk delivery app itu sendiri.
export async function putarUlangDelivery(app: PayApp, deliveryId: string): Promise<boolean> {
  const [rows]: any = await pool.query(
    'SELECT deliveryId FROM pay_webhook_deliveries WHERE deliveryId = ? AND appCode = ?',
    [deliveryId, app.code]
  );
  if (!rows || rows.length === 0) return false;
  await pool.query(
    `UPDATE pay_webhook_deliveries
        SET status = 'PENDING', attempt = 0, nextAttemptAt = ?, lastError = NULL, updatedAt = ?
      WHERE deliveryId = ?`,
    [nowIso(), nowIso(), deliveryId]
  );
  return true;
}
