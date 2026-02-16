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
  const semiBoldPath = path.join(fontPath, "Poppins-SemiBold.ttf");

  if (fs.existsSync(regularPath) && fs.existsSync(boldPath)) {
    registerFont(regularPath, { family: "Poppins" });
    registerFont(boldPath, { family: "Poppins", weight: "bold" });
    if (fs.existsSync(semiBoldPath)) {
      registerFont(semiBoldPath, { family: "Poppins", weight: "600" });
    }
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
// LAYOUT CONFIG - MUDAH DIATUR
// ============================================
const WIDTH = 600; // Naikin biar lebih lega
const HEIGHT = 350;

const LAYOUT = {
  avatar: {
    x: 50,
    y: HEIGHT / 2 - 70,
    size: 140, // Avatar lebih besar
  },
  title: {
    x: 210,
    y: HEIGHT / 2 - 60,
    fontSize: 48, // BESAR
    weight: "bold",
  },
  username: {
    x: 210,
    y: HEIGHT / 2,
    fontSize: 36, // SEDANG
    weight: "600", // Semi bold
  },
  subtitle: {
    x: 210,
    y: HEIGHT / 2 + 55,
    fontSize: 28, // KECIL
    weight: "normal",
  },
};

// Fungsi untuk setting font dengan weight yang tepat
function setFont(ctx, fontSize, weight = "normal") {
  if (fontRegistered) {
    switch (weight) {
      case "bold":
        ctx.font = `bold ${fontSize}px "Poppins", "sans-serif"`;
        break;
      case "600":
        ctx.font = `600 ${fontSize}px "Poppins", "sans-serif"`;
        break;
      default:
        ctx.font = `${fontSize}px "Poppins", "sans-serif"`;
    }
  } else {
    ctx.font = `${weight} ${fontSize}px "sans-serif"`;
  }
}

// ============================================
// RENDER TEXT
// ============================================
function renderText(ctx, text, x, y, fontSize, weight = "normal") {
  ctx.save();

  setFont(ctx, fontSize, weight);

  // Shadow untuk efek timbul
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 4;

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

    // ============================================
    // AVATAR - Lebih besar
    // ============================================
    const avatar = await loadImage(
      member.user.displayAvatarURL({ extension: "png", size: 256 }), // Naikin ke 256
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

    // Stroke avatar - Lebih tebal
    ctx.save();
    ctx.beginPath();
    ctx.arc(
      LAYOUT.avatar.x + LAYOUT.avatar.size / 2,
      LAYOUT.avatar.y + LAYOUT.avatar.size / 2,
      LAYOUT.avatar.size / 2 + 3,
      0,
      Math.PI * 2,
    );
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();

    // ============================================
    // TEXT - Dengan ukuran dan jarak yang diatur
    // ============================================

    // Title (WELCOME/GOODBYE/CONGRATS) - PALING BESAR
    renderText(
      ctx,
      type.toUpperCase(),
      LAYOUT.title.x,
      LAYOUT.title.y,
      48,
      "bold",
    );

    // Username - SEDANG, SEMI BOLD
    renderText(
      ctx,
      member.user.username,
      LAYOUT.username.x,
      LAYOUT.username.y,
      36,
      "600",
    );

    // Subtitle - LEBIH KECIL
    let subtitleText = "";
    if (type === "welcome" || type === "goodbye") {
      subtitleText = member.guild.name;
    } else if (type === "congrats" && extra.roleName) {
      subtitleText = extra.roleName;
    }

    if (subtitleText) {
      renderText(
        ctx,
        subtitleText,
        LAYOUT.subtitle.x,
        LAYOUT.subtitle.y,
        28,
        "normal",
      );
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
          `[0:v]scale=${WIDTH}:${HEIGHT}:flags=lanczos[bg];[bg][1:v]overlay=0:0`,
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
