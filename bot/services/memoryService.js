// In-memory storage (sementara, hilang kalau bot restart)
const memoryStore = {};

// Default limit chat history per user
let MEMORY_LIMIT = 10;

/* =================================
   GET MEMORY USER
================================= */
function getMemory(userId) {
  if (!memoryStore[userId]) {
    memoryStore[userId] = [];
  }

  return memoryStore[userId];
}

/* =================================
   SAVE MEMORY
================================= */
function saveMemory(userId, userMessage, botReply) {
  if (!memoryStore[userId]) {
    memoryStore[userId] = [];
  }

  memoryStore[userId].push({
    user: userMessage,
    bot: botReply,
    timestamp: Date.now(),
  });

  // Potong kalau lebih dari limit
  if (memoryStore[userId].length > MEMORY_LIMIT) {
    memoryStore[userId].shift();
  }
}

/* =================================
   CLEAR MEMORY USER
================================= */
function clearMemory(userId) {
  memoryStore[userId] = [];
}

/* =================================
   SET MEMORY LIMIT
================================= */
function setMemoryLimit(limit) {
  if (typeof limit === "number" && limit > 0) {
    MEMORY_LIMIT = limit;
  }
}

/* =================================
   GET MEMORY SIZE
================================= */
function getMemorySize(userId) {
  if (!memoryStore[userId]) return 0;
  return memoryStore[userId].length;
}

/* =================================
   CLEAR ALL MEMORY (ADMIN PURPOSE)
================================= */
function clearAllMemory() {
  for (const userId in memoryStore) {
    memoryStore[userId] = [];
  }
}

module.exports = {
  getMemory,
  saveMemory,
  clearMemory,
  setMemoryLimit,
  getMemorySize,
  clearAllMemory,
};
