// Uji cepat pemetaan respons login di sisi console. Dijalankan dengan tsx dari folder api/ supaya
// memakai runtime yang sama dengan skrip lain, tetapi mengimpor modul klien yang dipakai browser.
//
// Di browser modul ini memanggil jalur relatif ('/api/...') karena console satu asal dengan API lewat
// proxy Vite. Di Node tidak ada asal, jadi fetch dibungkus: awalan http://localhost:4010 dan cookie
// sesi disimpan sendiri — persis yang dilakukan browser terhadap Set-Cookie.
const BASE = 'http://localhost:4010';
let cookie = '';

const fetchAsli = globalThis.fetch;
globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = typeof input === 'string' ? BASE + input : input;
  const headers = new Headers(init.headers || {});
  if (cookie) headers.set('cookie', cookie);
  const res = await fetchAsli(url, { ...init, headers, redirect: 'manual' });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return res;
}) as typeof fetch;

// Modul dengan import agar top-level await diizinkan.
import type {} from '../../web/src/api.ts';

const { api } = await import('../../web/src/api.ts');

const user = await api.masuk('salman@gmail.com', 'salman123');
console.log('masuk:', JSON.stringify(user));
console.log('punya id:', Boolean(user?.id), '| nama:', user?.name, '| role:', user?.role);

const saya = await api.saya();
console.log('sesi aktif:', JSON.stringify(saya));
