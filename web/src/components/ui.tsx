import type { ReactNode } from 'react';

const nada: Record<string, string> = {
  PAID: 'pos',
  LUNAS: 'pos',
  SENT: 'pos',
  DELIVERED: 'pos',
  ACTIVE: 'pos',
  APPROVED: 'pos',
  REVIEW: 'warn',
  PENDING: 'warn',
  RETRY: 'warn',
  WAITING: 'warn',
  EXPIRED: 'muted',
  REJECTED: 'danger',
  FAILED: 'danger',
  DEAD: 'danger',
  INACTIVE: 'muted',
};

export function Chip({ nilai, children }: { nilai?: string | null; children?: ReactNode }) {
  const kunci = String(nilai || '').toUpperCase();
  const n = nada[kunci] || 'info';
  return <span className={`chip chip--${n}`}>{children ?? (kunci || '—')}</span>;
}

export function Panjang({ nilai, maks, warna = 'var(--pos)' }: { nilai: number; maks: number; warna?: string }) {
  const persen = maks > 0 ? Math.min(100, Math.round((nilai / maks) * 100)) : 0;
  return (
    <div className="status-row__bar" aria-hidden>
      <i style={{ width: `${Math.max(persen, 2)}%`, background: warna }} />
    </div>
  );
}

export function Kosong({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Panel({
  judul,
  petunjuk,
  aksi,
  children,
  padat = true,
}: {
  judul: string;
  petunjuk?: string;
  aksi?: ReactNode;
  children: ReactNode;
  padat?: boolean;
}) {
  return (
    <section className="panel">
      <header className="panel__head">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <span className="panel__title">{judul}</span>
          {petunjuk ? <span className="panel__hint">{petunjuk}</span> : null}
        </div>
        {aksi}
      </header>
      {padat ? <div className="panel__body">{children}</div> : children}
    </section>
  );
}

export function Kpi({
  label,
  nilai,
  kaki,
  nada = 'netral',
}: {
  label: string;
  nilai: ReactNode;
  kaki?: ReactNode;
  nada?: 'netral' | 'pos' | 'warn' | 'info';
}) {
  const kelas = nada === 'netral' ? '' : ` kpi--${nada}`;
  return (
    <div className={`kpi${kelas}`}>
      <span className="kpi__label">{label}</span>
      <span className="kpi__value num">{nilai}</span>
      {kaki ? <span className="kpi__foot">{kaki}</span> : null}
    </div>
  );
}
