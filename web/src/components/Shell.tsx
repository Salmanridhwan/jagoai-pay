import { NavLink, useLocation } from 'react-router-dom';
import { Activity, AppWindow, BookOpen, LogOut, Receipt, Webhook } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Saya } from '../api';

const MENU = [
  { ke: '/', label: 'Ikhtisar', ikon: Activity },
  { ke: '/tagihan', label: 'Tagihan', ikon: Receipt },
  { ke: '/aplikasi', label: 'Aplikasi', ikon: AppWindow },
  { ke: '/webhook', label: 'Webhook', ikon: Webhook },
  { ke: '/doks', label: 'Doks', ikon: BookOpen },
];

const JEJAK: Record<string, string> = {
  '/': 'Ikhtisar',
  '/tagihan': 'Tagihan',
  '/aplikasi': 'Aplikasi',
  '/webhook': 'Webhook',
  '/doks': 'Doks',
};

export type Gerbang = { gatewaySiap: boolean; alamatApi: string };

export function Shell({
  user,
  gerbang,
  onKeluar,
  children,
}: {
  user: Saya;
  gerbang: Gerbang;
  onKeluar: () => void;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const judul = JEJAK[pathname] || 'Console';

  return (
    <div className="shell">
      <nav className="rail" aria-label="Navigasi utama">
        <div className="rail__mark" title="JagoAI Pay">JP</div>
        {MENU.map(({ ke, label, ikon: Ikon }) => (
          <NavLink
            key={ke}
            to={ke}
            end={ke === '/'}
            className={({ isActive }) => `rail__link${isActive ? ' is-active' : ''}`}
            aria-label={label}
          >
            <Ikon size={18} strokeWidth={1.7} />
            <span className="rail__tip">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="main">
        <header className="topbar">
          <div className="topbar__crumbs">
            <span>JagoAI Pay</span>
            <span>/</span>
            <b>{judul}</b>
          </div>

          <div className="topbar__right">
            <span className={`env-pill${gerbang.gatewaySiap ? '' : ' env-pill--off'}`} title={gerbang.alamatApi}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: gerbang.gatewaySiap ? 'var(--pos)' : 'var(--warn)',
                }}
              />
              {gerbang.gatewaySiap ? 'gateway aktif' : 'gateway mati'}
            </span>

            <div className="who">
              <span>{user.name || user.email}</span>
              <span className="who__badge">{user.role}</span>
            </div>

            <button className="btn btn--ghost" onClick={onKeluar} title="Keluar dari console">
              <LogOut size={14} strokeWidth={1.8} />
              Keluar
            </button>
          </div>
        </header>

        <div className="page">{children}</div>
      </div>
    </div>
  );
}
