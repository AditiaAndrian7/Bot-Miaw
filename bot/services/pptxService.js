const PptxGenJS = require("pptxgenjs");
const fs = require("fs");
const path = require("path");

function ensureTempFolder() {
  const tempPath = path.join(__dirname, "../temp");
  if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath, { recursive: true });
  return tempPath;
}

/*
Expected AI format:
{
  "title": "Judul Presentasi",
  "author": "Nama",
  "slides": [
    {
      "title": "Slide 1",
      "points": ["Point 1", "Point 2"]
    }
  ]
}
*/

async function generatePPTX({ data, userId = "unknown" }) {
  try {
    if (
      !data ||
      !data.slides ||
      !Array.isArray(data.slides) ||
      data.slides.length === 0
    ) {
      throw new Error("Format PPT tidak valid.");
    }

    const pptx = new PptxGenJS();
    const tempPath = ensureTempFolder();
    const fileName = `ppt_${userId}_${Date.now()}.pptx`;
    const filePath = path.join(tempPath, fileName);

    const currentYear = new Date().getFullYear();

    // ================= COVER SLIDE =================
    const cover = pptx.addSlide();
    cover.addText(data.title || "Presentasi", {
      x: 1,
      y: 2,
      w: 8,
      align: "center",
      fontSize: 32,
      bold: true,
    });
    cover.addText(`${data.author || "Disusun oleh"}\n${currentYear}`, {
      x: 1,
      y: 3.5,
      w: 8,
      align: "center",
      fontSize: 16,
    });

    // ================= CONTENT SLIDES =================
    data.slides.forEach((slideData) => {
      if (!slideData.points || slideData.points.length === 0) return;

      // Hapus bullet kosong/null dan karakter # @ * dll
      const cleanPoints = slideData.points
        .filter((p) => p && p.toString().trim() !== "")
        .map(
          (p) =>
            p
              .toString()
              .trim()
              .replace(/[#@*`~>]/g, ""), // hapus karakter mengganggu
        )
        .filter((p) => p !== ""); // hapus jika jadi kosong setelah replace

      if (cleanPoints.length === 0) return;

      const chunkSize = 5; // maksimal 5 bullet per slide
      for (let i = 0; i < cleanPoints.length; i += chunkSize) {
        const chunk = cleanPoints.slice(i, i + chunkSize);

        const slide = pptx.addSlide();

        // Judul Slide
        slide.addText(slideData.title || "Slide", {
          x: 0.5,
          y: 0.5,
          w: 9,
          fontSize: 22,
          bold: true,
        });

        // Bullet Points
        slide.addText(
          chunk.map((p) => ({ text: p })),
          {
            x: 1,
            y: 1.5,
            w: 8,
            h: 4,
            fontSize: 18,
            bullet: true,
            lineSpacing: 28,
          },
        );

        // Footer
        slide.addText(`${data.author || ""} - ${currentYear}`, {
          x: 0.5,
          y: 6.8,
          w: 9,
          fontSize: 10,
          align: "center",
        });
      }
    });

    await pptx.writeFile({ fileName: filePath });

    return filePath;
  } catch (err) {
    throw err;
  }
}

module.exports = { generatePPTX };
