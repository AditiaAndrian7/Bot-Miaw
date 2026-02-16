const { createCanvas, loadImage, registerFont } = require("canvas");
const fs = require("fs");
const path = require("path");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// REGISTER FONT LOKAL!
const fontPath = path.join(__dirname, "../fonts");
try {
  if (fs.existsSync(path.join(fontPath, "Poppins-Regular.ttf"))) {
    registerFont(path.join(fontPath, "Poppins-Regular.ttf"), {
      family: "Poppins",
    });
    registerFont(path.join(fontPath, "Poppins-Bold.ttf"), {
      family: "Poppins",
      weight: "bold",
    });
    console.log("✅ Font Poppins registered from local file");
  } else {
    console.warn("⚠️ Font files not found, using system fallback");
  }
} catch (err) {
  console.warn("⚠️ Font registration failed:", err.message);
}

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

const LAYOUT = {
  avatar: { x: 40, y: HEIGHT / 2 - 60, size: 120 },
  title: { x: 180, y: HEIGHT / 2 - 45, fontSize: 36 },
  username: { x: 180, y: HEIGHT / 2, fontSize: 28 },
  subtitle: { x: 180, y: HEIGHT / 2 + 45, fontSize: 22 },
};

function renderText(ctx, text, x, y, fontSize, isBold = false) {
  ctx.save();

  // PAKE FONT YANG SUDAH DIREGISTER
  if (isBold) {
    ctx.font = `bold ${fontSize}px "Poppins", "sans-serif"`;
  } else {
    ctx.font = `${fontSize}px "Poppins", "sans-serif"`;
  }

  // Stroke hitam
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = fontSize / 6;
  ctx.strokeText(text, x, y);

  // Fill putih
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
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // RENDER TEXT DENGAN FONT SENDIRI
    renderText(
      ctx,
      type.toUpperCase(),
      LAYOUT.title.x,
      LAYOUT.title.y,
      36,
      true,
    );
    renderText(
      ctx,
      member.user.username,
      LAYOUT.username.x,
      LAYOUT.username.y,
      28,
    );

    if (type === "welcome" || type === "goodbye") {
      renderText(
        ctx,
        `Server: ${member.guild.name}`,
        LAYOUT.subtitle.x,
        LAYOUT.subtitle.y,
        22,
      );
    } else if (type === "congrats" && extra.roleName) {
      renderText(
        ctx,
        `Role baru: ${extra.roleName}`,
        LAYOUT.subtitle.x,
        LAYOUT.subtitle.y,
        22,
      );
    }

    const overlayBuffer = canvas.toBuffer("image/png");
    fs.writeFileSync(tempOverlayPath, overlayBuffer);
    console.log(`✅ Overlay created`);

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
