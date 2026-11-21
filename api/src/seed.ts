// Data contoh untuk console: 3 app, ~47 tagihan tersebar 14 hari, dan jejak webhook.
// Aman dijalankan berulang: kalau `pay_apps` sudah terisi, skrip berhenti kecuali diberi `--reset`.
// Hanya untuk DB lokal — jangan pernah dijalankan pada layanan yang sudah menerima uang nyata.
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { pool, cekKoneksi } from './db';
import { siapkanSkema } from './schema';
import { hashApiKey } from './pay/ids';
import { PROOF_DIR } from './env';

const RESET = process.argv.includes('--reset');
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

type AppSeed = { code: string; name: string; webhookUrl: string; channels: string; allowDecisions: number };
const APPS: AppSeed[] = [
  // URL webhook sengaja menunjuk ke host ini (bukan domain sungguhan): cron retry akan mencoba
  // mengirim dan gagal secara lokal, tanpa mengirim trafik ke sistem milik siapa pun.
  { code: 'autocashier', name: 'AutoCashier', webhookUrl: 'http://localhost:4010/__contoh-hook/autocashier', channels: 'SP,BR', allowDecisions: 1 },
  { code: 'kasirku', name: 'Kasirku POS', webhookUrl: '', channels: 'SP', allowDecisions: 1 },
  { code: 'webinar-digiup', name: 'Webinar DigiUP', webhookUrl: 'http://localhost:4010/__contoh-hook/digiup', channels: 'SP,BR,OV', allowDecisions: 1 },
];

const DESKRIPSI = [
  'Kelas AI Fundamental',
  'Sertifikasi BNSP',
  'Paket webinar DigiUP',
  'Workshop Prompt Engineering',
  'Langganan Pro 1 bulan',
];

const NAMA = ['Fajar Ramadhan', 'Rina Kusuma', 'Bagas Pratama', 'Dimas Anggara', 'Nadia Putri', 'Yoga Saputra', 'Siti Aisyah', 'Reza Mahendra'];
const CHANNEL = [
  { code: 'SP', name: 'QRIS', group: 'qris' },
  { code: 'BR', name: 'Virtual Account', group: 'va' },
  { code: 'OV', name: 'E-wallet', group: 'ewallet' },
];

// Distribusi mengikuti data yang dipakai saat menguji console di jamy: 26 lunas, 14 kedaluwarsa,
// 4 perlu review, 2 gagal, 1 bukti ditolak.
const STATUS_RENCANA: string[] = [
  ...Array(26).fill('PAID'),
  ...Array(14).fill('EXPIRED'),
  ...Array(4).fill('REVIEW'),
  ...Array(2).fill('FAILED'),
  ...Array(1).fill('REJECTED'),
];

const idAcak = (awalan: string, n = 10) => `${awalan}_${Math.random().toString(36).slice(2, 2 + n)}`;
const iso = (d: Date) => d.toISOString();

