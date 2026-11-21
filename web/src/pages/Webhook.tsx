import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCw } from 'lucide-react';
import { api, ApiError, waktu } from '../api';
import { Chip, Panel } from '../components/ui';

const STATUS = ['semua', 'PENDING', 'DELIVERED', 'DEAD'];
const HALAMAN = 25;

export function Webhook() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('semua');
  const [app, setApp] = useState('semua');
  const [halaman, setHalaman] = useState(0);
  const [pesan, setPesan] = useState<{ jenis: 'ok' | 'err'; teks: string } | null>(null);

  const apps = useQuery({ queryKey: ['apps'], queryFn: api.apps });
  const daftar = useQuery({
    queryKey: ['deliveries', status, app, halaman],
    queryFn: () => api.deliveries({ status, app, limit: HALAMAN, offset: halaman * HALAMAN }),
  });

  const putarUlang = useMutation({
    mutationFn: (id: string) => api.putarUlang(id),
    onSuccess: () => {
      setPesan({ jenis: 'ok', teks: 'Event dijadwalkan ulang. Pengiriman berjalan pada siklus cron berikutnya.' });
      qc.invalidateQueries({ queryKey: ['deliveries'] });
    },
    onError: (e) => {
      const teks = e instanceof ApiError ? e.message : 'Gagal menjadwalkan ulang.';
      setPesan({ jenis: 'err', teks });
    },
  });

  const baris = daftar.data?.rows ?? [];
  const total = daftar.data?.total ?? baris.length;

  return (
    <>
      <div className="page__head">
        <div>
          <h1 className="page__title">Webhook</h1>
          <p className="page__sub">
            Setiap perubahan status tagihan dikirim ke aplikasi pemiliknya. Yang gagal dicoba ulang dengan jeda
            makin panjang, lalu dimatikan. Anda bisa memutar ulang satu event secara manual.
          </p>
        </div>
        <div className="toolbar">
          <span className="field">
            <select
              value={app}
              onChange={(e) => {
                setApp(e.target.value);
                setHalaman(0);
              }}
              aria-label="Saring aplikasi"
            >
              <option value="semua">semua aplikasi</option>
              {(apps.data?.rows || []).map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code}
                </option>
              ))}
            </select>
          </span>
          <span className="field">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setHalaman(0);
              }}
              aria-label="Saring status"
            >
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {s === 'semua' ? 'semua status' : s}
                </option>
              ))}
            </select>
          </span>
        </div>
      </div>

      {pesan ? (
        <div className={`toast${pesan.jenis === 'err' ? ' toast--err' : ''}`} onClick={() => setPesan(null)}>
          {pesan.teks}
        </div>
      ) : null}

      <Panel judul="Pengiriman" petunjuk={`${total} event`} padat={false}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Aplikasi</th>
                <th>Tagihan</th>
                <th>Status</th>
                <th>Coba</th>
                <th>Jadwal berikut</th>
                <th>Catatan</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {baris.map((w) => (
                <tr key={w.deliveryId}>
                  <td className="id">{w.event}</td>
                  <td>{w.appCode}</td>
                  <td className="id" style={{ color: 'var(--ink-2)' }}>{w.payId}</td>
                  <td>
                    <Chip nilai={w.status} />
                  </td>
                  <td className="num">{w.attempt}</td>
                  <td className="num" style={{ color: 'var(--muted)', fontSize: 11.5 }}>
                    {w.status === 'DELIVERED' ? '—' : waktu(w.nextAttemptAt)}
                  </td>
                  <td className="panel__hint" style={{ maxWidth: 240 }}>
                    {w.lastError || '—'}
                  </td>
                  <td>
                    <button
                      className="btn btn--ghost"
                      disabled={putarUlang.isPending}
                      onClick={() => putarUlang.mutate(w.deliveryId)}
                      title="Jadwalkan ulang pengiriman"
                    >
                      <RotateCw size={14} strokeWidth={1.8} /> putar
                    </button>
                  </td>
                </tr>
              ))}
              {!baris.length && !daftar.isLoading ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty">Tidak ada pengiriman pada saringan ini.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="toolbar" style={{ padding: 12, borderTop: '1px solid var(--line-soft)' }}>
          <button className="btn btn--ghost" disabled={halaman === 0} onClick={() => setHalaman((h) => Math.max(0, h - 1))}>
            Sebelumnya
          </button>
          <button
            className="btn btn--ghost"
            disabled={(halaman + 1) * HALAMAN >= total}
            onClick={() => setHalaman((h) => h + 1)}
          >
            Berikutnya
          </button>
        </div>
      </Panel>

      <Panel judul="Cara memverifikasi" petunjuk="di sisi penerima">
        <div className="mono-block">{`// header yang dikirim: X-JagoaiPay-Signature: t=<unix>,v1=<hex>
const tanda = hmacSha256(secret, \`\${t}.\${rawBody}\`);
if (!timingSafeEqual(tanda, v1)) tolak();`}</div>
        <p className="panel__hint" style={{ marginTop: 10 }}>
          Selalu pakai body mentah (bukan hasil parse ulang) dan tolak timestamp lebih tua dari 5 menit supaya
          event lama tidak bisa diputar ulang dari luar.
        </p>
      </Panel>
    </>
  );
}
