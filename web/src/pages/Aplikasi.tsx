import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Copy, KeyRound, Plus, Webhook } from 'lucide-react';
import { api, ApiError, rupiah, waktu, type App } from '../api';
import { Chip, Panel } from '../components/ui';

function salin(teks: string) {
  navigator.clipboard?.writeText(teks).catch(() => {});
}

// Kode aplikasi dibentuk dari nama supaya operator tidak perlu mengarang sendiri: "Kasir Utama"
// menjadi "kasir-utama". Aturannya sama dengan validasi di API (2-32 huruf kecil/angka/strip),
// jadi yang tampil di sini tidak mungkin ditolak server karena bentuk kode.
function jadikanKode(teks: string) {
  return teks
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

const KODE_VALID = /^[a-z0-9][a-z0-9-]{1,31}$/;

export function Aplikasi() {
  const qc = useQueryClient();
  const apps = useQuery({ queryKey: ['apps'], queryFn: api.apps });
  const daftar = useQuery({ queryKey: ['channel-console'], queryFn: api.channels, staleTime: 5 * 60_000 });

  const [nama, setNama] = useState('');
  const [kode, setKode] = useState('');
  const [kodeDisentuh, setKodeDisentuh] = useState(false);
  const [pilih, setPilih] = useState<string[] | null>(null);
  const [hook, setHook] = useState('');
  const [kunciBaru, setKunciBaru] = useState<{ label: string; kunci: string; secret?: string } | null>(null);

  const rows = daftar.data?.rows || [];
  const namaChannel = (code: string) => rows.find((c) => c.code === code)?.name || code;

  // Pilihan awal: QRIS + satu virtual account yang memang ada di akun. `null` = belum disentuh
  // operator — kalau operator sengaja mengosongkan semua centang, jangan diisi ulang otomatis.
  useEffect(() => {
    if (pilih !== null || rows.length === 0) return;
    const mau = ['SP', 'BR'].filter((c) => rows.some((r) => r.code === c));
    setPilih(mau.length ? mau : [rows[0].code]);
  }, [rows, pilih]);

  const aktif = pilih || [];
  const ubahPilih = (code: string) =>
    setPilih(aktif.includes(code) ? aktif.filter((c) => c !== code) : [...aktif, code]);

  const buat = useMutation({
    mutationFn: () =>
      api.buatApp({ code: kode.trim().toLowerCase(), name: nama.trim(), channels: aktif.join(','), webhookUrl: hook.trim() }),
    onSuccess: (r: any) => {
      setKunciBaru({ label: `Kunci API ${r.code}`, kunci: r.apiKey, secret: r.webhookSecret });
      setNama('');
      setKode('');
      setKodeDisentuh(false);
      setHook('');
      setPilih(null);
      buat.reset();
      qc.invalidateQueries({ queryKey: ['apps'] });
    },
  });

  const putar = useMutation({
    mutationFn: (code: string) => api.putarKunci(code),
    onSuccess: (r: any, code) => {
      setKunciBaru({ label: `Kunci baru ${code}`, kunci: r.apiKey });
      qc.invalidateQueries({ queryKey: ['apps'] });
    },
  });

  const galat = (buat.error || putar.error) as ApiError | null;
  const kodeSalah = kode.length > 0 && !KODE_VALID.test(kode.trim().toLowerCase());
  const bisaSimpan = nama.trim().length > 0 && KODE_VALID.test(kode.trim().toLowerCase()) && aktif.length > 0 && !buat.isPending;

  return (
    <>
      <div className="page__head">
        <div>
          <h1 className="page__title">Aplikasi</h1>
          <p className="page__sub">Satu aplikasi, satu kunci API.</p>
        </div>
      </div>

      {kunciBaru ? (
        <Panel judul={kunciBaru.label} petunjuk="salin sekarang — tidak ditampilkan lagi">
          <div className="mono-block">{kunciBaru.kunci}</div>
          {kunciBaru.secret ? (
            <>
              <div className="panel__hint" style={{ margin: '10px 0 6px' }}>
                Secret webhook (untuk memverifikasi tanda tangan X-JagoaiPay-Signature)
              </div>
              <div className="mono-block">{kunciBaru.secret}</div>
            </>
          ) : null}
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button
              className="btn"
              onClick={() => salin(kunciBaru.kunci + (kunciBaru.secret ? `\n${kunciBaru.secret}` : ''))}
            >
              <Copy size={14} strokeWidth={1.8} /> Salin
            </button>
            <button className="btn btn--ghost" onClick={() => setKunciBaru(null)}>
              Sudah saya simpan
            </button>
          </div>
        </Panel>
      ) : null}

      <Panel judul="Aplikasi terdaftar" petunjuk={`${apps.data?.rows.length || 0} aplikasi`} padat={false}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Aplikasi</th>
                <th>Kunci API</th>
                <th>Channel</th>
                <th>Webhook</th>
                <th style={{ textAlign: 'right' }}>Tagihan</th>
                <th style={{ textAlign: 'right' }}>Lunas</th>
                <th>Terakhir</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(apps.data?.rows || []).map((a: App) => (
                <tr key={a.code}>
                  <td>
                    <div className="strong">{a.name}</div>
                    <div className="panel__hint num">{a.code}</div>
                  </td>
                  <td className="num" style={{ fontSize: 11.5 }}>{a.apiKeyPrefix}…</td>
                  <td>
                    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                      {a.allowedChannels
                        .split(',')
                        .filter(Boolean)
                        .map((c) => (
                          <span key={c} className="chip" title={namaChannel(c)}>
                            {c}
                          </span>
                        ))}
                    </span>
                  </td>
                  <td>
                    {a.webhookUrl ? (
                      <span className="panel__hint num" style={{ wordBreak: 'break-all' }}>{a.webhookUrl}</span>
                    ) : (
                      <span className="chip chip--warn">tanpa URL</span>
                    )}
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>{a.totalcharge ?? 0}</td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    {a.paidcharge ?? 0}
                    <div className="panel__hint">{rupiah(a.nilaipaid ?? 0)}</div>
                  </td>
                  <td className="num" style={{ color: 'var(--muted)', fontSize: 11.5 }}>{waktu(a.terakhircharge)}</td>
                  <td>
                    <button
                      className="btn btn--ghost"
                      disabled={putar.isPending}
                      onClick={() => putar.mutate(a.code)}
                      title="Putar kunci API aplikasi ini"
                    >
                      <KeyRound size={14} strokeWidth={1.8} /> putar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel judul="Daftarkan aplikasi" petunjuk="kunci API dibuat otomatis">
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (bisaSimpan) buat.mutate();
          }}
        >
          <div className="form__dua">
            <div className="form__field">
              <label className="form__label" htmlFor="app-nama">Nama aplikasi</label>
              <span className="field field--grow">
                <input
                  id="app-nama"
                  value={nama}
                  placeholder="Kasir Utama"
                  onChange={(e) => {
                    setNama(e.target.value);
                    if (!kodeDisentuh) setKode(jadikanKode(e.target.value));
                  }}
                />
              </span>
              <span className="form__hint">Nama yang tampil besar di daftar atas.</span>
            </div>

            <div className="form__field">
              <label className="form__label" htmlFor="app-kode">Kode aplikasi</label>
              <span className="field" style={{ maxWidth: 280 }}>
                <input
                  id="app-kode"
                  className="num"
                  value={kode}
                  placeholder="kasir-utama"
                  spellCheck={false}
                  onChange={(e) => {
                    setKodeDisentuh(true);
                    setKode(jadikanKode(e.target.value));
                  }}
                />
              </span>
              <span className="form__hint">
                {kodeSalah
                  ? 'Pakai huruf kecil, angka, atau strip (2-32 karakter).'
                  : 'Terbentuk otomatis dari nama. Dipakai di API dan laporan.'}
              </span>
            </div>
          </div>

          <div className="form__field">
            <span className="form__label">Channel yang boleh dipakai</span>
            <div className="pick" role="group" aria-label="Channel yang boleh dipakai">
              {rows.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className="pick__item"
                  aria-pressed={aktif.includes(c.code)}
                  onClick={() => ubahPilih(c.code)}
                >
                  <span className="pick__kode">{c.code}</span>
                  {c.name}
                </button>
              ))}
              {daftar.isLoading ? <span className="form__hint">memuat channel…</span> : null}
              {!daftar.isLoading && rows.length === 0 ? (
                <span className="form__hint">Daftar channel tidak terbaca. Isi lewat API bila mendesak.</span>
              ) : null}
            </div>
            <span className="form__hint">Boleh lebih dari satu — ini yang muncul sebagai pilihan di halaman bayar.</span>
          </div>

          <div className="form__field">
            <label className="form__label" htmlFor="app-hook">
              URL webhook <em>opsional</em>
            </label>
            <span className="field field--grow">
              <Webhook size={14} strokeWidth={1.8} style={{ color: 'var(--muted)' }} />
              <input
                id="app-hook"
                value={hook}
                placeholder="https://aplikasi-anda.com/hook"
                onChange={(e) => setHook(e.target.value)}
              />
            </span>
            <span className="form__hint">
              Boleh dikosongkan — di daftar nanti bertanda "tanpa URL" dan notifikasi tidak dikirim.
            </span>
          </div>

          <div className="form__kaki">
            <span className="form__hint">
              Akan tampil sebagai <strong>{nama.trim() || 'Nama aplikasi'}</strong> —{' '}
              <span className="num">{kode.trim() || 'kode-app'}</span>
              {aktif.length ? ` · channel ${aktif.join(', ')}` : ' · channel belum dipilih'}
            </span>
            <button className="btn btn--pos" type="submit" disabled={!bisaSimpan}>
              <Plus size={15} strokeWidth={2} /> Daftarkan
            </button>
          </div>

          {galat ? <div className="gate__err">{galat.message}</div> : null}
        </form>
      </Panel>

      <Panel judul="Cara memakai" petunjuk="rinciannya di Doks">
        <p className="panel__hint">
          Contoh permintaan, arti tiap status, daftar event webhook, dan cara memverifikasi tanda tangan ada di{' '}
          <Link to="/doks" style={{ color: 'var(--pos)' }}>Doks</Link> — di sana ada tombol "Salin semua" untuk
          diberikan ke agen/AI.
        </p>
      </Panel>
    </>
  );
}
