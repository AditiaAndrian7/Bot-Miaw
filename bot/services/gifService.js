const { createCanvas, loadImage } = require("@napi-rs/canvas");
const fs = require("fs");
const path = require("path");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// Import ffmpeg
let ffmpeg, ffmpegStatic;
try {
  ffmpeg = require("fluent-ffmpeg");
  ffmpegStatic = require("ffmpeg-static");
  if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic);
    console.log("✅ FFmpeg loaded successfully");
  }
} catch (err) {
  console.warn("⚠️ FFmpeg tidak tersedia:", err.message);
  ffmpeg = null;
}

const TEMP_DIR = path.join(__dirname, "../temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const WIDTH = 600;
const HEIGHT = 300;

// Layout yang rapi
const LAYOUT = {
  avatar: { x: 40, y: HEIGHT / 2 - 60, size: 120 },
  title: { x: 180, y: HEIGHT / 2 - 45, fontSize: 36 },
  username: { x: 180, y: HEIGHT / 2, fontSize: 28 },
  subtitle: { x: 180, y: HEIGHT / 2 + 45, fontSize: 22 },
};

// Fungsi untuk render teks sebagai PATH (tidak butuh font)
function drawTextAsPath(ctx, text, x, y, fontSize, isBold = false) {
  // Simpan state
  ctx.save();

  // Pindah ke posisi
  ctx.translate(x, y);

  // Scale berdasarkan font size
  ctx.scale(0.8, 1); // Sedikit kompresi horizontal biar lebih aesthetic

  // Warna putih dengan stroke hitam (biar kebaca di background apapun)
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = fontSize / 15;

  // Gambar setiap huruf sebagai path sederhana
  // Ini adalah path untuk huruf-huruf dasar (simplified)
  const chars = text.split("");
  let cursorX = 0;

  chars.forEach((char, index) => {
    ctx.save();
    ctx.translate(cursorX, 0);

    // Render huruf berdasarkan karakter
    renderChar(ctx, char, fontSize, isBold);

    ctx.restore();

    // Lebar huruf (approximation)
    cursorX += fontSize * 0.6;
  });

  ctx.restore();
}

// Fungsi render karakter sederhana
function renderChar(ctx, char, size, isBold) {
  const s = size / 10; // scale factor

  ctx.beginPath();

  switch (char.toUpperCase()) {
    case "W":
      ctx.moveTo(0, -size);
      ctx.lineTo(s * 3, size / 2);
      ctx.lineTo(s * 6, -size);
      ctx.lineTo(s * 9, size / 2);
      ctx.lineTo(s * 12, -size);
      break;

    case "E":
      ctx.moveTo(0, -size);
      ctx.lineTo(0, size / 2);
      ctx.lineTo(s * 8, size / 2);
      ctx.moveTo(0, -size / 4);
      ctx.lineTo(s * 6, -size / 4);
      ctx.moveTo(0, -size);
      ctx.lineTo(s * 8, -size);
      break;

    case "L":
      ctx.moveTo(0, -size);
      ctx.lineTo(0, size / 2);
      ctx.lineTo(s * 8, size / 2);
      break;

    case "C":
      ctx.moveTo(s * 8, -size);
      ctx.lineTo(0, -size);
      ctx.lineTo(0, size / 2);
      ctx.lineTo(s * 8, size / 2);
      break;

    case "O":
      ctx.moveTo(0, -size);
      ctx.lineTo(s * 8, -size);
      ctx.lineTo(s * 8, size / 2);
      ctx.lineTo(0, size / 2);
      ctx.closePath();
      break;

    case "M":
      ctx.moveTo(0, -size);
      ctx.lineTo(0, size / 2);
      ctx.lineTo(s * 4, 0);
      ctx.lineTo(s * 8, size / 2);
      ctx.lineTo(s * 8, -size);
      break;

    default:
      // Default rectangle untuk huruf lain
      ctx.rect(0, -size, s * 6, size * 1.5);
  }

  // Fill dan stroke
  if (isBold) {
    ctx.lineWidth = size / 8;
  }
  ctx.stroke();
  ctx.fill();

  // Tambah bold dengan stroke kedua
  if (isBold) {
    ctx.stroke();
  }
}

// Fungsi untuk render teks biasa dengan fallback
function drawText(
  ctx,
  text,
  x,
  y,
  fontSize,
  isBold = false,
  color = "#ffffff",
) {
  try {
    // Coba dengan font normal dulu
    ctx.font = `${isBold ? "bold" : "normal"} ${fontSize}px "Arial", "sans-serif"`;
    ctx.fillStyle = color;
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    ctx.fillText(text, x, y);
  } catch (err) {
    // Fallback ke path rendering
    console.log(`⚠️ Font error, using path rendering for: ${text}`);
    drawTextAsPath(ctx, text, x, y, fontSize, isBold);
  }
}

async function generateGifWithFFmpeg(member, type, backgroundURL, extra = {}) {
  if (!ffmpeg || !ffmpegStatic) {
    throw new Error("FFmpeg tidak tersedia");
  }

  const tempBgPath = path.join(TEMP_DIR, `bg_${Date.now()}.gif`);
  const tempOverlayPath = path.join(TEMP_DIR, `overlay_${Date.now()}.png`);
  const outputPath = path.join(TEMP_DIR, `output_${Date.now()}.gif`);

  try {
    console.log(`📥 Downloading background GIF...`);
    const response = await fetch(backgroundURL);
    if (!response.ok)
      throw new Error(`Gagal download GIF: ${response.statusText}`);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(tempBgPath, Buffer.from(buffer));
    console.log(`✅ Background downloaded (${buffer.byteLength} bytes)`);

    // 2. Buat overlay dengan canvas
    console.log(`🎨 Creating overlay...`);
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");

    // Background transparan
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Gambar avatar
    const avatar = await loadImage(
      member.user.displayAvatarURL({ extension: "png", size: 128 }),
    );

    // Avatar bulat
    ctx.save();
    ctx.beginPath();
    ctx.arc(
      LAYOUT.avatar.x + LAYOUT.avatar.size / 2,
      LAYOUT.avatar.y + LAYOUT.avatar.size / 2,
      LAYOUT.avatar.size / 2,
      0,
      Math.PI * 2,
    );
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(
      avatar,
      LAYOUT.avatar.x,
      LAYOUT.avatar.y,
      LAYOUT.avatar.size,
      LAYOUT.avatar.size,
    );
    ctx.restore();

    // Stroke tipis di avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(
      LAYOUT.avatar.x + LAYOUT.avatar.size / 2,
      LAYOUT.avatar.y + LAYOUT.avatar.size / 2,
      LAYOUT.avatar.size / 2 + 2,
      0,
      Math.PI * 2,
    );
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // Title (WELCOME)
    drawText(ctx, type.toUpperCase(), LAYOUT.title.x, LAYOUT.title.y, 36, true);

    // Username
    drawText(
      ctx,
      member.user.username,
      LAYOUT.username.x,
      LAYOUT.username.y,
      28,
      false,
    );

    // Subtitle
    if (type === "welcome" || type === "goodbye") {
      let serverName = member.guild.name;
      drawText(
        ctx,
        `Server: ${serverName}`,
        LAYOUT.subtitle.x,
        LAYOUT.subtitle.y,
        22,
        false,
        "#e0e0e0",
      );
    } else if (type === "congrats" && extra.roleName) {
      drawText(
        ctx,
        `Role baru: ${extra.roleName}`,
        LAYOUT.subtitle.x,
        LAYOUT.subtitle.y,
        22,
        false,
        "#e0e0e0",
      );
    }

    // Simpan overlay
    const overlayBuffer = canvas.toBuffer("image/png");
    fs.writeFileSync(tempOverlayPath, overlayBuffer);
    console.log(`✅ Overlay created`);

    // 3. Proses dengan FFmpeg
    console.log(`🎬 Processing GIF with FFmpeg...`);
    await new Promise((resolve, reject) => {
      ffmpeg(tempBgPath)
        .input(tempOverlayPath)
        .complexFilter([
          "[0:v] scale=600:300:flags=lanczos [bg]",
          "[bg][1:v] overlay=0:0:format=auto,format=rgb24 [out]",
        ])
        .outputOptions([
          "-map [out]",
          "-pix_fmt rgb24",
          "-r 15",
          "-loop 0",
          "-preset ultrafast",
          "-gifflags -offsetting",
        ])
        .on("end", resolve)
        .on("error", reject)
        .save(outputPath);
    });

    const resultBuffer = fs.readFileSync(outputPath);
    console.log(`✅ GIF generated: ${resultBuffer.length} bytes`);

    if (resultBuffer.length > 25 * 1024 * 1024) {
      throw new Error("Ukuran file terlalu besar (>25MB)");
    }

    return resultBuffer;
  } finally {
    [tempBgPath, tempOverlayPath, outputPath].forEach((f) => {
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch (e) {}
      }
    });
  }
}

module.exports = { generateGifWithFFmpeg };
