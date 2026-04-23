# 🗺️ FIF Adventure

**FIF Adventure** adalah platform manajemen aktivitas petualangan dan treasure hunt yang dirancang untuk meningkatkan engagement peserta melalui gamifikasi. Aplikasi ini mendukung alur kerja petugas lapangan (LO), pelacakan antrean wahana secara real-time, dan sistem penilaian terverifikasi fisik.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Supabase](https://img.shields.io/badge/Supabase-Database-green)

## ✨ Fitur Utama

- **Double-Scan Verification**: Menjamin kehadiran fisik peserta melalui proses scan individu saat check-in dan saat penilaian.
- **Real-Time Queue Management**: Petugas (LO) dapat melihat antrean tim dan anggota partisipan secara langsung.
- **Treasure Hunt System**: Integrasi dengan modul pencarian harta karun (Gacha/Random Rewards).
- **Admin Dashboard**: Audit log lengkap, manajemen user, dan ekspor laporan kehadiran (CSV).
- **Mobile First Design**: Antarmuka premium yang dioptimalkan untuk perangkat mobile di lapangan.

## 🚀 Teknologi

- **Frontend**: Next.js 15 (App Router), Tailwind CSS, Framer Motion.
- **Backend**: Supabase (PostgreSQL, Auth, Realtime).
- **Icons**: Lucide React.
- **Deployment**: Vercel & GitHub Actions (CI/CD).

## 🛠️ Persiapan Mandiri (Local Setup)

### 1. Prasyarat
- Node.js 20.x atau lebih baru.
- Akun Supabase (Gratis).

### 2. Instalasi
```bash
# Clone repository
git clone https://github.com/yogaWidodo/fif-adventure.git
cd fif-adventure

# Install dependencies
npm install
```

### 3. Konfigurasi Environment
Salin file `.env.example` menjadi `.env.local` dan isi dengan kredensial Supabase Anda:
```bash
cp .env.example .env.local
```

### 4. Jalankan Aplikasi
```bash
npm run dev
```
Aplikasi akan berjalan di `http://localhost:3000`.

## 🔒 Keamanan & Kontribusi
Proyek ini menggunakan alur kerja CI/CD yang ketat. Setiap Pull Request akan diuji melalui sistem otomatis sebelum dapat digabungkan ke cabang `master`.

---

Dibuat dengan ❤️ oleh tim kontributor FIF Adventure.
