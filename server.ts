import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Timezone-aware Time-Restriction Middleware (Malaysia Time GMT+8, Mon-Fri 8am-6pm)
app.use("/api", (req, res, next) => {
  if (process.env.BYPASS_WORKING_HOURS === "true") {
    return next();
  }

  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kuala_Lumpur",
    hour12: false,
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
  });

  const parts = formatter.formatToParts(now);
  const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));

  const day = partMap.weekday; // "Monday", "Tuesday", etc.
  const hour = parseInt(partMap.hour, 10);
  const minute = parseInt(partMap.minute, 10);

  const isWeekend = day === "Saturday" || day === "Sunday";
  const isOutsideHours = hour < 8 || hour > 18 || (hour === 18 && minute > 0);

  if (isWeekend || isOutsideHours) {
    return res.status(503).json({
      error: "Mursyid AI sedang berehat. Sila rujuk semula pada waktu operasi: Isnin - Jumaat, 8:00 pagi - 6:00 petang waktu Malaysia (UTC+8).",
      offHours: true
    });
  }

  next();
});

// Lazy-initialization of Gemini client helper
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key.includes("MY_GEMINI_API_KEY") || key === "") {
      throw new Error("GEMINI_API_KEY is not configured. Please add it to Secrets in the AI Studio sidebar.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// 1. Chat endpoint with Google Search Grounding & customized Shafi'i / Malaysia Islamic context
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Mesej diperlukan." });
    }

    const ai = getGeminiClient();

    // Prepare system instructions that enforces Bahasa Melayu and reliable sources
    const systemInstruction = 
      "Anda adalah seorang Ejen Kepakaran Syariah dan Fiqh Islam (Shafi'i) bertauliah di Malaysia. " +
      "Tugas anda adalah memberikan pandangan fekah, pemahaman hadis, fatwa, dan rujukan sejarah yang sahih. " +
      "Sentiasa utamakan pandangan Mazhab Syafi'i, keputusan Majlis Raja-Raja, fatwa JAKIM, e-Khutbah serta Jabatan Mufti Wilayah Persekutuan (muftiwp.gov.my). " +
      "Bahasa komunikasi mestilah Bahasa Melayu/Malaysia yang sopan, akademik, dan mudah difahami. " +
      "Cakap dengan sandaran dalil yang jelas dari Al-Quran dan Al-Sunnah jika bersesuaian, dan nyatakan sumber rujukan fatwa secara eksplisit. " +
      "Apabila pengguna bertanyakan isu semasa (contohnya pelaburan kripto, vaksin, waktu solat), gunakan keputusan mufti yang sah di Malaysia.";

    // Format chat history for Gemini API
    const formattedHistory = (history || []).map((h: any) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }]
    }));

    // Add current user prompt
    const contents = [...formattedHistory, { role: "user", parts: [{ text: message }] }];

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction,
        temperature: 0.2, // Low temperature for high precision/jurisprudence safety
        tools: [{ googleSearch: {} }],
      }
    });

    const text = response.text || "Maaf, tiada jawapan dijana.";
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    
    // Filter & map search citations to show to the user
    const citations = chunks.map((chunk: any) => ({
      title: chunk.web?.title || chunk.web?.uri || "Rujukan Sahih",
      url: chunk.web?.uri || "",
    })).filter(c => c.url !== "");

    res.json({ text, citations });
  } catch (error: any) {
    console.error("Chat Error:", error);
    res.status(500).json({ 
      error: error.message || "An unexpected error occurred",
      needsApiKey: !process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes("MY_GEMINI_API_KEY")
    });
  }
});

