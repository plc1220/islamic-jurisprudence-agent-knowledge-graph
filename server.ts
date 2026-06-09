import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// ==========================================
// PRISTINE ISLAMIC ONTOLOGY BASELINE
// ==========================================
const INITIAL_NODES = [
  { id: "syariah", type: "Konsep", label: "Syarak / Syariah", description: "Sistem perundangan dan kaedah ketetapan Tuhan untuk menyusun kehidupan umat Islam." },
  { id: "feqah", type: "Konsep", label: "Feqah (Fiqh)", description: "Penerokaan saintifik hukum amali Islam daripada dalil eksplicit yang ditemui melalui Ijtihad." },
  { id: "hukum", type: "Konsep", label: "Hukum Amali", description: "Peraturan yang dikelaskan kepada lima hukum taklifi (Wajib, Sunat, Harus, Makruh, Haram)." },
  { id: "al_quran", type: "Sumber", label: "Al-Quran", description: "Pencetus hukum primer dan kalam mukjizat Allah yang diwahyukan kepada Nabi Muhammad S.A.W." },
  { id: "al_hadith", type: "Sumber", label: "As-Sunnah / Hadis", description: "Segala perkataan, perbuatan, persetujuan, dan sifat Rasulullah S.A.W yang sahih." },
  { id: "ijtihad", type: "Sumber", label: "Ijtihad / Qiyas / Ijma'", description: "Pemuafakatan para mujtahid (Ijma') dan analogi hukum (Qiyas) sebagai sumber rujukan hujah." },
  { id: "mazhab_syafii", type: "Mazhab", label: "Mazhab Syafi'i", description: "Mazhab utama perundangan Fiqh yang rasmi di Malaysia berpandukan Metodologi Imam Al-Shafi'i." },
  { id: "jakim", type: "Institusi", label: "JAKIM", description: "Jabatan Kemajuan Islam Malaysia - agensi persekutuan utama yang menguruskan hal ehwal Islam negara." },
  { id: "mufti_wp", type: "Institusi", label: "Pejabat Mufti WP", description: "Pejabat Mufti Wilayah Persekutuan yang memberikan bimbingan hukum Syariah kontemporari rasmi." },
  { id: "myhadith", type: "Artikkel", label: "myhadith.islam.gov.my", description: "Lembaga kawalan hadis JAKIM bagi menyaring pemalsuan sanad hadis dari media massa." },
  { id: "i_fiqh", type: "Artikkel", label: "i-fiqh.islam.gov.my", description: "Katalog fatwa kebangsaan JAKIM mengurus resolusi perundangan muamalat dan kekeluargaan." },
  { id: "al_kafi", type: "Artikkel", label: "Al-Kafi li al-Fatawi", description: "Portal rujukan soalan harian menterjemah masalah fiqh mikro kepada jawapan terus berlandaskan Mazhab." }
];

const INITIAL_LINKS = [
  { source: "feqah", target: "syariah", relation: "CABANG_KEPADA" },
  { source: "feqah", target: "hukum", relation: "MENENTUKAN" },
  { source: "mazhab_syafii", target: "feqah", relation: "SISTEMATISASI" },
  { source: "mazhab_syafii", target: "al_quran", relation: "BERDASARKAN" },
  { source: "mazhab_syafii", target: "al_hadith", relation: "BERDASARKAN" },
  { source: "mazhab_syafii", target: "ijtihad", relation: "MENGGUNAKAN" },
  { source: "jakim", target: "mazhab_syafii", relation: "BERPANDUKAN" },
  { source: "mufti_wp", target: "mazhab_syafii", relation: "BERPANDUKAN" },
  { source: "jakim", target: "myhadith", relation: "MENGENDALIKAN" },
  { source: "jakim", target: "i_fiqh", relation: "MENGENDALIKAN" },
  { source: "mufti_wp", target: "al_kafi", relation: "MENERBITKAN" },
  { source: "al_kafi", target: "hukum", relation: "MEMBERI_PANDUAN" }
];

