const { createCanvas, loadImage, registerFont } = require("canvas");
const fs = require("fs");
const path = require("path");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// ============================================
// REGISTER FONT LOKAL
// ============================================
let fontRegistered = false;
const fontPath = path.join(__dirname, "../fonts");

try {
  const regularPath = path.join(fontPath, "Poppins-Regular.ttf");
  const boldPath = path.join(fontPath, "Poppins-Bold.ttf");

  if (fs.existsSync(regularPath) && fs.existsSync(boldPath)) {
    registerFont(regularPath, { family: "Poppins" });
    registerFont(boldPath, { family: "Poppins", weight: "bold" });
    console.log("✅ Font Poppins registered from local file");
    fontRegistered = true;
  } else {
    console.warn("⚠️ Font files not found, using system fallback");
  }
} catch (err) {
  console.warn("⚠️ Font registration failed:", err.message);
}

// ============================================
// FFMPEG SETUP
// ============================================
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

// ============================================
// LAYOUT - UKURAN VALID
// ============================================
const WIDTH = 500;
const HEIGHT = 250;

const LAYOUT = {
  avatar: { x: 35, y: HEIGHT / 2 - 50, size: 128 }, // GANTI 100 -> 128
  title: { x: 180, y: HEIGHT / 2 - 40, fontSize: 30 },
  username: { x: 180, y: HEIGHT / 2, fontSize: 24 },
  subtitle: { x: 180, y: HEIGHT / 2 + 40, fontSize: 18 },
};

// ============================================
// RENDER TEXT
// ============================================
function renderText(ctx, text, x, y, fontSize, isBold = false) {
  ctx.save();

  if (fontRegistered) {
    ctx.font = `${isBold ? "bold" : "normal"} ${fontSize}px "Poppins", "sans-serif"`;
  } else {
    ctx.font = `${isBold ? "bold" : "normal"} ${fontSize}px "sans-serif"`;
  }

  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);

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
    fs.writeFileSync(tempBgPath, Buffer.from(buffer));
    console.log(`✅ Background downloaded (${buffer.byteLength} bytes)`);

    console.log(`🎨 Creating overlay...`);
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // ============================================
    // AVATAR - PAKAI UKURAN 128 (VALID)
    // ============================================
    const avatar = await loadImage(
      member.user.displayAvatarURL({ extension: "png", size: 128 }), // 128 VALID
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

    // Stroke avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(
      LAYOUT.avatar.x + LAYOUT.avatar.size / 2,
      LAYOUT.avatar.y + LAYOUT.avatar.size / 2,
      LAYOUT.avatar.size / 2 + 2,
      0,
      Math.PI * 2,
    );
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // ============================================
    // TEXT
    // ============================================
    renderText(
      ctx,
      type.toUpperCase(),
      LAYOUT.title.x,
      LAYOUT.title.y,
      30,
      true,
    );
    renderText(
      ctx,
      member.user.username,
      LAYOUT.username.x,
      LAYOUT.username.y,
      24,
    );

    if (type === "welcome" || type === "goodbye") {
      renderText(
        ctx,
        member.guild.name,
        LAYOUT.subtitle.x,
        LAYOUT.subtitle.y,
        18,
      );
    } else if (type === "congrats" && extra.roleName) {
      renderText(ctx, extra.roleName, LAYOUT.subtitle.x, LAYOUT.subtitle.y, 18);
    }

    const overlayBuffer = canvas.toBuffer("image/png");
    fs.writeFileSync(tempOverlayPath, overlayBuffer);
    console.log(`✅ Overlay created (${overlayBuffer.length} bytes)`);

    // ============================================
    // FFMPEG
    // ============================================
    console.log(`🎬 Processing GIF with FFmpeg...`);

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(tempBgPath)
        .input(tempOverlayPath)
        .outputOptions([
          "-filter_complex",
          "[0:v]scale=500:250:flags=lanczos[bg];[bg][1:v]overlay=0:0",
          "-pix_fmt",
          "rgb24",
          "-r",
          "10",
        ])
        .on("end", resolve)
        .on("error", reject)
        .save(outputPath);
    });

    const resultBuffer = fs.readFileSync(outputPath);
    console.log(`✅ GIF generated: ${resultBuffer.length} bytes`);

    return resultBuffer;
  } catch (error) {
    console.error("❌ Error:", error.message);
    throw error;
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
