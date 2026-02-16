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

// Font stack untuk semua OS
const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// Layout yang rapi
const LAYOUT = {
  avatar: { x: 40, y: HEIGHT / 2 - 60, size: 120 },
  title: { x: 180, y: HEIGHT / 2 - 45, fontSize: 36 },
  username: { x: 180, y: HEIGHT / 2, fontSize: 28 },
  subtitle: { x: 180, y: HEIGHT / 2 + 45, fontSize: 22 },
};

// Helper function untuk setting font
function setFont(ctx, weight, size) {
  ctx.font = `${weight} ${size}px ${FONT_STACK}`;
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
    const buffer = await response.buffer();
    fs.writeFileSync(tempBgPath, buffer);
    console.log(`✅ Background downloaded (${buffer.length} bytes)`);

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

    // Avatar bulat dengan stroke putih tipis
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
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // Shadow untuk teks
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#ffffff";

    // Title dengan tracking/letter spacing effect
    setFont(ctx, "bold", LAYOUT.title.fontSize);
    ctx.fillText(type.toUpperCase(), LAYOUT.title.x, LAYOUT.title.y);

    // Username
    setFont(ctx, "500", LAYOUT.username.fontSize); // medium weight
    ctx.fillText(member.user.username, LAYOUT.username.x, LAYOUT.username.y);

    // Subtitle
    setFont(ctx, "400", LAYOUT.subtitle.fontSize); // normal weight

    if (type === "welcome" || type === "goodbye") {
      let serverName = member.guild.name;
      if (ctx.measureText(serverName).width > 320) {
        serverName = serverName.substring(0, 22) + "...";
      }
      ctx.fillText(
        `Server: ${serverName}`,
        LAYOUT.subtitle.x,
        LAYOUT.subtitle.y,
      );
    } else if (type === "congrats" && extra.roleName) {
      let roleName = extra.roleName;
      if (ctx.measureText(roleName).width > 320) {
        roleName = roleName.substring(0, 22) + "...";
      }
      ctx.fillText(
        `Role baru: ${roleName}`,
        LAYOUT.subtitle.x,
        LAYOUT.subtitle.y,
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
