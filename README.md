# Bot Miaw

Bot WhatsApp dengan fitur AI, PDF, Image, dan Memory services.

## 📋 Prasyarat

Sebelum memulai, pastikan Anda telah menginstal:
- [Node.js](https://nodejs.org/) (versi 16 atau lebih baru)

## 🚀 Cara Menjalankan Project

### 1. Clone Repository

Anda dapat melakukan clone repository dengan dua cara:

#### Opsi A - Menggunakan Git Clone
```bash
git clone https://github.com/username/nama-repo.git
cd nama-repo
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
   touch .env
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

> **Catatan:** Dependencies sudah termasuk dalam repository, jadi tidak perlu menginstall satu per satu.

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
root/
│
├── bot/
│   ├── index.js              # File utama bot
│   │
│   ├── services/              # Layanan-layanan
│   │   ├── aiService.js       # Service untuk AI
│   │   ├── pdfService.js      # Service untuk PDF
│   │   ├── imageService.js    # Service untuk gambar
│   │   └── memoryService.js   # Service untuk memory
│   │
│   ├── utils/                 # Utilitas
│   │   └── replyHandler.js    # Handler untuk reply
│   │
│   ├── config.js              # Konfigurasi
│   │
│   └── temp/                   # Folder temporary
│
├── node_modules/               # Dependencies
├── package.json
├── package-lock.json
└── .env                        # File environment (buat sendiri)
└── .env.example                # Contoh file environment
```


## 🛠️ Troubleshooting

### Error: "Cannot find module 'xxx'"
Jalankan ulang perintah:
```bash
npm install
```

### Error: "Environment variables not found"
Pastikan file `.env` sudah dibuat dan berisi konfigurasi yang benar

## 📝 Catatan Penting

- Folder `temp/` akan digunakan untuk menyimpan file sementara
- Pastikan koneksi internet stabil untuk menggunakan fitur-fitur yang membutuhkan API eksternal


## 📞 Kontak

Jika ada pertanyaan atau kendala, silakan hubungi:
- Email: aditiaandrian43.com
- Issue: [GitHub Issues](https://github.com/username/nama-repo/issues)

---
**Selamat mencoba!** 🎉
