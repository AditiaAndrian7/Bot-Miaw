require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const config = require("./config");
const { generateResponse } = require("./services/aiService");
const { generatePDF } = require("./services/pdfService");
const { generatePPTX } = require("./services/pptxService");
const { sendSmartReply } = require("./utils/replyHandler");
const memoryService = require("./services/memoryService");
const MemberService = require("./services/memberService");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

let botActive = true;
let userTones = {};

// ===============================
// MEMBER SERVICE - TANPA HARDCODE
// ===============================
const memberService = new MemberService(client);

// ===============================
// CLIENT READY EVENT
// ===============================
client.once("clientReady", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`📊 Bot aktif di ${client.guilds.cache.size} server`);

  // Tampilkan daftar server
  client.guilds.cache.forEach((guild) => {
    console.log(`   - ${guild.name} (${guild.memberCount} members)`);
  });
});

// ===============================
// GUILD CREATE EVENT (Bot masuk server baru)
// ===============================
client.on("guildCreate", async (guild) => {
  console.log(`📥 Bot ditambahkan ke server baru: ${guild.name} (${guild.id})`);

  // Auto-set default config untuk server baru
  const defaultConfig = {
    welcomeChannelId: guild.systemChannel?.id || null,
    autoRoleName: "Member",
    welcomeEnabled: true,
    goodbyeEnabled: true,
    congratsEnabled: true,
    backgrounds: {
      welcome:
        "https://i.pinimg.com/originals/2f/24/61/2f24616bd3e4805e20b6a91cb3b6dbe4.gif",
      goodbye:
        "https://i.pinimg.com/originals/00/9b/aa/009baaa4b96631d3d90740aac3b8947a.gif",
      congrats:
        "https://i.pinimg.com/originals/2b/6e/e1/2b6ee1af25e9b5cfc412333b20183c75.gif",
    },
    messages: {
      welcome: [
        "✨ Selamat datang di **{server}**, {user}! 🎉",
        "Halo {user}, selamat bergabung di **{server}**! Semoga betah ya 🥳",
        "{user} just joined the party! 🎊",
        "🎈 Hai {user}, selamat datang! Jangan lupa baca rules ya 📚",
      ],
      goodbye: [
        "👋 Selamat tinggal {user}, semoga sukses di mana pun berada!",
        "{user} telah meninggalkan server **{server}**. Sampai jumpa lagi! 🫡",
        "Bye bye {user}, server jadi sepi tanpamu 😢",
      ],
      congrats: [
        "🎉 **Selamat** {user}! Kamu sekarang memiliki role **{role}**!",
        "🥳 {user} mendapatkan role baru: **{role}**!",
        "✨ {user} naik level! Role **{role}** telah ditambahkan!",
      ],
    },
  };

  await memberService.updateConfig(guild.id, defaultConfig);
  console.log(`✅ Config created for ${guild.name}`);
});

// ===============================
// GUILD DELETE EVENT (Bot keluar dari server)
// ===============================
client.on("guildDelete", (guild) => {
  console.log(`📤 Bot keluar dari server: ${guild.name} (${guild.id})`);
});

