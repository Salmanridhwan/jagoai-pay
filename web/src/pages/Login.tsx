import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { api, ApiError, rupiahPendek, type Saya } from '../api';

// Pintu masuk console. Sengaja halaman sendiri, bukan menu di situs lain: pengguna console adalah
// operator keuangan, bukan peserta kursus. Tidak ada pemilih peran di sini — peran datang dari
// akun yang tersimpan di server, bukan dari pilihan di layar.
export function Login({
  onMasuk,
  ringkasPublik,
}: {
  onMasuk: (user: Saya) => void;
  ringkasPublik?: { jumlahTagihan: number; nilaiLunas: number };
}) {
  const [email, setEmail] = useState('');
  const [sandi, setSandi] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setGalat('');
    setSibuk(true);
    try {
      const user = await api.masuk(email.trim(), sandi);
      onMasuk(user);
    } catch (err) {
      const pesan = err instanceof ApiError ? err.message : 'Tidak bisa menghubungi server.';
      setGalat(pesan);
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="gate">
      <form className="gate__form" onSubmit={kirim}>
        <div className="gate__mark">
          <img src="/mark.svg" alt="" width={26} height={26} /> JagoAI Pay
        </div>
        <h1 className="gate__title">Masuk ke console</h1>
        <p className="gate__sub">
          Console ini mengelola tagihan, aplikasi, dan pengiriman webhook. Akun dibuat oleh pemilik layanan lewat
          terminal — tidak ada pendaftaran mandiri.
        </p>

        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="operator@jagoai.local"
            required
          />
        </div>

        <div>
          <label htmlFor="sandi">Sandi</label>
          <input
            id="sandi"
            type="password"
            autoComplete="current-password"
            value={sandi}
            onChange={(e) => setSandi(e.target.value)}
            placeholder="••••••••••"
            required
          />
        </div>

        {galat ? <div className="gate__err">{galat}</div> : null}

        <button className="btn btn--pos" type="submit" disabled={sibuk} style={{ height: 40 }}>
          {sibuk ? <Loader2 size={15} className="spin" /> : <KeyRound size={15} strokeWidth={1.8} />}
          {sibuk ? 'Memeriksa…' : 'Masuk'}
        </button>

        <p className="gate__sub" style={{ fontSize: 11.5 }}>
          Lupa sandi? Dari folder <span className="num">api/</span> jalankan{' '}
          <span className="num">npm run reset-password -- email sandi-baru</span>.
        </p>
      </form>

      <aside className="gate__side">
        <div className="gate__stat">
          <span>Status layanan</span>
          <b>Berjalan sendiri</b>
        </div>
        <div className="gate__stat">
          <span>Tagihan tercatat</span>
          <b className="num">{ringkasPublik ? ringkasPublik.jumlahTagihan : '—'}</b>
        </div>
        <div className="gate__stat">
          <span>Nilai lunas</span>
          <b className="num">{ringkasPublik ? rupiahPendek(ringkasPublik.nilaiLunas) : '—'}</b>
        </div>
        <div className="gate__stat" style={{ borderBottom: 0 }}>
          <span>Basis data</span>
          <b>Postgres terpisah dari aplikasi lain</b>
        </div>
      </aside>
    </div>
  );
}
