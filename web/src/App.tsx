import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Saya } from './api';
import { Shell } from './components/Shell';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Tagihan } from './pages/Tagihan';
import { Aplikasi } from './pages/Aplikasi';
import { Webhook } from './pages/Webhook';
import { Doks } from './pages/Doks';
import { Bayar } from './pages/Bayar';

export default function App() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const lokasi = useLocation();
  const publik = lokasi.pathname.startsWith('/bayar/') || lokasi.pathname.startsWith('/pay/');

  const [user, setUser] = useState<Saya | null>(null);
  const saya = useQuery({
    queryKey: ['saya'],
    queryFn: api.saya,
    enabled: !publik,
    retry: false,
    staleTime: 60_000,
  });

  // Status gateway dipakai untuk menandai di bilah atas apakah transaksi gateway mungkin sama sekali.
  const sehat = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const r = await fetch('/health');
      return (await r.json()) as { status: string; db: boolean; base: string; gatewaySiap: boolean };
    },
    enabled: !publik,
    retry: false,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (saya.data) setUser(saya.data);
    if (saya.error instanceof ApiError && saya.error.status === 401) setUser(null);
  }, [saya.data, saya.error]);

  if (publik) {
    return (
      <Routes>
        <Route path="/bayar/:payId" element={<Bayar />} />
        <Route path="/pay/:payId" element={<Bayar />} />
      </Routes>
    );
  }

  if (saya.isLoading) return <div className="empty" style={{ padding: 48 }}>Memeriksa sesi…</div>;

  if (!user) {
    return (
      <Routes>
        <Route
          path="*"
          element={
            <Login
              onMasuk={(u) => {
                setUser(u);
                qc.setQueryData(['saya'], u);
                nav(lokasi.pathname === '/login' ? '/' : lokasi.pathname, { replace: true });
              }}
            />
          }
        />
      </Routes>
    );
  }

  async function keluar() {
    try {
      await api.keluar();
    } finally {
      setUser(null);
      qc.clear();
      nav('/login', { replace: true });
    }
  }

  return (
    <Shell
      user={user}
      gerbang={{
        gatewaySiap: Boolean(sehat.data?.gatewaySiap),
        alamatApi: sehat.data?.base || '—',
      }}
      onKeluar={keluar}
    >
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/tagihan" element={<Tagihan />} />
        <Route path="/aplikasi" element={<Aplikasi />} />
        <Route path="/webhook" element={<Webhook />} />
        <Route path="/doks" element={<Doks />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
