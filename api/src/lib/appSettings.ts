// Pengganti `lib/email.ts` jamy untuk kebutuhan kecil di modul Duitku: membaca "pengaturan
// aplikasi" yang dulu disimpan di tabel app_settings. Di layanan ini sumbernya env, karena console
// punya env sendiri dan tidak perlu UI penyunting kredensial.
const DARI_ENV: Record<string, string | undefined> = {
  duitkuMerchantCode: process.env.DUITKU_MERCHANT_CODE,
  duitkuApiKey: process.env.DUITKU_API_KEY,
  duitkuMode: (process.env.DUITKU_BASE_URL || '').includes('passport') ? 'production' : 'sandbox',
  duitkuChannel: process.env.DUITKU_CHANNELS,
  // Rotasi kunci lama jamy: tidak dipakai di sini, ada hanya supaya pemanggil lama tetap jalan.
  duitkuApiKeyPrevious: process.env.DUITKU_API_KEY_PREVIOUS,
};

export async function getAppSetting(key: string, fallback = ''): Promise<string> {
  return (DARI_ENV[key] ?? fallback ?? '').trim();
}
