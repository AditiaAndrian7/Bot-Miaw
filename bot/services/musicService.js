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
const crypto = require("crypto");

process.env.FFMPEG_PATH = pathToFfmpeg;

const YT_DLP_PATH = path.join(
  __dirname,
  "..",
  "..",
  "bin",
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
);

// Folder untuk menyimpan lagu sementara
const TEMP_MUSIC_DIR = path.join(__dirname, "../temp/music");
if (!fs.existsSync(TEMP_MUSIC_DIR)) {
  fs.mkdirSync(TEMP_MUSIC_DIR, { recursive: true });
  console.log(`📁 Created temp music directory: ${TEMP_MUSIC_DIR}`);
}

const guildQueues = new Map();
const songFiles = new Map();

// ============================================
// CLEANUP FUNCTION
// ============================================
function cleanupSongFile(songId) {
  const filePath = songFiles.get(songId);
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Deleted temp file: ${path.basename(filePath)}`);
      songFiles.delete(songId);
    } catch (err) {
      console.error(`Failed to delete temp file: ${err.message}`);
    }
  }
}

// ============================================
// DOWNLOAD & CONVERT LAGU
// ============================================
async function downloadAndConvert(song) {
  const songId = crypto.randomBytes(16).toString("hex");
  const outputPath = path.join(TEMP_MUSIC_DIR, `${songId}.mp3`);

  try {
    console.log(`📥 Downloading: ${song.title}`);

    if (song.source === "soundcloud") {
      if (!soundcloudReady) throw new Error("SoundCloud not ready");

      const stream = await play.stream(song.url, {
        quality: 2,
        discorder: true,
      });

      const fileStream = fs.createWriteStream(outputPath);

      await new Promise((resolve, reject) => {
        stream.stream.pipe(fileStream);
        stream.stream.on("end", resolve);
        stream.stream.on("error", reject);
      });
    } else if (song.source === "youtube") {
      if (!fs.existsSync(YT_DLP_PATH)) {
        throw new Error("yt-dlp not found");
      }

      const ffmpegPath = pathToFfmpeg;

      console.log(`🎬 Using ffmpeg at: ${ffmpegPath}`);
      console.log(`🎬 yt-dlp at: ${YT_DLP_PATH}`);

      await execPromise(
        `"${YT_DLP_PATH}" --ffmpeg-location "${ffmpegPath}" -f bestaudio --extract-audio --audio-format mp3 -o "${outputPath}" "${song.url}"`,
        { timeout: 120000 },
      );
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error("Download failed - file not created");
    }

    const stats = fs.statSync(outputPath);
    console.log(
      `✅ Downloaded: ${song.title} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`,
    );

    songFiles.set(songId, outputPath);

    return {
      path: outputPath,
      songId: songId,
    };
  } catch (err) {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    console.error(`Download failed: ${err.message}`);
    throw err;
  }
}

// ============================================
// SOUNDCLOUD CLIENT ID
// ============================================
const SOUNDCLOUD_CLIENT_ID = "EnTrn2ZjaZXfOU7iRsFicZvTOi1Pl3rK";
let soundcloudReady = false;
let soundcloudInitPromise = null;

async function initSoundCloud() {
  try {
    console.log("Initializing SoundCloud...");

    play.setToken({
      soundcloud: {
        client_id: SOUNDCLOUD_CLIENT_ID,
      },
    });

    const test = await play
      .search("test", {
        source: { soundcloud: "tracks" },
        limit: 1,
      })
      .catch(() => null);

    if (test && test.length > 0) {
      console.log(`SoundCloud ready (ID: ${SOUNDCLOUD_CLIENT_ID})`);
      soundcloudReady = true;
      return true;
    } else {
      throw new Error("SoundCloud test failed");
    }
  } catch (err) {
    console.warn("SoundCloud unavailable, using YouTube only");
    soundcloudReady = false;
    return false;
  }
}

soundcloudInitPromise = initSoundCloud();

/* ============================= */
/* SEARCH LAGU - DENGAN YOUTUBE ERROR HANDLER */
/* ============================= */
async function searchSong(keyword, message = null) {
  try {
    console.log(`🔍 Searching: ${keyword}`);

    if (soundcloudInitPromise) {
      await soundcloudInitPromise;
    }

    // CEK URL YOUTUBE
    if (play.yt_validate(keyword) === "video") {
      try {
        console.log("📺 Detected YouTube URL, trying to fetch...");
        const info = await play.video_info(keyword);
        return {
          title: info.video_details.title,
          url: info.video_details.url,
          duration: info.video_details.durationInSec,
          thumbnail: info.video_details.thumbnails[0]?.url || null,
          source: "youtube",
        };
      } catch (ytErr) {
        // YouTube error - redirect ke SoundCloud search
        console.log("❌ YouTube error:", ytErr.message);

        // Extract judul dari URL atau kasih pesan
        if (message) {
          await message.reply(
            "⚠️ **YouTube sedang bermasalah** (kemungkinan diblokir).\n" +
              "Coba cari pakai **judul lagu** biasa, nanti bot cariin di SoundCloud!\n" +
              "Contoh: `!music play about you`",
          );
        }

        // Coba cari di SoundCloud pake judul dari URL atau keyword asli
        const searchQuery = keyword.includes("youtu")
          ? keyword.split("v=")[1]?.split("&")[0] || keyword
          : keyword;

        console.log(`🔄 Redirecting to SoundCloud search: ${searchQuery}`);

        // Cari di SoundCloud
        if (soundcloudReady) {
          const scResults = await play.search(searchQuery, {
            limit: 1,
            source: { soundcloud: "tracks" },
          });

          if (scResults.length > 0) {
            console.log("✅ Found on SoundCloud as fallback");
            return {
              title: scResults[0].name,
              url: scResults[0].url,
              duration: scResults[0].durationInSec,
              thumbnail: scResults[0].thumbnail,
              source: "soundcloud",
            };
          }
        }

        throw new Error("YouTube error dan tidak ditemukan di SoundCloud");
      }
    }

    // CEK URL SOUNDCLOUD
    if (play.so_validate(keyword) === "track") {
      if (soundcloudReady) {
        const info = await play.soundcloud(keyword);
        return {
          title: info.name,
          url: info.url,
          duration: info.durationInSec,
          thumbnail: info.thumbnail,
          source: "soundcloud",
        };
      }
    }

    // SEARCH SOUNDCLOUD (PRIORITAS)
    if (soundcloudReady) {
      try {
        const scResults = await play.search(keyword, {
          limit: 1,
          source: { soundcloud: "tracks" },
        });

        if (scResults.length > 0) {
          console.log("✅ Found on SoundCloud");
          return {
            title: scResults[0].name,
            url: scResults[0].url,
            duration: scResults[0].durationInSec,
            thumbnail: scResults[0].thumbnail,
            source: "soundcloud",
          };
        }
      } catch (scErr) {
        console.log("SoundCloud search failed, trying YouTube...");
      }
    }

    // FALLBACK YOUTUBE
    try {
      const ytResults = await play.search(keyword, {
        limit: 1,
        source: { youtube: "video" },
      });

      if (ytResults.length > 0) {
        console.log("✅ Found on YouTube");
        return {
          title: ytResults[0].title,
          url: ytResults[0].url,
          duration: ytResults[0].durationInSec,
          thumbnail: ytResults[0].thumbnails[0]?.url || null,
          source: "youtube",
        };
      }
    } catch (ytErr) {
      console.log("YouTube search failed:", ytErr.message);
    }

    throw new Error("Lagu tidak ditemukan");
  } catch (err) {
    console.error("Search error:", err);
    throw err;
  }
}

/* ============================= */
/* PLAY SONG - Modified dengan pesan error */
/* ============================= */
async function playSong(guild, member, keyword, message = null) {
  if (!member.voice.channel) {
    throw new Error("Kamu harus join voice channel dulu!");
  }

  console.log(`Play: ${member.user.tag} -> ${keyword}`);

  try {
    const song = await searchSong(keyword, message);

    let queue = guildQueues.get(guild.id);

    if (!queue) {
      console.log(`Connecting to ${guild.name}...`);

      const connection = joinVoiceChannel({
        channelId: member.voice.channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
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
        textChannel: member.channel,
        reconnectAttempts: 0,
        currentSongId: null,
      };

      guildQueues.set(guild.id, queue);

      player.on(AudioPlayerStatus.Idle, async () => {
        if (queue.currentSongId) {
          cleanupSongFile(queue.currentSongId);
          queue.currentSongId = null;
        }

        console.log("Song finished, playing next...");
        queue.songs.shift();

        if (queue.songs.length > 0) {
          await playNext(guild.id);
        } else {
          console.log("Queue empty, disconnecting in 60s");
          setTimeout(() => {
            const q = guildQueues.get(guild.id);
            if (q && q.songs.length === 0) {
              q.connection?.destroy();
              guildQueues.delete(guild.id);
            }
          }, 60000);
        }
      });

      player.on("error", async (err) => {
        console.error("Player error:", err.message);

        if (queue.currentSongId) {
          cleanupSongFile(queue.currentSongId);
          queue.currentSongId = null;
        }

        if (queue.reconnectAttempts < 3) {
          queue.reconnectAttempts++;
          console.log(`Reconnecting attempt ${queue.reconnectAttempts}...`);

          setTimeout(() => {
            if (queue.songs.length > 0) {
              playNext(guild.id);
            }
          }, 2000);
        } else {
          console.log("Max reconnection attempts reached, skipping song");
          queue.reconnectAttempts = 0;
          queue.songs.shift();
          await playNext(guild.id);
        }
      });

      player.on("stateChange", (oldState, newState) => {
        console.log(`Player: ${oldState.status} -> ${newState.status}`);
      });
    }

    console.log(`⏬ Downloading: ${song.title}...`);
    const { path: filePath, songId } = await downloadAndConvert(song);

    const songWithFile = {
      ...song,
      filePath: filePath,
      songId: songId,
      requestedBy: member.user.id,
    };

    queue.songs.push(songWithFile);
    console.log(
      `📦 Added to queue: ${song.title} (position ${queue.songs.length})`,
    );

    if (queue.songs.length === 1) {
      await playNext(guild.id);
    }

    const sourceEmoji = song.source === "soundcloud" ? "🔊" : "▶️";
    return `${sourceEmoji} **${song.title}**`;
  } catch (err) {
    // Khusus untuk YouTube error, kasih pesan friendly
    if (
      err.message.includes("Sign in to confirm") ||
      err.message.includes("403")
    ) {
      throw new Error(
        "⚠️ **YouTube sedang diblokir** di server ini.\n" +
          "Coba cari pakai **judul lagu** biasa, nanti bot cariin di SoundCloud!\n" +
          "Contoh: `!music play about you`",
      );
    }
    throw err;
  }
}

/* ============================= 
 PLAY NEXT 
============================= */
async function playNext(guildId) {
  const queue = guildQueues.get(guildId);
  if (!queue || queue.songs.length === 0) return;

  const song = queue.songs[0];

  try {
    console.log("=================================");
    console.log(`Now Playing: ${song.title}`);
    console.log(`Source: ${song.source}`);
    console.log(`File: ${path.basename(song.filePath)}`);

    if (!fs.existsSync(song.filePath)) {
      throw new Error("Downloaded file not found");
    }

    const resource = createAudioResource(song.filePath);
    queue.player.play(resource);

    queue.currentSongId = song.songId;
    queue.reconnectAttempts = 0;

    if (queue.textChannel) {
      const minutes = Math.floor(song.duration / 60);
      const seconds = song.duration % 60;
      const durationStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;
      const sourceEmoji = song.source === "soundcloud" ? "🔊" : "▶️";

      queue.textChannel
        .send({
          embeds: [
            {
              color: song.source === "soundcloud" ? 0xff7700 : 0xff0000,
              title: `${sourceEmoji} Now Playing`,
              description: `[${song.title}](${song.url})`,
              thumbnail: { url: song.thumbnail },
              fields: [
                {
                  name: "Duration",
                  value: durationStr,
                  inline: true,
                },
                {
                  name: "Requested by",
                  value: `<@${song.requestedBy}>`,
                  inline: true,
                },
              ],
            },
          ],
        })
        .catch(() => {});
    }

    console.log("=================================");
  } catch (err) {
    console.error("Playback failed:", err.message);
    cleanupSongFile(song.songId);
    queue.songs.shift();
    await playNext(guildId);
  }
}

/* ============================= */
/* DOWNLOAD YT-DLP UNTUK LINUX */
/* ============================= */
async function downloadYtDlp() {
  const ytDlpUrl =
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
  const binDir = path.join(__dirname, "..", "..", "bin");

  try {
    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true });
    }

    if (!fs.existsSync(YT_DLP_PATH)) {
      console.log("Downloading yt-dlp for Linux...");

      const response = await fetch(ytDlpUrl);
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(YT_DLP_PATH, Buffer.from(buffer));
      fs.chmodSync(YT_DLP_PATH, 0o755);

      console.log("✅ yt-dlp downloaded successfully");
    } else {
      console.log("✅ yt-dlp already exists");
    }
  } catch (err) {
    console.error("Failed to download yt-dlp:", err.message);
  }
}

if (process.platform !== "win32") {
  downloadYtDlp();
}

/* ============================= */
/* CONTROLS */
/* ============================= */
function pause(guildId) {
  const queue = guildQueues.get(guildId);
  if (queue) {
    queue.player.pause();
    console.log(`Paused in guild ${guildId}`);
  }
}

function resume(guildId) {
  const queue = guildQueues.get(guildId);
  if (queue) {
    queue.player.unpause();
    console.log(`Resumed in guild ${guildId}`);
  }
}

function stop(guildId) {
  const queue = guildQueues.get(guildId);
  if (!queue) return;

  console.log(`Stopping in guild ${guildId}`);

  queue.songs.forEach((song) => {
    cleanupSongFile(song.songId);
  });

  if (queue.currentSongId) {
    cleanupSongFile(queue.currentSongId);
  }

  queue.songs = [];
  queue.player.stop();
  queue.connection?.destroy();
  guildQueues.delete(guildId);
}

function skip(guildId) {
  const queue = guildQueues.get(guildId);
  if (queue) {
    if (queue.currentSongId) {
      cleanupSongFile(queue.currentSongId);
      queue.currentSongId = null;
    }
    queue.player.stop();
    console.log(`Skipping in guild ${guildId}`);
  }
}

function getQueue(guildId) {
  const queue = guildQueues.get(guildId);
  return queue ? queue.songs : [];
}

function getCurrentSong(guildId) {
  const queue = guildQueues.get(guildId);
  return queue?.songs[0] || null;
}

setInterval(() => {
  const files = fs.readdirSync(TEMP_MUSIC_DIR);
  const now = Date.now();

  files.forEach((file) => {
    const filePath = path.join(TEMP_MUSIC_DIR, file);
    const stats = fs.statSync(filePath);
    const age = now - stats.mtimeMs;

    if (age > 3600000) {
      fs.unlinkSync(filePath);
      console.log(`🧹 Cleaned up old temp file: ${file}`);
    }
  });
}, 3600000);

module.exports = {
  playSong,
  pause,
  resume,
  stop,
  skip,
  getQueue,
  getCurrentSong,
};
