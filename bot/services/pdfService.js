const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

/* ================================
   ENSURE TEMP FOLDER
================================ */
function ensureTempFolder() {
  const tempPath = path.join(__dirname, "../temp");
  if (!fs.existsSync(tempPath)) {
    fs.mkdirSync(tempPath, { recursive: true });
  }
  return tempPath;
}

/* ================================
   CLEAN RAW TEXT
================================ */
function cleanRawText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^---$/gm, "")
    .replace(/^-{3,}/g, "")
    .replace(/^Tentu.*$/gim, "")
    .replace(/^Berikut.*$/gim, "")
    .replace(/^Ini adalah.*$/gim, "")
    .replace(/^MAKALAH AKADEMIK.*$/gim, "")
    .trim();
}

/* ================================
   GENERATE PDF (FINAL STABLE)
================================ */
async function generatePDF({ text, username = "User", userId = "unknown" }) {
  try {
    const tempPath = ensureTempFolder();
    const fileName = `makalah_${userId}_${Date.now()}.pdf`;
    const filePath = path.join(tempPath, fileName);

    let cleaned = cleanRawText(text);

    const lines = cleaned
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    let detectedTitle = "MAKALAH";

    if (lines.length > 0 && /^[A-Z\s\d.,:()-]+$/.test(lines[0])) {
      detectedTitle = lines.shift();
    }

    const paragraphs = lines;

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 80, bottom: 70, left: 80, right: 80 },
      bufferPages: true,
    });

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    /* ================= COVER ================= */

    doc.moveDown(6);

    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .text("MAKALAH", { align: "center" });
    doc.moveDown(2);

    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .text(detectedTitle.toUpperCase(), { align: "center" });

    doc.moveDown(4);
    doc.moveDown(8);

    doc.font("Helvetica").fontSize(12).text("Oleh:", { align: "center" });
    doc.moveDown(0.5);

    doc.font("Helvetica-Bold").fontSize(14).text(username, { align: "center" });

    doc.moveDown(6);

    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .text("KOMUNITAS ARCANEX", { align: "center" });

    doc.moveDown(0.5);

    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .text(new Date().getFullYear().toString(), { align: "center" });

    doc.addPage();

    /* ================= TOC ================= */

    const toc = [];
    const tocPageIndex = doc.bufferedPageRange().count - 1;

    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .text("DAFTAR ISI", { align: "center" });

    doc.moveDown(2);
    const tocStartY = doc.y;

    /* ================= CONTENT ================= */

    let inDaftarPustaka = false;

    paragraphs.forEach((para) => {
      const lower = para.toLowerCase();

      // ===== ABSTRAK =====
      if (lower === "abstrak") {
        doc.addPage();

        toc.push({
          title: "ABSTRAK",
          page: doc.bufferedPageRange().count,
          level: 0,
        });

        doc
          .font("Helvetica-Bold")
          .fontSize(16)
          .text("ABSTRAK", { align: "center" });

        doc.moveDown(2);
        doc.font("Helvetica").fontSize(12);

        inDaftarPustaka = false;
      }

      // ===== BAB =====
      else if (lower.startsWith("bab ")) {
        doc.addPage();

        toc.push({
          title: para.toUpperCase(),
          page: doc.bufferedPageRange().count,
          level: 0,
        });

        doc
          .font("Helvetica-Bold")
          .fontSize(16)
          .text(para.toUpperCase(), { align: "center" });

        doc.moveDown(2);
        doc.font("Helvetica").fontSize(12);

        inDaftarPustaka = false;
      }

      // ===== SUB BAB (1.1, 2.3, dll) =====
      else if (/^\d+\.\d+/.test(para)) {
        toc.push({
          title: para,
          page: doc.bufferedPageRange().count,
          level: 1,
        });

        doc.moveDown();
        doc.font("Helvetica-Bold").fontSize(13).text(para);
        doc.moveDown(0.5);
        doc.font("Helvetica").fontSize(12);
      }

      // ===== DAFTAR PUSTAKA =====
      else if (lower === "daftar pustaka") {
        doc.addPage();

        toc.push({
          title: "DAFTAR PUSTAKA",
          page: doc.bufferedPageRange().count,
          level: 0,
        });

        doc
          .font("Helvetica-Bold")
          .fontSize(16)
          .text("DAFTAR PUSTAKA", { align: "center" });

        doc.moveDown(2);
        doc.font("Helvetica").fontSize(12);

        inDaftarPustaka = true;
      }

      // ===== ISI NORMAL =====
      else {
        if (inDaftarPustaka) {
          // APA 7 Hanging Indent
          doc.text(para, {
            align: "left",
            indent: -20,
            continued: false,
          });
          doc.moveDown(0.5);
        } else {
          doc.text(para, {
            align: "justify",
            indent: 30,
            lineGap: 4,
            paragraphGap: 10,
          });
        }
      }
    });

    /* ================= WRITE TOC ================= */

    doc.switchToPage(tocPageIndex);
    doc.y = tocStartY;
    doc.font("Helvetica").fontSize(12);

    toc.forEach((item) => {
      const indent = item.level === 1 ? 20 : 0;
      const pageNumber = item.page.toString();

      const maxWidth =
        doc.page.width -
        doc.page.margins.left -
        doc.page.margins.right -
        indent;

      // Tulis judul dulu tanpa titik
      const titleText = item.title;

      // Hitung sisa ruang
      const titleWidth = doc.widthOfString(titleText);
      const pageWidth = doc.widthOfString(pageNumber);
      const dotWidth = doc.widthOfString(".");

      let availableWidth = maxWidth - titleWidth - pageWidth - 5;

      if (availableWidth < 0) availableWidth = 0;

      const dotCount = Math.floor(availableWidth / dotWidth);
      const dots = ".".repeat(dotCount > 0 ? dotCount : 0);

      doc.text(titleText, doc.page.margins.left + indent, doc.y, {
        continued: true,
      });

      doc.text(dots, { continued: true });

      doc.text(pageNumber, { align: "right" });

      doc.moveDown(0.5);
    });

    /* ================= FOOTER ================= */

    // Ambil total halaman
    let range = doc.bufferedPageRange();
    let totalPages = range.count;

    // Cek apakah halaman terakhir kosong
    doc.switchToPage(totalPages - 1);

    // Kalau posisi Y masih di atas (artinya kosong / hampir kosong)
    if (doc.y < 100) {
      totalPages -= 1;
    }

    // Tambahkan nomor halaman
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);

      if (i === 0) continue; // skip cover

      doc
        .fontSize(9)
        .fillColor("gray")
        .text(`Halaman ${i}`, 0, doc.page.height - 40, {
          align: "center",
        });
    }

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on("finish", () => resolve(filePath));
      stream.on("error", reject);
    });
  } catch (err) {
    throw err;
  }
}

module.exports = { generatePDF };
