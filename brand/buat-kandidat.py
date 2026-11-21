#!/usr/bin/env python3
"""Kandidat mark JagoAI Pay — SVG ditulis tangan, tidak ada dependensi.

Aturan yang dipakai: mark harus menampilkan benda yang benar-benar dijual console ini
(tagihan/QR pembayaran/notifikasi), bukan bentuk abstrak. Palet mengikuti console:
graphite gelap + aksen hijau #00d68f.

Jalankan: python3 brand/buat-kandidat.py
Menghasilkan: brand/kandidat/*.svg + brand/lembar-kandidat.html
"""
import pathlib

HIJAU = "#00d68f"          # aksen di latar gelap
HIJAU_TERANG = "#00a86b"   # aksen di latar terang (kontras cukup di putih)
GELAP = "#0e1518"          # ink di latar terang
PUTIH = "#f2f6f5"          # ink di latar gelap

KANDIDAT = []


def simpan(nama: str, nama_pendek: str, konsep: str, isi_dark: str, isi_light: str):
    KANDIDAT.append({"nama": nama, "pendek": nama_pendek, "konsep": konsep,
                     "dark": isi_dark, "light": isi_light})


def svg(isi: str) -> str:
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" '
            'width="512" height="512" role="img">' + isi + "</svg>")


# ---------------------------------------------------------------- 01 · QR tag
def qr(ink: str, aksen: str) -> str:
    # Bingkai + pola QR gaya 3 mata sudut. Sengaja KONTUR, bukan kotak penuh: modul harus berwarna
    # sama dengan bingkai, bukan dengan latar, kalau tidak seluruh pola hilang (kesalahan pertama).
    mata = "".join(
        f'<rect x="{x}" y="{y}" width="72" height="72" rx="14" fill="none" stroke="{ink}" stroke-width="18"/>'
        for x, y in ((188, 188), (312, 188), (188, 312))
    )
    modul = "".join(
        f'<rect x="{x}" y="{y}" width="22" height="22" rx="5" fill="{ink}"/>'
        for x, y in ((300, 300), (348, 300), (348, 348))
    )
    return svg(
        f'<rect x="88" y="88" width="336" height="336" rx="86" fill="none" stroke="{ink}" stroke-width="24"/>'
        + mata + modul
        + f'<rect x="300" y="348" width="22" height="22" rx="5" fill="{aksen}"/>'
    )


simpan("01-qr-tag", "01", "QR di dalam tag pembulatan — tagihan yang dibayar dengan memindai",
      qr(PUTIH, HIJAU), qr(GELAP, HIJAU_TERANG))


# ---------------------------------------------------------------- 02 · Struk + centang
def struk(ink: str, aksen: str) -> str:
    # Struk dengan tepi bawah bergerigi: perintah bayar. Centang hijau = lunas.
    gerigi = "".join(
        f'<path d="M{140 + i * 46} 372 l23 22 l23 -22z" fill="{ink}"/>' for i in range(5)
    )
    baris = "".join(
        f'<rect x="176" y="{y}" width="{w}" height="18" rx="9" fill="{ink}"/>'
        for y, w in ((150, 132), (196, 96), (242, 116))
    )
    return svg(
        f'<path d="M140 116 h232 v256 h-232z" fill="{ink}"/>' + gerigi
        + baris.replace(ink, "#0e1518" if ink != GELAP else "#f2f6f5")
        + f'<circle cx="352" cy="352" r="76" fill="{aksen}"/>'
        + f'<path d="M316 352 l24 26 l48 -54" fill="none" stroke="#08120e" stroke-width="22" '
          f'stroke-linecap="round" stroke-linejoin="round"/>'
    )


simpan("02-struk-lunas", "02", "Struk dengan centang — perintah bayar yang sudah lunas",
      struk(PUTIH, HIJAU), struk(GELAP, HIJAU_TERANG))


