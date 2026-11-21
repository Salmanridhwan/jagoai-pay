// Cron JagoAI Pay: satu tempat untuk semua aplikasi. Tidak ada app yang perlu menulis cron sendiri.
//
// Tiga tugas, semuanya idempoten:
//   1. tandai EXPIRED tagihan yang lewat expiresAt
//   2. kirim webhook yang jatuh tempo (termasuk retry)
//   3. poll Duitku untuk tagihan PENDING (backstop kalau callback tidak datang, mis. deploy
//      memotong satu percobaan callback)
import { dbState } from '../db';
import { kedaluwarsakanCharge, rekonsiliasiPending } from './service';
import { kirimYangJatuhTempo } from './webhookOut';

let timer: NodeJS.Timeout | null = null;
let sedangJalan = false;

export async function tickJagoaiPay(): Promise<{ kedaluwarsa: number; rekonsiliasi: number; webhook: any }> {
  if (!dbState.ready) return { kedaluwarsa: 0, rekonsiliasi: 0, webhook: null };
  const kedaluwarsa = await kedaluwarsakanCharge();
  const rekonsiliasi = await rekonsiliasiPending();
  const webhook = await kirimYangJatuhTempo();
  return { kedaluwarsa, rekonsiliasi, webhook };
}

export function startJagoaiPayCron(intervalMs = 60_000): void {
  if (timer) return;
  const jalan = async () => {
    // Penjaga tumpang tindih: satu tick yang lambat (Duitku timeout 12 detik x beberapa baris)
    // tidak boleh menumpuk tick berikutnya.
    if (sedangJalan) return;
    sedangJalan = true;
    try {
      const hasil = await tickJagoaiPay();
      if (hasil.kedaluwarsa > 0 || hasil.rekonsiliasi > 0) {
        console.log(`[jagoai-pay] kedaluwarsa ${hasil.kedaluwarsa}, rekonsiliasi ${hasil.rekonsiliasi}`);
      }
      if (hasil.webhook && (hasil.webhook.terkirim > 0 || hasil.webhook.gagal > 0 || hasil.webhook.mati > 0)) {
        console.log(`[jagoai-pay] webhook terkirim ${hasil.webhook.terkirim}, gagal ${hasil.webhook.gagal}, mati ${hasil.webhook.mati}`);
      }
    } catch (error: any) {
      console.error('[jagoai-pay] cron error:', error?.message || error);
    } finally {
      sedangJalan = false;
    }
  };
  setTimeout(jalan, 20_000);
  timer = setInterval(jalan, intervalMs);
  timer.unref?.();
  console.log('✅ JagoAI Pay cron started (expire + reconcile + webhook, every 60s)');
}

export function stopJagoaiPayCron(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
