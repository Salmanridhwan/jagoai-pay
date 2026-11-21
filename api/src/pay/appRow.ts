// Satu-satunya penerjemah baris `pay_apps` menjadi PayApp. Dipakai jalur API-key (tidak perlu,
// app sudah dirakit dari header) maupun console dan halaman bayar, supaya bentuk objeknya tidak
// bercabang antar rute.
import type { PayApp } from './apiKeyAuth';

export function appDariBaris(row: any): PayApp {
  return {
    code: String(row.code),
    name: String(row.name || ''),
    webhookUrl: String(row.webhookUrl || ''),
    webhookSecret: String(row.webhookSecret || ''),
    allowedChannels: String(row.allowedChannels || '')
      .split(',')
      .map((c: string) => c.trim())
      .filter(Boolean),
    merchantCode: String(row.merchantCode || ''),
    allowDecisions: Number(row.allowDecisions) === 1 || row.allowDecisions === true,
    minAmount: Number(row.minAmount) || 10000,
    maxAmount: Number(row.maxAmount) || 25000000,
    status: String(row.status || 'ACTIVE'),
  };
}