// In-memory fallback graph store (used if PostgreSQL is unavailable)
let fallbackNodes = JSON.parse(JSON.stringify(INITIAL_NODES));
let fallbackLinks = JSON.parse(JSON.stringify(INITIAL_LINKS));

// ==========================================
// WORKING HOURS CONTROL MIDDLEWARE
// ==========================================
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

// ==========================================
// DYNAMIC CLIENT-SIDE API KEY RESOLUTION
// ==========================================
function getRequestApiKey(req: express.Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (token && !token.includes("MY_GEMINI_API_KEY") && token !== "") {
      return token;
    }
  }
  return undefined;
}

function getGeminiClient(reqApiKey?: string): GoogleGenAI {
  const key = reqApiKey || process.env.GEMINI_API_KEY;
  if (!key || key.includes("MY_GEMINI_API_KEY") || key === "") {
    throw new Error("GEMINI_API_KEY is not configured. Sila pasangkan API Key anda di bahagian penjuru kanan atas laman web ini.");
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// ==========================================
// DATABASE LAYER: POSTGRESQL + APACHE AGE + PGVECTOR
// ==========================================
let pgPool: pg.Pool | null = null;
let dbInitialized = false;
let isDbActive = false;

function getPGPool(): pg.Pool | null {
  if (!process.env.DB_HOST) {
    return null; // DB_HOST is omitted, load in-memory fallback gracefully
  }
  if (!pgPool) {
    pgPool = new pg.Pool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || process.env.DB_PASS || "postgres",
      database: process.env.DB_NAME || "postgres",
      port: parseInt(process.env.DB_PORT || "5432", 10),
      connectionTimeoutMillis: 4000, // Quick timeout to failover fast to memory mode
    });
  }
  return pgPool;
}

async function initializeDatabase(pool: pg.Pool): Promise<boolean> {
  if (dbInitialized) return isDbActive;

  let client: pg.PoolClient | null = null;
  try {
    console.log("Database: Initiating connection to", process.env.DB_HOST);
    client = await pool.connect();

    // 1. Setup Extensions
    try {
      await client.query("CREATE EXTENSION IF NOT EXISTS age CASCADE;");
      console.log("Database: Extension 'age' confirmed.");
    } catch (e: any) {
      console.warn("Database Warning: Could not create extension 'age':", e.message);
    }

    try {
      await client.query("CREATE EXTENSION IF NOT EXISTS vector CASCADE;");
      console.log("Database: Extension 'vector' confirmed.");
    } catch (e: any) {
      console.warn("Database Warning: Could not create extension 'vector':", e.message);
    }

    // Load age and set path
    await client.query("LOAD 'age';");
    await client.query('SET search_path = ag_catalog, "$user", public;');

    // 2. Validate/Create Apache AGE graph 'mursyid_graph'
    const graphCheck = await client.query(
      "SELECT count(*) FROM ag_catalog.ag_graph WHERE name = 'mursyid_graph';"
    );
    const hasGraph = parseInt(graphCheck.rows[0].count, 10) > 0;

    if (!hasGraph) {
      await client.query("SELECT create_graph('mursyid_graph');");
      console.log("Database: Created Apache AGE graph 'mursyid_graph'.");
    } else {
      console.log("Database: Apache AGE graph 'mursyid_graph' exists.");
    }

    // 3. Create regular tables (e.g. fatwa_chunks for pgvector search)
    await client.query(`
      CREATE TABLE IF NOT EXISTS fatwa_chunks (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        embedding vector(1536),
        metadata JSONB
      );
    `);
    console.log("Database: Table 'fatwa_chunks' verified.");

    // 4. Pre-seed baseline if the graph is empty
    const nodeCountResult = await client.query(`
      SELECT count(*) FROM cypher('mursyid_graph', $$
        MATCH (v:Entity) RETURN v
      $$) as (v agtype);
    `);
    const nodeCount = parseInt(nodeCountResult.rows[0].count, 10);

    if (nodeCount === 0) {
      console.log("Database: Pre-seeding baseline Islamic Ontology...");
      // Seed nodes
      for (const node of INITIAL_NODES) {
        await client.query(`
          SELECT * FROM cypher('mursyid_graph', $$
            MERGE (v:Entity {id: $id})
            SET v.type = $type, v.label = $label, v.description = $description
            RETURN v
          $$, $1) as (v agtype);
        `, [JSON.stringify(node)]);
      }

      // Seed links
      for (const link of INITIAL_LINKS) {
        await client.query(`
          SELECT * FROM cypher('mursyid_graph', $$
            MATCH (a:Entity {id: $source}), (b:Entity {id: $target})
            MERGE (a)-[r:RELATION {relation: $relation}]->(b)
            RETURN r
          $$, $1) as (r agtype);
        `, [JSON.stringify(link)]);
      }
      console.log("Database: Pre-seeding completed successfully.");
    }

    isDbActive = true;
    dbInitialized = true;
    return true;
  } catch (err: any) {
    console.error("Database: Failed to initialize. Falling back to Stateless Memory mode.", err.message);
    isDbActive = false;
    dbInitialized = true; // Still marked initialized to prevent repeat spamming of logs
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
}

// ==========================================
// APACHE AGE HELPER: AGTYPE DE-SERIALIZER
// ==========================================
function parseAgtype(val: any): any {
  if (val === null || val === undefined) return null;
  if (typeof val === "object") {
    if (val.properties) {
      return {
        id: val.properties.id,
        type: val.properties.type,
        label: val.properties.label,
        description: val.properties.description,
        properties: val.properties
      };
    }
    return val;
  }

  if (typeof val === "string") {
    let cleaned = val.trim();
    // Remove type suffixes e.g., ::vertex, ::edge, ::path
    cleaned = cleaned.replace(/::[a-zA-Z0-9_]+$/, "");

    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === "object") {
        if (parsed.properties) {
          return {
            id: parsed.properties.id,
            type: parsed.properties.type,
            label: parsed.properties.label,
            description: parsed.properties.description,
            properties: parsed.properties
          };
        }
        return parsed;
      }
      return parsed;
    } catch (e) {
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        return cleaned.substring(1, cleaned.length - 1);
      }
      return cleaned;
    }
  }
  return val;
}

