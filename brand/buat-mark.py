#!/usr/bin/env python3
"""Mark resmi JagoAI Pay: struk dengan centang.

Alasan bentuk: yang dijual console ini adalah tagihan — struk adalah bendanya, centang hijau adalah
keadaan yang dikejar operator ("lunas"). Dipilih dari lembar kandidat karena satu-satunya bentuk yang
masih terbaca di 16 px: siluet struk + lingkaran centang tetap jelas, sementara pola QR pecah jadi
bercak dan garis-garis struk versi detail menyatu.

Tiga berkas, tiga tugas:
  mark.svg         ink gelap, untuk latar terang (dokumen, surel, faktur)
  mark-gelap.svg   ink putih, untuk latar console gelap (rail navigasi)
  mark-16.svg      versi datar: tanpa garis dalam, pita lebih tebal — untuk favicon/tab

Jalankan: python3 brand/buat-mark.py  (butuh rsvg-convert untuk PNG)
"""
import pathlib
import subprocess

HIJAU_GELAP = "#00d68f"   # di latar console gelap
HIJAU_TERANG = "#00a86b"  # di latar terang: #00d68f gagal kontras di atas putih
GELAP = "#0e1518"
PUTIH = "#f4f8f7"

akar = pathlib.Path(__file__).resolve().parent


def svg(isi: str, ukuran: int = 512) -> str:
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" '
            f'width="{ukuran}" height="{ukuran}" role="img" aria-label="JagoAI Pay">'
            + isi + "</svg>")


def struk(ink: str, aksen: str, dalam: str, detail: bool) -> str:
    """Struk bertepi gerigi + lingkaran centang di pojok kanan bawah."""
    badan_atas, badan_bawah = 104, 356
    kiri, kanan = 132, 380

    # Gerigi: lima gigi segitiga di tepi bawah, supaya siluetnya langsung terbaca "struk",
    # bukan sekadar persegi panjang.
    gigi = 5
    lebar = (kanan - kiri) / gigi
    gerigi = "".join(
        f'<path d="M{kiri + i * lebar:.1f} {badan_bawah} l{lebar / 2:.1f} 26 l{lebar / 2:.1f} -26z" fill="{ink}"/>'
        for i in range(gigi)
    )

    garis = ""
    if detail:
        garis = "".join(
            f'<rect x="{kiri + 44}" y="{y}" width="{w}" height="18" rx="9" fill="{dalam}"/>'
            for y, w in ((158, 120), (204, 84), (250, 104))
        )

    return svg(
        f'<path d="M{kiri} {badan_atas} h{kanan - kiri} v{badan_bawah - badan_atas} h{-(kanan - kiri)}z" fill="{ink}"/>'
        + gerigi
        + garis
        + f'<circle cx="352" cy="352" r="78" fill="{aksen}"/>'
        # Centang digeser sedikit ke dalam: pada versi pertama ujungnya terlalu rapat ke tepi
        # lingkaran sehingga terlihat "mau keluar" saat diperkecil.
        + f'<path d="M318 350 l24 26 l44 -50" fill="none" stroke="{dalam}" stroke-width="24" '
          f'stroke-linecap="round" stroke-linejoin="round"/>'
    )


# Versi utama 512: dipakai di layar, ekspor PNG, dan lockup.
(akar / "mark-gelap.svg").write_text(struk(PUTIH, HIJAU_GELAP, GELAP, detail=True))
(akar / "mark.svg").write_text(struk(GELAP, HIJAU_TERANG, PUTIH, detail=True))

# Versi ringkas (tanpa garis dalam) untuk pemakaian kecil: rail 34 px dan label tab. Di ukuran itu
# tiga garis tipis struk menyatu jadi noda, jadi siluet + centang saja yang dipertahankan.
(akar / "mark-ringkas.svg").write_text(struk(PUTIH, HIJAU_GELAP, GELAP, detail=False))

# Versi 16 px: garis dalam dibuang (menyatu jadi bercak), pita centang dipertebal.
kecil = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="16" height="16" role="img">'
         f'<path d="M124 96 h264 v268 h-264z" fill="{GELAP}"/>'
         f'<path d="M124 364 l26.4 30 l26.4 -30 l26.4 30 l26.4 -30 l26.4 30 l26.4 -30 l26.4 30 l26.4 -30 '
         f'l26.4 30 l26.4 -30 l26.4 30 l26.4 -30z" fill="{GELAP}"/>'
         f'<circle cx="356" cy="348" r="92" fill="{HIJAU_TERANG}"/>'
         f'<path d="M314 346 l30 32 l52 -58" fill="none" stroke="{PUTIH}" stroke-width="34" '
         f'stroke-linecap="round" stroke-linejoin="round"/></svg>')
(akar / "mark-16.svg").write_text(kecil)
(akar / "favicon.svg").write_text(kecil)

# PNG: 1024 untuk dokumen/bursa, 512 untuk pratinjau cepat.
for sumber, nama, lebar in (
    ("mark.svg", "mark-1024.png", 1024),
    ("mark-gelap.svg", "mark-gelap-1024.png", 1024),
    ("mark-16.svg", "mark-16.png", 16),
):
    subprocess.run(["rsvg-convert", "-w", str(lebar), "-h", str(lebar),
                    str(akar / sumber), "-o", str(akar / nama)], check=True)

print("mark.svg, mark-gelap.svg, mark-16.svg, favicon.svg + PNG siap di", akar)
