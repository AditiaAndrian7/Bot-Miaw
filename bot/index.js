require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const config = require("./config");
const { generateResponse } = require("./services/aiService");
const { generatePDF } = require("./services/pdfService");
const { generatePPTX } = require("./services/pptxService");
const { sendSmartReply } = require("./utils/replyHandler");
const memoryService = require("./services/memoryService");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

let botActive = true;
let userTones = {};

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

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

    /* ===== UTILITY COMMANDS ===== */
    if (command === "ping") {
      const sent = await message.channel.send("🏓 Pong...");
      return sent.edit(
        `Pong! Latency: ${sent.createdTimestamp - message.createdTimestamp}ms`,
      );
    }

    if (command === "info") {
      return message.reply(
        `Saya adalah bot Miaw versi 1.0, dibuat oleh <@${"1234411792785215528"}>`,
      );
    }

    if (command === "server") {
      return message.reply(
        `Server ini bernama: ${message.guild.name}, total member: ${message.guild.memberCount}`,
      );
    }

    if (command === "user") {
      const mentioned = message.mentions.users.first() || message.author;
      return message.reply(`Nama: ${mentioned.username}\nID: ${mentioned.id}`);
    }

    /* ===== MENU ===== */
    if (command === "menu") {
      return message.reply({
        content: `
📜 **BOT MENU**

🔹 Utility:
!ping
!info
!server
!user @mention

🔹 Tools:
!ppt <topik>
!makalah <topik>
!critical <topik>

🔹 Tone:
!tone lembut
!tone tegas
!tone pemarah
!tone santai
!tone default
`,
        allowedMentions: { repliedUser: false },
      });
    }

    /* ===== TONE ===== */
    if (command === "tone") {
      const selected = args[0];

      if (!selected || selected === "default") {
        delete userTones[userId];
        return message.reply("Tone dikembalikan ke default.");
      }

      if (!config.tones[selected]) {
        return message.reply("Tone tidak tersedia.");
      }

      userTones[userId] = selected;
      return message.reply(`Tone diubah ke: ${selected}`);
    }

    /* ===== MUSIC ===== */
    if (command === "music") {
      const subCommand = args[0]?.toLowerCase();
      const keyword = args.slice(1).join(" ");
      const userId = message.author.id;

      const musicService = require("./services/musicService");

      try {
        switch (subCommand) {
          case "play":
            if (!keyword)
              return message.reply("Masukkan lagu yang ingin diputar!");

            const currentQueue = musicService.getQueue(message.guild.id);
            const wasEmpty = currentQueue.length === 0;

            const songTitle = await musicService.playSong(
              message.guild,
              message.member,
              keyword,
            );

            if (wasEmpty) {
              return message.reply(`🎶 **Memulai lagu:** ${songTitle}`);
            } else {
              return message.reply(
                `📥 **Menambahkan ke antrian:** ${songTitle}`,
              );
            }

          case "pause":
            musicService.pause(message.guild.id);
            return message.reply("⏸️ Musik dijeda.");

          case "resume":
            musicService.resume(message.guild.id);
            return message.reply("▶️ Musik dilanjutkan.");

          case "stop":
            musicService.stop(message.guild.id);
            return message.reply("⏹️ Musik dihentikan.");

          case "skip":
            musicService.skip(message.guild.id);
            return message.reply("⏭️ Lagu dilewati.");

          case "queue":
            const queueList = musicService.getQueue(message.guild.id);
            if (!queueList.length) return message.reply("Antrian kosong.");
            return message.reply(
              "🎵 **Antrian saat ini:**\n" +
                queueList.map((s, i) => `${i + 1}. ${s.title}`).join("\n"),
            );

          default:
            return message.reply(
              "Gunakan: `!music play [judul]`, `pause`, `resume`, `stop`, `skip`, `queue`",
            );
        }
      } catch (err) {
        console.error("Music Error:", err);
        return message.reply(`Terjadi error: ${err.message}`);
      }
    }

    /* ======================================
      TOOLS SECTION
    ====================================== */

    /* ===== PPT ===== */
    if (command === "ppt") {
      const topic = args.join(" ");
      if (!topic) return message.reply("Masukkan topik PPT.");

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
        return message.reply("AI gagal menghasilkan format PPT yang valid.");
      }

      const filePath = await generatePPTX({
        data: parsed,
        userId,
      });

      return message.reply({
        content: "PPT berhasil dibuat:",
        files: [filePath],
      });
    }

    if (command === "makalah") {
      const topic = args.join(" ");
      if (!topic) return message.reply("Masukkan topik makalah.");

      await message.channel.sendTyping();

      const aiText = await generateResponse({
        userMessage: `Buat makalah lengkap tentang "${topic}" dengan struktur:

BAB I PENDAHULUAN
1.1 Latar Belakang
1.2 Rumusan Masalah
1.3 Tujuan

BAB II PEMBAHASAN

BAB III PENUTUP
3.1 Kesimpulan
3.2 Saran

DAFTAR PUSTAKA

Gunakan bahasa formal akademik.`,
        toneInstruction: userTones[userId]
          ? config.tones[userTones[userId]]
          : "",
        toolInstruction: config.tools.makalah,
        imageUrl, // Kirim gambar ke AI jika ada
      });

      const filePath = await generatePDF({
        text: aiText,
        username,
        userId,
        title: `Makalah tentang ${topic}`,
      });

      return message.reply({
        content: "Makalah berhasil dibuat:",
        files: [filePath],
      });
    }

    /* ===== CRITICAL ===== */
    if (command === "critical") {
      const topic = args.join(" ");
      if (!topic) return message.reply("Masukkan topik.");

      await message.channel.sendTyping();

      const reply = await generateResponse({
        userMessage: topic,
        toneInstruction: userTones[userId]
          ? config.tones[userTones[userId]]
          : "",
        toolInstruction: config.tools.critical,
        imageUrl, // Kirim gambar ke AI jika ada
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
        imageUrl, // Kirim gambar ke AI jika ada
      });

      memoryService.saveMemory(userId, cleaned, reply);
      await sendSmartReply(message, reply);
    } catch (err) {
      console.error("AI Error:", err);
      await message.reply({
        content: "Terjadi error saat memproses AI.",
        allowedMentions: { repliedUser: false },
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
