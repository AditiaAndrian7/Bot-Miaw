require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const { generateResponse } = require("./services/aiService");
const { sendSmartReply } = require("./utils/replyHandler");
const memoryService = require("./services/memoryService");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let botActive = true;

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // =========================
  // COMMAND CONTROL
  // =========================
  if (message.content === "!bot off") {
    botActive = false;
    return message.reply({
      content: "Bot dinonaktifkan.",
      allowedMentions: { repliedUser: false },
    });
  }

  if (message.content === "!bot on") {
    botActive = true;
    return message.reply({
      content: "Bot diaktifkan.",
      allowedMentions: { repliedUser: false },
    });
  }

  if (!botActive) return;

  // =========================
  // MENTION DETECT
  // =========================
  if (!message.mentions.has(client.user)) return;

  try {
    const cleaned = message.content
      .replace(`<@${client.user.id}>`, "")
      .replace(`<@!${client.user.id}>`, "")
      .trim();

    const attachment = message.attachments.first();
    let imageUrl = null;

    if (attachment && attachment.contentType?.startsWith("image")) {
      imageUrl = attachment.url;
    }

    if (!cleaned && !imageUrl) return;

    await message.channel.sendTyping();

    // =========================
    // MEMORY GET
    // =========================
    const userId = message.author.id;
    const history = memoryService.getMemory(userId);

    const reply = await generateResponse(
      cleaned || "Jelaskan gambar ini.",
      imageUrl,
      history,
    );

    if (!reply) {
      return message.reply({
        content: "AI tidak memberikan respon.",
        allowedMentions: { repliedUser: false },
      });
    }

    // =========================
    // SAVE MEMORY
    // =========================
    memoryService.saveMemory(userId, cleaned, reply);

    // =========================
    // SMART REPLY (split / PDF)
    // =========================
    await sendSmartReply(message, reply);
  } catch (err) {
    console.error("AI Error:", err);
    await message.reply({
      content: "Terjadi error saat memproses AI.",
      allowedMentions: { repliedUser: false },
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