// ===============================
// ADMIN COMMANDS HANDLER
// ===============================
async function handleAdminCommands(message, command, args) {
  if (!message.member.permissions.has("Administrator")) {
    return message.reply(
      "❌ Kamu butuh permission **Administrator** untuk menggunakan command ini!",
    );
  }

  switch (command) {
    // ===== SIMPLE CHANNEL SETTER (PAKAI MENTION) =====
    case "setchannel":
    case "setchannel2": {
      const channel = message.mentions.channels.first();
      if (!channel) {
        return message.reply(
          "❌ Tag channel yang mau dijadikan welcome channel!\nContoh: `!setchannel #welcome`",
        );
      }

      await memberService.setWelcomeChannel(message.guild.id, channel.id);
      await message.reply(`✅ Welcome channel set to ${channel}!`);

      // Test kirim card
      setTimeout(() => {
        memberService.test(message, "welcome").catch(() => {});
      }, 1000);
      return;
    }

    // ===== INTERACTIVE CHANNEL PICKER =====
    case "pickchannel": {
      // Tampilkan daftar channel
      const channels = message.guild.channels.cache
        .filter((c) => c.type === 0) // 0 = text channel
        .map((c) => `#${c.name}`)
        .join("\n");

      await message.reply(
        "📋 **Daftar Text Channel:**\n" +
          "Ketik **nama channel** yang mau dipakai untuk welcome:\n\n" +
          channels,
      );

      // Collector untuk menunggu response
      const filter = (m) => m.author.id === message.author.id;
      const collector = message.channel.createMessageCollector({
        filter,
        time: 30000,
        max: 1,
      });

      collector.on("collect", async (m) => {
        const channelName = m.content.replace("#", "");
        const selectedChannel = message.guild.channels.cache.find(
          (c) => c.name === channelName,
        );

        if (selectedChannel) {
          await memberService.setWelcomeChannel(
            message.guild.id,
            selectedChannel.id,
          );
          m.reply(`✅ Welcome channel set to ${selectedChannel}!`);

          // Test kirim card
          setTimeout(() => {
            memberService.test(message, "welcome").catch(() => {});
          }, 1000);
        } else {
          m.reply(
            "❌ Channel tidak ditemukan. Coba lagi dengan `!pickchannel`",
          );
        }
      });

      collector.on("end", (collected) => {
        if (collected.size === 0) {
          message.reply("⏰ Timeout! Gunakan `!pickchannel` lagi.");
        }
      });
      return;
    }

    // ===== LIST ALL CHANNELS =====
    case "listchannel": {
      const channels = message.guild.channels.cache
        .filter((c) => c.type === 0)
        .map((c) => `#${c.name} (${c.id})`)
        .join("\n");

      return message.reply(`📋 **Daftar Text Channel:**\n${channels}`);
    }

    // ===== CHECK WELCOME CHANNEL =====
    case "cekwelcome": {
      const config = memberService.getConfig(message.guild.id);

      if (config.welcomeChannelId) {
        const channel = message.guild.channels.cache.get(
          config.welcomeChannelId,
        );
        if (channel) {
          return message.reply(
            `📢 **Welcome Channel:** ${channel}\n` +
              `**Auto Role:** ${config.autoRoleName}\n` +
              `**Welcome:** ${config.welcomeEnabled ? "✅" : "❌"} | ` +
              `**Goodbye:** ${config.goodbyeEnabled ? "✅" : "❌"} | ` +
              `**Congrats:** ${config.congratsEnabled ? "✅" : "❌"}`,
          );
        } else {
          return message.reply(
            `⚠️ Welcome channel ID: ${config.welcomeChannelId} tapi channel tidak ditemukan!`,
          );
        }
      } else {
        return message.reply(
          "❌ Belum ada welcome channel. Gunakan `!setchannel #channel`",
        );
      }
    }

    // ===== SET AUTO ROLE =====
    case "setrole": {
      const roleName = args.join(" ");
      if (!roleName) {
        return message.reply(
          "❌ Masukkan nama role!\nContoh: `!setrole Member`",
        );
      }

      await memberService.setAutoRole(message.guild.id, roleName);
      return message.reply(`✅ Auto role set to **${roleName}**`);
    }

    // ===== SET BACKGROUND =====
    case "setbg": {
      const type = args[0]; // welcome/goodbye/congrats
      const url = args[1];

      if (!type || !url || !["welcome", "goodbye", "congrats"].includes(type)) {
        return message.reply(
          "❌ Format salah!\nContoh: `!setbg welcome https://url-gambar.gif`",
        );
      }

      await memberService.setBackground(message.guild.id, type, url);
      return message.reply(`✅ Background **${type}** updated!`);
    }

    // ===== SET CUSTOM MESSAGE =====
    case "setmsg": {
      const type = args[0];
      const msg = args.slice(1).join(" ");

      if (!type || !msg || !["welcome", "goodbye", "congrats"].includes(type)) {
        return message.reply(
          "❌ Format salah!\nContoh: `!setmsg welcome Selamat datang {user} di {server}!`",
        );
      }

      await memberService.setMessage(message.guild.id, type, msg);
      return message.reply(`✅ **${type}** message updated!`);
    }

    // ===== TOGGLE FEATURE =====
    case "toggle": {
      const feature = args[0];
      if (!feature || !["welcome", "goodbye", "congrats"].includes(feature)) {
        return message.reply("❌ Pilih: `welcome` / `goodbye` / `congrats`");
      }

      const config = memberService.getConfig(message.guild.id);
      await memberService.toggleFeature(message.guild.id, feature);

      const newStatus = !config[`${feature}Enabled`];
      return message.reply(
        `✅ **${feature}** ${newStatus ? "✅ enabled" : "❌ disabled"}`,
      );
    }

    // ===== VIEW CONFIG =====
    case "config": {
      const config = memberService.getConfig(message.guild.id);

      const embed = {
        color: 0x0099ff,
        title: "⚙️ Server Configuration",
        fields: [
          {
            name: "📢 Welcome Channel",
            value: config.welcomeChannelId
              ? `<#${config.welcomeChannelId}>`
              : "Not Set",
            inline: true,
          },
          {
            name: "👥 Auto Role",
            value: config.autoRoleName || "None",
            inline: true,
          },
          {
            name: "✅ Features",
            value: `Welcome: ${config.welcomeEnabled ? "✅" : "❌"} | Goodbye: ${config.goodbyeEnabled ? "✅" : "❌"} | Congrats: ${config.congratsEnabled ? "✅" : "❌"}`,
            inline: false,
          },
          {
            name: "💬 Welcome Message",
            value:
              config.messages?.welcome?.[0]?.substring(0, 100) + "..." ||
              "Default",
            inline: false,
          },
        ],
        footer: { text: `Server ID: ${message.guild.id}` },
      };

      return message.reply({ embeds: [embed] });
    }

    default:
      return null;
  }
}