# ---------------------------------------------------------------- 03 · Kartu + panah masuk
def kartu(ink: str, aksen: str) -> str:
    return svg(
        f'<rect x="72" y="176" width="368" height="216" rx="34" fill="{ink}"/>'
        f'<rect x="72" y="176" width="42" height="216" rx="21" fill="{aksen}"/>'
        f'<rect x="146" y="230" width="150" height="20" rx="10" fill="{aksen}" opacity=".9"/>'
        f'<rect x="146" y="286" width="96" height="20" rx="10" fill="{aksen}" opacity=".55"/>'
        # panah masuk dari kanan atas
        f'<path d="M400 96 v78" stroke="{ink}" stroke-width="26" stroke-linecap="round"/>'
        f'<path d="M352 140 l48 48 l48 -48" fill="none" stroke="{aksen}" stroke-width="26" '
        f'stroke-linecap="round" stroke-linejoin="round"/>'
    )


simpan("03-kartu-masuk", "03", "Kartu tagihan dengan panah dana masuk",
      kartu(PUTIH, HIJAU), kartu(GELAP, HIJAU_TERANG))


# ---------------------------------------------------------------- 04 · Monogram J
def monogram(ink: str, aksen: str) -> str:
    return svg(
        f'<path d="M330 108 v188 a98 98 0 0 1 -196 0" fill="none" stroke="{ink}" stroke-width="72" '
        f'stroke-linecap="round"/>'
        f'<circle cx="330" cy="108" r="44" fill="{aksen}"/>'
    )


simpan("04-monogram-j", "04", "Monogram J — huruf awal JagoAI, titik hijau sebagai kunci",
      monogram(PUTIH, HIJAU), monogram(GELAP, HIJAU_TERANG))


# ---------------------------------------------------------------- 05 · Lingkar pindah dana
def lingkar(ink: str, aksen: str) -> str:
    return svg(
        f'<path d="M256 88 a168 168 0 0 1 0 336" fill="none" stroke="{ink}" stroke-width="52" '
        f'stroke-linecap="round"/>'
        f'<path d="M256 424 a168 168 0 0 1 0 -336" fill="none" stroke="{aksen}" stroke-width="52" '
        f'stroke-linecap="round" stroke-dasharray="300 760" stroke-dashoffset="0"/>'
        f'<path d="M196 148 l-58 58 l58 58" fill="none" stroke="{ink}" stroke-width="44" '
        f'stroke-linecap="round" stroke-linejoin="round"/>'
        f'<path d="M316 306 l58 58 l-58 58" fill="none" stroke="{aksen}" stroke-width="44" '
        f'stroke-linecap="round" stroke-linejoin="round"/>'
    )


simpan("05-lingkar-dana", "05", "Dua panah mengelilingi — dana masuk dan notifikasi keluar",
      lingkar(PUTIH, HIJAU), lingkar(GELAP, HIJAU_TERANG))


# ---------------------------------------------------------------- 06 · Prompt terminal
def terminal(ink: str, aksen: str) -> str:
    # Chevron memakai warna kebalikan dari alas: kalau alas putih, chevron gelap; kalau alas gelap, terang.
    dalam = "#0e1518" if ink != GELAP else PUTIH
    return svg(
        f'<rect x="64" y="88" width="384" height="336" rx="72" fill="{ink}"/>'
        f'<path d="M168 196 l64 60 l-64 60" fill="none" stroke="{dalam}" stroke-width="34" '
        f'stroke-linecap="round" stroke-linejoin="round"/>'
        f'<rect x="272" y="298" width="96" height="34" rx="17" fill="{aksen}"/>'
    )


simpan("06-terminal", "06", "Prompt terminal — console untuk pengembang/API",
      terminal(PUTIH, HIJAU), terminal(GELAP, HIJAU_TERANG))


# ---------------------------------------------------------------- ekspor
akar = pathlib.Path(__file__).resolve().parent
keluar = akar / "kandidat"
keluar.mkdir(exist_ok=True)

for k in KANDIDAT:
    (keluar / f"{k['nama']}-gelap.svg").write_text(k["dark"])
    (keluar / f"{k['nama']}.svg").write_text(k["light"])

