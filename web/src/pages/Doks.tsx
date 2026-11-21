import { useState, type ReactNode } from 'react';
import { Copy } from 'lucide-react';
import { Chip, Panel } from '../components/ui';

// Halaman dokumen: satu tempat untuk "cara pakai" — baik dari sisi aplikasi (API + webhook)
// maupun dari sisi console. Ditulis pendek per baris supaya bisa dibaca sambil kerja.

function Kode({ isi, judul }: { isi: string; judul?: string }) {
  const [tersalin, setTersalin] = useState(false);
  return (
    <div className="kode">
      {judul ? <div className="kode__judul">{judul}</div> : null}
      <button
        className="btn btn--ghost kode__salin"
        onClick={() => {
          navigator.clipboard?.writeText(isi).catch(() => {});
          setTersalin(true);
          window.setTimeout(() => setTersalin(false), 1500);
        }}
      >
        <Copy size={13} strokeWidth={1.8} /> {tersalin ? 'tersalin' : 'salin'}
      </button>
      <pre className="mono-block">{isi}</pre>
    </div>
  );
}

function Blok({ id, judul, petunjuk, children }: { id: string; judul: string; petunjuk?: string; children: ReactNode }) {
  return (
    <div id={id} className="dok__blok">
      <Panel judul={judul} petunjuk={petunjuk}>
        {children}
      </Panel>
    </div>
  );
}

const LANGKAH = [
  { n: '01', judul: 'Aplikasi minta tagihan', isi: 'POST /charges dengan kunci API. Balasannya payId.' },
  { n: '02', judul: 'Pembeli membayar', isi: 'Buka checkoutUrl: QRIS, nomor VA, atau transfer manual.' },
  { n: '03', judul: 'Status berubah', isi: 'PENDING → REVIEW atau PAID, atau EXPIRED bila lewat waktu.' },
  { n: '04', judul: 'Aplikasi diberi tahu', isi: 'Webhook bertanda tangan; bisa juga cek GET /charges/:payId.' },
];

const FIELD_TAGIHAN = [
  ['appOrderId', 'wajib', 'ID pesanan di aplikasi Anda, maks 190 karakter. Dipakai untuk idempoten: kirim ulang id yang sama, tagihannya tidak dobel.'],
  ['amount', 'wajib', 'Bilangan bulat rupiah. Batas per aplikasi: minAmount–maxAmount (bawaan 10.000–25.000.000).'],
  ['channel', 'opsional', 'manual-transfer, auto, atau kode channel Duitku (mis. SP untuk QRIS). Kosong = auto.'],
  ['description', 'opsional', 'Teks yang muncul di halaman bayar dan di console.'],
  ['customer', 'opsional', 'Objek { name, email } — ditampilkan ke operator saat memutuskan bukti.'],
  ['metadata', 'opsional', 'Objek bebas milik aplikasi Anda; dikembalikan utuh dan ikut di webhook.'],
  ['expiresInSeconds', 'opsional', 'Batas waktu bayar. QRIS/e-wallet maks 1 jam, VA maks 24 jam.'],
];

const STATUS_TAGIHAN: { status: string; arti: string }[] = [
  { status: 'PENDING', arti: 'Tagihan dibuat, pembeli belum membayar.' },
  { status: 'REVIEW', arti: 'Bukti transfer sudah diunggah dan menunggu keputusan operator.' },
  { status: 'PAID', arti: 'Lunas. paidAt terisi dan saldo aplikasi bertambah.' },
  { status: 'REJECTED', arti: 'Bukti ditolak. Pembeli boleh mengunggah bukti baru.' },
  { status: 'EXPIRED', arti: 'Lewat batas waktu tanpa pembayaran.' },
  { status: 'FAILED', arti: 'Ditolak gateway (mis. channel gagal dibuat).' },
];

const EVENT: [string, string][] = [
  ['charge.created', 'Tagihan baru dibuat.'],
  ['charge.review', 'Bukti transfer diunggah, menunggu keputusan.'],
  ['charge.paid', 'Tagihan lunas — ini yang biasanya memicu pengiriman barang/akses.'],
  ['charge.rejected', 'Bukti ditolak operator.'],
  ['charge.expired', 'Tagihan kedaluwarsa.'],
  ['charge.failed', 'Gateway menolak tagihan.'],
];

