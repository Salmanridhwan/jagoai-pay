import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Check, ExternalLink, Search, X } from 'lucide-react';
import { api, ApiError, rupiah, waktu, type Charge } from '../api';
import { Chip, Panel } from '../components/ui';

const STATUS = ['semua', 'PENDING', 'REVIEW', 'PAID', 'EXPIRED', 'FAILED', 'REJECTED'];
const HALAMAN = 25;

export function Tagihan() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const [status, setStatus] = useState(params.get('status') || 'semua');
  const [cari, setCari] = useState('');
  const [cariKirim, setCariKirim] = useState('');
  const [halaman, setHalaman] = useState(0);
  const dipilih = params.get('payId');

  // Pencarian ditunda sebentar supaya tidak membanjiri API satu permintaan per ketukan.
  useEffect(() => {
    const t = setTimeout(() => setCariKirim(cari.trim()), 350);
    return () => clearTimeout(t);
  }, [cari]);

  const daftar = useQuery({
    queryKey: ['charges', status, cariKirim, halaman],
    queryFn: () => api.charges({ status, q: cariKirim, limit: HALAMAN, offset: halaman * HALAMAN }),
  });

  const detail = useQuery({
    queryKey: ['charge', dipilih],
    queryFn: () => api.charge(String(dipilih)),
    enabled: !!dipilih,
  });

  const putuskan = useMutation({
    mutationFn: ({ payId, keputusan }: { payId: string; keputusan: 'approve' | 'reject' }) =>
      api.putuskan(payId, keputusan),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['charges'] });
      qc.invalidateQueries({ queryKey: ['charge'] });
      qc.invalidateQueries({ queryKey: ['ringkasan'] });
    },
  });

  function buka(payId: string) {
    const next = new URLSearchParams(params);
    next.set('payId', payId);
    setParams(next);
  }

  function tutup() {
    const next = new URLSearchParams(params);
    next.delete('payId');
    setParams(next);
  }

  function ubahStatus(nilai: string) {
    setStatus(nilai);
    setHalaman(0);
    const next = new URLSearchParams(params);
    if (nilai === 'semua') next.delete('status');
    else next.set('status', nilai);
    setParams(next);
  }

  const total = daftar.data?.total ?? 0;
  const baris = daftar.data?.rows ?? [];
  const galatPutus = putuskan.error instanceof ApiError ? putuskan.error.message : null;

  return (
    <>
      <div className="page__head">
        <div>
          <h1 className="page__title">Tagihan</h1>
          <p className="page__sub">
            {total} tagihan tercatat. Klik satu baris untuk melihat rincian, jejak webhook, dan memutuskan bukti
            transfer yang menunggu.
          </p>
        </div>
      </div>

      <Panel
        judul="Daftar tagihan"
        petunjuk={`halaman ${halaman + 1} dari ${Math.max(1, Math.ceil(total / HALAMAN))}`}
        padat={false}
        aksi={
          <div className="toolbar">
            <span className="field field--grow" style={{ minWidth: 220 }}>
              <Search size={14} strokeWidth={1.8} style={{ color: 'var(--muted)' }} />
              <input
                placeholder="cari payId, order, atau nama pembeli"
                value={cari}
                onChange={(e) => {
                  setCari(e.target.value);
                  setHalaman(0);
                }}
              />
            </span>
            <span className="field">
              <select value={status} onChange={(e) => ubahStatus(e.target.value)} aria-label="Saring status">
                {STATUS.map((s) => (
                  <option key={s} value={s}>
                    {s === 'semua' ? 'semua status' : s}
                  </option>
                ))}
              </select>
            </span>
          </div>
        }
      >
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Tagihan</th>
                <th>Order aplikasi</th>
                <th>Aplikasi</th>
                <th>Channel</th>
                <th style={{ textAlign: 'right' }}>Nominal</th>
                <th>Status</th>
                <th>Dibuat</th>
              </tr>
            </thead>
            <tbody>
              {baris.map((c: Charge) => (
                <tr
                  key={c.payId}
                  className={dipilih === c.payId ? 'is-picked' : ''}
                  onClick={() => buka(c.payId)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="id">{c.payId}</td>
                  <td className="id" style={{ color: 'var(--ink-2)' }}>{c.appOrderId}</td>
                  <td>{c.appCode}</td>
                  <td className="num" style={{ fontSize: 11.5 }}>{c.channelCode}</td>
                  <td className="num strong" style={{ textAlign: 'right' }}>{rupiah(c.amount)}</td>
                  <td>
                    <Chip nilai={c.status} />
                  </td>
                  <td className="num" style={{ color: 'var(--muted)', fontSize: 11.5 }}>
                    {waktu(c.createdAt)}
                    {c.adabukti ? <span title="Ada bukti transfer" style={{ marginLeft: 6, color: 'var(--warn)' }}>•</span> : null}
                  </td>
                </tr>
              ))}
              {!baris.length && !daftar.isLoading ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty">Tidak ada tagihan yang cocok dengan saringan ini.</div>
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
          <span className="toolbar__spacer" />
          <span className="panel__hint num">
            {total === 0 ? '0' : `${halaman * HALAMAN + 1}–${Math.min((halaman + 1) * HALAMAN, total)}`} dari {total}
          </span>
        </div>
      </Panel>

      {dipilih ? (
        <>
          <div className="scrim" onClick={tutup} />
          <aside className="detail" role="dialog" aria-label="Rincian tagihan">
            <header className="detail__head">
              <span className="num" style={{ fontSize: 13 }}>{dipilih}</span>
              {detail.data ? <Chip nilai={detail.data.charge.status} /> : null}
              <span style={{ marginLeft: 'auto' }} />
              <button className="btn btn--ghost" onClick={tutup} aria-label="Tutup">
                <X size={15} />
              </button>
            </header>

            <div className="detail__body">
              {detail.isLoading ? <div className="empty">Memuat rincian…</div> : null}
              {detail.data ? (
                <>
                  <dl className="detail__grid">
                    <dt>Nominal</dt>
                    <dd className="num" style={{ fontSize: 15 }}>{rupiah(detail.data.charge.amount)}</dd>
                    <dt>Biaya / net</dt>
                    <dd className="num">
                      {rupiah(detail.data.charge.fee)} / {rupiah(detail.data.charge.net)}
                    </dd>
                    <dt>Aplikasi</dt>
                    <dd>{detail.data.charge.appCode}</dd>
                    <dt>Order</dt>
                    <dd className="num">{detail.data.charge.appOrderId}</dd>
                    <dt>Channel</dt>
                    <dd>
                      {detail.data.charge.channelName || detail.data.charge.channelCode}{' '}
                      <span className="panel__hint">({detail.data.charge.channelCode})</span>
                    </dd>
                    <dt>Pembeli</dt>
                    <dd>
                      {detail.data.charge.customerName || '—'}
                      {detail.data.charge.customerEmail ? (
                        <div className="panel__hint">{detail.data.charge.customerEmail}</div>
                      ) : null}
                    </dd>
                    <dt>Deskripsi</dt>
                    <dd>{detail.data.charge.description || '—'}</dd>
                    <dt>Dibuat</dt>
                    <dd className="num">{waktu(detail.data.charge.createdAt)}</dd>
                    <dt>Kedaluwarsa</dt>
                    <dd className="num">{waktu(detail.data.charge.expiresAt)}</dd>
                    <dt>Dibayar</dt>
                    <dd className="num">{waktu(detail.data.charge.paidAt)}</dd>
                  </dl>

                  {detail.data.charge.status === 'REVIEW' ? (
                    <div className="panel" style={{ padding: 12 }}>
                      <div className="panel__title" style={{ marginBottom: 8 }}>Putuskan bukti transfer</div>
                      <div className="toolbar">
                        <button
                          className="btn btn--pos"
                          disabled={putuskan.isPending}
                          onClick={() => putuskan.mutate({ payId: String(dipilih), keputusan: 'approve' })}
                        >
                          <Check size={15} strokeWidth={2} /> Tandai lunas
                        </button>
                        <button
                          className="btn btn--danger"
                          disabled={putuskan.isPending}
                          onClick={() => putuskan.mutate({ payId: String(dipilih), keputusan: 'reject' })}
                        >
                          <X size={15} strokeWidth={2} /> Tolak bukti
                        </button>
                      </div>
                      {galatPutus ? <div className="gate__err" style={{ marginTop: 8 }}>{galatPutus}</div> : null}
                    </div>
                  ) : null}

                  {detail.data.charge.proofUrl ? (
                    <div>
                      <div className="panel__hint" style={{ marginBottom: 6 }}>Bukti transfer</div>
                      <a
                        className="mono-block"
                        href={detail.data.charge.proofUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <ExternalLink size={13} /> buka berkas bukti
                      </a>
                    </div>
                  ) : null}

                  {detail.data.charge.qrisString ? (
                    <div>
                      <div className="panel__hint" style={{ marginBottom: 6 }}>Payload QRIS</div>
                      <div className="mono-block">{detail.data.charge.qrisString}</div>
                    </div>
                  ) : null}

                  <div>
                    <div className="panel__hint" style={{ marginBottom: 6 }}>
                      Jejak webhook ({detail.data.deliveries?.length || 0} event)
                    </div>
                    {detail.data.deliveries?.length ? (
                      <div className="tbl-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Event</th>
                              <th>Status</th>
                              <th>Coba</th>
                              <th>Catatan</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.data.deliveries.map((w) => (
                              <tr key={w.deliveryId}>
                                <td className="id">{w.event}</td>
                                <td><Chip nilai={w.status} /></td>
                                <td className="num">{w.attempt}</td>
                                <td className="panel__hint">{w.lastError || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="empty">Belum ada event untuk tagihan ini.</div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}
