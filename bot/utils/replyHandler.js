const fs = require("fs");
const { generatePDF } = require("../services/pdfService");

const DISCORD_LIMIT = 2000;
const PDF_THRESHOLD = 4000;

/* =================================
   SEND SMART REPLY
================================= */
async function sendSmartReply(message, text) {
  try {
    if (!text || typeof text !== "string") {
      return message.reply({
        content: "AI tidak memberikan respon yang valid.",
        allowedMentions: { repliedUser: false },
      });
    }

    // =============================
    // SHORT MESSAGE (<2000)
    // =============================
    if (text.length <= DISCORD_LIMIT) {
      return message.reply({
        content: text,
        allowedMentions: { repliedUser: false },
      });
    }

    // =============================
    // VERY LONG → PDF (>4000)
    // =============================
    if (text.length > PDF_THRESHOLD) {
      const filePath = await generatePDF({
        text,
        username: message.author.username,
        userId: message.author.id,
      });

      await message.reply({
        content: "Jawaban terlalu panjang, gue kirim dalam bentuk PDF 📄",
        files: [filePath],
        allowedMentions: { repliedUser: false },
      });

      try {
        await message.reply({
          content: "Jawaban terlalu panjang, gue kirim dalam bentuk PDF 📄",
          files: [filePath],
          allowedMentions: { repliedUser: false },
        });

        // Tunggu sedikit biar Discord benar2 selesai baca file
        await new Promise((resolve) => setTimeout(resolve, 1000));

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log("PDF deleted:", filePath);
        }
      } catch (err) {
        console.error("Error sending PDF:", err);
      }

      return;
    }

    // =============================
    // MEDIUM (2000–4000) → SPLIT
    // =============================
    let start = 0;
    let first = true;

    while (start < text.length) {
      const chunk = text.substring(start, start + 1900);

      if (first) {
        await message.reply({
          content: chunk,
          allowedMentions: { repliedUser: false },
        });
        first = false;
      } else {
        await message.channel.send({
          content: chunk,
          allowedMentions: { repliedUser: false },
        });
      }

      start += 1900;
    }
  } catch (err) {
    console.error("ReplyHandler Error:", err);

    return message.reply({
      content: "Terjadi error saat mengirim jawaban.",
      allowedMentions: { repliedUser: false },
    });
  }
}

module.exports = { sendSmartReply };
