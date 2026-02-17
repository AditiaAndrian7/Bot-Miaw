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

// Path ke binary yt-dlp
const YT_DLP_PATH = path.join(
  __dirname,
  "..",
  "..",
  "bin",
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
);

// Path ke cookies
const COOKIE_PATH = path.join(__dirname, "../cookies.txt");
const HAS_COOKIES = fs.existsSync(COOKIE_PATH);

if (HAS_COOKIES) {
  console.log("🍪 YouTube cookies found");
} else {
  console.log("⚠️ No YouTube cookies found (YouTube may be blocked)");
}

// Map untuk menyimpan antrian per guild
const guildQueues = new Map();

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
/* SEARCH LAGU */
/* ============================= */
async function searchSong(keyword) {
  try {
    console.log(`🔍 Searching: ${keyword}`);

    if (soundcloudInitPromise) {
      await soundcloudInitPromise;
    }

    // Cek URL YouTube
    if (play.yt_validate(keyword) === "video") {
      const info = await play.video_info(keyword);
      return {
        title: info.video_details.title,
        url: info.video_details.url,
        duration: info.video_details.durationInSec,
        thumbnail: info.video_details.thumbnails[0]?.url || null,
        source: "youtube",
      };
    }

    // Cek URL SoundCloud
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

    // Search SoundCloud (prioritas)
    if (soundcloudReady) {
      try {
        const scResults = await play.search(keyword, {
          limit: 1,
          source: { soundcloud: "tracks" },
        });

        if (scResults.length > 0) {
          console.log("Found on SoundCloud");
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

    // Fallback YouTube
    const ytResults = await play.search(keyword, {
      limit: 1,
      source: { youtube: "video" },
    });

    if (ytResults.length > 0) {
      console.log("Found on YouTube");
      return {
        title: ytResults[0].title,
        url: ytResults[0].url,
        duration: ytResults[0].durationInSec,
        thumbnail: ytResults[0].thumbnails[0]?.url || null,
        source: "youtube",
      };
    }

    throw new Error("Lagu tidak ditemukan");
  } catch (err) {
    console.error("Search error:", err);
    throw err;
  }
}

/* ============================= */
/* GET AUDIO STREAM - DENGAN COOKIES */
/* ============================= */
async function getAudioStream(song) {
  try {
    console.log(`Streaming from ${song.source}...`);

    if (song.source === "soundcloud") {
      if (!soundcloudReady) throw new Error("SoundCloud not ready");

      const stream = await play.stream(song.url, {
        quality: 2,
        seek: 0,
        discorder: true,
      });

      return {
        stream: stream.stream,
        type: stream.type,
        method: "soundcloud",
      };
    } else {
      // YouTube - yt-dlp dengan cookies
      if (fs.existsSync(YT_DLP_PATH)) {
        try {
          console.log("Trying yt-dlp with cookies...");

          // Build command dengan cookies
          let command = `"${YT_DLP_PATH}" -f bestaudio --get-url "${song.url}"`;
          if (HAS_COOKIES) {
            command = `"${YT_DLP_PATH}" --cookies "${COOKIE_PATH}" -f bestaudio --get-url "${song.url}"`;
          }

          const { stdout } = await execPromise(command, { timeout: 30000 });
          const audioUrl = stdout.trim();

          if (!audioUrl) {
            throw new Error("No audio URL from yt-dlp");
          }

          console.log("Fetching audio stream...");
          const response = await fetch(audioUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              Accept: "*/*",
              Referer: "https://www.youtube.com/",
            },
          });

          if (response.ok) {
            console.log(
              "✅ yt-dlp successful" + (HAS_COOKIES ? " (with cookies)" : ""),
            );
            return {
              stream: response.body,
              method: "yt-dlp",
            };
          } else {
            throw new Error(`HTTP ${response.status}`);
          }
        } catch (err) {
          console.log(`❌ yt-dlp failed: ${err.message}`);
        }
      }

      // Fallback play-dl
      if (!song.url) {
        throw new Error("No valid URL for play-dl");
      }

      console.log("Trying play-dl...");
      try {
        const stream = await play.stream(song.url);
        console.log("✅ play-dl successful");
        return {
          stream: stream.stream,
          type: stream.type,
          method: "play-dl",
        };
      } catch (playErr) {
        console.log(`❌ play-dl failed: ${playErr.message}`);
        throw playErr;
      }
    }
  } catch (err) {
    console.error("Stream error:", err);
    throw err;
  }
}

/* ============================= */
/* PLAY SONG */
/* ============================= */
async function playSong(guild, member, keyword) {
  if (!member.voice.channel) {
    throw new Error("Kamu harus join voice channel dulu!");
  }

  console.log(`Play: ${member.user.tag} -> ${keyword}`);

  const song = await searchSong(keyword);
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
    };

    guildQueues.set(guild.id, queue);

    player.on(AudioPlayerStatus.Idle, async () => {
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

  queue.songs.push({
    ...song,
    requestedBy: member.user.id,
  });

  if (queue.songs.length === 1) {
    await playNext(guild.id);
  } else {
    console.log(`Added to queue (position ${queue.songs.length})`);
  }

  const sourceEmoji = song.source === "soundcloud" ? "🔊" : "▶️";
  return `${sourceEmoji} **${song.title}**`;
}

/* ============================= */
/* PLAY NEXT */
/* ============================= */
async function playNext(guildId) {
  const queue = guildQueues.get(guildId);
  if (!queue || queue.songs.length === 0) return;

  const song = queue.songs[0];

  try {
    console.log("=================================");
    console.log(`Now Playing: ${song.title}`);
    console.log(`Source: ${song.source}`);
    console.log(`URL: ${song.url}`);

    if (!song.url) {
      throw new Error("Invalid song URL");
    }

    const { stream, method } = await getAudioStream(song);
    console.log(`Stream: ${method}`);

    const resource = createAudioResource(stream, {
      inputType: method === "soundcloud" ? undefined : "arbitrary",
    });

    queue.player.play(resource);
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

// Panggil fungsi download
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
  queue.songs = [];
  queue.player.stop();
  queue.connection?.destroy();
  guildQueues.delete(guildId);
}

function skip(guildId) {
  const queue = guildQueues.get(guildId);
  if (queue) {
    console.log(`Skipping in guild ${guildId}`);
    queue.player.stop();
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

module.exports = {
  playSong,
  pause,
  resume,
  stop,
  skip,
  getQueue,
  getCurrentSong,
};
