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
   EXTRACT TITLE
================================ */
function extractTitleAndClean(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let candidates = [];

  for (let line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("bab i")) break;

    if (
      line === line.toUpperCase() &&
      line.length > 15 &&
      !lower.includes("daftar isi") &&
      !lower.startsWith("bab")
    ) {
      candidates.push(line);
    }
  }

  const detectedTitle =
    candidates.length > 0
      ? candidates.sort((a, b) => b.length - a.length)[0]
      : null;

  const finalLines = lines.filter(
    (l) =>
      !candidates.includes(l) && !l.toLowerCase().includes("makalah akademik"),
  );

  return {
    title: detectedTitle,
    cleanedText: finalLines.join("\n"),
  };
}

/* ================================
   GENERATE PDF
================================ */
async function generatePDF({
  text,
  username = "User",
  userId = "unknown",
  title = "MAKALAH",
}) {
  return new Promise((resolve, reject) => {
    try {
      const tempPath = ensureTempFolder();
      const fileName = `makalah_${userId}_${Date.now()}.pdf`;
      const filePath = path.join(tempPath, fileName);

      const rawClean = cleanRawText(text);
      const { title: detectedTitle, cleanedText } =
        extractTitleAndClean(rawClean);

      if (detectedTitle) title = detectedTitle;

      const paragraphs = cleanedText
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean);

      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 80, bottom: 70, left: 80, right: 80 },
        bufferPages: true,
      });

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      const toc = [];

      /* ================= COVER ================= */
      doc.moveDown(6);

      doc
        .font("Helvetica-Bold")
        .fontSize(20)
        .text(title.toUpperCase(), { align: "center" });

      doc.moveDown(3);

      doc.font("Helvetica").fontSize(14).text("Disusun Oleh:", {
        align: "center",
      });

      doc.moveDown(0.5);

      doc.font("Helvetica-Bold").fontSize(14).text(username, {
        align: "center",
      });

      doc.moveDown(2);

      doc
        .font("Helvetica")
        .fontSize(12)
        .text(new Date().getFullYear().toString(), { align: "center" });

      doc.addPage();

      /* ================= DAFTAR ISI ================= */
      const tocPageIndex = doc.bufferedPageRange().count - 1;

      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .text("DAFTAR ISI", { align: "center" });

      doc.moveDown(2);

      doc.addPage();

      /* ================= ISI ================= */
      paragraphs.forEach((para) => {
        const lower = para.toLowerCase();

        if (lower.includes("daftar isi")) return;
        if (lower.includes("disusun oleh")) return;
        if (lower === title.toLowerCase()) return;

        if (lower.startsWith("bab")) {
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
        } else if (/^\d+\.\d+/.test(para)) {
          toc.push({
            title: para,
            page: doc.bufferedPageRange().count,
            level: 1,
          });

          doc.moveDown();
          doc.font("Helvetica-Bold").fontSize(13).text(para);
          doc.moveDown(0.5);
          doc.font("Helvetica").fontSize(12);
        } else if (lower.includes("daftar pustaka")) {
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
        } else {
          doc.text(para, {
            align: "justify",
            indent: 30,
            lineGap: 4,
            paragraphGap: 10,
          });
        }
      });

      /* ================= WRITE TOC RAPI ================= */
      doc.switchToPage(tocPageIndex);
      doc.moveDown(2);
      doc.font("Helvetica").fontSize(12);

      const pageWidth =
        doc.page.width - doc.page.margins.left - doc.page.margins.right;

      toc.forEach((item) => {
        const indent = item.level === 1 ? 20 : 0;
        const pageNumber = item.page.toString();

        const titleWidth = doc.widthOfString(item.title);
        const pageWidthText = doc.widthOfString(pageNumber);

        const dotsWidth = pageWidth - indent - titleWidth - pageWidthText - 10;

        const dot = ".";
        const dotWidth = doc.widthOfString(dot);
        const dotCount = Math.floor(dotsWidth / dotWidth);

        const dots = dot.repeat(dotCount > 0 ? dotCount : 5);

        doc.text(item.title, doc.page.margins.left + indent, doc.y, {
          continued: true,
        });

        doc.text(dots, { continued: true });

        doc.text(pageNumber, {
          align: "right",
        });

        doc.moveDown(0.5);
      });

      /* ================= FOOTER ================= */
      doc.flushPages();
      const range = doc.bufferedPageRange();

      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc
          .fontSize(9)
          .fillColor("gray")
          .text(`Halaman ${i - range.start + 1}`, 0, doc.page.height - 40, {
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
