// Tambah akun console dari terminal. Akun console sengaja tidak bisa didaftarkan sendiri dari web:
// yang boleh membuat operator adalah orang yang punya akses ke server.
//
//   npm run add-user -- <email> <sandi> [nama] [role]
//
// role: owner (semua aksi) atau viewer (hanya membaca).
import 'dotenv/config';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pool, cekKoneksi } from './db';

async function main() {
  const [email, sandi, nama, role = 'owner'] = process.argv.slice(2);
  if (!email || !sandi) {
    console.error('Pakai: npm run add-user -- <email> <sandi> [nama] [role]');
    process.exit(1);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Email tidak valid.');
    process.exit(1);
  }
  if (sandi.length < 6) {
    console.error('Sandi minimal 6 karakter.');
    process.exit(1);
  }
  if (role !== 'owner' && role !== 'viewer') {
    console.error("Role harus 'owner' atau 'viewer'.");
    process.exit(1);
  }

  await cekKoneksi();
  const [ada]: any = await pool.query('SELECT id FROM console_users WHERE LOWER(email) = LOWER(?)', [email]);
  if (ada?.length) {
    console.error(`Akun ${email} sudah ada. Untuk mengganti sandinya: npm run reset-password -- ${email} <sandi-baru>`);
    process.exit(1);
  }

  const id = `usr_${crypto.randomBytes(9).toString('base64url')}`;
  await pool.query(
    'INSERT INTO console_users (id, email, name, passwordHash, role, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, email.trim(), (nama || email.split('@')[0]).trim(), bcrypt.hashSync(sandi, 10), role, 'ACTIVE', new Date().toISOString()],
  );
  console.log(`Akun dibuat: ${email} (role ${role}).`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[add-user] gagal:', e?.message || e);
  process.exit(1);
});
