# Jembatan pembayaran JagoAI Pay → jamy

Dokumen ini menjelaskan cara JagoAI Pay menerima uang **tanpa** memegang kredensial Duitku.
Semua transaksi dibungkus jadi transaksi jamy, karena merchant Duitku yang terdaftar
adalah jamy (termasuk URL callback-nya).

## Siapa melakukan apa

| Langkah | Dilakukan oleh | Keterangan |
| --- | --- | --- |
| Aplikasi klien minta tagihan | klien → pay | `POST /api/jagoai-pay/v1/charges` + `X-JagoaiPay-Key` |
| pay minta jamy membuat transaksi | pay → jamy | `POST {JAMY_BRIDGE_URL}/api/pay-bridge/charges` + `X-Jagoai-Bridge-Key` |
| jamy inquiry ke Duitku | jamy → Duitku | `callbackUrl` = `https://jagoaischool.com/api/payments/duitku/callback` (terdaftar) |
| pembeli bayar | pembeli → Duitku | QRIS / VA / e-wallet sesuai channel |
| Duitku kabari hasil | Duitku → jamy | tanda tangan MD5 diverifikasi jamy |
| jamy kabari pay | jamy → pay | `POST /api/jagoai-pay/v1/bridge/callback` + `X-Jagoai-Pay-Token` |
| pay kabari aplikasi klien | pay → klien | webhook `charge.paid` / `charge.failed` |
| jaring pengaman | cron pay tiap 60 s | `GET /api/pay-bridge/charges/<payId>` bila notifikasi tidak sampai |

Pay **tidak** menyimpan merchant code / API key Duitku lagi. Kalau `GATEWAY_MODE=bridge`,
kredensial Duitku di `.env` pay diabaikan.

## Nomor transaksi

- `transactions.id` di jamy = `trx_pay_<payId>` (contoh `trx_pay_pym_165xvvwqg4`)
- `transactions.merchantOrderId` = `payId`
- `transactions.category` = `JAGOAI_PAY`
- Prefiks `trx_pay_` sengaja tidak punya cabang di `transactionCascade`, jadi tidak menyentuh
  enrollment/event/mentoring/certification/learning-path.
- Baris `JAGOAI_PAY` tidak muncul di Finance akademi (`WHERE category <> 'JAGOAI_PAY'`).

## Konfigurasi

### Layanan pay (`api/.env`)

```
JAMY_BRIDGE_URL=https://jagoaischool.com
JAMY_BRIDGE_KEY=<kunci bersama, min 24 karakter acak>
JAMY_BRIDGE_CALLBACK_TOKEN=<token bersama untuk notifikasi jamy → pay>
PAY_PUBLIC_BASE_URL=https://<domain-pay>   # untuk halaman bayar & returnUrl
```

`GATEWAY_MODE` diturunkan otomatis: `bridge` bila `JAMY_BRIDGE_URL` + `JAMY_BRIDGE_KEY` ada,
`duitku` bila kredensial Duitku lama ada, `off` bila tidak ada keduanya.
Bisa dipaksa lewat `GATEWAY_MODE=bridge|duitku|off`.

### Sisi jamy

```
PAY_BRIDGE_KEY=<sama dengan JAMY_BRIDGE_KEY>
PAY_BRIDGE_CALLBACK_URL=https://<domain-pay>/api/jagoai-pay/v1/bridge/callback
PAY_BRIDGE_CALLBACK_TOKEN=<sama dengan JAMY_BRIDGE_CALLBACK_TOKEN>
PAY_PUBLIC_BASE_URL=https://<domain-pay>
PUBLIC_BASE_URL=https://jagoaischool.com   # sudah ada, dipakai callback Duitku
```

## Kontrak endpoint jembatan (sisi jamy)

Semua di bawah `/api/pay-bridge`, wajib header `X-Jagoai-Bridge-Key`, **tidak** didaftarkan
di `authorize.ts` karena pemanggilnya layanan, bukan browser.

| Method | Path | Isi |
| --- | --- | --- |
| GET | `/health` | `{ ok, waktu }` |
| GET | `/channels` | `{ channels: [{ code, name, fee, group }] }` |
| POST | `/charges` | `{ payId, appCode, amount, channel, customerName, customerEmail, description, expiresInSeconds, returnUrl }` |
| GET | `/charges/:payId` | status terkini (`PENDING`/`PAID`/`FAILED`/`REJECTED`) + `qrString`/`vaNumber` |

Balasan `POST /charges`: `{ created, orderId, payId, status, statusJamy, amount, channel, reference,
paymentUrl, qrString, vaNumber, expiresInMinutes }`. `created=false` dipakai saat `payId` sudah ada.
`GET /charges/:payId` memakai bentuk yang sama tanpa `paymentUrl`.

## Notifikasi jamy → pay

```
POST /api/jagoai-pay/v1/bridge/callback
X-Jagoai-Pay-Token: <JAMY_BRIDGE_CALLBACK_TOKEN>
{ "payId": "...", "status": "PAID|FAILED|REJECTED", "orderId": "trx_pay_...", "amount": 15000, "reference": "...", "paidAt": "..." }
```

Aturan di pay:

- token dibandingkan `crypto.timingSafeEqual` → 401 kalau beda
- `payId` tak dikenal → 404, tanpa `payId` → 400
- nominal **tidak** dipercaya; kalau `amount` ada dan beda dengan tagihan → 409 `amount_mismatch`
- status final tidak diturunkan lagi (PAID tidak bisa jadi FAILED)
- jamy tetap membalas `200` ke Duitku walau forward ke pay gagal; cron pay yang menyusul

## Uji lokal (yang sudah dijalankan)

1. mock Duitku di `:4099` (`~/.hermes/cache/scratch/mock_duitku.py`)
2. jamy worktree `feat/pay-bridge` di `:3100` dengan `DUITKU_BASE_URL=http://127.0.0.1:4099`
3. pay di `:4011` dengan env jembatan
4. alur lolos: charge QRIS → `trx_pay_*` PENDING → callback `00` → jamy COMPLETED → pay PAID → webhook terkirim
5. tanpa callback sama sekali, cron pay menandai PAID (rekonsiliasi) — terbukti

Hasil negatif yang juga diuji: token salah 401, kunci jembatan salah 401, nominal beda 409,
`payId` asing 404, callback Duitku untuk order asing tetap 404.

## Yang belum diverifikasi

- Perilaku Duitku produksi untuk `callbackUrl` per-request — tidak relevan lagi karena
  transaksi pay memakai callback jamy yang memang terdaftar.
- Retensi: kalau baris `trx_pay_*` dibersihkan sementara pembeli masih membuka halaman bayar,
  jamy menjawab 404 dan pay menandai tagihan gagal setelah kedaluwarsa.
