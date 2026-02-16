const { AttachmentBuilder } = require("discord.js");
const { generateCard } = require("../utils/cardGenerator");
const fs = require("fs");
const path = require("path");

class MemberService {
  constructor(client, options = {}) {
    this.client = client;
    this.serverConfigs = new Map();
    this.configPath = path.join(__dirname, "../server-channels.json");
    this.loadConfigs();
    this.registerEvents();
  }

  loadConfigs() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, "utf8");
        const configs = JSON.parse(data);
        this.serverConfigs = new Map(Object.entries(configs));
        console.log(`✅ Loaded config for ${this.serverConfigs.size} servers`);
      } else {
        console.log("📝 Membuat file config baru...");
        fs.writeFileSync(this.configPath, JSON.stringify({}, null, 2));
      }
    } catch (err) {
      console.error("❌ Gagal load config:", err.message);
    }
  }

  saveConfigs() {
    try {
      const configs = Object.fromEntries(this.serverConfigs);
      fs.writeFileSync(this.configPath, JSON.stringify(configs, null, 2));
    } catch (err) {
      console.error("❌ Gagal save config:", err.message);
    }
  }

  getConfig(guildId) {
    const defaultConfig = {
      welcomeChannelId: null,
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
    };

    return this.serverConfigs.get(guildId) || defaultConfig;
  }

  async setWelcomeChannel(guildId, channelId) {
    const config = this.getConfig(guildId);
    config.welcomeChannelId = channelId;
    this.serverConfigs.set(guildId, config);
    this.saveConfigs();
  }

  async setAutoRole(guildId, roleName) {
    const config = this.getConfig(guildId);
    config.autoRoleName = roleName;
    this.serverConfigs.set(guildId, config);
    this.saveConfigs();
  }

  async setBackground(guildId, type, url) {
    const config = this.getConfig(guildId);
    if (!config.backgrounds) config.backgrounds = {};
    config.backgrounds[type] = url;
    this.serverConfigs.set(guildId, config);
    this.saveConfigs();
  }

  async setMessage(guildId, type, message) {
    const config = this.getConfig(guildId);
    if (!config.messages) config.messages = {};
    if (!config.messages[type]) config.messages[type] = [];
    config.messages[type] = [message];
    this.serverConfigs.set(guildId, config);
    this.saveConfigs();
  }

  async toggleFeature(guildId, feature) {
    const config = this.getConfig(guildId);
    const featureKey = `${feature}Enabled`;
    config[featureKey] = !config[featureKey];
    this.serverConfigs.set(guildId, config);
    this.saveConfigs();
  }

  registerEvents() {
    this.client.on("guildMemberAdd", (member) => this.handleWelcome(member));
    this.client.on("guildMemberRemove", (member) => this.handleGoodbye(member));
    this.client.on("guildMemberUpdate", (oldMember, newMember) =>
      this.handleRoleUpdate(oldMember, newMember),
    );
  }

  getChannel(guild) {
    const config = this.getConfig(guild.id);

    if (config.welcomeChannelId) {
      const channel = guild.channels.cache.get(config.welcomeChannelId);
      if (channel) return channel;
    }

    return null;
  }

  formatMessage(type, member, extra = {}) {
    const config = this.getConfig(member.guild.id);
    const mention = `<@${member.user.id}>`;
    const serverName = member.guild.name;

    // Default messages
    const defaultMessages = {
      welcome: [
        `✨ **Selamat datang** di **${serverName}**, ${mention}! 🎉`,
        `Halo ${mention}, selamat bergabung di server **${serverName}**! Semoga betah ya 🥳`,
        `${mention} just joined the party! 🎊 Selamat datang di **${serverName}**!`,
        `🎈 Hai ${mention}, selamat datang! Jangan lupa baca rules ya 📚`,
      ],
      goodbye: [
        `👋 Selamat tinggal ${mention}, semoga sukses di mana pun berada!`,
        `${mention} telah meninggalkan server **${serverName}**. Sampai jumpa lagi! 🫡`,
        `Bye bye ${mention}, server jadi sepi tanpamu 😢`,
        `🚪 ${mention} left the server. Semoga kita bertemu lagi!`,
      ],
      congrats: [
        `🎉 **Selamat** ${mention}! Kamu sekarang memiliki role **${extra.roleName}**!`,
        `🥳 ${mention} mendapatkan role baru: **${extra.roleName}**! Selamat!`,
        `✨ ${mention} naik level! Role **${extra.roleName}** telah ditambahkan!`,
        `🎈 Selamat ${mention}, kamu sekarang adalah **${extra.roleName}**!`,
      ],
    };

    // Gunakan custom messages jika ada
    const messages =
      config.messages?.[type] ||
      defaultMessages[type] ||
      defaultMessages.welcome;

    // Pilih random
    const randomIndex = Math.floor(Math.random() * messages.length);
    let message = messages[randomIndex];

    // Replace variables
    message = message
      .replace(/{user}/g, mention)
      .replace(/{server}/g, serverName)
      .replace(/{role}/g, extra.roleName || "");

    return message;
  }

  async sendCard(member, type, extra = {}) {
    try {
      const config = this.getConfig(member.guild.id);

      // Cek fitur enabled
      if (type === "welcome" && !config.welcomeEnabled) return;
      if (type === "goodbye" && !config.goodbyeEnabled) return;
      if (type === "congrats" && !config.congratsEnabled) return;

      const backgroundURL = config.backgrounds?.[type];
      if (!backgroundURL) {
        console.warn(
          `Background untuk ${type} tidak diset di server ${member.guild.id}`,
        );
        return;
      }

      console.log(`📤 Generating ${type} card for ${member.user.tag}...`);

      const buffer = await generateCard({
        member,
        type,
        backgroundURL,
        extra,
      });

      const isGif = backgroundURL.toLowerCase().endsWith(".gif");
      const attachment = new AttachmentBuilder(buffer, {
        name: `${type}_${member.user.id}.${isGif ? "gif" : "png"}`,
      });

      const channel = this.getChannel(member.guild);
      if (!channel) {
        console.warn(
          `⚠️ Tidak ada welcome channel di server ${member.guild.name} (${member.guild.id})`,
        );
        console.log(
          `ℹ️ Admin bisa set channel dengan: !setchannel2 #nama-channel`,
        );
        return;
      }

      const messageText = this.formatMessage(type, member, extra);

      await channel.send({
        content: messageText,
        files: [attachment],
      });

      console.log(`✅ Card ${type} sent successfully to ${member.user.tag}`);
    } catch (err) {
      console.error(`❌ Error sending ${type} card:`, err);
    }
  }

  async handleWelcome(member) {
    const config = this.getConfig(member.guild.id);

    // Kasih role otomatis
    if (config.autoRoleName) {
      const role = member.guild.roles.cache.find(
        (r) => r.name === config.autoRoleName,
      );
      if (role) {
        await member.roles
          .add(role)
          .catch((err) =>
            console.warn(
              `⚠️ Gagal kasih role ${config.autoRoleName}:`,
              err.message,
            ),
          );
      }
    }

    await this.sendCard(member, "welcome");
  }

  async handleGoodbye(member) {
    await this.sendCard(member, "goodbye");
  }

  async handleRoleUpdate(oldMember, newMember) {
    if (oldMember.roles.cache.size < newMember.roles.cache.size) {
      const addedRole = newMember.roles.cache.find(
        (role) => !oldMember.roles.cache.has(role.id),
      );

      if (addedRole) {
        await this.sendCard(newMember, "congrats", {
          roleName: addedRole.name,
        });
      }
    }
  }

  async test(message, type) {
    const extra = type === "congrats" ? { roleName: "Member" } : {};
    await this.sendCard(message.member, type, extra);
  }
}

module.exports = MemberService;
