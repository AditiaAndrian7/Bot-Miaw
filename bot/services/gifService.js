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
// FONT HANDLING DENGAN MULTIPLE FALLBACK
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
    console.warn("⚠️ Font files not found");
  }
} catch (err) {
  console.warn("⚠️ Font registration failed:", err.message);
}

// FUNGSI RENDER TEXT DENGAN FALLBACK BERTINGKAT
function renderText(ctx, text, x, y, fontSize, isBold = false) {
  ctx.save();

  // Coba pake Poppins kalau berhasil register
  if (fontRegistered) {
    try {
      ctx.font = `${isBold ? "bold" : "normal"} ${fontSize}px "Poppins"`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText("test", 0, 0); // Test render
    } catch (e) {
      fontRegistered = false; // Gagal, fallback
    }
  }

  // Fallback: sans-serif dengan stroke tebal
  if (!fontRegistered) {
    // Stroke hitam sangat tebal
    ctx.font = `${isBold ? "bold" : "normal"} ${fontSize}px "sans-serif"`;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = fontSize / 3; // Stroke lebih tebal
    ctx.strokeText(text, x, y);

    // Stroke putih medium
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = fontSize / 6;
    ctx.strokeText(text, x, y);

    // Fill putih
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, x, y);
  } else {
    // Poppins version
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = fontSize / 5;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, x, y);
  }

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

    // RENDER TEXT
    renderText(
      ctx,
      type.toUpperCase(),
      LAYOUT.title.x,
      LAYOUT.title.y,
      24,
      true,
    );
    renderText(
      ctx,
      member.user.username,
      LAYOUT.username.x,
      LAYOUT.username.y,
      18,
    );

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

    const overlayBuffer = canvas.toBuffer("image/png");
    fs.writeFileSync(tempOverlayPath, overlayBuffer);
    console.log(`✅ Overlay created`);

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
        ])
        .on("end", resolve)
        .on("error", reject)
        .save(outputPath);
    });

    const resultBuffer = fs.readFileSync(outputPath);
    console.log(`✅ GIF generated: ${resultBuffer.length} bytes`);

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
