import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Plus, Webhook } from 'lucide-react';
import { api, ApiError, rupiah, waktu, type App } from '../api';
import { Chip, Panel } from '../components/ui';

function salin(teks: string) {
  navigator.clipboard?.writeText(teks).catch(() => {});
}

export function Aplikasi() {
  const qc = useQueryClient();
  const apps = useQuery({ queryKey: ['apps'], queryFn: api.apps });

  const [kode, setKode] = useState('');
  const [nama, setNama] = useState('');
  const [channel, setChannel] = useState('SP,BR');
  const [hook, setHook] = useState('');
  const [kunciBaru, setKunciBaru] = useState<{ label: string; kunci: string; secret?: string } | null>(null);

  const buat = useMutation({
    mutationFn: () =>
      api.buatApp({ code: kode.trim().toLowerCase(), name: nama.trim(), channels: channel, webhookUrl: hook.trim() }),
    onSuccess: (r: any) => {
      setKunciBaru({ label: `Kunci API ${r.code}`, kunci: r.apiKey, secret: r.webhookSecret });
      setKode('');
      setNama('');
      setHook('');
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

  return (
    <>
      <div className="page__head">
        <div>
          <h1 className="page__title">Aplikasi</h1>
          <p className="page__sub">Kunci API, channel, dan URL webhook tiap aplikasi.</p>
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
                <th>Kunci</th>
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
                  <td className="num" style={{ fontSize: 11.5 }}>{a.allowedChannels}</td>
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

      <Panel judul="Daftarkan aplikasi" petunjuk="kunci dibuat otomatis">
        <div className="toolbar" style={{ alignItems: 'flex-end', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label className="panel__hint">kode</label>
            <span className="field">
              <input value={kode} onChange={(e) => setKode(e.target.value)} placeholder="kasir-utama" />
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label className="panel__hint">nama</label>
            <span className="field">
              <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Kasir Utama" />
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label className="panel__hint">channel</label>
            <span className="field">
              <input value={channel} onChange={(e) => setChannel(e.target.value.toUpperCase())} size={10} />
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 240 }}>
            <label className="panel__hint">url webhook</label>
            <span className="field field--grow">
              <Webhook size={14} strokeWidth={1.8} style={{ color: 'var(--muted)' }} />
              <input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="https://app.example/hook" />
            </span>
          </div>
          <button
            className="btn btn--pos"
            disabled={buat.isPending || kode.trim().length < 2 || !nama.trim()}
            onClick={() => buat.mutate()}
          >
            <Plus size={15} strokeWidth={2} /> Daftarkan
          </button>
        </div>
        {galat ? <div className="gate__err" style={{ marginTop: 10 }}>{galat.message}</div> : null}
        {buat.isSuccess ? (
          <div className="panel__hint" style={{ marginTop: 10 }}>
            Aplikasi dibuat. Berikan kunci di atas ke pemilik aplikasi lewat kanal aman.
          </div>
        ) : null}
      </Panel>

      <Panel judul="Cara memakai" petunjuk="contoh permintaan">
        <div className="mono-block">{`curl -X POST http://localhost:4010/api/jagoai-pay/v1/charges \\
  -H "X-JagoaiPay-Key: jgp_..." \\
  -H "Content-Type: application/json" \\
  -d '{"appOrderId":"INV-001","amount":99000,"channel":"manual-transfer"}'`}</div>
        <p className="panel__hint" style={{ marginTop: 10 }}>
          Endpoint daftar channel: <span className="num">GET /api/jagoai-pay/v1/channels</span>. Verifikasi webhook
          memakai HMAC-SHA256 atas <span className="num">timestamp.body</span> dengan secret aplikasi.
        </p>
      </Panel>
    </>
  );
}