// ==========================================
// DATABASE GRAPH ACTIONS
// ==========================================
async function saveNodeToGraph(pool: pg.Pool, node: { id: string; type: string; label: string; description: string }) {
  const client = await pool.connect();
  try {
    await client.query('LOAD \'age\'; SET search_path = ag_catalog, "$user", public;');
    const query = `
      SELECT * FROM cypher('mursyid_graph', $$
        MERGE (v:Entity {id: $id})
        SET v.type = $type, v.label = $label, v.description = $description
        RETURN v
      $$, $1) as (v agtype);
    `;
    await client.query(query, [JSON.stringify(node)]);
  } catch (err: any) {
    console.error(`Database Error: Gagal menyimpan nod ${node.id}:`, err.message);
  } finally {
    client.release();
  }
}

async function saveLinkToGraph(pool: pg.Pool, link: { source: string; target: string; relation: string }) {
  const client = await pool.connect();
  try {
    await client.query('LOAD \'age\'; SET search_path = ag_catalog, "$user", public;');
    const query = `
      SELECT * FROM cypher('mursyid_graph', $$
        MATCH (a:Entity {id: $source}), (b:Entity {id: $target})
        MERGE (a)-[r:RELATION {relation: $relation}]->(b)
        RETURN r
      $$, $1) as (r agtype);
    `;
    await client.query(query, [JSON.stringify(link)]);
  } catch (err: any) {
    console.error(`Database Error: Gagal menyambung ${link.source} -> ${link.target}:`, err.message);
  } finally {
    client.release();
  }
}