async function main() {
  await cekKoneksi();
  await siapkanSkema(pool);

  const [ada]: any = await pool.query('SELECT COUNT(*) AS n FROM pay_apps');
  if (Number(ada?.[0]?.n || 0) > 0 && !RESET) {
    console.log('[seed] pay_apps sudah terisi — dilewati. Jalankan dengan --reset untuk menimpa data contoh.');
    process.exit(0);
  }

  if (RESET) {
    console.log('[seed] menghapus data contoh lama…');
    await pool.query('DELETE FROM pay_webhook_deliveries');
    await pool.query('DELETE FROM pay_charges');
    await pool.query('DELETE FROM pay_apps');
  }

  if (!fs.existsSync(PROOF_DIR)) fs.mkdirSync(PROOF_DIR, { recursive: true });
  const bukti = ['bukti-a.png', 'bukti-b.png', 'bukti-c.png'];
  for (const b of bukti) fs.writeFileSync(path.join(PROOF_DIR, b), PNG_1PX);

  const kunciApps: Array<{ code: string; apiKey: string }> = [];
  for (const a of APPS) {
    const kunci = `jgp_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    await pool.query(
      `INSERT INTO pay_apps (code, name, apiKeyHash, apiKeyPrefix, webhookUrl, webhookSecret, allowedChannels,
                             allowDecisions, minAmount, maxAmount, status, createdAt, ownerEmail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
      [a.code, a.name, hashApiKey(kunci), kunci.slice(0, 12), a.webhookUrl, `whs_${Math.random().toString(36).slice(2)}`, a.channels, a.allowDecisions, 10000, 25000000, iso(new Date()), 'operator@jagoai.local'],
    );
    kunciApps.push({ code: a.code, apiKey: kunci });
  }

  const sekarang = Date.now();
  let urut = 0;
  const simpanCharges: Array<{ payId: string; appCode: string; status: string; createdAt: string }> = [];

  for (const status of STATUS_RENCANA) {
    urut += 1;
    const app = APPS[urut % APPS.length];
    const hariLalu = urut % 14;
    const dibuat = new Date(sekarang - hariLalu * 86400000 - (urut % 11) * 3600000);
    const amount = [15000, 25000, 49000, 75000, 99000, 149000, 250000, 600000][urut % 8];
    const fee = Math.round(amount * 0.007);
    const kanal = CHANNEL[urut % CHANNEL.length];
    const payId = idAcak('pym');
    const lunas = status === 'PAID';

    await pool.query(
      `INSERT INTO pay_charges (payId, appCode, appOrderId, amount, fee, net, channelCode, channelName, channelGroup,
                                status, description, metadata, paymentUrl, qrisString, vaNumber, proofUrl,
                                customerName, customerEmail, expiresAt, paidAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payId,
        app.code,
        `order-${dibuat.toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 7)}`,
        amount,
        fee,
        amount - fee,
        kanal.code,
        kanal.name,
        kanal.group,
        status,
        `${DESKRIPSI[urut % DESKRIPSI.length]} — ${app.name}`,
        kanal.code === 'BR' ? `https://sandbox.duitku.com/pay/${payId}` : '',
        kanal.code === 'SP' ? `00020101021226670016COM.NOBUBANK.WWW01189360050300000820910215${payId}5204000053033605802ID` : '',
        kanal.code === 'BR' ? `8808${String(1000000000 + urut)}` : '',
        status === 'REVIEW' ? `/proofs/${bukti[urut % bukti.length]}` : '',
        NAMA[urut % NAMA.length],
        `${NAMA[urut % NAMA.length].split(' ')[0].toLowerCase()}@contoh.id`,
        iso(new Date(dibuat.getTime() + 2 * 3600000)),
        lunas ? iso(new Date(dibuat.getTime() + 20 * 60000)) : '',
        iso(dibuat),
        iso(dibuat),
      ],
    );
    simpanCharges.push({ payId, appCode: app.code, status, createdAt: iso(dibuat) });
  }

  // Jejak webhook: 54 terkirim, 6 menunggu, 9 mati — sama dengan angka yang dipakai saat menguji
  // UI di jamy, supaya perbandingan tampilan tetap masuk akal.
  const rencanaDelivery = [
    ...Array(54).fill('DELIVERED'),
    ...Array(6).fill('PENDING'),
    ...Array(9).fill('DEAD'),
  ];
  let i = 0;
  for (const status of rencanaDelivery) {
    const c = simpanCharges[i % simpanCharges.length];
    i += 1;
    const event = c.status === 'PAID' ? 'charge.paid' : c.status === 'REVIEW' ? 'charge.review' : c.status === 'EXPIRED' ? 'charge.expired' : 'charge.created';
    await pool.query(
      `INSERT INTO pay_webhook_deliveries (deliveryId, appCode, payId, eventId, event, data, status, attempt,
                                           nextAttemptAt, lastError, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, ?)`,
      [
        idAcak('dlv'),
        c.appCode,
        c.payId,
        idAcak('evt'),
        event,
        status,
        status === 'DELIVERED' ? 1 : status === 'DEAD' ? 3 : 1,
        iso(new Date(sekarang + 300000)),
        status === 'DEAD' ? (c.appCode === 'kasirku' ? 'App tidak punya webhookUrl.' : 'HTTP 404') : '',
        c.createdAt,
        c.createdAt,
      ],
    );
  }

  const [hitung]: any = await pool.query(
    `SELECT (SELECT COUNT(*) FROM pay_charges) AS charges,
            (SELECT COUNT(*) FROM pay_webhook_deliveries) AS deliveries`,
  );
  console.log('[seed] selesai:', hitung?.[0]);
  console.log('[seed] kunci app (hanya tampil sekarang):');
  for (const k of kunciApps) console.log(`  ${k.code}: ${k.apiKey}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[seed] gagal:', e?.message || e);
  process.exit(1);
});
