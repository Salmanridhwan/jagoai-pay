import { useState } from 'react';
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

// Tiga status ini beda arti tetapi sama-sama berarti uang tidak masuk. Digabung hanya untuk kartu
// "Uang bocor" dan tautan ?status=GAGAL; di daftar tagihan statusnya tetap tampil apa adanya.
const GAGAL = ['EXPIRED', 'FAILED', 'REJECTED'];

// Enam status mentah tidak menjawab pertanyaan pemilik layanan. Dikelompokkan jadi empat keadaan
// yang masing-masing punya tindakan berbeda: uang sudah masuk, masih menunggu pembeli, menunggu
// keputusan operator, atau sudah tidak akan jadi uang.
const KELOMPOK: { label: string; status: Status[] }[] = [
  { label: 'selesai', status: ['PAID'] },
  { label: 'berjalan', status: ['PENDING'] },
  { label: 'butuh tindakan', status: ['REVIEW'] },
  { label: 'gagal', status: GAGAL as Status[] },
];

// "Tertua 3 hari" lebih berguna daripada jam pasti: yang perlu ditindak adalah sejak kapan uang
// pembeli tertahan, bukan detiknya.
// Label di puncak batang harus muat ~25–54px: "Rp 149 rb" jadi "149rb" (tanpa spasi & awalan Rp).
// Rp dihilangkan karena seluruh panel sudah berbicara rupiah; satuannya cukup di petunjuk panel.
function singkat(nilai: string | number): string {
  return rupiahPendek(Number(nilai)).replace('Rp', '').replace(/\s+/g, '');
}

// Median waktu bayar dibaca dalam menit; "90 mnt" tidak enak dibaca, jadi dipecah ke jam.
function durasi(menit: number | null): string {
  if (menit === null || !Number.isFinite(menit)) return '—';
  if (menit < 60) return `${menit} mnt`;
  const jam = Math.floor(menit / 60);
  const sisa = menit % 60;
  return sisa ? `${jam} j ${sisa} mnt` : `${jam} jam`;
}

function umur(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const jam = Math.floor(ms / 3_600_000);
  if (jam < 1) return 'baru masuk';
  if (jam < 24) return `${jam} jam`;
  return `${Math.floor(jam / 24)} hari`;
}

