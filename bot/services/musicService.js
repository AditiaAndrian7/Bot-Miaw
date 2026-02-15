const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  entersState,
  VoiceConnectionStatus,
} = require("@discordjs/voice");

const play = require("play-dl");
const pathToFfmpeg = require("ffmpeg-static");
const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);
const fs = require("fs");
const path = require("path");

// Beri tahu @discordjs/voice lokasi FFmpeg
process.env.FFMPEG_PATH = pathToFfmpeg;

// Path ke binary yt-dlp (otomatis menyesuaikan OS)
// Dari services (bot/services) naik 2 level ke root, lalu masuk folder bin
const YT_DLP_PATH = path.join(
  __dirname,
  "..",
  "..",
  "bin",
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
);

// Map untuk menyimpan antrian per guild
const guildQueues = new Map();

/* ============================= */
/* SEARCH YOUTUBE (menggunakan play-dl) */
/* ============================= */
async function searchYoutube(keyword) {
  const results = await play.search(keyword, { limit: 1 });
  if (!results || results.length === 0) {
    throw new Error("Lagu tidak ditemukan di YouTube");
  }

  const video = results[0];
  return {
    title: video.title,
    url: video.url,
    id: video.id,
  };
}

/* ============================= */
/* PLAY SONG */
/* ============================= */
async function playSong(guild, member, keyword) {
  if (!member.voice.channel) {
    throw new Error("Kamu harus ada di voice channel!");
  }

  const song = await searchYoutube(keyword);

  let queue = guildQueues.get(guild.id);

  if (!queue) {
    const connection = joinVoiceChannel({
      channelId: member.voice.channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
      },
    });

    connection.subscribe(player);

    queue = {
      connection,
      player,
      songs: [],
    };

    guildQueues.set(guild.id, queue);

    // Event ketika lagu selesai
    player.on(AudioPlayerStatus.Idle, async () => {
      queue.songs.shift();
      if (queue.songs.length > 0) {
        await playNext(guild.id);
      } else {
        // Hancurkan koneksi hanya jika masih ada dan belum dihancurkan
        if (
          queue.connection &&
          queue.connection.state.status !== VoiceConnectionStatus.Destroyed
        ) {
          queue.connection.destroy();
        }
        guildQueues.delete(guild.id);
      }
    });

    // Event error pada player
    player.on("error", (err) => {
      console.error("❌ Audio Player Error:", err);
    });

    // Pantau perubahan state untuk debugging
    player.on("stateChange", (oldState, newState) => {
      console.log(`🎵 Player state: ${oldState.status} -> ${newState.status}`);
    });
  }

  queue.songs.push(song);
  if (queue.songs.length === 1) {
    await playNext(guild.id);
  }

  return song.title;
}

