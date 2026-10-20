# Design reference — Ceklis

Mockup dari canvas "Ceklis Valet — PWA & Admin". Format `.dc.html` (butuh runtime canvas, tidak bisa dibuka langsung). Baca markup + inline style sebagai acuan. Data di mockup = contoh; `{{hole}}` dan `<script type="text/x-dc">` = logika mockup.

| File | Route |
|---|---|
| Main.dc.html | `/masuk` (login petugas) |
| MHome.dc.html | `/` beranda petugas |
| MCheckin.dc.html | `/checkin` (4 langkah; checklist + ringkasan otomatis di langkah 3) |
| MCheckout.dc.html | `/checkout/[id]` |
| MAktif.dc.html | `/aktif` |
| MRiwayat.dc.html | `/riwayat` |
| MAkun.dc.html | `/akun` |
| ADashboard.dc.html | `/admin` |
| ATransaksi.dc.html | `/admin/transaksi` |
| AInsiden.dc.html | `/admin/insiden` |
| ALokasi.dc.html | `/admin/lokasi` |
| AChecklist.dc.html | `/admin/template` (catatan: versi mockup masih daftar datar; implementasi ikut pengelompokan PRD §4.2 & §6) |

Canvas asli: https://claude.ai/artifact/68ewHanXJFDB49uycGiFhS
