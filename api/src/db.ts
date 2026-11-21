// Pool Postgres tunggal untuk layanan ini. Fasad `PgCompatPool` dipertahankan apa adanya supaya
// modul pay yang dipindahkan dari jamy berjalan tanpa menulis ulang ratusan kueri `?`.
import { createPgPool, type PgCompatPool } from './db/pg/pool';
import { DATABASE_URL } from './env';

export const pool: PgCompatPool = createPgPool({ connectionString: DATABASE_URL, max: 10 });

export const dbState = { ready: false };

export async function cekKoneksi(): Promise<void> {
  const [rows]: any = await pool.query('SELECT 1 AS satu');
  if (!rows?.[0] || Number(rows[0].satu) !== 1) throw new Error('Kueri uji mengembalikan hasil tak terduga.');
  dbState.ready = true;
}