// ===============================
// MESSAGE CREATE EVENT
// ===============================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!botActive) return;

  const prefix = config.prefix;

  // ===== CEK GAMBAR =====
  let imageUrl = null;
  if (message.attachments.size > 0) {
    const attachment = message.attachments.first();
    if (attachment.contentType?.startsWith("image")) {
      imageUrl = attachment.url;
    }
  }

  /* ======================================
     PREFIX COMMANDS
  ====================================== */
  if (message.content.startsWith(prefix)) {
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const userId = message.author.id;
    const username = message.author.username;

    /* ===== CEK ADMIN COMMANDS DULU ===== */
    const adminResult = await handleAdminCommands(message, command, args);
    if (adminResult) return adminResult;

    /* ===== MEMBER TEST ===== */
    if (command === "welcome") {
      return memberService.test(message, "welcome");
    }

    if (command === "goodbye") {
      return memberService.test(message, "goodbye");
    }

    if (command === "congrats") {
      return memberService.test(message, "congrats");
    }

    /* ===== UTILITY COMMANDS ===== */
    if (command === "ping") {
      const sent = await message.channel.send("🏓 Pong...");
      return sent.edit(
        `Pong! Latency: ${sent.createdTimestamp - message.createdTimestamp}ms`,
      );
    }

    if (command === "info") {
      return message.reply(
        ` **Bot Miaw**\n` +
          `Nama: ${client.user.tag}\n` +
          `Server: ${client.guilds.cache.size} server\n` +
          `Member Total: ${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)} users\n` +
          `Dibuat oleh: <@1234411792785215528>\n` +
          `Versi: 2.0`,
      );
    }

    if (command === "server") {
      const config = memberService.getConfig(message.guild.id);
      return message.reply(
        `**Server Info**\n` +
          `Nama: ${message.guild.name}\n` +
          `ID: ${message.guild.id}\n` +
          `Member: ${message.guild.memberCount}\n` +
          `Owner: <@${message.guild.ownerId}>\n` +
          `Welcome Channel: ${config.welcomeChannelId ? `<#${config.welcomeChannelId}>` : "Not Set"}\n` +
          `Auto Role: ${config.autoRoleName || "None"}`,
      );
    }

    if (command === "user") {
      const mentioned = message.mentions.users.first() || message.author;
      const member = message.guild.members.cache.get(mentioned.id);
      return message.reply(
        `**User Info**\n` +
          `Nama: ${mentioned.username}\n` +
          `ID: ${mentioned.id}\n` +
          `Join: <t:${Math.floor(member.joinedAt / 1000)}:R>\n` +
          `Roles: ${member.roles.cache.size - 1} roles`,
      );
    }

    /* ===== MENU ===== */
    if (command === "menu") {
      return message.reply({
        content: `
\`\`\`
📜 BOT MENU

⚙️ UTILITY
!ping              - Cek latency bot
!info              - Info bot
!server            - Info server
!user @mention     - Info user

⚒️ TOOLS
!ppt <topik>       - Buat presentasi
!makalah <topik>   - Buat makalah  
!critical <topik>  - Analisis kritis

🎶 MUSIC
!music play <judul>  - Putar lagu
!music pause         - Jeda
!music resume        - Lanjut
!music skip          - Lewati
!music stop          - Berhenti
!music queue         - Antrian

🎭 TONE
!tone lembut      - Tone ramah
!tone tegas       - Tone profesional  
!tone pemarah     - Tone marah
!tone santai      - Tone santai
!tone default     - Reset tone

⚙️ ADMIN (butuh Admin)
!setchannel #channel        - Set welcome channel (pakai mention)
!pickchannel               - Pilih channel dari daftar
!listchannel               - Lihat semua channel
!cekwelcome                - Cek welcome channel yg sudah diset
!setrole <nama>            - Set auto role
!setbg [type] [url]        - Set background
!setmsg [type] [pesan]     - Set custom message
!toggle [feature]          - Enable/disable fitur
!config                     - Lihat config server
\`\`\`
`,
        allowedMentions: { repliedUser: false },
      });
    }

    /* ===== TONE ===== */
    if (command === "tone") {
      const selected = args[0];

      if (!selected || selected === "default") {
        delete userTones[userId];
        return message.reply("🎭 Tone dikembalikan ke default.");
      }

      if (!config.tones[selected]) {
        return message.reply(
          "Tone tidak tersedia. Pilih: lembut, tegas, pemarah, santai",
        );
      }

      userTones[userId] = selected;
      return message.reply(`🎭 Tone diubah ke: **${selected}**`);
    }
    /* ======================================
    MUSIC SECTION
    ====================================== */

    if (command === "music") {
      const subCommand = args[0]?.toLowerCase();
      const query = args.slice(1).join(" ");

      const musicService = require("./services/musicService");

      try {
        switch (subCommand) {
          case "play":
            if (!query)
              return message.reply(
                "Masukkan judul lagu!\nContoh: `!music play about you`",
              );

            if (!message.member.voice.channel) {
              return message.reply("Kamu harus join voice channel dulu!");
            }

            // Cek apakah ada lagu yang sedang diputar
            const currentSong = musicService.getCurrentSong(message.guild.id);

            const result = await musicService.playSong(
              message.guild,
              message.member,
              query,
            );

            // Kalau ada lagu yang sedang diputar, kasih notifikasi queue
            if (currentSong) {
              const queueLength = musicService.getQueue(
                message.guild.id,
              ).length;
              return message.reply(
                `📥 **Lagu ditambahkan ke antrian**\n` +
                  `Posisi: **${queueLength}** dalam antrian\n` +
                  `${result}`,
              );
            } else {
              return message.reply(result);
            }

          case "pause":
            const pauseQueue = musicService.getQueue(message.guild.id);
            if (!pauseQueue.length) {
              return message.reply("📭 Tidak ada lagu yang sedang diputar.");
            }
            musicService.pause(message.guild.id);
            return message.reply(
              "⏸️ **Musik dijeda**\nGunakan `!music resume` untuk melanjutkan.",
            );

          case "resume":
            const resumeQueue = musicService.getQueue(message.guild.id);
            if (!resumeQueue.length) {
              return message.reply("📭 Tidak ada lagu yang sedang diputar.");
            }
            musicService.resume(message.guild.id);
            return message.reply("▶️ **Musik dilanjutkan**");

          case "stop":
            const stopQueue = musicService.getQueue(message.guild.id);
            if (!stopQueue.length) {
              return message.reply("📭 Antrian sudah kosong.");
            }
            musicService.stop(message.guild.id);
            return message.reply(
              "⏹️ **Musik dihentikan**\nAntrian telah dikosongkan.",
            );

          case "skip":
            const skipQueue = musicService.getQueue(message.guild.id);
            if (!skipQueue.length) {
              return message.reply("📭 Tidak ada lagu untuk dilewati.");
            }
            const skippedSong = musicService.getCurrentSong(message.guild.id);
            musicService.skip(message.guild.id);
            return message.reply(
              `⏭️ **Lagu dilewati:** ${skippedSong?.title || "Unknown"}`,
            );

          case "queue":
            const queue = musicService.getQueue(message.guild.id);
            const current = musicService.getCurrentSong(message.guild.id);

            if (!queue.length && !current) {
              return message.reply(
                "**Antrian kosong**\nGunakan `!music play [judul]` untuk memutar lagu.",
              );
            }

            let queueText = "";

            // Lagu yang sedang diputar
            if (current) {
              const currentMinutes = Math.floor(current.duration / 60);
              const currentSeconds = current.duration % 60;
              queueText += `**🎵 Sedang Diputar:**\n`;
              queueText += `${current.title} (${currentMinutes}:${currentSeconds.toString().padStart(2, "0")}) - <@${current.requestedBy}>\n\n`;
            }

            // Antrian
            if (queue.length > 0) {
              queueText += `**📋 Antrian (${queue.length} lagu):**\n`;
              queue.forEach((song, i) => {
                const minutes = Math.floor(song.duration / 60);
                const seconds = song.duration % 60;
                queueText += `${i + 1}. ${song.title} (${minutes}:${seconds.toString().padStart(2, "0")}) - <@${song.requestedBy}>\n`;
              });
            }

            return message.reply(queueText);

          case "now":
          case "current":
            const currentNow = musicService.getCurrentSong(message.guild.id);
            if (!currentNow) {
              return message.reply("📭 Tidak ada lagu yang sedang diputar.");
            }
            const nowMinutes = Math.floor(currentNow.duration / 60);
            const nowSeconds = currentNow.duration % 60;
            return message.reply(
              `🎵 **Sedang Diputar:**\n` +
                `${currentNow.title} (${nowMinutes}:${nowSeconds.toString().padStart(2, "0")})\n` +
                `Diminta oleh: <@${currentNow.requestedBy}>`,
            );

          default:
            return message.reply(
              "🎵 **Music Commands:**\n" +
                "`!music play [judul]` - Putar lagu dari SoundCloud\n" +
                "`!music pause` - Jeda lagu\n" +
                "`!music resume` - Lanjutkan lagu\n" +
                "`!music skip` - Lewati lagu\n" +
                "`!music stop` - Berhenti dan kosongkan antrian\n" +
                "`!music queue` - Lihat antrian\n" +
                "`!music now` - Lihat lagu yang sedang diputar\n" +
                "\n**Tips:** YouTube saat ini diblokir, gunakan judul lagu biasa dan bot akan mencari di SoundCloud!",
            );
        }
      } catch (err) {
        console.error("Music Error:", err);

        // Handle specific errors
        if (err.message.includes("SoundCloud")) {
          return message.reply(
            "❌ **SoundCloud Error**\n" +
              "Lagu tidak ditemukan di SoundCloud. Coba judul lain atau cek ejaan.",
          );
        } else if (err.message.includes("voice channel")) {
          return message.reply("Kamu harus join voice channel dulu!");
        } else {
          return message.reply(`**Error:** ${err.message}`);
        }
      }
    }

    /* ======================================
      TOOLS SECTION
    ====================================== */

    /* ===== PPT ===== */
    if (command === "ppt") {
      const topic = args.join(" ");
      if (!topic)
        return message.reply(
          "📊 Masukkan topik PPT!\nContoh: `!ppt Artificial Intelligence`",
        );

      await message.channel.sendTyping();

      const aiRaw = await generateResponse({
        userMessage: `Buat presentasi tentang "${topic}".

Output WAJIB dalam format JSON valid:

{
  "title": "Judul Presentasi",
  "author": "${username}",
  "slides": [
    {
      "title": "Judul Slide",
      "points": ["Bullet 1", "Bullet 2"]
    }
  ]
}

Aturan:
- Maksimal 5 bullet per slide
- Bullet singkat
- Tidak boleh teks di luar JSON`,
        toneInstruction: userTones[userId]
          ? config.tones[userTones[userId]]
          : "",
        toolInstruction: config.tools.ppt,
        imageUrl,
      });

      let parsed;
      try {
        const jsonMatch = aiRaw.match(/```json([\s\S]*?)```/);
        const cleanJson = jsonMatch ? jsonMatch[1].trim() : aiRaw.trim();
        parsed = JSON.parse(cleanJson);
      } catch (err) {
        console.log("AI RAW OUTPUT:\n", aiRaw);
        return message.reply("❌ AI gagal menghasilkan format PPT yang valid.");
      }

      const filePath = await generatePPTX({ data: parsed, userId });

      return message.reply({
        content: "📊 **PPT berhasil dibuat!**",
        files: [filePath],
      });
    }

    /* ===== MAKALAH ===== */
    if (command === "makalah") {
      const topic = args.join(" ");
      if (!topic)
        return message.reply(
          "📝 Masukkan topik makalah!\nContoh: `!makalah Perubahan Iklim`",
        );

      await message.channel.sendTyping();

      const aiText = await generateResponse({
        userMessage: `Buat makalah lengkap tentang "${topic}" dengan struktur:

Judul (huruf kapital semua)

ABSTRAK

BAB I PENDAHULUAN
1.1 Latar Belakang
1.2 Rumusan Masalah
1.3 Tujuan

BAB II PEMBAHASAN
2.1 ...
2.2 ...
2.3 ...

BAB III PENUTUP
3.1 Kesimpulan
3.2 Saran

DAFTAR PUSTAKA

Gunakan bahasa formal akademik.`,
        toneInstruction: userTones[userId]
          ? config.tones[userTones[userId]]
          : "",
        toolInstruction: config.tools.makalah,
        imageUrl,
      });

      const filePath = await generatePDF({
        text: aiText,
        username,
        userId,
        title: `Makalah tentang ${topic}`,
      });

      return message.reply({
        content: "📄 **Makalah berhasil dibuat!**",
        files: [filePath],
      });
    }

    /* ===== CRITICAL ===== */
    if (command === "critical") {
      const topic = args.join(" ");
      if (!topic)
        return message.reply(
          "🤔 Masukkan topik!\nContoh: `!critical Dampak Media Sosial`",
        );

      await message.channel.sendTyping();

      const reply = await generateResponse({
        userMessage: topic,
        toneInstruction: userTones[userId]
          ? config.tones[userTones[userId]]
          : "",
        toolInstruction: config.tools.critical,
        imageUrl,
      });

      return sendSmartReply(message, reply);
    }

    return;
  }

  /* ======================================
     MENTION MODE
  ====================================== */
  if (message.mentions.has(client.user)) {
    try {
      const cleaned = message.content
        .replace(`<@${client.user.id}>`, "")
        .replace(`<@!${client.user.id}>`, "")
        .trim();
      if (!cleaned) return;

      await message.channel.sendTyping();

      const userId = message.author.id;
      const history = memoryService.getMemory(userId);
      const toneInstruction = userTones[userId]
        ? config.tones[userTones[userId]]
        : "";

      const reply = await generateResponse({
        userMessage: cleaned,
        history,
        toneInstruction,
        imageUrl,
      });

      memoryService.saveMemory(userId, cleaned, reply);
      await sendSmartReply(message, reply);
    } catch (err) {
      console.error("AI Error:", err);
      await message.reply({
        content: "❌ Terjadi error saat memproses AI.",
        allowedMentions: { repliedUser: false },
      });
    }
  }
});

// ===============================
// ERROR HANDLING
// ===============================
process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled promise rejection:", error);
});

client.login(process.env.DISCORD_TOKEN);