async function getFullGraph(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    await client.query('LOAD \'age\'; SET search_path = ag_catalog, "$user", public;');

    // 1. Fetch nodes
    const nodesQuery = `
      SELECT * FROM cypher('mursyid_graph', $$
        MATCH (v:Entity)
        RETURN v
      $$) as (v agtype);
    `;
    const nodesResult = await client.query(nodesQuery);

    // 2. Fetch links
    const linksQuery = `
      SELECT * FROM cypher('mursyid_graph', $$
        MATCH (a:Entity)-[r:RELATION]->(b:Entity)
        RETURN a.id, b.id, r
      $$) as (source_id agtype, target_id agtype, r agtype);
    `;
    const linksResult = await client.query(linksQuery);

    const nodes = nodesResult.rows.map(row => parseAgtype(row.v)).filter(Boolean);
    const links = linksResult.rows.map(row => {
      const source = parseAgtype(row.source_id);
      const target = parseAgtype(row.target_id);
      const rObj = parseAgtype(row.r);
      return {
        source,
        target,
        relation: rObj?.properties?.relation || "RELATION"
      };
    }).filter(link => link.source && link.target);

    return { nodes, links };
  } catch (err: any) {
    console.error("Database Error: Gagal mendapatkan graf penuh:", err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function resetGraphInDB(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    await client.query('LOAD \'age\'; SET search_path = ag_catalog, "$user", public;');

    // Drop all nodes and relations
    await client.query(`
      SELECT * FROM cypher('mursyid_graph', $$
        MATCH (n:Entity)
        DETACH DELETE n
      $$) as (v agtype);
    `);

    // Reseed baseline
    for (const node of INITIAL_NODES) {
      await client.query(`
        SELECT * FROM cypher('mursyid_graph', $$
          MERGE (v:Entity {id: $id})
          SET v.type = $type, v.label = $label, v.description = $description
          RETURN v
        $$, $1) as (v agtype);
      `, [JSON.stringify(node)]);
    }

    for (const link of INITIAL_LINKS) {
      await client.query(`
        SELECT * FROM cypher('mursyid_graph', $$
          MATCH (a:Entity {id: $source}), (b:Entity {id: $target})
          MERGE (a)-[r:RELATION {relation: $relation}]->(b)
          RETURN r
        $$, $1) as (r agtype);
      `, [JSON.stringify(link)]);
    }
  } catch (err: any) {
    console.error("Database Error: Gagal menetapkan semula graf dalam DB:", err.message);
    throw err;
  } finally {
    client.release();
  }
}

// ==========================================
// API ENDPOINTS
// ==========================================

// 1. Chat endpoint with Google Search Grounding & customized Shafi'i / Malaysia Islamic context
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Mesej diperlukan." });
    }

    const reqApiKey = getRequestApiKey(req);
    const ai = getGeminiClient(reqApiKey);

    const systemInstruction = 
      "Anda adalah seorang Ejen Kepakaran Syariah dan Fiqh Islam (Shafi'i) bertauliah di Malaysia. " +
      "Tugas anda adalah memberikan pandangan fekah, pemahaman hadis, fatwa, dan rujukan sejarah yang sahih. " +
      "Sentiasa utamakan pandangan Mazhab Syafi'i, keputusan Majlis Raja-Raja, fatwa JAKIM, e-Khutbah serta Jabatan Mufti Wilayah Persekutuan (muftiwp.gov.my). " +
      "Bahasa komunikasi mestilah Bahasa Melayu/Malaysia yang sopan, akademik, dan mudah difahami. " +
      "Cakap dengan sandaran dalil yang jelas dari Al-Quran dan Al-Sunnah jika bersesuaian, dan nyatakan sumber rujukan fatwa secara eksplisit. " +
      "Apabila pengguna bertanyakan isu semasa (contohnya pelaburan kripto, vaksin, waktu solat), gunakan keputusan mufti yang sah di Malaysia.";

    const formattedHistory = (history || []).map((h: any) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }]
    }));

    const contents = [...formattedHistory, { role: "user", parts: [{ text: message }] }];

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction,
        temperature: 0.2,
        tools: [{ googleSearch: {} }],
      }
    });

    const text = response.text || "Maaf, tiada jawapan dijana.";
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    
    const citations = chunks.map((chunk: any) => ({
      title: chunk.web?.title || chunk.web?.uri || "Rujukan Sahih",
      url: chunk.web?.uri || "",
    })).filter(c => c.url !== "");

    res.json({ text, citations });
  } catch (error: any) {
    console.error("Chat Error:", error);
    res.status(500).json({ 
      error: error.message || "An unexpected error occurred",
      needsApiKey: error.message?.includes("configured") || !process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes("MY_GEMINI_API_KEY")
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

    const reqApiKey = getRequestApiKey(req);
    const ai = getGeminiClient(reqApiKey);

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

    // Persist Graph to DB if Active
    const pool = getPGPool();
    if (pool) {
      if (!dbInitialized) {
        await initializeDatabase(pool);
      }
      if (isDbActive) {
        console.log("Database: Saving extracted nodes & links...");
        // 1. Save all extracted nodes
        for (const node of graphData.nodes) {
          await saveNodeToGraph(pool, node);
        }
        // 2. Save all extracted links
        for (const link of graphData.links) {
          await saveLinkToGraph(pool, link);
        }
        // 3. Return full consolidated graph from DB
        const fullGraph = await getFullGraph(pool);
        return res.json(fullGraph);
      }
    }

    // In-memory fallback
    console.log("Database: Offline. Merging graph elements in-memory...");
    for (const node of graphData.nodes) {
      const existingIdx = fallbackNodes.findIndex((n: any) => n.id.toLowerCase() === node.id.toLowerCase());
      if (existingIdx >= 0) {
        fallbackNodes[existingIdx] = { ...fallbackNodes[existingIdx], ...node };
      } else {
        fallbackNodes.push(node);
      }
    }

    for (const link of graphData.links) {
      const exists = fallbackLinks.some(
        (l: any) => l.source.toLowerCase() === link.source.toLowerCase() &&
                   l.target.toLowerCase() === link.target.toLowerCase() &&
                   l.relation.toUpperCase() === link.relation.toUpperCase()
      );
      if (!exists) {
        fallbackLinks.push(link);
      }
    }

    res.json({ nodes: fallbackNodes, links: fallbackLinks });
  } catch (error: any) {
    console.error("Extract Graph Error:", error);
    res.status(500).json({ 
      error: error.message || "An unexpected error occurred",
      needsApiKey: error.message?.includes("configured") || !process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes("MY_GEMINI_API_KEY")
    });
  }
});