// 2. Structured endpoint to extract Knowledge Graph elements from a query or text segment
app.post("/api/extract-graph", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Teks diperlukan." });
    }

    const ai = getGeminiClient();

    const systemInstruction = 
      "Anda adalah pakar pengekstrakan maklumat teologi dan entiti undang-undang Islam. " +
      "Tugas anda adalah mengekstrak konsep Syariah, hukum fiqh, rujukan dalil (Al-Quran/Hadis), institusi autoriti (JAKIM, Mufti, dll), dan mazhab dari perbincangan atau teks yang diberikan " +
      "dan menyusunnya dalam struktur nod (nodes) dan hubungan (links) Graf Pengetahuan (Knowledge Graph). " +
      "Setiap nod mesti mempunyai jenis (type) yang bersesuaian antara salah satu berikut: " +
      "1. 'Konsep' (e.g. Puasa, Solat, Hadis Palsu, Riba, Kripto, Pusaka) " +
      "2. 'Hukum' (e.g. Wajib, Sunat, Harus, Makruh, Haram, Sah, Batal) " +
      "3. 'Sumber' (e.g. Al-Quran, Al-Hadith, Al-Ijma', Al-Qiyas) " +
      "4. 'Mazhab' (e.g. Mazhab Syafi'i, Mazhab Hanafi, Mazhab Maliki, Mazhab Hanbali) " +
      "5. 'Institusi' (e.g. JAKIM, Jabatan Mufti WP, Jawatankuasa Fatwa Kebangsaan) " +
      "6. 'Artikkel' (Satu daripada 10 laman rujukan khusus yang dibincangkan) " +
      "Setiap nod ID mestilah unik dan ringkas. Hubungan (links) antara nod mestilah menggambarkan relasi sebenar (tulis nama relasi dalam Bahasa Melayu yang ringkas seperti 'RULING_ON', 'DIKAWAL_OLEH', 'BERASASKAN_SABDA', 'DIPUTUSKAN_OLEH', 'MAZHAB_UTAMA'). " +
      "Pastikan teks bahasa pengantar adalah Bahasa Melayu/Malaysia.";

    const prompt = `Analisis teks atau topik berikut: "${text}". Kenalpasti entiti perundangan Islam dan kaitannya, kemudian bina graf pengetahuan. Hubungkan entiti dengan sumber sahih fiqh, fatwa Malaysia, hukum yang berkenaan, serta rujukan yang sesuai.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["nodes", "links"],
          properties: {
            nodes: {
              type: Type.ARRAY,
              description: "Senarai nod graf pengetahuan",
              items: {
                type: Type.OBJECT,
                required: ["id", "type", "label", "description"],
                properties: {
                  id: { type: Type.STRING, description: "ID nod yang unik (cth: 'mazhab_syafii', 'riba', 'jakim')" },
                  type: { type: Type.STRING, description: "Jenis salah satu daripada: 'Konsep', 'Hukum', 'Sumber', 'Mazhab', 'Institusi', 'Artikkel'" },
                  label: { type: Type.STRING, description: "Label pendek manusiawi untuk visualisasi (cth: 'Mazhab Syafi'i')" },
                  description: { type: Type.STRING, description: "Penerangan ringkas tentang entiti ini dalam konteks Syariah" }
                }
              }
            },
            links: {
              type: Type.ARRAY,
              description: "Senarai pautan/hubungan antara nod graf pengetahuan",
              items: {
                type: Type.OBJECT,
                required: ["source", "target", "relation"],
                properties: {
                  source: { type: Type.STRING, description: "ID nod asal" },
                  target: { type: Type.STRING, description: "ID nod sasaran" },
                  relation: { type: Type.STRING, description: "Jenis hubungan (cth: 'SANDARAN_UTAMA', 'HUKUM_HAKIKI', 'DIKELUARKAN_OLEH')" }
                }
              }
            }
          }
        }
      }
    });

    const textResult = response.text || "{}";
    let graphData;
    try {
      graphData = JSON.parse(textResult.trim());
    } catch (parseErr) {
      console.error("JSON Parsing Error from Gemini output:", textResult);
      throw new Error("Gagal mengurai Graf Pengetahuan daripada output kecerdasan buatan.");
    }

    res.json(graphData);
  } catch (error: any) {
    console.error("Extract Graph Error:", error);
    res.status(500).json({ 
      error: error.message || "An unexpected error occurred",
      needsApiKey: !process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes("MY_GEMINI_API_KEY")
    });
  }
});

// Setup Vite Dev server or Serve build files
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
