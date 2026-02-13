const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("../config");

const keys = [process.env.GEMINI_KEY_1, process.env.GEMINI_KEY_2].filter(
  Boolean,
);

let currentKeyIndex = 0;

/* =================================
   ENSURE TEMP FOLDER
================================= */
function ensureTempFolder() {
  const tempPath = path.join(__dirname, "../temp");

  if (!fs.existsSync(tempPath)) {
    fs.mkdirSync(tempPath, { recursive: true });
  }

  return tempPath;
}

/* =================================
   GET MODEL FROM CONFIG
================================= */
function getModel() {
  if (!keys.length) {
    throw new Error("No Gemini API keys found.");
  }

  const genAI = new GoogleGenerativeAI(keys[currentKeyIndex]);

  return genAI.getGenerativeModel({
    model: config.model, // 🔥 ambil dari config
  });
}

/* =================================
   GENERATE IMAGE
================================= */
async function generateImage(prompt) {
  try {
    const model = getModel();

    const result = await model.generateContent([{ text: prompt }]);

    const response = result.response;

    if (!response.candidates || !response.candidates.length) {
      throw new Error("No candidates returned.");
    }

    const parts = response.candidates[0].content.parts;

    const imagePart = parts.find((p) => p.inlineData);

    if (!imagePart) {
      throw new Error("Model did not return image data.");
    }

    const base64Image = imagePart.inlineData.data;

    const tempPath = ensureTempFolder();
    const fileName = `image_${Date.now()}.png`;
    const filePath = path.join(tempPath, fileName);

    fs.writeFileSync(filePath, Buffer.from(base64Image, "base64"));

    return filePath;
  } catch (err) {
    const message = err?.message?.toLowerCase() || "";

    // 🔥 FAILOVER KEY
    if (
      (message.includes("429") || message.includes("quota")) &&
      currentKeyIndex < keys.length - 1
    ) {
      console.log(
        `Image Key ${currentKeyIndex + 1} limit. Switching to key ${
          currentKeyIndex + 2
        }...`,
      );

      currentKeyIndex++;
      return generateImage(prompt);
    }

    console.error("Image Generation Error:", err);
    throw new Error("Gagal generate gambar.");
  }
}

module.exports = { generateImage };
