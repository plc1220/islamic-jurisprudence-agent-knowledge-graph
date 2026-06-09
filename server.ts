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

// Global background crawler state
let isBatchCrawling = false;
let batchCrawlLogs: Array<{ url: string; title: string; status: string; log: string; time: string }> = [];

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
// CRAWLER & VECTOR HELPERS
// ==========================================
async function extractCleanContent(url: string, ai: GoogleGenAI): Promise<{ title: string; content: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      }
    });

    if (!response.ok) {
      throw new Error(`Kelemahan pelayan! Kod: ${response.status}`);
    }

    const html = await response.text();

    // Strip heavy layout tags before sending to LLM
    let cleanHtml = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "");

    // Use gemini-2.0-flash-lite as requested: fast, cheap and perfect for structuring unstructured HTML
    const responseAi = await ai.models.generateContent({
      model: "gemini-2.0-flash-lite",
      contents: `Berdasarkan kod HTML berikut, sila keluarkan tajuk rencana utama dan isi kandungan teks utamanya sahaja. 
Abaikan semua menu navigasi, iklan, pautan sidebar, pengisytiharan kuki, dan maklumat footer. 
Sila kembalikan jawapan dalam format JSON dengan dua medan: "title" (tajuk rencana) dan "content" (teks penuh rencana yang bersih).

KOD HTML:
${cleanHtml.substring(0, 32000)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["title", "content"],
          properties: {
            title: { type: Type.STRING, description: "Tajuk rencana utama" },
            content: { type: Type.STRING, description: "Kandungan teks rencana penuh yang bersih dan bermaklumat" }
          }
        }
      }
    });

    const resultText = responseAi.text || "{}";
    const result = JSON.parse(resultText.trim());

    return {
      title: result.title || "Rujukan Kontemporari",
      content: result.content || ""
    };
  } catch (err: any) {
    console.error(`Crawler Error for ${url}:`, err.message);
    throw new Error(`Gagal melayari atau mengekstrak kandungan: ${err.message}`);
  }
}

function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  if (!text) return [];
  const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(p => p.length > 20);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const para of paragraphs) {
    if ((currentChunk + "\n" + para).length <= chunkSize) {
      currentChunk = currentChunk ? (currentChunk + "\n" + para) : para;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = para;
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  return chunks;
}

async function saveChunkToDB(pool: pg.Pool, content: string, embedding: number[], metadata: any) {
  const client = await pool.connect();
  try {
    const query = `
      INSERT INTO fatwa_chunks (content, embedding, metadata)
      VALUES ($1, $2, $3)
      RETURNING id;
    `;
    const vectorStr = "[" + embedding.join(",") + "]";
    await client.query(query, [content, vectorStr, JSON.stringify(metadata)]);
  } catch (err: any) {
    console.error("Database Error saving vector chunk:", err.message);
  } finally {
    client.release();
  }
}

async function searchVectorChunks(pool: pg.Pool, queryEmbedding: number[], limit: number = 3): Promise<string[]> {
  const client = await pool.connect();
  try {
    const vectorStr = "[" + queryEmbedding.join(",") + "]";
    const query = `
      SELECT content
      FROM fatwa_chunks
      ORDER BY embedding <=> $1
      LIMIT $2;
    `;
    const result = await client.query(query, [vectorStr, limit]);
    return result.rows.map(row => row.content);
  } catch (err: any) {
    console.error("Database Error searching vectors:", err.message);
    return [];
  } finally {
    client.release();
  }
}

// ==========================================
// GRAPHRAG KEYWORD SEARCH EXTRACRATORS
// ==========================================
function extractKeywords(text: string): string[] {
  const stopwords = new Set([
    "dan", "di", "ke", "yang", "adalah", "pada", "untuk", "atau", "saya", "apa", 
    "apakah", "bagaimana", "ada", "tidak", "bila", "itu", "ini", "dengan", "oleh",
    "dari", "darihal", "tentang", "mengenai", "bagi", "seperti", "ia", "mereka", "kita",
    "kami", "kamu", "dia", "dalam", "sebagai", "akan", "telah", "sudah", "belum", "sedang",
    "boleh", "harus", "wajib", "hukum", "hukumnya", "status", "mengikut", "menurut", "keputusan",
    "fatwa", "kebangsaan", "malaysia", "pejabat", "mufti", "bagaimanakah", "apakah", "siapa", "siapakah"
  ]);
  
  const cleaned = text.toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, " ")
    .replace(/\s+/g, " ");
    
  return cleaned.split(/\s+/)
    .map(word => word.trim())
    .filter(word => word.length > 3 && !stopwords.has(word));
}

async function searchGraphTriples(pool: pg.Pool, keywords: string[]): Promise<string[]> {
  if (keywords.length === 0) return [];
  const client = await pool.connect();
  try {
    await client.query('LOAD \'age\'; SET search_path = ag_catalog, "$user", public;');
    
    const triples: string[] = [];
    const selectedKeywords = keywords.slice(0, 2); // Pull top 2 keywords to avoid latency lag
    
    for (const keyword of selectedKeywords) {
      const query = `
        SELECT * FROM cypher('mursyid_graph', $$
          MATCH (a:Entity)-[r:RELATION]->(b:Entity)
          WHERE a.id CONTAINS $keyword OR b.id CONTAINS $keyword
             OR a.label CONTAINS $keyword OR b.label CONTAINS $keyword
          RETURN a.label, r.relation, b.label, a.description, b.description
        $$, $1) as (source_label agtype, relation agtype, target_label agtype, source_desc agtype, target_desc agtype);
      `;
      
      const params = JSON.stringify({ keyword });
      const result = await client.query(query, [params]);
      
      for (const row of result.rows) {
        const sourceLabel = parseAgtype(row.source_label);
        const relation = parseAgtype(row.relation);
        const targetLabel = parseAgtype(row.target_label);
        const sourceDesc = parseAgtype(row.source_desc);
        const targetDesc = parseAgtype(row.target_desc);
        
        const relName = relation?.properties?.relation || "BERKAITAN_DENGAN";
        triples.push(`[Graf DB] ${sourceLabel} -> ${relName} -> ${targetLabel} (${sourceDesc || ""} | ${targetDesc || ""})`);
      }
    }
    
    return Array.from(new Set(triples)).slice(0, 10);
  } catch (err: any) {
    console.error("Database Error searching graph:", err.message);
    return [];
  } finally {
    client.release();
  }
}

function searchFallbackGraph(keywords: string[]): string[] {
  if (keywords.length === 0) return [];
  const triples: string[] = [];
  const selectedKeywords = keywords.slice(0, 2);

  for (const keyword of selectedKeywords) {
    for (const link of fallbackLinks) {
      const sourceNode = fallbackNodes.find(n => n.id.toLowerCase() === link.source.toLowerCase());
      const targetNode = fallbackNodes.find(n => n.id.toLowerCase() === link.target.toLowerCase());
      
      if (!sourceNode || !targetNode) continue;
      
      const isMatch = 
        sourceNode.id.toLowerCase().includes(keyword) ||
        sourceNode.label.toLowerCase().includes(keyword) ||
        sourceNode.description.toLowerCase().includes(keyword) ||
        targetNode.id.toLowerCase().includes(keyword) ||
        targetNode.label.toLowerCase().includes(keyword) ||
        targetNode.description.toLowerCase().includes(keyword) ||
        link.relation.toLowerCase().includes(keyword);
        
      if (isMatch) {
        triples.push(`[Memori Graf] ${sourceNode.label} -> ${link.relation} -> ${targetNode.label} (${sourceNode.description || ""} | ${targetNode.description || ""})`);
      }
    }
  }
  return Array.from(new Set(triples)).slice(0, 10);
}

// ==========================================
// END-TO-END INGESTION CONTROL PIPELINE
// ==========================================
async function ingestURLContent(url: string, ai: GoogleGenAI): Promise<{ chunksCount: number; nodesCount: number; linksCount: number; title: string }> {
  const pool = getPGPool();
  
  // 1. Scrape clean HTML with gemini-2.0-flash-lite
  const { title, content } = await extractCleanContent(url, ai);
  
  if (!content || content.trim().length === 0) {
    throw new Error("Laman web tidak mengandungi sebarang kandungan teks rencana yang bermaklumat.");
  }
  
  let chunksCount = 0;
  let nodesCount = 0;
  let linksCount = 0;
  
  // 2. Index to pgvector (chunks)
  const chunks = chunkText(content, 1200, 200);
  chunksCount = chunks.length;

  if (pool && isDbActive) {
    for (const chunk of chunks) {
      try {
        const embedResponse = await ai.models.embedContent({
          model: "text-embedding-004",
          contents: chunk,
        });
        const embedding = embedResponse.embedding.values;
        await saveChunkToDB(pool, chunk, embedding, { url, title, dateIndexed: new Date().toISOString() });
      } catch (err: any) {
        console.error(`Vector indexing failed for chunk under ${url}:`, err.message);
      }
    }
  }
  
  // 3. Extract nodes and links for graph database (AGE/memory)
  const systemInstruction = 
    "Anda adalah pakar pengekstrakan maklumat teologi dan entiti undang-undang Islam. " +
    "Tugas anda adalah mengekstrak konsep Syariah, hukum fiqh, rujukan dalil (Al-Quran/Hadis), institusi autoriti (JAKIM, Mufti, dll), dan mazhab dari perbincangan atau teks yang diberikan " +
    "dan menyusunnya dalam struktur nod (nodes) dan hubungan (links) Graf Pengetahuan (Knowledge Graph). " +
    "Setiap nod mesti mempunyai jenis (type) yang bersesuaian antara salah satu berikut: " +
    "1. 'Konsep' (e.g. Puasa, Solat, Riba) " +
    "2. 'Hukum' (e.g. Wajib, Sunat, Harus, Haram) " +
    "3. 'Sumber' (e.g. Al-Quran, Al-Hadith) " +
    "4. 'Mazhab' (e.g. Mazhab Syafi'i) " +
    "5. 'Institusi' (e.g. JAKIM, Jabatan Mufti WP) " +
    "6. 'Artikkel' (Satu daripada 10 laman rujukan khusus yang dibincangkan) " +
    "Setiap nod ID mestilah unik dan ringkas. Hubungan (links) antara nod mestilah menggambarkan relasi dalam Bahasa Melayu yang ringkas. " +
    "Pastikan teks bahasa pengantar adalah Bahasa Melayu/Malaysia.";

  const prompt = `Analisis kandungan berikut daripada plans rencana "${title}": "${content.substring(0, 9000)}". Kenalpasti entiti perundangan Islam dan kaitannya, kemudian bina graf pengetahuan.`;

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
            items: {
              type: Type.OBJECT,
              required: ["id", "type", "label", "description"],
              properties: {
                id: { type: Type.STRING },
                type: { type: Type.STRING },
                label: { type: Type.STRING },
                description: { type: Type.STRING }
              }
            }
          },
          links: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ["source", "target", "relation"],
              properties: {
                source: { type: Type.STRING },
                target: { type: Type.STRING },
                relation: { type: Type.STRING }
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
    console.error("JSON Parsing Error from Gemini output during ingestion:", textResult);
    throw new Error("Gagal mengurai Graf Pengetahuan daripada output model kecerdasan buatan.");
  }

  nodesCount = graphData.nodes?.length || 0;
  linksCount = graphData.links?.length || 0;

  if (pool && isDbActive) {
    // Persistent Apache AGE updates
    for (const node of (graphData.nodes || [])) {
      await saveNodeToGraph(pool, node);
    }
    for (const link of (graphData.links || [])) {
      await saveLinkToGraph(pool, link);
    }
  } else {
    // Memory fallback updates
    for (const node of (graphData.nodes || [])) {
      const existingIdx = fallbackNodes.findIndex((n: any) => n.id.toLowerCase() === node.id.toLowerCase());
      if (existingIdx >= 0) {
        fallbackNodes[existingIdx] = { ...fallbackNodes[existingIdx], ...node };
      } else {
        fallbackNodes.push(node);
      }
    }

    for (const link of (graphData.links || [])) {
      const exists = fallbackLinks.some(
        (l: any) => l.source.toLowerCase() === link.source.toLowerCase() &&
                   l.target.toLowerCase() === link.target.toLowerCase() &&
                   l.relation.toUpperCase() === link.relation.toUpperCase()
      );
      if (!exists) {
        fallbackLinks.push(link);
      }
    }
  }

  return { chunksCount, nodesCount, linksCount, title };
}

// ==========================================
// API ENDPOINTS
// ==========================================

// 1. Chat endpoint with TRUE Hybrid GraphRAG Grounding & customized Shafi'i context
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

    // GRAPH-RETRIEVAL AUGMENTED GENERATION (GraphRAG) LAYER
    let groundedContext = "";
    const keywords = extractKeywords(message);
    const pool = getPGPool();

    if (pool && isDbActive) {
      try {
        console.log(`GraphRAG: Initiating database context search for: "${message}"`);
        // A. pgvector Semantic Search
        let vectorChunks: string[] = [];
        try {
          const embedResponse = await ai.models.embedContent({
            model: "text-embedding-004",
            contents: message,
          });
          const queryEmbedding = embedResponse.embedding.values;
          vectorChunks = await searchVectorChunks(pool, queryEmbedding, 3);
        } catch (vErr: any) {
          console.warn("GraphRAG Vector Retrieval Offline:", vErr.message);
        }

        // B. Apache AGE Cypher Retrieval
        const graphTriples = await searchGraphTriples(pool, keywords);

        if (vectorChunks.length > 0 || graphTriples.length > 0) {
          groundedContext += "\n\nMAKLUMAT GRAPHRAG SAHIH DARIPADA DATABASE PERSISTEN MURSYID AI:\n";
          groundedContext += "===============================================================\n";
          if (graphTriples.length > 0) {
            groundedContext += "ENTITI & HUBUNGAN ONTOLOGI SYARAK (APACHE AGE):\n";
            groundedContext += graphTriples.join("\n") + "\n\n";
          }
          if (vectorChunks.length > 0) {
            groundedContext += "KERATAN TEKS PECAHAN (PGVECTOR SIMILARITY SEARCH):\n";
            groundedContext += vectorChunks.map((c, i) => `[Sumber Rencana ${i+1}]: ${c}`).join("\n") + "\n";
          }
        }
      } catch (ragErr: any) {
        console.error("Failed to compile Database GraphRAG Context:", ragErr.message);
      }
    }

    // In-memory GraphRAG fallback if database is offline or ungrounded
    if (!groundedContext && keywords.length > 0) {
      const memoryTriples = searchFallbackGraph(keywords);
      if (memoryTriples.length > 0) {
        groundedContext += "\n\nMAKLUMAT GRAPHRAG SAHIH DARIPADA MEMORI GRY MURSYID AI:\n";
        groundedContext += "=========================================================\n";
        groundedContext += "ENTITI & HUBUNGAN ONTOLOGI SYARAK (MOCK-GRAPH):\n";
        groundedContext += memoryTriples.join("\n") + "\n";
      }
    }

    // Append our grounding context block directly into the Gemini instructions
    const finalSystemInstruction = systemInstruction + (groundedContext ? `\n\nSila berikan keutamaan tertinggi kepada data rujukan di bawah untuk menyusun hujah jawapan anda:\n${groundedContext}` : "");

    const formattedHistory = (history || []).map((h: any) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }]
    }));

    const contents = [...formattedHistory, { role: "user", parts: [{ text: message }] }];

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction: finalSystemInstruction,
        temperature: 0.15, // Extremely low temperature to enforce strict adherence to groundings
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
        for (const node of graphData.nodes) {
          await saveNodeToGraph(pool, node);
        }
        for (const link of graphData.links) {
          await saveLinkToGraph(pool, link);
        }
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
    fallbackNodes = JSON.parse(JSON.stringify(INITIAL_NODES));
    fallbackLinks = JSON.parse(JSON.stringify(INITIAL_LINKS));
    res.json({ nodes: fallbackNodes, links: fallbackLinks });
  } catch (error: any) {
    console.error("Reset Graph Error:", error);
    res.status(500).json({ error: error.message || "An unexpected error occurred" });
  }
});

// ==========================================
// REAL-TIME SCRAPING & BATCH INDEX PORTALS
// ==========================================
app.post("/api/ingest-url", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "URL diperlukan." });
    }

    const reqApiKey = getRequestApiKey(req);
    const ai = getGeminiClient(reqApiKey);

    const stats = await ingestURLContent(url, ai);
    res.json({
      success: true,
      message: `Berjaya mengindeks "${stats.title}".`,
      stats
    });
  } catch (error: any) {
    console.error("Ingest URL Error:", error);
    res.status(500).json({ error: error.message || "Gagal melaksanakan proses crawler ke atas URL berkenaan." });
  }
});

app.get("/api/crawl-logs", (req, res) => {
  res.json({
    isCrawling: isBatchCrawling,
    logs: batchCrawlLogs
  });
});

app.post("/api/ingest-batch", async (req, res) => {
  if (isBatchCrawling) {
    return res.status(400).json({ error: "Proses merangkak (batch crawling) sedang berjalan." });
  }

  const reqApiKey = getRequestApiKey(req);
  let ai;
  try {
    ai = getGeminiClient(reqApiKey);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }

  isBatchCrawling = true;
  batchCrawlLogs = [];

  // limited sequence list of target official portals for fast execution
  const targetUrls = [
    "https://muftiwp.gov.my/ms/artikel/irsyad-hukum",
    "https://muftiwp.gov.my/ms/artikel/bayan-linnas",
    "https://muftiwp.gov.my/ms/artikel/al-kafi-li-al-fatawi",
    "https://www.waktusolat.digital",
    "https://myhadith.islam.gov.my",
    "https://i-fiqh.islam.gov.my/portal/"
  ];

  // Fire-and-forget background crawling
  (async () => {
    for (const url of targetUrls) {
      const timeStr = new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Kuala_Lumpur" });
      const logEntry = {
        url,
        title: "Penganalisisan Laman...",
        status: "RUNNING",
        log: "Memulakan sambungan HTML Scraper...",
        time: timeStr
      };
      batchCrawlLogs.push(logEntry);

      try {
        console.log(`Crawler: Ingesting URL: ${url}`);
        const stats = await ingestURLContent(url, ai);
        
        logEntry.title = stats.title;
        logEntry.status = "SUCCESS";
        logEntry.log = `Mengindeks ${stats.chunksCount} paragraf teks (pgvector) dan mengekstrak ${stats.nodesCount} entiti perundangan Islam (Apache AGE).`;
      } catch (err: any) {
        console.error(`Crawler Error for ${url}:`, err.message);
        logEntry.status = "FAILED";
        logEntry.log = `Gagal diindeks: ${err.message}`;
      }

      logEntry.time = new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Kuala_Lumpur" });
    }
    isBatchCrawling = false;
  })();

  res.json({ success: true, message: "Proses crawler diaktifkan di latar belakang." });
});

// Setup Vite Dev server or Serve build files
async function startServer() {
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
