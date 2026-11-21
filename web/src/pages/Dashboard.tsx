import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api, rupiah, rupiahPendek, tanggalPendek, waktu, type Status } from '../api';
import { Chip, Kpi, Panel, Panjang } from '../components/ui';

const WARNA_STATUS: Record<string, string> = {
  PAID: 'var(--pos)',
  REVIEW: 'var(--warn)',
  PENDING: 'var(--info)',
  EXPIRED: 'var(--muted)',
  FAILED: 'var(--danger)',
  REJECTED: 'var(--danger)',
};

export function Dashboard() {
  const nav = useNavigate();
  const ringkas = useQuery({ queryKey: ['ringkasan'], queryFn: api.ringkasan });
  const terbaru = useQuery({
    queryKey: ['charges', 'terbaru'],
    queryFn: () => api.charges({ limit: 8 }),
  });

  if (ringkas.isLoading) return <div className="empty">Memuat dashboard…</div>;
  if (ringkas.error || !ringkas.data) return <div className="empty">Gagal memuat dashboard.</div>;

  const d = ringkas.data;
  const puncak = Math.max(...d.tren.map((t) => Number(t.nilai) || 0), 1);
  const maksStatus = Math.max(...d.perStatus.map((s) => Number(s.jumlah) || 0), 1);
  const lunas = d.perStatus.find((s) => s.status === 'PAID');
  const review = d.perStatus.find((s) => s.status === 'REVIEW');
  const rasioLunas = d.total.jumlah > 0 ? Math.round((d.total.jumlahpaid / d.total.jumlah) * 100) : 0;

  return (
    <>
      <div className="page__head">
        <div>
          <h1 className="page__title">Dashboard</h1>
          <p className="page__sub">Uang masuk, tagihan menunggu, dan event yang gagal.</p>
        </div>
        <div className="toolbar">
          <button className="btn btn--ghost" onClick={() => ringkas.refetch()}>
            Segarkan
          </button>
          <Link className="btn btn--pos" to="/tagihan">
            Lihat tagihan
          </Link>
        </div>
      </div>

      <div className="kpis">
        <Kpi
          label="Nilai lunas"
          nilai={rupiah(d.total.nilaipaid)}
          nada="pos"
          kaki={`Net setelah biaya ${rupiah(d.total.netpaid)}`}
        />
        <Kpi
          label="Lunas hari ini"
          nilai={rupiah(d.hariIni.nilaipaid)}
          nada="info"
          kaki={`${d.hariIni.jumlah} tagihan dibayar`}
        />
        <Kpi
          label="Menunggu keputusan"
          nilai={rupiah(review?.nilai || 0)}
          nada="warn"
          kaki={`${review?.jumlah || 0} bukti transfer perlu diperiksa`}
        />
        <Kpi
          label="Rasio lunas"
          nilai={`${rasioLunas}%`}
          kaki={`${d.total.jumlahpaid} dari ${d.total.jumlah} tagihan`}
        />
      </div>

      <div className="split">
        <Panel
          judul={`Nilai lunas ${d.tren.length} hari terakhir`}
          petunjuk="nilai tagihan lunas per hari"
          kelas="panel--chart"
        >
          <div className="chart" role="img" aria-label="Grafik nilai tagihan empat belas hari terakhir">
            <div className="chart__plot">
              {d.tren.map((t) => {
                // Tinggi dalam persen dari area plot: induknya punya tinggi pasti, jadi tidak runtuh.
                const persen = Math.max(1.5, (Number(t.nilai) / puncak) * 100);
                return (
                  <div
                    className="chart__col"
                    key={t.hari}
                    title={`${tanggalPendek(t.hari)} · ${rupiah(t.nilai)}`}
                  >
                    <div className="chart__bar" style={{ height: `${persen}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="chart__axis">
              {d.tren.map((t) => (
                <span className="chart__x" key={t.hari}>
                  {tanggalPendek(t.hari)}
                </span>
              ))}
            </div>
          </div>
        </Panel>

        <Panel judul="Sebaran status" petunjuk="klik untuk menyaring">
          <div className="status-rows">
            {d.perStatus.map((s) => (
              <button
                key={s.status}
                className="status-row"
                onClick={() => nav(`/tagihan?status=${s.status}`)}
                title={`Lihat ${s.jumlah} tagihan ${s.status}`}
              >
                <div style={{ minWidth: 0 }}>
                  <span className="status-row__name">
                    <Chip nilai={s.status as Status} />
                    <span className="num" style={{ color: 'var(--ink-2)' }}>{rupiahPendek(s.nilai)}</span>
                  </span>
                  <Panjang nilai={Number(s.jumlah)} maks={maksStatus} warna={WARNA_STATUS[s.status] || 'var(--info)'} />
                </div>
                <span className="num" style={{ fontSize: 13 }}>{s.jumlah}</span>
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>tagihan</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <div className="split">
        <Panel
          judul="Tagihan terbaru"
          petunjuk="8 terakhir"
          padat={false}
          aksi={
            <Link className="panel__hint" to="/tagihan">
              semua tagihan →
            </Link>
          }
        >
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tagihan</th>
                  <th>Aplikasi</th>
                  <th style={{ textAlign: 'right' }}>Nominal</th>
                  <th>Status</th>
                  <th>Dibuat</th>
                </tr>
              </thead>
              <tbody>
                {(terbaru.data?.rows || []).map((c) => (
                  <tr key={c.payId} onClick={() => nav(`/tagihan?payId=${c.payId}`)} style={{ cursor: 'pointer' }}>
                    <td className="id">{c.payId}</td>
                    <td>{c.appCode}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{rupiah(c.amount)}</td>
                    <td>
                      <Chip nilai={c.status} />
                    </td>
                    <td className="num" style={{ color: 'var(--muted)', fontSize: 11.5 }}>{waktu(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel judul="Kesehatan integrasi">
          <dl className="detail__grid" style={{ gridTemplateColumns: '1fr auto' }}>
            <dt>Aplikasi aktif</dt>
            <dd className="num" style={{ textAlign: 'right' }}>
              {d.apps.aktif} / {d.apps.jumlah}
            </dd>
            <dt>Tanpa URL webhook</dt>
            <dd className="num" style={{ textAlign: 'right', color: d.apps.tanpahook ? 'var(--warn)' : 'var(--ink)' }}>
              {d.apps.tanpahook}
            </dd>
            <dt>Event terkirim</dt>
            <dd className="num" style={{ textAlign: 'right', color: 'var(--pos)' }}>{d.deliveries.terkirim}</dd>
            <dt>Menunggu kirim</dt>
            <dd className="num" style={{ textAlign: 'right', color: 'var(--warn)' }}>{d.deliveries.menunggu}</dd>
            <dt>Gagal permanen</dt>
            <dd className="num" style={{ textAlign: 'right', color: 'var(--danger)' }}>{d.deliveries.mati}</dd>
            <dt>Lunas</dt>
            <dd className="num" style={{ textAlign: 'right' }}>{lunas?.jumlah || 0} tagihan</dd>
          </dl>
          <p className="panel__hint" style={{ marginTop: 12 }}>
            {d.apps.tanpahook > 0
              ? 'Ada aplikasi tanpa URL webhook: perubahan status tidak akan pernah sampai ke sana.'
              : 'Semua aplikasi punya URL webhook.'}
          </p>
        </Panel>
      </div>
    </>
  );
}
