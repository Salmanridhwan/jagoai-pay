import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Copy, Upload } from 'lucide-react';
import { api, ApiError, rupiah, waktu } from '../api';
import { Chip } from '../components/ui';

// Halaman yang dibuka pembayar. Tidak ada menu console di sini: satu tagihan, satu tindakan.
export function Bayar() {
  const { payId } = useParams();
  const berkas = useRef<HTMLInputElement>(null);
  const [pesan, setPesan] = useState('');

  const data = useQuery({
    queryKey: ['publik', payId],
    queryFn: () => api.publikCharge(String(payId)),
    refetchInterval: 15_000,
  });

  const unggah = useMutation({
    mutationFn: async (file: File) => {
      const dataUri = await new Promise<string>((selesai, gagal) => {
        const r = new FileReader();
        r.onload = () => selesai(String(r.result));
        r.onerror = () => gagal(new Error('Berkas tidak terbaca.'));
        r.readAsDataURL(file);
      });
      return api.unggahBukti(String(payId), dataUri);
    },
    onSuccess: () => {
      setPesan('Bukti terkirim. Penjual akan memeriksa dan menandai lunas.');
      data.refetch();
    },
    onError: (e) => setPesan(e instanceof ApiError ? e.message : 'Gagal mengunggah bukti.'),
  });

  if (data.isLoading) return <div className="pay"><div className="empty">Memuat tagihan…</div></div>;
  if (data.error || !data.data) return <div className="pay"><div className="empty">Tagihan tidak ditemukan.</div></div>;

  const c = data.data;
  const lunas = c.status === 'PAID';

  return (
    <div className="pay">
      <div className="pay__card">
        <div className="pay__head">
          <div>
            <div className="panel__hint">{c.appName}</div>
            <div className="pay__amount num">{rupiah(c.amount)}</div>
          </div>
          <Chip nilai={c.status} />
        </div>

        <div className="pay__body">
          <dl className="detail__grid" style={{ gridTemplateColumns: '104px 1fr' }}>
            <dt>Tagihan</dt>
            <dd className="num">{c.payId}</dd>
            <dt>Channel</dt>
            <dd>{c.channelName || c.channelCode}</dd>
            <dt>Keterangan</dt>
            <dd>{c.description || '—'}</dd>
            <dt>Berlaku sampai</dt>
            <dd className="num">{waktu(c.expiresAt)}</dd>
            {lunas ? (
              <>
                <dt>Dibayar</dt>
                <dd className="num">{waktu(c.paidAt)}</dd>
              </>
            ) : null}
          </dl>

          {lunas ? (
            <div className="chip chip--pos" style={{ justifySelf: 'start' }}>pembayaran diterima</div>
          ) : null}

          {!lunas && c.vaNumber ? (
            <>
              <div className="panel__hint">Nomor virtual account</div>
              <div className="va">{c.vaNumber}</div>
              <button className="btn" onClick={() => navigator.clipboard?.writeText(String(c.vaNumber))}>
                <Copy size={14} strokeWidth={1.8} /> Salin nomor
              </button>
            </>
          ) : null}

          {!lunas && c.qrisString ? (
            <>
              <div className="panel__hint">Payload QRIS — buka aplikasi bank/e-wallet, pilih pindai, lalu tempel</div>
              <div className="mono-block" style={{ maxHeight: 120, overflowY: 'auto' }}>{c.qrisString}</div>
              <button className="btn" onClick={() => navigator.clipboard?.writeText(String(c.qrisString))}>
                <Copy size={14} strokeWidth={1.8} /> Salin payload
              </button>
            </>
          ) : null}

          {!lunas && c.paymentUrl ? (
            <a className="btn btn--pos" href={c.paymentUrl} target="_blank" rel="noreferrer">
              Buka halaman pembayaran
            </a>
          ) : null}

          {!lunas && c.channelCode === 'manual-transfer' ? (
            <>
              <div className="panel__hint">
                Sudah transfer? Unggah bukti (JPG/PNG, maks 1 MB). Tagihan akan berstatus REVIEW sampai diperiksa
                penjual.
              </div>
              <input
                ref={berkas}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) unggah.mutate(f);
                }}
              />
              <button className="btn btn--pos" disabled={unggah.isPending} onClick={() => berkas.current?.click()}>
                <Upload size={15} strokeWidth={1.8} /> {unggah.isPending ? 'Mengunggah…' : 'Unggah bukti transfer'}
              </button>
            </>
          ) : null}

          {pesan ? <div className="panel__hint">{pesan}</div> : null}

          <p className="panel__hint" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
            Halaman ini menyegarkan sendiri status pembayaran setiap 15 detik.
          </p>
        </div>
      </div>
    </div>
  );
}
