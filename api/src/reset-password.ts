// Atur ulang sandi akun console dari terminal. Dipakai saat akun terkunci, lupa sandi, atau setelah
// memutar kredensial. Semua sesi lama akun itu ikut dicabut — kalau sandi diganti, perangkat yang
// masih login harus masuk lagi.
//
//   npm run reset-password -- <email> <sandi-baru>
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool, cekKoneksi } from './db';

async function main() {
  const [email, sandi] = process.argv.slice(2);
  if (!email || !sandi) {
    console.error('Pakai: npm run reset-password -- <email> <sandi-baru>');
    process.exit(1);
  }
  if (sandi.length < 10) {
    console.error('Sandi minimal 10 karakter.');
    process.exit(1);
  }

  await cekKoneksi();
  const [rows]: any = await pool.query('SELECT id FROM console_users WHERE LOWER(email) = LOWER(?)', [email]);
  if (!rows?.length) {
    console.error(`Akun ${email} tidak ada.`);
    process.exit(1);
  }
  const id = String(rows[0].id);
  await pool.query('UPDATE console_users SET passwordHash = ? WHERE id = ?', [bcrypt.hashSync(sandi, 10), id]);
  const [hapus]: any = await pool.query('DELETE FROM console_sessions WHERE userId = ?', [id]);
  console.log(`Sandi ${email} diperbarui. Sesi dicabut: ${hapus?.affectedRows ?? 0}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[reset-password] gagal:', e?.message || e);
  process.exit(1);
});
