import pg from 'pg';
import { toPgPlaceholders } from './placeholders';
import { restoreKeyCase, warnOnUnmappedColumns } from './columnCase';

// Postgres mengembalikan BIGINT/NUMERIC sebagai string agar presisi tidak hilang. Kolom numerik di
// skema ini semuanya INT/FLOAT yang aman di Number, dan kode memperlakukannya sebagai number
// (mis. `points + 150`), jadi parse balik supaya perilakunya sama dengan mysql2.
pg.types.setTypeParser(pg.types.builtins.INT8, (v: string) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v: string) => Number(v));

export interface PgCompatPool {
  query(sql: string, values?: any[]): Promise<[any, any]>;
  transaction<T>(callback: (tx: PgCompatPool) => Promise<T>): Promise<T>;
  end(): Promise<void>;
}

// mysql2 mengembalikan array baris untuk SELECT dan ResultSetHeader untuk DML. Kode di server/
// bergantung pada perbedaan itu, jadi bentuknya harus dicocokkan persis.
export function isSelectLike(sql: string): boolean {
  const head = sql.trim().toLowerCase();
  if (head.startsWith('select') || head.startsWith('with')) return true;
  return /\breturning\b/i.test(sql);
}

export function buildResult(sql: string, res: pg.QueryResult): [any, any] {
  if (isSelectLike(sql)) {
    const rows = res.rows.map(restoreKeyCase);
    // INSERT ... RETURNING id dipakai sebagai pengganti insertId (session.ts, rateLimit.ts).
    // Baris tetap dikembalikan, tapi header ikut ditempel supaya kedua pola pembacaan jalan.
    if (!/^\s*(select|with)/i.test(sql)) {
      const first: any = rows[0] ?? {};
      const header: any = { affectedRows: res.rowCount ?? 0, insertId: first.id ?? first.insertId ?? 0 };
      return [Object.assign(header, { rows }), res.fields];
    }
    return [rows, res.fields];
  }
  return [{ affectedRows: res.rowCount ?? 0, insertId: 0 }, res.fields];
}

export function createPgPool(config: pg.PoolConfig): PgCompatPool {
  // (perf) Pool diperbesar dari 10 → 50 (bisa ditimpa PG_POOL_MAX): 1.000 request konkuren
  // antre di pool 10 koneksi padahal Postgres mampu jauh lebih banyak. Nama env sengaja
  // PG_POOL_MAX supaya konsisten dgn prefix PG_* yang sudah dipakai dbHost/dbPort/dbName.
  const max = Number(process.env.PG_POOL_MAX) > 0 ? Number(process.env.PG_POOL_MAX) : 50;
  const pool = new pg.Pool({
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...config,
  });

  // Sesuai perilaku mysql2 saat ini: error pool tidak boleh menjatuhkan proses.
  pool.on('error', (err) => console.error('[PG POOL] idle client error:', err.message));

  const makeFacade = (executor: { query: (sql: string, values?: any[]) => Promise<pg.QueryResult> }): PgCompatPool => ({
    async query(sql: string, values?: any[]) {
      const res = await executor.query(toPgPlaceholders(sql), values ?? []);
      return buildResult(sql, res);
    },
    async transaction<T>(callback: (tx: PgCompatPool) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback(makeFacade(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    end: () => pool.end(),
  });

  const facade = makeFacade(pool);

  // Sekali saat boot: laporkan kolom yang belum ada di peta case sebelum menyebabkan null senyap.
  void warnOnUnmappedColumns((sql) => pool.query(sql));

  return facade;
}