const MASALAH: [string, string, string][] = [
  ['401', 'unauthorized', 'Kunci API tidak dikirim atau salah. Periksa header X-JagoaiPay-Key; putar kunci bila bocor.'],
  ['404', 'not_found', 'payId/appOrderId tidak ada, atau milik aplikasi lain.'],
  ['409', 'already_paid', 'appOrderId ini sudah lunas — jangan buat tagihan baru untuk pesanan yang sama.'],
  ['400', 'validation', 'Ada field yang tidak sah: amount harus bilangan bulat, appOrderId wajib, decision harus approve/reject.'],
  ['400', 'channel_unavailable', 'Channel tidak diizinkan untuk aplikasi ini atau tidak tersedia di akun gateway.'],
  ['403', 'forbidden', 'Aplikasi tidak punya izin memutuskan bukti (allowDecisions mati).'],
  ['409', 'charge_not_reviewable', 'Status tagihan sudah berubah sebelum keputusan dikirim.'],
  ['503', 'gateway_off', 'Kredensial gateway belum diisi untuk layanan ini. Pakai manual-transfer sampai aktif.'],
];

export function Doks() {
  return (
    <>
      <div className="page__head">
        <div>
          <h1 className="page__title">Doks</h1>
          <p className="page__sub">Cara memakai JagoAI Pay, dari membuat aplikasi sampai menerima webhook.</p>
        </div>
      </div>

      <nav className="dok__toc" aria-label="Daftar isi">
        {[
          ['mulai', 'Mulai'],
          ['tagihan', 'Buat tagihan'],
          ['cek', 'Cek status'],
          ['status', 'Arti status'],
          ['channel', 'Channel'],
          ['bukti', 'Bukti transfer'],
          ['webhook', 'Webhook'],
          ['bayar', 'Halaman bayar'],
          ['console', 'Isi console'],
          ['masalah', 'Kalau bermasalah'],
        ].map(([id, label]) => (
          <a key={id} className="dok__tautan" href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>

      <Panel judul="Alur singkat" petunjuk="empat langkah">
        <div className="dok__alur">
          {LANGKAH.map((l) => (
            <div key={l.n} className="dok__langkah">
              <span className="dok__angka">{l.n}</span>
              <b>{l.judul}</b>
              <span>{l.isi}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Blok id="mulai" judul="Mulai" petunjuk="sekali per aplikasi">
        <ol className="dok__list">
          <li>
            Buka menu <b>Aplikasi</b>, isi kode (mis. <span className="dok__kode">kasir-utama</span>), nama, channel
            yang diizinkan, dan URL webhook.
          </li>
          <li>
            Salin <b>kunci API</b> (<span className="dok__kode">jgp_…</span>) dan <b>secret webhook</b> (
            <span className="dok__kode">whs_…</span>). Keduanya tampil sekali. Simpan di server aplikasi Anda, jangan
            di browser atau repo.
          </li>
          <li>
            Kirim header <span className="dok__kode">X-JagoaiPay-Key</span> di setiap permintaan. Tanpa URL webhook,
            event langsung berstatus DEAD.
          </li>
        </ol>
      </Blok>

      <Blok id="tagihan" judul="Membuat tagihan" petunjuk="POST /api/jagoai-pay/v1/charges">
        <Kode
          judul="permintaan"
          isi={`curl -X POST http://localhost:4010/api/jagoai-pay/v1/charges \\
  -H "X-JagoaiPay-Key: jgp_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "appOrderId": "INV-2026-0001",
    "amount": 150000,
    "channel": "manual-transfer",
    "description": "Kelas JagoAI - Batch 12",
    "customer": { "name": "Salman", "email": "salman@example.com" }
  }'`}
        />
        <Kode
          judul="balasan 201"
          isi={`{
  "payId": "pym_du59m1ve7x",
  "status": "PENDING",
  "amount": 150000,
  "fee": 0,
  "net": 150000,
  "channel": { "code": "manual-transfer", "name": "Transfer Manual", "group": "manual" },
  "payMethod": { "type": "manual", "instructions": "Unggah bukti transfer lewat endpoint /proof." },
  "checkoutUrl": "http://localhost:4020/pay/pym_du59m1ve7x",
  "expiresAt": "2026-11-22T05:54:00.000Z"
}`}
        />
        <div className="tbl-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Wajib</th>
                <th>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {FIELD_TAGIHAN.map(([nama, wajib, ket]) => (
                <tr key={nama}>
                  <td className="id">{nama}</td>
                  <td>
                    <span className={wajib === 'wajib' ? 'dok__wajib' : 'panel__hint'}>{wajib}</span>
                  </td>
                  <td>{ket}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="dok__catatan">
          Idempoten: kirim ulang <span className="dok__kode">appOrderId</span> yang masih aktif dan Anda menerima
          tagihan yang sama (HTTP 200, bukan 201). Kalau sudah lunas, jawabannya 409.
        </p>
      </Blok>

      <Blok id="cek" judul="Cek status" petunjuk="tanpa menunggu webhook">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Permintaan</th>
                <th>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="id">GET /api/jagoai-pay/v1/charges/&lt;payId&gt;</td>
                <td>Objek tagihan lengkap. Bila masih PENDING lebih dari 60 detik, status ikut ditanyakan ke gateway.</td>
              </tr>
              <tr>
                <td className="id">GET /api/jagoai-pay/v1/charges?appOrderId=INV-2026-0001</td>
                <td>Cari tagihan memakai id pesanan Anda sendiri — praktis untuk rekonsiliasi.</td>
              </tr>
              <tr>
                <td className="id">GET /api/jagoai-pay/v1/channels</td>
                <td>Channel yang diizinkan untuk aplikasi ini, beserta biaya dan grupnya.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Blok>

      <Blok id="status" judul="Arti status" petunjuk="PENDING sampai FAILED">
        <div className="dok__status">
          {STATUS_TAGIHAN.map((s) => (
            <div key={s.status} className="dok__status-baris">
              <Chip nilai={s.status} />
              <span>{s.arti}</span>
            </div>
          ))}
        </div>
      </Blok>

      <Blok id="channel" judul="Channel" petunjuk="manual dulu, gateway menyusul">
        <ul className="dok__list">
          <li>
            <span className="dok__kode">manual-transfer</span> selalu tersedia dan tanpa biaya. Pembeli mentransfer
            sendiri lalu mengunggah bukti.
          </li>
          <li>
            <span className="dok__kode">auto</span> memilih channel utama aplikasi; kode lain (mis.{' '}
            <span className="dok__kode">SP</span> QRIS, <span className="dok__kode">BR</span> VA) harus ada di daftar
            channel aplikasi dan di akun gateway.
          </li>
          <li>
            Selama gateway belum aktif, permintaan channel gateway dijawab <span className="dok__kode">503 gateway_off</span>{' '}
            — bukan berarti channel-nya salah.
          </li>
        </ul>
      </Blok>

      <Blok id="bukti" judul="Bukti transfer" petunjuk="alur manual-transfer">
        <ol className="dok__list">
          <li>
            Pembeli mengunggah bukti di halaman bayar, atau aplikasi mengirimnya:{' '}
            <span className="dok__kode">POST /api/jagoai-pay/v1/charges/&lt;payId&gt;/proof</span> dengan body{' '}
            <span className="dok__kode">{'{ "proof": "data:image/png;base64,…" }'}</span> (maks 1 MB). Status jadi
            REVIEW.
          </li>
          <li>
            Putuskan dari console (menu Tagihan) atau lewat API:{' '}
            <span className="dok__kode">POST /charges/&lt;payId&gt;/decision</span> dengan{' '}
            <span className="dok__kode">{'{ "decision": "approve" }'}</span> atau{' '}
            <span className="dok__kode">"reject"</span>. Keputusan lewat API butuh <b>allowDecisions</b> aktif di
            aplikasi.
          </li>
          <li>Approve → PAID (paidAt terisi). Reject → REJECTED, pembeli boleh mengunggah bukti lagi.</li>
        </ol>
      </Blok>

      <Blok id="webhook" judul="Webhook" petunjuk="event ke aplikasi Anda">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Kapan dikirim</th>
              </tr>
            </thead>
            <tbody>
              {EVENT.map(([nama, kapan]) => (
                <tr key={nama}>
                  <td className="id">{nama}</td>
                  <td>{kapan}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Kode
          judul="body yang dikirim"
          isi={`{
  "apiVersion": "2026-11-01",
  "eventId": "evt_...",
  "event": "charge.paid",
  "occurredAt": "2026-11-21T05:54:00.000Z",
  "attempt": 0,
  "data": { "payId": "pym_du59m1ve7x", "status": "PAID", "amount": 150000, "metadata": {} }
}`}
        />

        <Kode
          judul="verifikasi tanda tangan (node)"
          isi={`const t = req.header('X-JagoaiPay-Signature'); // t=<unix>,v1=<hex>
const [bagianT, bagianV1] = t.split(',').map((p) => p.split('=')[1]);
const harap = crypto.createHmac('sha256', SECRET).update(bagianT + '.' + rawBody).digest('hex');
if (harap !== bagianV1) return res.status(401).end();
if (Math.abs(Date.now() / 1000 - Number(bagianT)) > 300) return res.status(401).end();`}
        />

        <ul className="dok__list" style={{ marginTop: 12 }}>
          <li>
            Header: <span className="dok__kode">X-JagoaiPay-Signature</span> dan{' '}
            <span className="dok__kode">X-JagoaiPay-Event</span>. Balas 2xx dalam 8 detik; selain itu dihitung gagal.
          </li>
          <li>Gagal dicoba ulang 6 kali: 1 menit, 5 menit, 30 menit, 2 jam, 6 jam, lalu DEAD.</li>
          <li>
            Putar ulang satu event: tombol <b>putar</b> di menu Webhook, atau{' '}
            <span className="dok__kode">POST /api/jagoai-pay/v1/deliveries/&lt;deliveryId&gt;/replay</span>.
          </li>
          <li>Pakai body mentah (raw) saat menghitung HMAC — bukan hasil parse ulang JSON.</li>
        </ul>
      </Blok>

      <Blok id="bayar" judul="Halaman bayar" petunjuk="untuk pembeli, tanpa login">
        <p className="dok__paragraf">
          Kirim <span className="dok__kode">checkoutUrl</span> dari balasan API ke pembeli. Halaman ini menampilkan
          nominal, QR/VA atau instruksi transfer, tombol unggah bukti, dan status terkini — otomatis menyegarkan
          tiap 15 detik.
        </p>
        <Kode judul="bentuk URL" isi={`http://localhost:4020/pay/pym_du59m1ve7x`} />
      </Blok>

      <Blok id="console" judul="Isi console" petunjuk="lima menu">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Menu</th>
                <th>Dipakai untuk</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="id">Dashboard</td>
                <td>Uang masuk, tagihan menunggu keputusan, event yang gagal, tren 14 hari.</td>
              </tr>
              <tr>
                <td className="id">Tagihan</td>
                <td>Cari tagihan, lihat rincian dan jejak webhook, putuskan bukti transfer.</td>
              </tr>
              <tr>
                <td className="id">Aplikasi</td>
                <td>Daftarkan aplikasi, atur channel dan URL webhook, putar kunci API.</td>
              </tr>
              <tr>
                <td className="id">Webhook</td>
                <td>Antrean event: status kirim, error terakhir, putar ulang.</td>
              </tr>
              <tr>
                <td className="id">Doks</td>
                <td>Halaman ini — cara pakai dari sisi aplikasi.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Blok>

      <Blok id="masalah" judul="Kalau bermasalah" petunjuk="kode jawaban API">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>HTTP</th>
                <th>code</th>
                <th>Artinya</th>
              </tr>
            </thead>
            <tbody>
              {MASALAH.map(([http, kode, arti]) => (
                <tr key={kode}>
                  <td className="num">{http}</td>
                  <td className="id">{kode}</td>
                  <td>{arti}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="dok__catatan">
          Semua galat berbentuk <span className="dok__kode">{'{ "error": { "code": "…", "message": "…" } }'}</span>.
          Untuk pertanyaan ke operator, sebutkan payId atau appOrderId-nya.
        </p>
      </Blok>
    </>
  );
}
