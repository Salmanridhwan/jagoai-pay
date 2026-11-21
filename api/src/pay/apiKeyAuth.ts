// Autentikasi app -> layanan: header `X-JagoaiPay-Key: <kunci app>`.
//
// Ini pengganti sesi cookie, jadi TIDAK memakai req.user. Semua rute /api/jagoai-pay/v1/* sengaja
// tidak terdaftar di AUTHZ_POLICY (yang default-allow) dan otorisasinya hidup di sini + di daftar
// beku authzCoverage.test.ts, mengikuti preseden callback Duitku.
import type { Request, RequestHandler } from 'express';
import { pool } from '../db';
import { hashApiKey } from './ids';

export interface PayApp {
  code: string;
  name: string;
  webhookUrl: string;
  webhookSecret: string;
  allowedChannels: string[];
  merchantCode: string;
  allowDecisions: boolean;
  minAmount: number;
  maxAmount: number;
  status: string;
}

function petakanApp(row: any): PayApp {
  return {
    code: String(row.code),
    name: String(row.name || ''),
    webhookUrl: String(row.webhookUrl || ''),
    webhookSecret: String(row.webhookSecret || ''),
    allowedChannels: String(row.allowedChannels || '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean),
    merchantCode: String(row.merchantCode || ''),
    allowDecisions: Number(row.allowDecisions) === 1 || row.allowDecisions === true,
    minAmount: Number(row.minAmount) || 10000,
    maxAmount: Number(row.maxAmount) || 25000000,
    status: String(row.status || 'ACTIVE'),
  };
}

export async function cariAppDariKunci(kunciMentah: string): Promise<PayApp | null> {
  const kunci = String(kunciMentah || '').trim();
  if (!kunci) return null;
  const [rows]: any = await pool.query('SELECT * FROM pay_apps WHERE apiKeyHash = ?', [hashApiKey(kunci)]);
  if (!rows || rows.length === 0) return null;
  const app = petakanApp(rows[0]);
  return app.status === 'ACTIVE' ? app : null;
}

export const apiKeyAuth: RequestHandler = async (req: Request, res, next) => {
  try {
    const kunci = req.header('x-jagoaipay-key') || req.header('X-JagoaiPay-Key') || '';
    const app = await cariAppDariKunci(kunci);
    if (!app) {
      return res.status(401).json({ error: { code: 'unauthorized', message: 'Kunci API tidak dikenal.' } });
    }
    (req as any).payApp = app;
    return next();
  } catch (error: any) {
    return res.status(500).json({ error: { code: 'internal', message: error?.message || String(error) } });
  }
};

export function appDariRequest(req: Request): PayApp {
  const app = (req as any).payApp as PayApp | undefined;
  if (!app) throw new Error('apiKeyAuth belum dijalankan untuk rute ini');
  return app;
}
