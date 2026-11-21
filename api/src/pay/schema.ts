// Skema tabel JagoAI Pay. Sengaja TIDAK lewat SCHEMA_VERSION: menaikkan versi skema memicu
// penolakan boot di produksi (server/db/init.ts K-06) dan itu berarti push ke main bisa mematikan
// academy.jagoai.dev. Pola yang dipakai di sini sama dengan applyTenants: `runOnce` berkunci di
// schema_migrations, isinya CREATE TABLE IF NOT EXISTS yang murni aditif.
//
// Nama kolom memakai camelCase seperti tabel lain di repo ini (fasad pg menurunkan ke huruf kecil
// di Postgres dan mengembalikannya sebagai camelCase saat dibaca).
import type { PgCompatPool } from '../db/pg/pool';

type RunOnce = (key: string, fn: () => Promise<void>) => Promise<void>;

export async function applyJagoaiPay(pool: PgCompatPool, runOnce: RunOnce): Promise<void> {
  await runOnce('060_jagoai_pay', async () => {
    // App terdaftar. apiKeyHash = sha256 kunci (kunci asli tidak pernah disimpan), webhookSecret
    // dipakai menandatangani event keluar. merchantCode opsional: kosong = pakai konfigurasi
    // bersama jamy (satu project Duitku untuk semua app, sesuai keputusan 2026-11-02).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pay_apps (
        code VARCHAR(32) PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        apiKeyHash VARCHAR(64) NOT NULL,
        apiKeyPrefix VARCHAR(16),
        webhookUrl TEXT,
        webhookSecret VARCHAR(128) NOT NULL,
        allowedChannels TEXT,
        merchantCode VARCHAR(64),
        allowDecisions INTEGER NOT NULL DEFAULT 0,
        minAmount INTEGER NOT NULL DEFAULT 10000,
        maxAmount INTEGER NOT NULL DEFAULT 25000000,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        createdAt VARCHAR(50)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pay_charges (
        payId VARCHAR(40) PRIMARY KEY,
        appCode VARCHAR(32) NOT NULL,
        appOrderId VARCHAR(190) NOT NULL,
        amount INTEGER NOT NULL,
        fee INTEGER NOT NULL DEFAULT 0,
        net INTEGER NOT NULL DEFAULT 0,
        channelCode VARCHAR(20),
        channelName VARCHAR(120),
        channelGroup VARCHAR(20),
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        description TEXT,
        metadata TEXT,
        duitkuReference VARCHAR(120),
        paymentUrl TEXT,
        qrisString TEXT,
        vaNumber VARCHAR(60),
        proofUrl TEXT,
        customerName VARCHAR(190),
        customerEmail VARCHAR(190),
        expiresAt VARCHAR(50),
        paidAt VARCHAR(50),
        createdAt VARCHAR(50),
        updatedAt VARCHAR(50)
      )
    `);

    // Jejak setiap pengiriman event ke app. Satu baris per event (bukan per percobaan): percobaan
    // dihitung di kolom attempt supaya replay tidak menggandakan jejak.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pay_webhook_deliveries (
        deliveryId VARCHAR(40) PRIMARY KEY,
        appCode VARCHAR(32) NOT NULL,
        payId VARCHAR(40),
        eventId VARCHAR(40) NOT NULL,
        event VARCHAR(40) NOT NULL,
        data TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        attempt INTEGER NOT NULL DEFAULT 0,
        nextAttemptAt VARCHAR(50),
        lastError TEXT,
        createdAt VARCHAR(50),
        updatedAt VARCHAR(50)
      )
    `);
  });

  // Index idempoten, di luar runOnce (pola L-10): database yang sudah pernah boot tetap mendapat
  // index-nya. Aman dijalankan setiap boot karena CREATE INDEX IF NOT EXISTS.
  await pool.query('CREATE INDEX IF NOT EXISTS idx_pay_apps_key ON pay_apps (apiKeyHash)').catch(() => {});

  // Satu appOrderId hanya boleh punya SATU charge aktif. Status final yang boleh diulang
  // (EXPIRED/FAILED/REJECTED) sengaja tidak ikut dikunci, sesuai kontrak: pembeli boleh menagih
  // ulang setelah gagal.
  await pool
    .query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_charges_aktif
         ON pay_charges (appCode, appOrderId)
         WHERE status IN ('PENDING', 'REVIEW', 'PAID')`
    )
    .catch(() => {});
  await pool.query('CREATE INDEX IF NOT EXISTS idx_pay_charges_app ON pay_charges (appCode, status)').catch(() => {});
  await pool.query('CREATE INDEX IF NOT EXISTS idx_pay_charges_status ON pay_charges (status, expiresAt)').catch(() => {});
  await pool
    .query('CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_deliveries_event ON pay_webhook_deliveries (eventId)')
    .catch(() => {});
  await pool
    .query('CREATE INDEX IF NOT EXISTS idx_pay_deliveries_jadwal ON pay_webhook_deliveries (status, nextAttemptAt)')
    .catch(() => {});
}
