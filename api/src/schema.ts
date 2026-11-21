// Skema layanan. Semua murni aditif (`IF NOT EXISTS`) dan dijalankan setiap boot — tidak ada
// versi skema yang bisa menolak boot, karena di sini tidak ada rilis bersama yang perlu dijaga.
//
// `runOnce` memakai tabel schema_migrations sendiri supaya migrasi bertanda tangan jamy (yang
// dipakai `applyJagoaiPay`) tetap bisa dijalankan apa adanya setelah modul pay dipindahkan.
import type { PgCompatPool } from './db/pg/pool';
import { applyJagoaiPay } from './pay/schema';
import bcrypt from 'bcryptjs';

type RunOnce = (key: string, fn: () => Promise<void>) => Promise<void>;

export function buatRunOnce(pool: PgCompatPool): RunOnce {
  return async (key, fn) => {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         key VARCHAR(120) PRIMARY KEY,
         appliedAt VARCHAR(50) NOT NULL
       )`,
    );
    const [rows]: any = await pool.query('SELECT key FROM schema_migrations WHERE key = ?', [key]);
    if (rows?.length) return;
    await fn();
    await pool.query('INSERT INTO schema_migrations (key, appliedAt) VALUES (?, ?)', [key, new Date().toISOString()]);
  };
}

async function tabelConsole(pool: PgCompatPool) {
  // Akun console. SENGAJA terpisah dari tabel `users` jamy: pemakai console bukan peserta/tentor
  // akademi, dan layanan ini tidak boleh bergantung pada tabel milik aplikasi lain.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS console_users (
      id VARCHAR(40) PRIMARY KEY,
      email VARCHAR(190) NOT NULL,
      name VARCHAR(120) NOT NULL,
      passwordHash VARCHAR(100) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'operator',
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      createdAt VARCHAR(50) NOT NULL,
      lastLoginAt VARCHAR(50)
    )
  `);
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_console_users_email ON console_users (LOWER(email))');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS console_sessions (
      token VARCHAR(80) PRIMARY KEY,
      userId VARCHAR(40) NOT NULL REFERENCES console_users(id) ON DELETE CASCADE,
      expiresAt VARCHAR(50) NOT NULL,
      createdAt VARCHAR(50) NOT NULL,
      ip VARCHAR(60),
      userAgent TEXT
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_console_sessions_user ON console_sessions (userId)');

  // Kepemilikan app. Belum dipakai untuk penyaringan (console masih internal), tetapi kolomnya
  // dipasang sekarang supaya pintu ke portal merchant nanti tidak perlu migrasi data.
  await pool.query('ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS ownerEmail VARCHAR(190)').catch(() => {});
}

export async function siapkanSkema(pool: PgCompatPool, seedConsoleUser?: { email: string; password: string; name: string }) {
  const runOnce = buatRunOnce(pool);
  await applyJagoaiPay(pool, runOnce);
  await tabelConsole(pool);

  if (seedConsoleUser?.email && seedConsoleUser?.password) {
    const [ada]: any = await pool.query('SELECT id FROM console_users WHERE LOWER(email) = LOWER(?)', [seedConsoleUser.email]);
    if (!ada?.length) {
      await pool.query(
        'INSERT INTO console_users (id, email, name, passwordHash, role, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          `usr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          seedConsoleUser.email,
          seedConsoleUser.name,
          bcrypt.hashSync(seedConsoleUser.password, 10),
          'owner',
          'ACTIVE',
          new Date().toISOString(),
        ],
      );
      console.log(`[skema] akun console dibuat: ${seedConsoleUser.email}`);
    }
  }
}
