// Login/logout console + info sesi. Satu-satunya pintu masuk manusia ke layanan ini.
import { Router } from 'express';
import { pool } from '../db';
import {
  buatSesi,
  clearSessionCookie,
  setSessionCookie,
  verifyPassword,
  wajibLogin,
} from '../auth';

const router = Router();

const BATAS_GAGAL = 8;
const JENDELA_MS = 15 * 60 * 1000;
const gagal = new Map<string, { n: number; sampai: number }>();

function kunciPembatas(ip: string, email: string) {
  return `${ip}|${email.toLowerCase()}`;
}

// POST /api/auth/login { email, password }
router.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email dan sandi wajib diisi.' });

  const kunci = kunciPembatas(String(req.ip || ''), email);
  const catatan = gagal.get(kunci);
  if (catatan && catatan.n >= BATAS_GAGAL && Date.now() < catatan.sampai) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan masuk. Coba lagi dalam beberapa menit.' });
  }

  try {
    const [rows]: any = await pool.query(
      // Alias berkutip wajib: fasad pg mengembalikan key lowercase kecuali namanya dikutip, dan
      // `passwordHash` tidak ada di peta columnCase (peta itu di-generate dari skema jamy).
      'SELECT id, email, name, passwordHash AS "passwordHash", role, status FROM console_users WHERE LOWER(email) = ?',
      [email],
    );
    const user = rows?.[0];
    // Pesan gagal sengaja seragam: jangan membocorkan email mana yang terdaftar.
    if (!user || user.status !== 'ACTIVE' || !verifyPassword(password, String(user.passwordHash))) {
      const sebelum = gagal.get(kunci)?.n || 0;
      gagal.set(kunci, { n: sebelum + 1, sampai: Date.now() + JENDELA_MS });
      return res.status(401).json({ error: 'Email atau sandi salah.' });
    }

    gagal.delete(kunci);
    const { token, expiresAt } = await buatSesi(String(user.id), req);
    await pool.query('UPDATE console_users SET lastLoginAt = ? WHERE id = ?', [new Date().toISOString(), user.id]);
    setSessionCookie(res, token, expiresAt);
    return res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  } catch (e: any) {
    console.error('[auth] login gagal:', e?.message || e);
    return res.status(500).json({ error: 'Gagal memproses login.' });
  }
});

// GET /api/auth/me
router.get('/api/auth/me', wajibLogin, (req, res) => {
  return res.json({ user: req.consoleUser });
});

// POST /api/auth/logout — sesi dihapus di server, bukan hanya cookie-nya.
router.post('/api/auth/logout', async (req, res) => {
  const token = String((req.cookies?.jgp_console_session as string) || (req.cookies?.[process.env.SESSION_COOKIE || ''] as string) || '');
  try {
    if (token) await pool.query('DELETE FROM console_sessions WHERE token = ?', [token]);
  } catch (e: any) {
    console.error('[auth] logout gagal menghapus sesi:', e?.message || e);
  }
  clearSessionCookie(res);
  return res.json({ ok: true });
});

export default router;
