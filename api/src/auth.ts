// Sesi console: bcrypt + cookie httpOnly yang disimpan di database layanan ini sendiri.
//
// Tidak memakai JWT: sesi yang bisa dicabut (logout, akun dinonaktifkan) lebih penting di console
// keuangan daripada menghindari satu query per request.
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { Request, RequestHandler, Response } from 'express';
import { pool } from './db';
import { COOKIE_DOMAIN, NODE_ENV, SESSION_COOKIE, SESSION_TTL_HARI } from './env';

export type ConsoleRole = 'owner' | 'operator' | 'viewer';

export interface ConsoleUser {
  id: string;
  email: string;
  name: string;
  role: ConsoleRole;
  status: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      consoleUser?: ConsoleUser;
    }
  }
}

const HARI_MS = 86400_000;

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}

export async function buatSesi(userId: string, req: Request): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_HARI * HARI_MS);
  await pool.query(
    'INSERT INTO console_sessions (token, userId, expiresAt, createdAt, ip, userAgent) VALUES (?, ?, ?, ?, ?, ?)',
    [token, userId, expiresAt.toISOString(), new Date().toISOString(), String(req.ip || ''), String(req.headers['user-agent'] || '')],
  );
  // Bersihkan sesi kedaluwarsa sekalian — murah, dan mencegah tabel tumbuh tanpa batas.
  await pool.query('DELETE FROM console_sessions WHERE expiresAt < ?', [new Date().toISOString()]).catch(() => {});
  return { token, expiresAt };
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: NODE_ENV === 'production',
    domain: COOKIE_DOMAIN,
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/', domain: COOKIE_DOMAIN });
}

export async function cariUserDariSesi(token: string): Promise<ConsoleUser | null> {
  if (!token) return null;
  const [rows]: any = await pool.query(
    `SELECT u.id, u.email, u.name, u.role, u.status
       FROM console_sessions s
       JOIN console_users u ON u.id = s.userId
      WHERE s.token = ? AND s.expiresAt > ? AND u.status = 'ACTIVE'`,
    [token, new Date().toISOString()],
  );
  if (!rows?.length) return null;
  const r = rows[0];
  return { id: String(r.id), email: String(r.email), name: String(r.name), role: String(r.role) as ConsoleRole, status: String(r.status) };
}

export const wajibLogin: RequestHandler = async (req, res, next) => {
  try {
    const token = String((req.cookies?.[SESSION_COOKIE] as string) || '');
    const user = await cariUserDariSesi(token);
    if (!user) return res.status(401).json({ error: 'Sesi console tidak berlaku. Silakan masuk lagi.' });
    req.consoleUser = user;
    return next();
  } catch (e: any) {
    console.error('[auth] gagal memeriksa sesi:', e?.message || e);
    return res.status(500).json({ error: 'Gagal memeriksa sesi.' });
  }
};

// `viewer` hanya membaca. Aksi yang mengubah uang atau status app wajib operator ke atas.
export const wajibOperator: RequestHandler = (req, res, next) => {
  const peran = req.consoleUser?.role;
  if (peran === 'owner' || peran === 'operator') return next();
  return res.status(403).json({ error: 'Peran Anda hanya bisa membaca.' });
};
