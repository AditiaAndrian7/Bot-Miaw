const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("../config");

const keys = [process.env.GEMINI_KEY_1, process.env.GEMINI_KEY_2].filter(
  Boolean,
);

let currentKeyIndex = 0;

/* ================================
   GET MODEL
================================ */
function getModel() {
  if (!keys.length) {
    throw new Error("No Gemini API keys found in .env");
  }

  const genAI = new GoogleGenerativeAI(keys[currentKeyIndex]);

  return genAI.getGenerativeModel({
    model: config.model,
  });
}

/* ================================
   IMAGE → BASE64
================================ */
async function imageUrlToBase64(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch image");
  }

  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

/* ================================
   BUILD PROMPT WITH MEMORY
================================ */
function buildPrompt(userMessage, history = [], systemInstruction = "") {
  let historyText = "";

  if (history.length) {
    historyText =
      "\nConversation History:\n" +
      history.map((h) => `User: ${h.user}\nBot: ${h.bot}`).join("\n") +
      "\n";
  }

  return `
${systemInstruction || config.personality}

${historyText}
User: ${userMessage}
Bot:
`;
}

/* ================================
   GENERATE RESPONSE (OBJECT BASED)
================================ */
async function generateResponse({
  userMessage,
  imageUrl = null,
  history = [],
  toneInstruction = "",
  toolInstruction = "",
}) {
  try {
    const model = getModel();

    // Gabungkan semua instruction
    const systemInstruction = `
${config.personality || ""}
${toneInstruction || ""}
${toolInstruction || ""}
`;

    const prompt = buildPrompt(userMessage, history, systemInstruction);

    let result;

    /* ================= IMAGE MODE ================= */
    if (imageUrl) {
      const base64Image = await imageUrlToBase64(imageUrl);

      result = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            mimeType: "image/png",
            data: base64Image,
          },
        },
      ]);
    } else {
      /* ================= TEXT MODE ================= */
      result = await model.generateContent(prompt);
    }

    const text = result.response.text();

    return text || "AI tidak memberikan jawaban.";
  } catch (err) {
    const message = err?.message?.toLowerCase() || "";

    /* ================= FAILOVER KEY ================= */
    if (
      (message.includes("429") || message.includes("quota")) &&
      currentKeyIndex < keys.length - 1
    ) {
      console.log(
        `Key ${currentKeyIndex + 1} limit. Switching to key ${
          currentKeyIndex + 2
        }...`,
      );

      currentKeyIndex++;

      return generateResponse({
        userMessage,
        imageUrl,
        history,
        toneInstruction,
        toolInstruction,
      });
    }

    console.error("Gemini Error:", err);
    return "Ada error internal dari AI.";
  }
}

module.exports = { generateResponse };
