const { AttachmentBuilder } = require("discord.js");
const { generateCard } = require("../utils/cardGenerator");

class MemberService {
  constructor(client, options = {}) {
    this.client = client;
    this.welcomeChannelId = options.welcomeChannelId;
    this.autoRoleName = options.autoRoleName || "Member";
    this.backgrounds = {
      welcome: options.welcomeBackground,
      goodbye: options.goodbyeBackground,
      congrats: options.congratsBackground,
    };
    this.registerEvents();
  }

  registerEvents() {
    this.client.on("guildMemberAdd", (member) => this.handleWelcome(member));
    this.client.on("guildMemberRemove", (member) => this.handleGoodbye(member));
    this.client.on("guildMemberUpdate", (oldMember, newMember) =>
      this.handleRoleUpdate(oldMember, newMember),
    );
  }

  // Helper untuk mendapatkan channel tujuan
  getChannel(guild) {
    return (
      guild.channels.cache.get(this.welcomeChannelId) || guild.systemChannel
    );
  }

  // Format pesan dengan mention
  formatMessage(type, member, extra = {}) {
    const mention = `<@${member.user.id}>`;
    const serverName = member.guild.name;

    const messages = {
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

    // Pilih pesan random dari array
    const messageList = messages[type] || messages.welcome;
    const randomIndex = Math.floor(Math.random() * messageList.length);
    return messageList[randomIndex];
  }

  async sendCard(member, type, extra = {}) {
    try {
      const backgroundURL = this.backgrounds[type];
      if (!backgroundURL) {
        console.warn(`Background untuk ${type} tidak diset`);
        return;
      }

      console.log(`📤 Generating ${type} card for ${member.user.tag}...`);

      // Generate card
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
        console.warn(`⚠️ Tidak ada channel untuk mengirim kartu ${type}`);
        return;
      }

      // Dapatkan pesan sesuai tipe
      const messageText = this.formatMessage(type, member, extra);

      // Kirim pesan + card
      await channel.send({
        content: messageText,
        files: [attachment],
      });

      console.log(`✅ Card ${type} sent successfully to ${member.user.tag}`);
    } catch (err) {
      console.error(`❌ Error sending ${type} card:`, err);

      // Fallback: kirim pesan saja tanpa card
      const channel = this.getChannel(member.guild);
      if (channel) {
        const fallbackMessage = this.formatMessage(type, member, extra);
        await channel.send(fallbackMessage).catch(() => {});
      }
    }
  }

  async handleWelcome(member) {
    // Kasih role otomatis
    const role = member.guild.roles.cache.find(
      (r) => r.name === this.autoRoleName,
    );
    if (role) {
      await member.roles
        .add(role)
        .catch((err) =>
          console.warn(
            `⚠️ Gagal kasih role ${this.autoRoleName}:`,
            err.message,
          ),
        );
    }

    // Kirim card welcome
    await this.sendCard(member, "welcome");
  }

  async handleGoodbye(member) {
    await this.sendCard(member, "goodbye");
  }

  async handleRoleUpdate(oldMember, newMember) {
    // Cek apakah ada role baru yang ditambahkan
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

  // Method untuk testing manual
  async test(message, type) {
    const extra = type === "congrats" ? { roleName: "Member" } : {};
    await this.sendCard(message.member, type, extra);
  }
}

module.exports = MemberService;
