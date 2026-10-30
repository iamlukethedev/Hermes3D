# NEX-MEX Local — Android / Termux

Status dokumen: fondasi ekstraksi tahap awal.

## Tujuan

Menjalankan kantor NEX-MEX dari Android menggunakan Termux, tanpa hosting Vercel dan tanpa membutuhkan server gateway eksternal. Tahap awal menggunakan demo gateway bawaan Hermes3D sebagai runtime lokal. Demo gateway mendukung daftar agen, membuat/mengubah/menghapus agen, riwayat sesi, dan percakapan demo yang mengalir secara bertahap.

## Persyaratan

- Android ARM64 disarankan.
- Termux dari sumber resmi F-Droid atau GitHub Termux.
- Node.js 20+ dan npm 10+ (sesuai persyaratan upstream Hermes3D).
- Ruang penyimpanan cukup untuk dependency Next.js, Three.js, dan Phaser.

## Instalasi di Termux

Jalankan perintah berikut satu per satu:

```bash
pkg update && pkg upgrade -y
pkg install git nodejs-lts -y
node -v
npm -v
git clone https://github.com/duerohub2/Nex-Mex.git
cd Nex-Mex
npm install
npm run local:demo
```

Buka browser Android dan akses:

```
http://127.0.0.1:3000
```

Jika halaman meminta memilih backend, pilih **Demo backend** dan hubungkan ke gateway lokal `ws://127.0.0.1:18789`. Penghilangan layar koneksi otomatis adalah pekerjaan tahap berikutnya; saat ini peluncur sudah menyalakan gateway demo dan aplikasi web bersamaan.

## Menghentikan

Tekan `Ctrl+C di sesi Termux yang menjalankan aplikasi.

## Batasan tahap awal

- Ini masih memakai UI koneksi upstream; belum menjadi mode tanpa login/koneksi satu-klik.
- Demo gateway mensimulasikan jawaban agen. Ini bukan model AI lokal sungguhan dan tidak menjalankan tool eksternal.
- Penyimpanan percakapan demo saat ini berada di memori proses demo gateway, sehingga percakapan dapat hilang ketika proses dihentikan.
- Fitur yang memerlukan API runtime nyata, kredensial, GitHub, Jira, atau layanan eksternal belum otomatis tersedia secara offline.
- Build dan uji di perangkat Android belum dilakukan dari lingkungan ini.

## Tahap ekstraksi berikutnya

1. Buat mode `NEX_MEX_LOCAL=1` untuk membuka kantor langsung tanpa layar pemilihan backend.
2. Jadikan demo gateway runtime lokal default, dengan indikator "Simulasi lokal".
3. Tambahkan penyimpanan persisten lokal untuk konfigurasi kantor dan riwayat chat.
4. Pertahankan jalur adapter eksternal sebagai opsi lanjutan, bukan syarat membuka kantor.
5. Audit fitur satu per satu agar panel yang bergantung pada runtime eksternal tetap ditandai jelas dan tidak rusak.