/* ============================= */
/* PLAY NEXT (dengan prioritas yt-dlp binary) */
/* ============================= */
async function playNext(guildId) {
  const queue = guildQueues.get(guildId);
  if (!queue || queue.songs.length === 0) return;

  const song = queue.songs[0];

  // Validasi dan konstruksi URL
  let videoUrl;
  if (song.id) {
    videoUrl = `https://www.youtube.com/watch?v=${song.id}`;
  } else if (
    song.url &&
    typeof song.url === "string" &&
    song.url.startsWith("http")
  ) {
    videoUrl = song.url.trim();
  } else {
    console.error("Invalid song URL/ID, removing from queue:", song);
    queue.songs.shift();
    return playNext(guildId);
  }

  try {
    console.log("=================================");
    console.log("DEBUG START");
    console.log("Song URL:", videoUrl);

    // ===== METODE UTAMA: yt-dlp binary =====
    if (fs.existsSync(YT_DLP_PATH)) {
      try {
        console.log("📁 Menggunakan yt-dlp binary di:", YT_DLP_PATH);

        const { stdout } = await execPromise(
          `"${YT_DLP_PATH}" -f bestaudio --get-url "${videoUrl}"`,
        );
        const audioUrl = stdout.trim();

        console.log("✅ yt-dlp URL obtained");

        // Fetch URL dengan header yang meniru browser
        const response = await fetch(audioUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "*/*",
            Connection: "keep-alive",
            Referer: "https://www.youtube.com/",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Buat resource audio dengan inputType 'arbitrary' agar FFmpeg menangani konversi
        const resource = createAudioResource(response.body, {
          inputType: "arbitrary",
        });

        resource.playStream.on("error", (err) => {
          console.error("❌ Resource stream error (yt-dlp):", err);
        });

        queue.player.play(resource);
        console.log("✅ Playing using yt-dlp binary + fetch");
        console.log("=================================");
        return; // Berhasil, keluar
      } catch (ytDlpErr) {
        console.log("⚠️ yt-dlp binary failed:", ytDlpErr.message);
        // Lanjut ke metode cadangan
      }
    } else {
      console.log("⚠️ yt-dlp binary tidak ditemukan di:", YT_DLP_PATH);
    }

    // ===== METODE CADANGAN: play-dl video_info + fetch =====
    console.log("📁 Menggunakan fallback play-dl...");
    const info = await play.video_info(videoUrl);
    console.log("✅ video_info OK");
    console.log("Video title:", info.video_details?.title);
    console.log("Available formats:", info.format.length);

    // Tampilkan sample format untuk debugging
    console.log("Sample formats (first 5):");
    info.format.slice(0, 5).forEach((f, i) => {
      console.log(`Format ${i}:`, {
        itag: f.itag,
        mimeType: f.mimeType,
        url: !!f.url,
        bitrate: f.bitrate,
      });
    });

    // Pilih format dengan URL (prioritas audio)
    let format = info.format.find(
      (f) => f.url && (f.mimeType?.includes("audio") || f.hasAudio === true),
    );
    if (!format) format = info.format.find((f) => f.url);
    if (!format) throw new Error("Tidak ada format dengan URL.");

    console.log(
      "✅ Selected format: itag=" +
        format.itag +
        ", mimeType=" +
        format.mimeType,
    );
    console.log("🔗 URL:", format.url);

    // Fetch URL dengan header
    const response = await fetch(format.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        Connection: "keep-alive",
        Referer: "https://www.youtube.com/",
      },
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const resource = createAudioResource(response.body, {
      inputType: "arbitrary",
    });
    resource.playStream.on("error", (err) => {
      console.error("❌ Resource stream error (fetch):", err);
    });

    queue.player.play(resource);
    console.log("✅ Playing using fallback (play-dl)");
    console.log("=================================");
  } catch (err) {
    console.error("❌ All methods failed:", err);
    queue.songs.shift();
    await playNext(guildId);
  }
}

/* ============================= */
/* CONTROLS */
/* ============================= */
function pause(guildId) {
  const queue = guildQueues.get(guildId);
  if (queue) queue.player.pause();
}

function resume(guildId) {
  const queue = guildQueues.get(guildId);
  if (queue) queue.player.unpause();
}

function stop(guildId) {
  const queue = guildQueues.get(guildId);
  if (!queue) return;

  // Hentikan pemutaran dan kosongkan antrian
  queue.songs = [];
  queue.player.stop();

  // Hancurkan koneksi hanya jika masih ada dan belum dihancurkan
  if (
    queue.connection &&
    queue.connection.state.status !== VoiceConnectionStatus.Destroyed
  ) {
    queue.connection.destroy();
  }

  guildQueues.delete(guildId);
}

function skip(guildId) {
  const queue = guildQueues.get(guildId);
  if (queue) queue.player.stop(); // stop akan memicu Idle, lalu next lagu
}

function getQueue(guildId) {
  const queue = guildQueues.get(guildId);
  return queue ? queue.songs : [];
}

module.exports = {
  playSong,
  pause,
  resume,
  stop,
  skip,
  getQueue,
};