// 3. Query the unified mesh graph state
app.get("/api/get-graph", async (req, res) => {
  try {
    const pool = getPGPool();
    if (pool) {
      if (!dbInitialized) {
        await initializeDatabase(pool);
      }
      if (isDbActive) {
        const fullGraph = await getFullGraph(pool);
        return res.json(fullGraph);
      }
    }
    // Return in-memory fallback
    res.json({ nodes: fallbackNodes, links: fallbackLinks });
  } catch (error: any) {
    console.error("Get Graph Error:", error);
    res.json({ nodes: fallbackNodes, links: fallbackLinks }); // Fail-safe
  }
});

// 4. Reset the entire graph state (in DB or memory fallback)
app.post("/api/reset-graph", async (req, res) => {
  try {
    const pool = getPGPool();
    if (pool) {
      if (!dbInitialized) {
        await initializeDatabase(pool);
      }
      if (isDbActive) {
        await resetGraphInDB(pool);
        const fullGraph = await getFullGraph(pool);
        return res.json(fullGraph);
      }
    }
    // Reset in-memory fallback
    fallbackNodes = JSON.parse(JSON.stringify(INITIAL_NODES));
    fallbackLinks = JSON.parse(JSON.stringify(INITIAL_LINKS));
    res.json({ nodes: fallbackNodes, links: fallbackLinks });
  } catch (error: any) {
    console.error("Reset Graph Error:", error);
    res.status(500).json({ error: error.message || "An unexpected error occurred" });
  }
});

// Setup Vite Dev server or Serve build files
async function startServer() {
  // Try to pre-initialize database on startup to speed up subsequent requests
  const pool = getPGPool();
  if (pool) {
    initializeDatabase(pool).then(active => {
      if (active) {
        console.log("Database: Connected and fully initialized on startup.");
      } else {
        console.log("Database: Failed connection on startup. Running in memory fallback.");
      }
    }).catch(err => {
      console.log("Database Error on Startup:", err.message);
    });
  }

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
