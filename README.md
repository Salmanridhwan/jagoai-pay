# JagoAI Pay

Layanan pembayaran mandiri: API gateway tagihan, console operator, dan halaman bayar publik. Berdiri
sendiri — repo, basis data, sesi login, dan rahasia sendiri — tidak menumpang aplikasi akademi.

```
jagoai-pay/
├── api/                 # Express + TypeScript + Postgres (port 4010)
│   ├── src/pay/         # mesin tagihan, webhook keluar, cron, tanda tangan
│   ├── src/routes/      # v1 (API berkunci), auth (console), console, public (halaman bayar)
│   └── var/proofs/      # bukti transfer yang diunggah pembayar
├── web/                 # React + Vite (port 4020)
│   └── src/pages/       # Ikhtisar, Tagihan, Aplikasi, Webhook, Bayar
└── docker-compose.yml   # Postgres 16 di 127.0.0.1:5435, DB jagoai_pay
```

## Menjalankan di lokal

```bash
docker compose up -d               # Postgres 5435
cd api && cp .env.example .env && npm install
npm run seed                       # data contoh + 3 kunci app (hanya dicetak sekali)
npm start                          # API di http://localhost:4010

cd ../web && npm install
npm run dev                        # console di http://localhost:4020
```

Akun console pertama dibuat otomatis saat API pertama kali menyala, memakai `SEED_CONSOLE_EMAIL` dan
`SEED_CONSOLE_PASSWORD` dari `api/.env`. Ganti sandinya lewat terminal:

```bash
cd api && npm run reset-password -- operator@jagoai.local 'sandi-baru-yang-panjang'
```

Nilai di `.env` yang mengandung `#` **harus dikutip** — dotenv memotong nilai tanpa kutip di karakter
itu, dan akibatnya sandi tersimpan berbeda dari yang tertulis.

## API untuk aplikasi pemilik tagihan

Semua permintaan membawa kunci aplikasi di header `X-JagoaiPay-Key` (prefix `jgp_`).

```bash
# daftar channel yang diizinkan untuk app ini
curl http://localhost:4010/api/jagoai-pay/v1/channels -H "X-JagoaiPay-Key: jgp_..."

# buat tagihan
curl -X POST http://localhost:4010/api/jagoai-pay/v1/charges \
  -H "X-JagoaiPay-Key: jgp_..." -H 'Content-Type: application/json' \
  -d '{"appOrderId":"INV-001","amount":99000,"channel":"manual-transfer"}'
```

`appOrderId` bersifat idempoten: permintaan ulang dengan id yang sama mengembalikan tagihan yang sudah
ada, bukan membuat yang baru.

Webhook keluar ditandatangani HMAC-SHA256 atas `timestamp.body` dengan secret aplikasi, dikirim di
header `X-JagoaiPay-Signature: t=<unix>,v1=<hex>`. Penerima wajib memakai body mentah dan menolak
timestamp lebih tua dari 5 menit.

## Keamanan yang disengaja

- **Kredensial Duitku tidak dipakai bersama dengan aplikasi lain.** Project Duitku yang terdaftar milik
  aplikasi akademi dan callback-nya mendarat di basis data aplikasi itu; memakai kredensial tersebut di
  sini akan membuat transaksi tidak pernah lunas. Karena itu `DUITKU_CALLBACK_URL` dibiarkan kosong dan
  `GATEWAY_SIAP` menolak pembuatan tagihan non-manual dengan `503 gateway_off` sampai layanan ini punya
  project Duitku sendiri.
- **Kunci aplikasi disimpan sebagai hash.** Nilainya hanya muncul sekali saat app dibuat atau kuncinya
  diputar.
- **Sesi console memakai cookie HttpOnly**, bukan token di `localStorage`. Sandi disimpan sebagai hash
  bcrypt.
- **Batas wewenang di server.** `viewer` bisa membaca console tetapi tidak bisa memutuskan bukti,
  mengelola app, atau memutar ulang webhook.

## Catatan operasi

- `GET /health` mengembalikan status DB dan `gatewaySiap` — dipakai console untuk menandai bilah atas.
- Cron 60 detik: kedaluwarsakan tagihan, rekonsiliasi yang tertunda, dan kirim ulang webhook.
- Webhook gagal dicoba ulang dengan jeda makin panjang lalu berstatus `DEAD`; bisa diputar manual dari
  halaman Webhook.
- Data contoh memakai URL webhook `http://localhost:4010/__contoh-hook/...` supaya tidak ada trafik
  keluar ke sistem siapa pun saat mencoba.
