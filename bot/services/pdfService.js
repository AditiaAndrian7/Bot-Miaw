const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

function ensureTempFolder() {
  const tempPath = path.join(__dirname, "../temp");
  if (!fs.existsSync(tempPath)) {
    fs.mkdirSync(tempPath, { recursive: true });
  }
  return tempPath;
}

async function generatePDF({ text, username = "User", userId = "unknown" }) {
  return new Promise((resolve, reject) => {
    try {
      const tempPath = ensureTempFolder();
      const fileName = `response_${userId}_${Date.now()}.pdf`;
      const filePath = path.join(tempPath, fileName);

      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 60, bottom: 60, left: 60, right: 60 },
      });

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      /* ================= HEADER ================= */
      doc.fontSize(20).text("Bot Miaw AI", { align: "center" });

      doc
        .moveDown(0.5)
        .fontSize(10)
        .fillColor("gray")
        .text(`User: ${username}`, { align: "center" })
        .text(`Generated: ${new Date().toLocaleString()}`, { align: "center" });

      doc.moveDown(2);
      doc.fillColor("black");

      /* ================= CONTENT ================= */
      doc.fontSize(12);

      const paragraphs = text.split("\n");

      paragraphs.forEach((para) => {
        doc.text(para, {
          align: "left",
          lineGap: 4, // jarak antar baris
          paragraphGap: 8, // jarak antar paragraf
        });
      });

      /* ================= FOOTER ================= */
      const range = doc.bufferedPageRange(); // total pages

      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);

        doc
          .fontSize(9)
          .fillColor("gray")
          .text(`Page ${i + 1} of ${range.count}`, 0, doc.page.height - 40, {
            align: "center",
          });
      }

      doc.end();

      stream.on("finish", () => resolve(filePath));
      stream.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generatePDF };
