// Penyimpanan bukti transfer. Versi jamy lebih besar karena melayani unggahan kursus/forum; di sini
// hanya satu kebutuhan: dataURI gambar bukti bayar disimpan ke disk dan dikembalikan sebagai URL.
//
// Tipe berkas ditentukan dari byte-nya, bukan dari label mime di dataURI — label bisa dipalsukan.
// Itu pertahanan yang sama dengan versi jamy dan sengaja dipertahankan.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PROOF_DIR } from '../env';

const DATA_URI_HEAD = /^data:([\w/+.-]+)?;base64,/i;
const MAX_BYTES = 1_500_000;

export class DataUriError extends Error {}

export function detectImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.slice(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

export function persistDataUriImage(value: any, _dirName = 'payment-proofs', maxBytes = MAX_BYTES): string {
  if (typeof value !== 'string') throw new DataUriError('Bukti transfer harus berupa dataURI gambar.');
  const head = value.match(DATA_URI_HEAD);
  if (!head) throw new DataUriError('Bukti transfer harus dataURI base64 (jpg/png/webp).');

  const b64 = value.slice(head[0].length);
  if (Math.floor((b64.length * 3) / 4) > maxBytes) {
    throw new DataUriError(`Gambar terlalu besar. Maksimal ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
  }
  const buf = Buffer.from(b64, 'base64');
  if (buf.length === 0) throw new DataUriError('Gambar tidak terbaca.');
  if (buf.length > maxBytes) throw new DataUriError('Gambar terlalu besar.');

  const mime = detectImageMime(buf);
  if (!mime) throw new DataUriError('Berkas yang diunggah bukan gambar (JPEG, PNG, WebP, atau GIF).');

  if (!fs.existsSync(PROOF_DIR)) fs.mkdirSync(PROOF_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}${EXT_BY_MIME[mime]}`;
  fs.writeFileSync(path.join(PROOF_DIR, name), buf);
  return `/proofs/${name}`;
}
