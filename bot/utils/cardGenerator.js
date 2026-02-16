const { createCanvas, loadImage } = require("canvas");
const { generateGifWithFFmpeg } = require("../services/gifService");
const { parseGIF, decompressFrames } = require("gifuct-js");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const WIDTH = 600;
const HEIGHT = 300;

// SAME FONT AS DISCORD!
const DISCORD_FONT =
  '"Whitney", "Helvetica Neue", "Helvetica", "Arial", "sans-serif"';
const DISCORD_BOLD =
  '"Whitney Bold", "Helvetica Neue Bold", "Helvetica Bold", "Arial Bold", "sans-serif"';

// Konfigurasi posisi yang rapi
const LAYOUT = {
  avatar: {
    x: 40,
    y: HEIGHT / 2 - 60,
    size: 120,
  },
  title: {
    x: 180,
    y: HEIGHT / 2 - 45,
    fontSize: 36,
  },
  username: {
    x: 180,
    y: HEIGHT / 2,
    fontSize: 28,
  },
  subtitle: {
    x: 180,
    y: HEIGHT / 2 + 45,
    fontSize: 22,
  },
};

// Helper function untuk setting font ala Discord
function setFont(ctx, weight, size) {
  if (weight === "bold") {
    ctx.font = `${size}px ${DISCORD_BOLD}`;
  } else {
    ctx.font = `${size}px ${DISCORD_FONT}`;
  }

  // Fallback
  try {
    ctx.measureText("Test");
  } catch {
    ctx.font = `${size}px "Arial", "sans-serif"`;
  }
}

async function generateCard({ member, type, backgroundURL, extra = {} }) {
  if (!backgroundURL) throw new Error("Background URL tidak ditemukan");

  const isGif = backgroundURL.toLowerCase().endsWith(".gif");

  if (isGif) {
    try {
      console.log("🎬 Mencoba generate dengan FFmpeg...");
      return await generateGifWithFFmpeg(member, type, backgroundURL, extra);
    } catch (ffmpegError) {
      console.error(
        "❌ FFmpeg gagal, beralih ke method lama:",
        ffmpegError.message,
      );
      console.log("🔄 Menggunakan method lama (gifuct-js)...");
      return await generateAnimatedCard(member, type, backgroundURL, extra);
    }
  } else {
    return await generateStaticCard(member, type, backgroundURL, extra);
  }
}

async function generateAnimatedCard(member, type, backgroundURL, extra) {
  console.log("📥 Mendownload GIF untuk method lama...");
  const response = await fetch(backgroundURL);
  const buffer = Buffer.from(await response.arrayBuffer());
  const gif = parseGIF(buffer);
  const frames = decompressFrames(gif, true);

  console.log(`📊 Total frame: ${frames.length}`);

  const gifWidth = gif.lsd.width;
  const gifHeight = gif.lsd.height;

  const accCanvas = createCanvas(gifWidth, gifHeight);
  const accCtx = accCanvas.getContext("2d");

  const outCanvas = createCanvas(WIDTH, HEIGHT);
  const outCtx = outCanvas.getContext("2d");

  const GIFEncoder = require("gif-encoder-2");
  const encoder = new GIFEncoder(WIDTH, HEIGHT);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setQuality(5);
  encoder.setThreshold(30);

  const avatar = await loadImage(
    member.user.displayAvatarURL({ extension: "png", size: 128 }),
  );

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const { dims, disposalType, patch } = frame;

    if (disposalType === 2) {
      accCtx.clearRect(dims.left, dims.top, dims.width, dims.height);
    }

    if (patch && patch.length > 0) {
      const imageData = accCtx.createImageData(dims.width, dims.height);
      imageData.data.set(new Uint8ClampedArray(patch));
      accCtx.putImageData(imageData, dims.left, dims.top);
    }

    outCtx.clearRect(0, 0, WIDTH, HEIGHT);
    outCtx.drawImage(accCanvas, 0, 0, gifWidth, gifHeight, 0, 0, WIDTH, HEIGHT);

    drawOverlay(outCtx, member, type, extra, avatar);

    const delayMs = (frame.delay || 10) * 10;
    encoder.setDelay(delayMs);
    encoder.addFrame(outCtx);
  }

  encoder.finish();
  console.log("✅ GIF lama selesai");
  return encoder.out.getData();
}

async function generateStaticCard(member, type, backgroundURL, extra) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  const bg = await loadImage(backgroundURL);
  ctx.drawImage(bg, 0, 0, WIDTH, HEIGHT);

  const avatar = await loadImage(
    member.user.displayAvatarURL({ extension: "png", size: 128 }),
  );

  drawOverlay(ctx, member, type, extra, avatar);
  return canvas.toBuffer("image/png");
}

function drawOverlay(ctx, member, type, extra, avatar) {
  // Shadow ala Discord (subtle)
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  // Gambar avatar (bulat)
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

  // Stroke tipis di avatar (efek seperti di Discord)
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

  // Title - Putih bold
  setFont(ctx, "bold", LAYOUT.title.fontSize);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(type.toUpperCase(), LAYOUT.title.x, LAYOUT.title.y);

  // Username - Putih semi bold
  setFont(ctx, "normal", LAYOUT.username.fontSize);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(member.user.username, LAYOUT.username.x, LAYOUT.username.y);

  // Subtitle - Abu-abu muda
  setFont(ctx, "normal", LAYOUT.subtitle.fontSize);
  ctx.fillStyle = "#e0e0e0";

  if (type === "welcome" || type === "goodbye") {
    let serverName = member.guild.name;
    if (ctx.measureText(serverName).width > 320) {
      serverName = serverName.substring(0, 22) + "...";
    }
    ctx.fillText(`Server: ${serverName}`, LAYOUT.subtitle.x, LAYOUT.subtitle.y);
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

  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

module.exports = { generateCard };