export function Dashboard() {
  const nav = useNavigate();
  const [jendela, setJendela] = useState<7 | 14 | 30>(14);
  const [tab, setTab] = useState<'terbaru' | 'tindakan'>('terbaru');
  const ringkas = useQuery({ queryKey: ['ringkasan', jendela], queryFn: () => api.ringkasan(jendela) });
  const terbaru = useQuery({
    queryKey: ['charges', 'terbaru', tab],
    queryFn: () => api.charges({ limit: 8, status: tab === 'tindakan' ? 'REVIEW' : undefined }),
  });

  if (ringkas.isLoading) return <div className="empty">Memuat dashboard…</div>;
  if (ringkas.error || !ringkas.data) return <div className="empty">Gagal memuat dashboard.</div>;

  const d = ringkas.data;
  const puncak = Math.max(...d.tren.map((t) => Number(t.nilai) || 0), 1);
  const maksStatus = Math.max(...d.perStatus.map((s) => Number(s.jumlah) || 0), 1);
  const lunas = d.perStatus.find((s) => s.status === 'PAID');
  const review = d.perStatus.find((s) => s.status === 'REVIEW');
  const rasioLunas = d.total.jumlah > 0 ? Math.round((d.total.jumlahpaid / d.total.jumlah) * 100) : 0;
  const bocorRows = d.perStatus.filter((s) => GAGAL.includes(s.status));
  const bocorJumlah = bocorRows.reduce((n, s) => n + Number(s.jumlah || 0), 0);
  const bocorNilai = bocorRows.reduce((n, s) => n + Number(s.nilai || 0), 0);
  const bocorRincian = bocorRows.map((s) => `${s.status} ${s.jumlah}`).join(' · ');
  const umurTertua = umur(d.tindakan?.tertua ?? null);
  const totalPeriode = d.tren.reduce((n, t) => n + Number(t.nilai || 0), 0);
  const totalTagihan = Number(d.total.jumlah || 0);
  const perApp = d.perApp || [];
  const totalApp = perApp.reduce(
    (t, a) => ({ jumlah: t.jumlah + Number(a.jumlah || 0), lunas: t.lunas + Number(a.lunas || 0), biaya: t.biaya + Number(a.biaya || 0) }),
    { jumlah: 0, lunas: 0, biaya: 0 },
  );

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
          label="Rasio lunas"
          nilai={`${rasioLunas}%`}
          kaki={`${d.total.jumlahpaid} dari ${d.total.jumlah} tagihan`}
        />
        <Link className="kpi-link" to="/tagihan?status=REVIEW">
          <Kpi
            label="Butuh tindakan"
            nilai={`${Number(review?.jumlah || 0)} tagihan`}
            nada="warn"
            kaki={
              Number(review?.jumlah || 0) > 0
                ? `${rupiah(review?.nilai || 0)} tertahan${umurTertua ? ` · tertua ${umurTertua}` : ''}`
                : 'tidak ada bukti menunggu'
            }
          />
        </Link>
        <Link className="kpi-link" to="/tagihan?status=GAGAL">
          <Kpi
            label="Uang bocor"
            nilai={rupiah(bocorNilai)}
            nada="warn"
            kaki={bocorJumlah > 0 ? `${bocorJumlah} tagihan · ${bocorRincian}` : 'tidak ada tagihan gagal'}
          />
        </Link>
      </div>

      <div className="split">
        <Panel
          judul={`Nilai lunas ${d.tren.length} hari terakhir`}
          petunjuk={`total ${rupiah(totalPeriode)} periode ini · median bayar ${durasi(d.medianBayarMenit)}`}
          kelas="panel--chart"
          aksi={
            <div className="seg" role="group" aria-label="Panjang periode grafik">
              {([7, 14, 30] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`seg__btn${jendela === n ? ' is-on' : ''}`}
                  aria-pressed={jendela === n}
                  onClick={() => setJendela(n)}
                >
                  {n} hari
                </button>
              ))}
            </div>
          }
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
                    {Number(t.nilai) > 0 && d.tren.length <= 14 ? (
                      <span className="chart__val" style={{ bottom: `calc(${persen}% + 3px)` }}>
                        {singkat(t.nilai)}
                      </span>
                    ) : null}
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
            {KELOMPOK.map((k) => {
              const isi = k.status
                .map((st) => d.perStatus.find((x) => x.status === st))
                .filter((x): x is NonNullable<typeof x> => !!x);
              if (!isi.length) return null;
              const subtotalJumlah = isi.reduce((n, x) => n + Number(x.jumlah || 0), 0);
              const subtotalNilai = isi.reduce((n, x) => n + Number(x.nilai || 0), 0);
              return (
                <div key={k.label} className="status-grup">
                  <div className="status-grup__head">
                    <span>{k.label}</span>
                    <span className="num">
                      {subtotalJumlah} · {rupiahPendek(subtotalNilai)} ·{' '}
                      {totalTagihan > 0 ? Math.round((subtotalJumlah / totalTagihan) * 100) : 0}%
                    </span>
                  </div>
            {isi.map((s) => (
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
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                  {totalTagihan > 0 ? Math.round((Number(s.jumlah) / totalTagihan) * 100) : 0}%
                </span>
              </button>
            ))}
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel judul="Per aplikasi" petunjuk="hanya tagihan lunas yang dihitung" padat={false}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Aplikasi</th>
                <th style={{ textAlign: 'right' }}>Tagihan</th>
                <th style={{ textAlign: 'right' }}>Lunas</th>
                <th style={{ textAlign: 'right' }}>Nilai</th>
                <th style={{ textAlign: 'right' }}>Biaya</th>
                <th style={{ textAlign: 'right' }}>Net</th>
              </tr>
            </thead>
            <tbody>
              {perApp.map((a) => {
                const jumlahApp = Number(a.jumlah || 0);
                const lunasApp = Number(a.lunas || 0);
                // Baris bisa diklik: halaman Tagihan kini menerima ?app=, jadi angka per app bisa ditelusuri.
                const bukaApp = () => nav(`/tagihan?app=${encodeURIComponent(a.appCode)}`);
                const rasioApp = jumlahApp > 0 ? Math.round((lunasApp / jumlahApp) * 100) : 0;
                return (
                  <tr
                    key={a.appCode}
                    onClick={bukaApp}
                    style={{ cursor: 'pointer' }}
                    title={`Lihat tagihan ${a.appCode}`}
                  >
                    <td>
                      <span className="id">{a.appCode}</span>
                      <div style={{ color: 'var(--muted)', fontSize: 11 }}>{a.nama}</div>
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>{jumlahApp}</td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {lunasApp}{' '}
                      <span style={{ color: 'var(--muted)', fontSize: 11 }}>({rasioApp}%)</span>
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>{rupiah(a.nilai)}</td>
                    <td className="num" style={{ textAlign: 'right', color: 'var(--muted)' }}>{rupiah(a.biaya)}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{rupiah(a.net)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="strong">Total</td>
                <td className="num" style={{ textAlign: 'right' }}>{totalApp.jumlah}</td>
                <td className="num" style={{ textAlign: 'right' }}>{totalApp.lunas}</td>
                <td className="num" style={{ textAlign: 'right' }}>{rupiah(d.total.nilaipaid)}</td>
                <td className="num" style={{ textAlign: 'right', color: 'var(--muted)' }}>{rupiah(totalApp.biaya)}</td>
                <td className="num" style={{ textAlign: 'right' }}>{rupiah(d.total.netpaid)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      <div className="split">
        <Panel
          judul="Tagihan"
          petunjuk={tab === 'tindakan' ? 'menunggu keputusan, terlama dulu' : '8 terakhir dibuat'}
          padat={false}
          aksi={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="seg" role="group" aria-label="Pilih daftar tagihan">
                <button
                  type="button"
                  className={`seg__btn${tab === 'terbaru' ? ' is-on' : ''}`}
                  aria-pressed={tab === 'terbaru'}
                  onClick={() => setTab('terbaru')}
                >
                  Terbaru
                </button>
                <button
                  type="button"
                  className={`seg__btn${tab === 'tindakan' ? ' is-on' : ''}`}
                  aria-pressed={tab === 'tindakan'}
                  onClick={() => setTab('tindakan')}
                >
                  Perlu tindakan
                </button>
              </div>
              <Link
                className="panel__hint"
                to={tab === 'tindakan' ? '/tagihan?status=REVIEW' : '/tagihan'}
                style={{ whiteSpace: 'nowrap' }}
              >
                semua tagihan →
              </Link>
            </div>
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
                {(terbaru.data?.rows || []).length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ color: 'var(--muted)', textAlign: 'center', padding: '18px 12px' }}>
                      Tidak ada tagihan pada daftar ini.
                    </td>
                  </tr>
                ) : null}
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

        <Panel
          judul="Kesehatan integrasi"
          petunjuk={`${d.deliveries.terkirim} terkirim · ${d.deliveries.mati} gagal · ${d.deliveries.menunggu} menunggu`}
          padat={false}
        >
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Aplikasi</th>
                  <th style={{ textAlign: 'right' }}>Terkirim</th>
                  <th style={{ textAlign: 'right' }}>Gagal</th>
                  <th>Error terakhir</th>
                </tr>
              </thead>
              <tbody>
                {(d.perAppSehat || []).map((a) => (
                  <tr key={a.appCode}>
                    <td>
                      <span className="id">{a.appCode}</span>
                      {a.tanpaHook ? (
                        <div style={{ color: 'var(--warn)', fontSize: 11 }}>tanpa URL webhook</div>
                      ) : null}
                    </td>
                    <td className="num" style={{ textAlign: 'right', color: 'var(--pos)' }}>{Number(a.terkirim)}</td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      <span style={{ color: Number(a.mati) > 0 ? 'var(--danger)' : 'var(--ink)' }}>{Number(a.mati)}</span>
                      {Number(a.menunggu) > 0 ? (
                        <span style={{ color: 'var(--muted)', fontSize: 11 }}> · {Number(a.menunggu)} menunggu</span>
                      ) : null}
                    </td>
                    <td
                      title={a.errorTerakhir || ''}
                      style={{ color: 'var(--muted)', fontSize: 11.5, maxWidth: 160, whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.35 }}
                    >
                      {a.errorTerakhir || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="panel__hint" style={{ padding: '12px 16px 14px' }}>
            {d.apps.tanpahook > 0
              ? 'Ada aplikasi tanpa URL webhook: perubahan status tidak akan pernah sampai ke sana.'
              : 'Semua aplikasi punya URL webhook.'}
          </p>
        </Panel>
      </div>
    </>
  );
}