baris = []
for k in KANDIDAT:
    baris.append(f"""
    <section class="kartu">
      <div class="kartu__no">{k['pendek']}</div>
      <div class="kartu__isi">
        <div class="ubin ubin--gelap"><img src="kandidat/{k['nama']}-gelap.svg" width="128" height="128" alt="">
          <img src="kandidat/{k['nama']}-gelap.svg" width="32" height="32" alt="">
          <img src="kandidat/{k['nama']}-gelap.svg" width="16" height="16" alt=""></div>
        <div class="ubin ubin--terang"><img src="kandidat/{k['nama']}.svg" width="128" height="128" alt="">
          <img src="kandidat/{k['nama']}.svg" width="32" height="32" alt="">
          <img src="kandidat/{k['nama']}.svg" width="16" height="16" alt=""></div>
      </div>
      <p class="kartu__ket"><b>{k['nama']}</b><br>{k['konsep']}</p>
    </section>""")

rel = []
for k in KANDIDAT:
    rel.append(f"""
    <div class="rel">
      <div class="rel__rail">
        <img src="kandidat/{k['nama']}-gelap.svg" width="30" height="30" alt="">
        <span class="rel__dot"></span><span class="rel__dot"></span><span class="rel__dot"></span>
      </div>
      <div class="rel__ket"><b>{k['pendek']}</b> · 30 px di rail 56 px</div>
      <div class="rel__lencana">
        <img src="kandidat/{k['nama']}.svg" width="16" height="16" alt="">
        <span class="rel__judul">JagoAI Pay — Console</span>
      </div>
    </div>""")

(akar / "lembar-kandidat.html").write_text(f"""<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Kandidat mark JagoAI Pay</title>
<style>
  body {{ margin: 0; padding: 28px; background: #060a0c; color: #e6edeb;
         font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }}
  h1 {{ font-size: 18px; font-weight: 600; margin: 0 0 4px; }}
  p.sub {{ color: #7f8f8b; font-size: 12px; margin: 0 0 22px; }}
  .grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; max-width: 1180px; }}
  .kartu {{ border: 1px solid #1b2724; border-radius: 12px; padding: 14px; background: #0b1114; }}
  .kartu__no {{ font-family: ui-monospace, monospace; font-size: 11px; color: #00d68f;
               letter-spacing: .08em; margin-bottom: 10px; }}
  .kartu__isi {{ display: grid; gap: 10px; }}
  .ubin {{ display: flex; align-items: center; gap: 14px; padding: 12px; border-radius: 10px; }}
  .ubin--gelap {{ background: #0e1518; border: 1px solid #1b2724; }}
  .ubin--terang {{ background: #f4f7f6; border: 1px solid #dfe6e4; }}
  .ubin img {{ display: block; }}
  .kartu__ket {{ font-size: 11.5px; color: #93a29e; margin: 12px 0 0; line-height: 1.45; }}
  .kartu__ket b {{ color: #d7e2df; font-weight: 600; }}
  h2 {{ font-size: 14px; font-weight: 600; margin: 30px 0 4px; }}
  .relgrid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; max-width: 1180px; }}
  .rel {{ display: flex; align-items: center; gap: 12px; border: 1px solid #1b2724; border-radius: 12px;
         padding: 12px; background: #0b1114; }}
  .rel__rail {{ width: 56px; flex: 0 0 56px; height: 132px; border-radius: 12px; border: 1px solid #1b2724;
               background: #0e1518; display: flex; flex-direction: column; align-items: center;
               padding-top: 12px; gap: 12px; }}
  .rel__dot {{ width: 18px; height: 18px; border-radius: 6px; background: #1b2724; }}
  .rel__ket {{ font-size: 11px; color: #8fa09b; }}
  .rel__ket b {{ color: #00d68f; font-family: ui-monospace, monospace; }}
  .rel__lencana {{ margin-left: auto; display: flex; align-items: center; gap: 8px; padding: 5px 10px;
                  border-radius: 8px; background: #0e1518; border: 1px solid #1b2724; }}
  .rel__judul {{ font-size: 11px; color: #cddbd7; }}
</style></head><body>
<h1>Kandidat mark JagoAI Pay</h1>
<p class="sub">Setiap kandidat: 128 px, 32 px, 16 px — di latar gelap (console) dan latar terang (dokumen).</p>
<div class="grid">{''.join(baris)}</div>

<h2>Pratinjau tempat pakai</h2>
<p class="sub">Kiri: mark di rail navigasi (56 px, latar console). Kanan: mark 16 px sebagai ikon tab.</p>
<div class="relgrid">{''.join(rel)}</div>
</body></html>
""")

print(f"{len(KANDIDAT)} kandidat ->", keluar)
