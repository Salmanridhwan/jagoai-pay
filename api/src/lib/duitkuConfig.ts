// Konfigurasi Duitku untuk layanan ini — satu sumber: env.
//
// Di jamy, berkas ini membaca app_settings lalu jatuh ke env, karena admin akademi bisa menempel
// kunci lewat halaman Pengaturan. Console pay berdiri sendiri, jadi tidak ada tabel pengaturan yang
// harus dibaca: env layanan ini adalah sumber tunggal dan satu-satunya cara mengganti kunci adalah
// mengubah env + restart. Itu lebih sederhana dan lebih aman untuk rahasia uang.
import {
  DUITKU_API_KEY as ENV_API_KEY,
  DUITKU_BASE_URL as ENV_BASE_URL,
  DUITKU_CHANNELS as ENV_CHANNELS,
  DUITKU_MERCHANT_CODE as ENV_MERCHANT_CODE,
} from '../env';

export interface DuitkuConfig {
  merchantCode: string;
  apiKey: string;
  baseUrl: string;
  channels: string[];
  primaryChannel: string;
}

export const DUITKU_DEFAULT_CHANNEL = ENV_BASE_URL.includes('passport') ? 'BR' : 'SP';

export async function getDuitkuConfig(): Promise<DuitkuConfig> {
  const channels = ENV_CHANNELS;
  return {
    merchantCode: ENV_MERCHANT_CODE.trim(),
    apiKey: ENV_API_KEY.trim(),
    baseUrl: ENV_BASE_URL,
    channels,
    primaryChannel: channels[0] || DUITKU_DEFAULT_CHANNEL,
  };
}

export async function isDuitkuConfigured(): Promise<boolean> {
  const c = await getDuitkuConfig();
  return Boolean(c.merchantCode && c.apiKey);
}
