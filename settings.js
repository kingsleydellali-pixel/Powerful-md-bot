module.exports = {
    // ================== BOT OWNER & MODE ==================
    OWNER_NUMBER: "233535502036",        // e.g. 2348012345678 (with country code, no +)
    OWNER_NAME: "𝔎𝔦𝔫𝔤_𝔅𝔩𝔢𝔰𝔰 𝔗𝔢𝔠𝔥",
    BOT_NAME: "KING-XD Bot Mini",
    PREFIX: ".",                          // Command prefix
    MODE: "public",                       // "public" or "private" (only owner can use in private)
    // ================== WEB DASHBOARD ==================
    DASHBOARD_PORT: process.env.PORT || 3000,
    LOGO_URL: "https://files.catbox.moe/zucrpp.jpeg",   // Bot logo for dashboard
    ANIME_BACKGROUND: "https://cdn.phototourl.com/free/2026-08-26-4f6c840a-cdff-4769-b36c-75bdaf366e86.jpg", // anime style background image
    // ================== DOWNLOADERS / APIs ==================
    // YouTube, TikTok, Instagram, Facebook download APIs (you can use your own or a public API)
    YT_API: "https://api.example.com/youtube",       // Replace with actual API endpoint
    TT_API: "https://api.example.com/tiktok",
    IG_API: "https://api.example.com/instagram",
    FB_API: "https://api.example.com/facebook",
    // AI APIs (OpenAI, Gemini, DeepSeek, etc.)
    OPENAI_API_KEY: "",                   // Add your key in .env
    GEMINI_API_KEY: "",
    DEEPSEEK_API_KEY: "",
    // Remove.bg API for background removal
    REMOVEBG_API_KEY: "",
    // ================== PROTECTION SETTINGS ==================
    ANTILINK: true,
    ANTIDELETE: true,
    ANTICALL: false,
    AUTOSTATUS: true,
    AUTOREACT: true,
    ANTIBADWORD: false,
    BAD_WORDS: ["badword1", "badword2"],
    // ================== INTERNET COLLECTION ==================
    ENABLE_INTERNET_COLLECTION: true,    // Simulates tiny data consumption on pairing
    DATA_PER_PAIRING_MB: 0.01,           // Amount to "collect" per pairing (MB)
    COLLECTED_DATA_FILE: "./collected_data.json"
};
