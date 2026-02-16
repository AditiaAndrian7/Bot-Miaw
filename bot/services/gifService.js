const { createCanvas, loadImage, registerFont } = require("canvas");
const fs = require("fs");
const path = require("path");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

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

const WIDTH = 400;
const HEIGHT = 200;

const LAYOUT = {
  avatar: { x: 30, y: HEIGHT / 2 - 40, size: 80 },
  title: { x: 120, y: HEIGHT / 2 - 30, fontSize: 24 },
  username: { x: 120, y: HEIGHT / 2, fontSize: 18 },
  subtitle: { x: 120, y: HEIGHT / 2 + 30, fontSize: 14 },
};

// ============================================
// FONT HANDLING - PASTI JALAN
// ============================================
let fontRegistered = false;
try {
  const fontDir = path.join(__dirname, "../fonts");
  const regularPath = path.join(fontDir, "Poppins-Regular.ttf");
  const boldPath = path.join(fontDir, "Poppins-Bold.ttf");

  if (fs.existsSync(regularPath) && fs.existsSync(boldPath)) {
    registerFont(regularPath, { family: "Poppins" });
    registerFont(boldPath, { family: "Poppins", weight: "bold" });
    console.log("✅ Poppins fonts registered successfully");
    fontRegistered = true;
  } else {
    console.warn("⚠️ Font files not found, using system fonts");
  }
} catch (err) {
  console.warn("⚠️ Font registration failed:", err.message);
}

// ============================================
// FUNGSI RENDER TEXT - PASTI KELIATAN
// ============================================
function renderText(ctx, text, x, y, fontSize, isBold = false) {
  ctx.save();

  // Set font dengan fallback
  if (fontRegistered) {
    ctx.font = `${isBold ? "bold" : "normal"} ${fontSize}px "Poppins", "sans-serif"`;
  } else {
    ctx.font = `${isBold ? "bold" : "normal"} ${fontSize}px "sans-serif"`;
  }

  // LAPISAN 1: Shadow hitam besar (biar kebaca)
  ctx.shadowColor = "black";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);

  // LAPISAN 2: Fill putih (utama)
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);

  // LAPISAN 3: Stroke hitam tipis (biar rapi)
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.strokeText(text, x, y);

  ctx.restore();
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

    // Cek ukuran file
    if (buffer.byteLength > 10 * 1024 * 1024) {
      throw new Error("Background GIF terlalu besar (>10MB)");
    }

    fs.writeFileSync(tempBgPath, Buffer.from(buffer));
    console.log(`✅ Background downloaded (${buffer.byteLength} bytes)`);

    console.log(`🎨 Creating overlay...`);
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");

    // Background transparan
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Gambar avatar
    const avatar = await loadImage(
      member.user.displayAvatarURL({ extension: "png", size: 64 }),
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

    // Stroke putih di avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(
      LAYOUT.avatar.x + LAYOUT.avatar.size / 2,
      LAYOUT.avatar.y + LAYOUT.avatar.size / 2,
      LAYOUT.avatar.size / 2 + 2,
      0,
      Math.PI * 2,
    );
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // ============================================
    // RENDER TEXT - PAKAI SHADOW AGAR PASTI KELIATAN
    // ============================================

    // Title
    renderText(
      ctx,
      type.toUpperCase(),
      LAYOUT.title.x,
      LAYOUT.title.y,
      24,
      true,
    );

    // Username
    renderText(
      ctx,
      member.user.username,
      LAYOUT.username.x,
      LAYOUT.username.y,
      18,
    );

    // Subtitle
    if (type === "welcome" || type === "goodbye") {
      renderText(
        ctx,
        member.guild.name,
        LAYOUT.subtitle.x,
        LAYOUT.subtitle.y,
        14,
      );
    } else if (type === "congrats" && extra.roleName) {
      renderText(ctx, extra.roleName, LAYOUT.subtitle.x, LAYOUT.subtitle.y, 14);
    }

    // Simpan overlay
    const overlayBuffer = canvas.toBuffer("image/png");

    // DEBUG: Simpan overlay untuk inspection
    const debugPath = path.join(TEMP_DIR, `debug_${Date.now()}.png`);
    fs.writeFileSync(debugPath, overlayBuffer);
    console.log(`🔍 Debug overlay saved: ${debugPath}`);

    fs.writeFileSync(tempOverlayPath, overlayBuffer);
    console.log(`✅ Overlay created (${overlayBuffer.length} bytes)`);

    console.log(`🎬 Processing GIF with FFmpeg...`);
    await new Promise((resolve, reject) => {
      ffmpeg(tempBgPath)
        .input(tempOverlayPath)
        .outputOptions([
          "-vf",
          "scale=400:200:flags=lanczos",
          "-r",
          "10",
          "-loop",
          "0",
          "-preset",
          "ultrafast",
          "-fs",
          "5M",
        ])
        .on("start", (cmd) => {
          console.log("FFmpeg command:", cmd);
        })
        .on("end", () => {
          console.log("FFmpeg finished");
          resolve();
        })
        .on("error", (err) => {
          console.error("FFmpeg error:", err);
          reject(err);
        })
        .save(outputPath);
    });

    const resultBuffer = fs.readFileSync(outputPath);
    console.log(`✅ GIF generated: ${resultBuffer.length} bytes`);

    return resultBuffer;
  } catch (error) {
    console.error("❌ Error in generateGifWithFFmpeg:", error.message);
    throw error;
  } finally {
    // Cleanup
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
