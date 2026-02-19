# Bot Miaw

Bot Discord dengan fitur AI, PDF, Image, dan Memory services.

## 📋 Prasyarat

Sebelum memulai, pastikan Anda telah menginstal:
- [Node.js](https://nodejs.org/) (versi 22 atau lebih baru)

## 🚀 Cara Menjalankan Project

### 1. Clone Repository

Anda dapat melakukan clone repository dengan dua cara:

#### Opsi A - Menggunakan Git Clone
```bash
git clone https://github.com/AditiaAndrian7/Bot-Miaw.git
cd Bot-Miaw
```

#### Opsi B - Download ZIP
1. Download repository sebagai ZIP dari GitHub
2. Ekstrak file ZIP tersebut
3. Buka folder hasil ekstrak di terminal/command prompt

### 2. Setup File Environment

Project ini membutuhkan file environment untuk konfigurasi. Ikuti langkah berikut:

1. Duplikat file `.env.example` menjadi `.env`
   
   **Di Windows (Command Prompt):**
   ```bash
   copy .env.example .env
   ```
   
   **Di Linux/Mac:**
   ```bash
   cp .env.example .env
   ```

2. Edit file `.env` dan isi dengan konfigurasi yang sesuai:
```env
DISCORD_TOKEN=QWERT1234567890
GEMINI_KEY_1=AIQWERTY12345678
GEMINI_KEY_2=AIQWERTY12345678
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Jalankan Project

```bash
npm start
```

Atau jika ingin menjalankan dalam mode development:
```bash
npm run dev
```

## 📁 Struktur Folder

```
BOT DISCORD CONTROL/
│
├── bin/                           # File eksekusi tambahan
│   └── yt-dlp/
│       └── yt-dlp.exe            # Untuk unduh video/audio
│
├── bot/                           # Folder utama bot
│   ├── fonts/                      # File font untuk generate gambar
│   │   └── services/               # SERVICES - LANGSUNG DI DALAM FONTS?
│   │       ├── aiService.js        # Service untuk AI
│   │       ├── gifService.js       # Service untuk GIF
│   │       ├── imageService.js     # Service untuk gambar
│   │       ├── memberService.js    # Service untuk member
│   │       ├── memoryService.js    # Service untuk memory
│   │       ├── musicService.js     # Service untuk music
│   │       ├── pdfService.js       # Service untuk PDF
│   │       └── pptxService.js      # Service untuk PowerPoint
│   │
│   ├── temp/                        # Folder temporary
│   │   └── music/                   # Sub-folder untuk music
│   │
│   ├── utils/                        # Utilitas
│   │   ├── cardGenerator.js         # Generator kartu/gambar
│   │   └── replyHandler.js          # Handler untuk reply
│   │
│   ├── config.js                     # File konfigurasi bot
│   ├── index.js                       # File utama bot
│   └── server-channels.json           # Data channel server Discord
│
├── node_modules/                    # Dependencies
├── .env                              # File environment (buat sendiri)
├── .env.example                      # Contoh file environment
├── .gitignore                        # File ignore untuk Git
├── package-lock.json
├── package.json
└── README.md
```

## 🛠️ Troubleshooting

### Error: "Cannot find module 'xxx'"
Jalankan ulang perintah:
```bash
npm install
```

### Error: "Environment variables not found"
Pastikan file `.env` sudah dibuat dan berisi konfigurasi yang benar

### Error: yt-dlp tidak berfungsi
Pastikan file `yt-dlp.exe` ada di folder `bin/yt-dlp/`. Jika perlu, download versi terbaru dari [situs resmi yt-dlp](https://github.com/yt-dlp/yt-dlp).

## 📝 Catatan Penting

- Folder `bot/temp/` akan digunakan untuk menyimpan file sementara (cache, unduhan)
- File `server-channels.json` menyimpan data channel Discord untuk keperluan logging/manajemen
- Pastikan koneksi internet stabil untuk menggunakan fitur-fitur yang membutuhkan API eksternal
- Fitur download menggunakan yt-dlp membutuhkan akses internet dan file eksekusi yang sesuai dengan sistem operasi Anda

## 📞 Kontak

Jika ada pertanyaan atau kendala, silakan hubungi:
- Email: aditiaandrian43@gmail.com
- Issue: [GitHub Issues](https://github.com/username/nama-repo/issues)

---
**Selamat mencoba!** 🎉

---



