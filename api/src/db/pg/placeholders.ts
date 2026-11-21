// mysql2 memakai placeholder posisional `?`; pg memakai `$1..$n`. Semua 819 call site di server/
// ditulis dengan gaya `?`, jadi konversi dilakukan di sini — sekali, dengan benar — alih-alih
// menulis ulang setiap query.
//
// Pemindaian ini sadar konteks: `?` di dalam string literal, identifier berkutip, dan komentar
// BUKAN placeholder. Regex naif akan salah menomori dan menggeser semua parameter setelahnya.
export function toPgPlaceholders(sql: string): string {
  let out = '';
  let i = 0;
  let n = 0;

  while (i < sql.length) {
    const ch = sql[i];

    // String literal / identifier berkutip: '' dan "" di dalamnya adalah escape, bukan penutup.
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === quote && sql[j + 1] === quote) { j += 2; continue; }
        if (sql[j] === quote) { j++; break; }
        j++;
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }

    if (ch === '-' && sql[i + 1] === '-') {          // komentar baris
      const nl = sql.indexOf('\n', i);
      const end = nl === -1 ? sql.length : nl;
      out += sql.slice(i, end);
      i = end;
      continue;
    }

    if (ch === '/' && sql[i + 1] === '*') {          // komentar blok
      const close = sql.indexOf('*/', i + 2);
      const end = close === -1 ? sql.length : close + 2;
      out += sql.slice(i, end);
      i = end;
      continue;
    }

    if (ch === '?') { out += '$' + String(++n); i++; continue; }

    out += ch;
    i++;
  }

  return out;
}
