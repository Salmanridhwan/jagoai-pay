import { COLUMN_CASE } from './columnCase.generated';

export { COLUMN_CASE };

// Postgres mengembalikan key baris dalam lowercase (lihat catatan case-folding di plan).
// Tanpa ini, `row.courseId` bernilai undefined dan endpoint mengembalikan null secara SENYAP —
// tidak ada error yang dilempar. Jalankan pada setiap baris yang keluar dari driver.
export function restoreKeyCase<T extends Record<string, any>>(row: T): T {
  const out: Record<string, any> = {};
  for (const key of Object.keys(row)) {
    const camel = COLUMN_CASE[key];
    out[camel !== undefined ? camel : key] = row[key];
  }
  return out as T;
}

// Kolom yang ejaannya di database MEMANG satu kata lowercase, dan kode membacanya persis begitu —
// jadi tidak ada camelCase yang perlu dipulihkan. Tanpa daftar ini heuristik "panjang & satu kata"
// di bawah menandainya sebagai drift, padahal tidak ada yang salah: peringatan palsu yang muncul
// tiap boot justru melatih orang mengabaikan peringatan yang sungguhan.
const INTENTIONALLY_LOWERCASE = new Set([
  // events.prerequisites — kolom hidup: ditulis POST/PUT /api/events (acara.routes.ts) dan dibaca
  // form acara di src/components/events/*. Namanya memang satu kata, bukan camelCase yang tergerus.
  'prerequisites',
  // users.communityjoinedat — nol pembaca di seluruh kode (diperiksa 2026-08-31). Dibiarkan ADA
  // supaya tidak ada DDL destruktif di jalur boot; kalau mau benar-benar dibuang, lakukan lewat
  // migrasi terpisah yang disengaja, bukan efek samping perbaikan log.
  'communityjoinedat',
]);

// Guard drift saat boot: kolom yang ADA di database tapi TIDAK ada di peta akan dikembalikan
// lowercase ke kode yang mengharapkan camelCase. Hanya melaporkan yang mencurigakan (panjang,
// satu kata) supaya `id`, `name`, `email` tidak memenuhi log.
export async function warnOnUnmappedColumns(
  query: (sql: string) => Promise<{ rows: Array<Record<string, any>> }>
): Promise<void> {
  try {
    const { rows } = await query(
      `SELECT DISTINCT column_name FROM information_schema.columns WHERE table_schema = 'public'`
    );
    const unmapped = rows
      .map(r => r.column_name as string)
      // Kunci COLUMN_CASE adalah nama hasil case-folding Postgres (selalu lowercase), sedangkan
      // information_schema mengembalikan nama PERSIS seperti ditulis saat CREATE — jadi kolom yang
      // dibuat ber-kutip (`"isVisibleInCatalog"`) muncul camelCase di sini. Tanpa toLowerCase(),
      // kolom semacam itu selalu dilaporkan "tidak ada di peta" padahal ada, dan peringatan palsu
      // yang muncul tiap boot justru melatih orang mengabaikan peringatan yang sungguhan.
      .filter(c => COLUMN_CASE[c.toLowerCase()] === undefined && !INTENTIONALLY_LOWERCASE.has(c.toLowerCase()) && c.length > 12 && !c.includes('_'));
    if (unmapped.length > 0) {
      console.warn(`[PG CASE] ${unmapped.length} kolom tidak ada di peta case — jalankan "npm run gen:column-case": ${unmapped.join(', ')}`);
    }
  } catch {
    // Diagnostik saja; jangan pernah menghalangi startup.
  }
}
