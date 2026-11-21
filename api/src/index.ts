// Titik masuk layanan JagoAI Pay. Semua yang menyangkut uang ada di proses ini, terpisah dari
// aplikasi akademi (jamy): database sendiri, sesi sendiri, rahasia sendiri, rilis sendiri.
//
// Tiga permukaan:
//   /api/jagoai-pay/v1/*  → dipanggil aplikasi klien dengan kunci app (X-JagoaiPay-Key)
//   /api/console/*        → console manusia, sesi cookie
//   /api/public/*         → halaman bayar pembeli, tanpa kunci
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { CORS_ORIGINS, GATEWAY_SIAP, HOST, NODE_ENV, PORT, PROOF_DIR, PUBLIC_BASE_URL } from './env';
import { cekKoneksi, dbState, pool } from './db';
import { siapkanSkema } from './schema';
import { startJagoaiPayCron } from './pay/cron';
import v1Routes from './routes/v1';
import consoleRoutes from './routes/console';
import authRoutes from './routes/auth';
import publicRoutes from './routes/public';

const app = express();

// API ini dipanggil dari dua tempat berbeda (console di domain lain saat produksi, dan aplikasi
// klien dari server), jadi CSP tidak relevan di sini; console yang memegang CSP-nya sendiri.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // server-ke-server (aplikasi klien) tidak mengirim Origin
      return cb(null, CORS_ORIGINS.includes(origin));
    },
    credentials: true,
  }),
);

app.use(cookieParser());
// Bukti transfer dikirim sebagai dataURI base64; 1,5 MB biner ≈ 2 MB base64. Batas ini sengaja
// dinaikkan hanya untuk permukaan ini, bukan seluruh aplikasi.
app.use(express.json({ limit: '6mb' }));

app.get('/health', (_req, res) => {
  res.json({
    status: dbState.ready ? 'ok' : 'starting',
    db: dbState.ready,
    base: PUBLIC_BASE_URL,
    env: NODE_ENV,
    // Console memakai ini untuk menandai apakah transaksi gateway bisa dibuat sama sekali.
    gatewaySiap: GATEWAY_SIAP,
  });
});

app.use('/proofs', express.static(PROOF_DIR, { maxAge: '7d', index: false }));
app.use(v1Routes);
app.use(authRoutes);
app.use('/api/console', consoleRoutes);
app.use(publicRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Rute tidak ditemukan.' }));

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[index] kesalahan tak tertangani:', error?.message || error);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Terjadi kesalahan di layanan pembayaran.' });
});

async function main() {
  console.log(`[index] memulai layanan pay (env ${NODE_ENV})`);
  await cekKoneksi();
  await siapkanSkema(pool, {
    email: process.env.SEED_CONSOLE_EMAIL || '',
    password: process.env.SEED_CONSOLE_PASSWORD || '',
    name: process.env.SEED_CONSOLE_NAME || 'Operator JagoAI Pay',
  });
  startJagoaiPayCron(60_000);

  app.listen(PORT, HOST, () => {
    console.log(`[index] JagoAI Pay API siap di ${PUBLIC_BASE_URL} (${HOST}:${PORT})`);
  });
}

main().catch((e) => {
  console.error('[index] gagal start:', e?.message || e);
  process.exit(1);
});
