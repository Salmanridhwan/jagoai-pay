// Pemuatan .env yang tidak bergantung pada direktori kerja proses.
//
// Di dev, proses dijalankan dari `api/` dan membaca `api/.env`. Di produksi (panel) proses
// dijalankan dari akar repo supaya `web/dist` ikut terjangkau, dan panel menaruh `.env` di akar.
// Keduanya dibaca berurutan: akar dulu, lalu `api/.env`. dotenv tidak menimpa variabel yang sudah
// ada, jadi env yang diisi panel saat deploy selalu menang atas berkas dev yang ikut ter-upload.
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url)); // api/src
for (const berkas of [path.resolve(HERE, '../../.env'), path.resolve(HERE, '../.env')]) {
  dotenv.config({ path: berkas });
}
