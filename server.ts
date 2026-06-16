import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";
import { spawn } from "child_process";
import { createHash } from "crypto";
import { BigQuery } from "@google-cloud/bigquery";
import { Storage } from "@google-cloud/storage";
import { GoogleAuth } from "google-auth-library";

dotenv.config();

// ==========================================
// CENTRAL CONFIGURATION & MODEL RESOLUTION
// ==========================================
let modelConfig = {
  CRAWLER_MODEL: "gemini-3.1-flash-lite",
  CHAT_MODEL: "gemini-3.5-flash",
  EXTRACTOR_MODEL: "gemini-3.5-flash"
};

try {
  const configPath = path.join(process.cwd(), "config.json");
  if (fs.existsSync(configPath)) {
    const rawConfig = fs.readFileSync(configPath, "utf8");
    const parsedConfig = JSON.parse(rawConfig);
    modelConfig = { ...modelConfig, ...parsedConfig };
    console.log("Configuration loaded successfully from config.json:", modelConfig);
  }
} catch (e: any) {
  console.log("Configuration Warning: Could not read config.json, using defaults.", e.message);
}

// Allow environment variables to override the config file
const CRAWLER_MODEL = process.env.CRAWLER_MODEL || modelConfig.CRAWLER_MODEL;
const CHAT_MODEL = process.env.CHAT_MODEL || modelConfig.CHAT_MODEL;
const EXTRACTOR_MODEL = process.env.EXTRACTOR_MODEL || modelConfig.EXTRACTOR_MODEL;
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const CRAWL4AI_BRIDGE_PATH = process.env.CRAWL4AI_BRIDGE_PATH || path.join(process.cwd(), "scripts", "crawl4ai_bridge.py");
const INGESTION_CRAWLER = (process.env.INGESTION_CRAWLER || "crawl4ai").toLowerCase();
const CRAWL_MAX_DEPTH = Math.max(0, parseInt(process.env.CRAWL_MAX_DEPTH || "1", 10));
const CRAWL_MAX_PAGES_PER_SOURCE = Math.max(1, parseInt(process.env.CRAWL_MAX_PAGES_PER_SOURCE || "3", 10));
const CRAWL4AI_TIMEOUT_MS = Math.max(30_000, parseInt(process.env.CRAWL4AI_TIMEOUT_MS || "180000", 10));
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "";
const GCP_LOCATION = process.env.GCP_LOCATION || "asia-southeast1";
const GEMINI_LOCATION = process.env.GEMINI_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || "global";
const BQ_DATASET = process.env.BQ_DATASET || "mursyid_knowledge";
const BQ_CORPUS_TABLE = process.env.BQ_CORPUS_TABLE || "corpus";
const BQ_CHUNKS_TABLE = process.env.BQ_CHUNKS_TABLE || "chunks";
const BQ_GRAPH_TABLE = process.env.BQ_GRAPH_TABLE || "graph_edges";
const BQ_EMBEDDING_MODEL = process.env.BQ_EMBEDDING_MODEL || "text-embedding-004";
const GCS_RAW_BUCKET = process.env.GCS_RAW_BUCKET || "";
const KNOWLEDGE_CATALOG_ENTRY_GROUP = process.env.KNOWLEDGE_CATALOG_ENTRY_GROUP || "mursyid-knowledge";
const KNOWLEDGE_CATALOG_ENTRY_TYPE = process.env.KNOWLEDGE_CATALOG_ENTRY_TYPE || "mursyid-knowledge-entry";
const KNOWLEDGE_CATALOG_ASPECT_TYPE = process.env.KNOWLEDGE_CATALOG_ASPECT_TYPE || "mursyid-context";
const MDCODE_EXPORT_DIR = process.env.MDCODE_EXPORT_DIR || path.join(process.cwd(), "catalog-export");

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

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

// In-memory fallback graph store for local/offline development.
let fallbackNodes = JSON.parse(JSON.stringify(INITIAL_NODES));
let fallbackLinks = JSON.parse(JSON.stringify(INITIAL_LINKS));

// Global background crawler state
let isBatchCrawling = false;
type CrawlLogStatus = "RUNNING" | "SUCCESS" | "FAILED";
type CrawlSource = {
  id: number;
  name: string;
  url: string;
  category: "website - internal" | "articles - internal" | "website";
  includePatterns: string[];
  defaultMaxPages: number;
};
type CrawledDocument = {
  url: string;
  title: string;
  content: string;
  sourceName?: string;
  category?: string;
  crawler: string;
  depth?: number;
};
type KnowledgeNode = {
  id: string;
  type: string;
  label: string;
  description: string;
};
type KnowledgeLink = {
  source: string;
  target: string;
  relation: string;
};
type GraphExtraction = {
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
};
type Citation = {
  title: string;
  url: string;
  source: "bigquery-vector" | "knowledge-catalog-graph" | "local-memory";
  documentId?: string;
  chunkIndex?: number;
  snippet?: string;
};
type RetrievedChunk = {
  content: string;
  title: string;
  sourceUrl: string;
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  metadataJson?: string;
  score?: number;
};
type RetrievedGraphTriple = {
  text: string;
  title: string;
  sourceUrl: string;
  documentId?: string;
};
type GcpPipelineStatus = "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED_NOT_CONFIGURED";
type IngestStats = {
  title: string;
  chunksCount: number;
  nodesCount: number;
  linksCount: number;
  documentsCount: number;
  crawler: string;
  gcsStatus: GcpPipelineStatus;
  bigQueryStatus: GcpPipelineStatus;
  knowledgeCatalogStatus: GcpPipelineStatus;
  metadataCatalogPath?: string;
  gcsRawUris: string[];
};
type CrawlLog = {
  sourceId?: number;
  sourceName?: string;
  url: string;
  title: string;
  status: CrawlLogStatus;
  log: string;
  time: string;
  pagesCount?: number;
  chunksCount?: number;
  nodesCount?: number;
  linksCount?: number;
  crawler?: string;
  gcsStatus?: GcpPipelineStatus;
  bigQueryStatus?: GcpPipelineStatus;
  knowledgeCatalogStatus?: GcpPipelineStatus;
};

let batchCrawlLogs: CrawlLog[] = [];

const SOURCE_PORTALS: CrawlSource[] = [
  {
    id: 1,
    name: "Waktu Solat Digital",
    url: "https://www.waktusolat.digital",
    category: "website - internal",
    includePatterns: ["*waktusolat.digital*"],
    defaultMaxPages: 2
  },
  {
    id: 2,
    name: "Berita Harian - Agama",
    url: "https://www.bharian.com.my/rencana/agama",
    category: "articles - internal",
    includePatterns: ["*bharian.com.my/rencana/agama*", "*bharian.com.my/berita/nasional*", "*bharian.com.my/rencana*"],
    defaultMaxPages: 4
  },
  {
    id: 3,
    name: "Harian Metro - Addin",
    url: "https://www.hmetro.com.my/addin",
    category: "articles - internal",
    includePatterns: ["*hmetro.com.my/addin*"],
    defaultMaxPages: 4
  },
  {
    id: 4,
    name: "Portal i-Fiqh JAKIM",
    url: "https://i-fiqh.islam.gov.my/portal/",
    category: "website",
    includePatterns: ["*i-fiqh.islam.gov.my/portal*"],
    defaultMaxPages: 3
  },
  {
    id: 5,
    name: "Sistem MyHadith JAKIM",
    url: "https://myhadith.islam.gov.my",
    category: "website",
    includePatterns: ["*myhadith.islam.gov.my*"],
    defaultMaxPages: 3
  },
  {
    id: 6,
    name: "e-Khutbah JAKIM",
    url: "https://www.islam.gov.my/ms/e-khutbah",
    category: "website",
    includePatterns: ["*islam.gov.my/ms/e-khutbah*", "*islam.gov.my/ms/khutbah*"],
    defaultMaxPages: 3
  },
  {
    id: 7,
    name: "Mufti WP - Bayan Linnas",
    url: "https://muftiwp.gov.my/ms/artikel/bayan-linnas",
    category: "website",
    includePatterns: ["*muftiwp.gov.my/ms/artikel/bayan-linnas*"],
    defaultMaxPages: 4
  },
  {
    id: 8,
    name: "Mufti WP - Irsyad Hukum",
    url: "https://muftiwp.gov.my/ms/artikel/irsyad-hukum",
    category: "website",
    includePatterns: ["*muftiwp.gov.my/ms/artikel/irsyad-hukum*"],
    defaultMaxPages: 4
  },
  {
    id: 9,
    name: "Mufti WP - Irsyad Al-Hadith",
    url: "https://muftiwp.gov.my/ms/artikel/irsyad-al-hadith",
    category: "website",
    includePatterns: ["*muftiwp.gov.my/ms/artikel/irsyad-al-hadith*"],
    defaultMaxPages: 4
  },
  {
    id: 10,
    name: "Mufti WP - Al-Kafi li al-Fatawi",
    url: "https://muftiwp.gov.my/ms/artikel/al-kafi-li-al-fatawi",
    category: "website",
    includePatterns: ["*muftiwp.gov.my/ms/artikel/al-kafi-li-al-fatawi*"],
    defaultMaxPages: 4
  }
];

// ==========================================
// WORKING HOURS CONTROL MIDDLEWARE
// ==========================================
app.use("/api", (req, res, next) => {
  if (process.env.BYPASS_WORKING_HOURS !== "false") {
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
// GOOGLE GEN AI SDK CLIENT VIA ADC / CLOUD RUN SERVICE ACCOUNT
// ==========================================
function isAdcConfigured(): boolean {
  return (
    process.env.GOOGLE_GENAI_USE_ENTERPRISE === "true" || 
    process.env.GOOGLE_GENAI_USE_VERTEXAI === "true" ||
    !!process.env.GOOGLE_CLOUD_PROJECT
  );
}

function getGeminiClient(): GoogleGenAI {
  // Prevent accidental Developer API-key auth. Gemini calls should use ADC locally
  // and the Cloud Run runtime service account in production.
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.API_KEY;

  const project = process.env.GOOGLE_CLOUD_PROJECT || GCP_PROJECT_ID || undefined;
  console.log(`Initializing GoogleGenAI with ADC / Vertex AI for project: ${project || "default/ADC"}, location: ${GEMINI_LOCATION}`);

  return new GoogleGenAI({
    enterprise: true,
    vertexai: true,
    project,
    location: GEMINI_LOCATION,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// ==========================================
// GCP-NATIVE KNOWLEDGE PLATFORM: GCS + BIGQUERY + KNOWLEDGE CATALOG
// ==========================================
let bigQueryClient: BigQuery | null = null;
let storageClient: Storage | null = null;
let googleAuth: GoogleAuth | null = null;
let bigQueryInitPromise: Promise<boolean> | null = null;

type PreparedChunk = {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
};

function isGcpNativeConfigured(): boolean {
  return Boolean(GCP_PROJECT_ID);
}

function isValidBqIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function assertBqIdentifiers() {
  const identifiers = {
    BQ_DATASET,
    BQ_CORPUS_TABLE,
    BQ_CHUNKS_TABLE,
    BQ_GRAPH_TABLE,
  };

  for (const [name, value] of Object.entries(identifiers)) {
    if (!isValidBqIdentifier(value)) {
      throw new Error(`${name} must contain only letters, numbers, and underscores, and cannot start with a number.`);
    }
  }
}

function bqDatasetRef(): string {
  assertBqIdentifiers();
  return `\`${GCP_PROJECT_ID}.${BQ_DATASET}\``;
}

function bqTableRef(table: string): string {
  assertBqIdentifiers();
  if (!isValidBqIdentifier(table)) {
    throw new Error(`Invalid BigQuery table identifier: ${table}`);
  }
  return `\`${GCP_PROJECT_ID}.${BQ_DATASET}.${table}\``;
}

function getBigQueryClient(): BigQuery | null {
  if (!isGcpNativeConfigured()) return null;
  if (!bigQueryClient) {
    bigQueryClient = new BigQuery({ projectId: GCP_PROJECT_ID });
  }
  return bigQueryClient;
}

function getStorageClient(): Storage | null {
  if (!isGcpNativeConfigured() || !GCS_RAW_BUCKET) return null;
  if (!storageClient) {
    storageClient = new Storage({ projectId: GCP_PROJECT_ID });
  }
  return storageClient;
}

function getGoogleAuth(): GoogleAuth | null {
  if (!isGcpNativeConfigured()) return null;
  if (!googleAuth) {
    googleAuth = new GoogleAuth({
      projectId: GCP_PROJECT_ID,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
  }
  return googleAuth;
}

function hashId(input: string, length: number = 16): string {
  return createHash("sha256").update(input).digest("hex").slice(0, length);
}

function slugify(input: string, fallback: string = "item"): string {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function documentIdFor(document: CrawledDocument): string {
  return `${slugify(document.title || document.sourceName || "document")}-${hashId(document.url || document.content)}`;
}

function safeJson(value: any): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function truncateText(value: string, maxLength: number): string {
  if (!value) return "";
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3)}...`;
}

function catalogFqn(kind: string, id: string): string {
  const project = slugify(GCP_PROJECT_ID || "project", "project");
  const location = slugify(GCP_LOCATION || "location", "location");
  const group = slugify(KNOWLEDGE_CATALOG_ENTRY_GROUP, "entry-group");
  return `custom:mursyid-ai.${project}.${location}.${group}.${slugify(kind)}.${slugify(id)}`;
}

function getEmbeddingModelName(): string {
  if (BQ_EMBEDDING_MODEL.includes(".") || BQ_EMBEDDING_MODEL.includes("/")) {
    return "text-embedding-004";
  }
  return BQ_EMBEDDING_MODEL || "text-embedding-004";
}

async function generateTextEmbedding(ai: GoogleGenAI, content: string): Promise<number[]> {
  const embedResponse = await ai.models.embedContent({
    model: getEmbeddingModelName(),
    contents: content,
  });
  return embedResponse.embeddings?.[0]?.values || [];
}

async function runBigQuery(query: string, params?: Record<string, any>): Promise<any[]> {
  const client = getBigQueryClient();
  if (!client) return [];
  const [rows] = await client.query({
    query,
    params,
    location: GCP_LOCATION,
  });
  return rows as any[];
}

async function ensureBigQueryKnowledgeStore(): Promise<boolean> {
  if (!isGcpNativeConfigured()) return false;
  if (!bigQueryInitPromise) {
    bigQueryInitPromise = (async () => {
      const location = GCP_LOCATION.replace(/'/g, "");
      await runBigQuery(`CREATE SCHEMA IF NOT EXISTS ${bqDatasetRef()} OPTIONS(location='${location}')`);
      await runBigQuery(`
        CREATE TABLE IF NOT EXISTS ${bqTableRef(BQ_CORPUS_TABLE)} (
          document_id STRING NOT NULL,
          source_url STRING,
          title STRING,
          source_name STRING,
          category STRING,
          crawler STRING,
          gcs_uri STRING,
          content STRING,
          metadata_json STRING,
          created_at TIMESTAMP,
          updated_at TIMESTAMP
        )
      `);
      await runBigQuery(`
        CREATE TABLE IF NOT EXISTS ${bqTableRef(BQ_CHUNKS_TABLE)} (
          chunk_id STRING NOT NULL,
          document_id STRING NOT NULL,
          source_url STRING,
          title STRING,
          chunk_index INT64,
          content STRING,
          embedding ARRAY<FLOAT64>,
          metadata_json STRING,
          created_at TIMESTAMP
        )
      `);
      await runBigQuery(`
        CREATE TABLE IF NOT EXISTS ${bqTableRef(BQ_GRAPH_TABLE)} (
          edge_id STRING NOT NULL,
          document_id STRING,
          source_url STRING,
          source_id STRING,
          source_label STRING,
          source_type STRING,
          source_description STRING,
          target_id STRING,
          target_label STRING,
          target_type STRING,
          target_description STRING,
          relation STRING,
          metadata_json STRING,
          created_at TIMESTAMP
        )
      `);

      try {
        await runBigQuery(`
          CREATE VECTOR INDEX IF NOT EXISTS chunks_embedding_idx
          ON ${bqTableRef(BQ_CHUNKS_TABLE)}(embedding)
          OPTIONS(index_type='TREE_AH', distance_type='COSINE')
        `);
      } catch (err: any) {
        console.warn("BigQuery Vector Index: continuing without index:", err.message);
      }

      return true;
    })().catch(err => {
      bigQueryInitPromise = null;
      throw err;
    });
  }
  return bigQueryInitPromise;
}

async function uploadRawMarkdownToGCS(document: CrawledDocument, documentId: string): Promise<{ status: GcpPipelineStatus; uri?: string }> {
  const client = getStorageClient();
  if (!client) return { status: "SKIPPED_NOT_CONFIGURED" };

  try {
    const sourceSlug = slugify(document.sourceName || document.category || "manual");
    const objectName = `raw/${sourceSlug}/${documentId}.md`;
    const file = client.bucket(GCS_RAW_BUCKET).file(objectName);
    await file.save(document.content, {
      contentType: "text/markdown; charset=utf-8",
      metadata: {
        metadata: {
          title: document.title,
          sourceUrl: document.url,
          sourceName: document.sourceName || "",
          crawler: document.crawler,
        },
      },
    });
    return { status: "SUCCESS", uri: `gs://${GCS_RAW_BUCKET}/${objectName}` };
  } catch (err: any) {
    console.error("Cloud Storage snapshot failed:", err.message);
    return { status: "FAILED" };
  }
}

function buildGraphRows(document: CrawledDocument, documentId: string, graphData: GraphExtraction): any[] {
  const nodesById = new Map<string, KnowledgeNode>();
  for (const node of graphData.nodes || []) {
    nodesById.set(String(node.id).toLowerCase(), node);
  }

  return (graphData.links || []).map(link => {
    const sourceNode = nodesById.get(String(link.source).toLowerCase());
    const targetNode = nodesById.get(String(link.target).toLowerCase());
    const edgeKey = `${documentId}:${link.source}:${link.relation}:${link.target}`;
    return {
      edge_id: hashId(edgeKey, 24),
      document_id: documentId,
      source_url: document.url,
      source_id: link.source,
      source_label: sourceNode?.label || link.source,
      source_type: sourceNode?.type || "Entity",
      source_description: sourceNode?.description || "",
      target_id: link.target,
      target_label: targetNode?.label || link.target,
      target_type: targetNode?.type || "Entity",
      target_description: targetNode?.description || "",
      relation: link.relation,
      metadata_json: safeJson({
        title: document.title,
        sourceName: document.sourceName,
        category: document.category,
      }),
      created_at: new Date().toISOString(),
    };
  });
}

async function writeRowsToBigQuery(document: CrawledDocument, documentId: string, chunks: PreparedChunk[], graphData: GraphExtraction, gcsUri?: string): Promise<GcpPipelineStatus> {
  if (!isGcpNativeConfigured()) return "SKIPPED_NOT_CONFIGURED";

  try {
    await ensureBigQueryKnowledgeStore();
    const client = getBigQueryClient();
    if (!client) return "SKIPPED_NOT_CONFIGURED";

    const now = new Date().toISOString();
    // BigQuery streaming inserts cannot be immediately updated/deleted. Keep ingestion
    // append-only here; query paths de-duplicate by IDs where strict uniqueness matters.
    await client.dataset(BQ_DATASET).table(BQ_CORPUS_TABLE).insert([{
      document_id: documentId,
      source_url: document.url,
      title: document.title,
      source_name: document.sourceName || "",
      category: document.category || "",
      crawler: document.crawler,
      gcs_uri: gcsUri || "",
      content: document.content,
      metadata_json: safeJson({
        depth: document.depth,
        embeddingModel: BQ_EMBEDDING_MODEL,
      }),
      created_at: now,
      updated_at: now,
    }], { ignoreUnknownValues: true } as any);

    const chunkRows = chunks.map(chunk => ({
      chunk_id: chunk.chunkId,
      document_id: documentId,
      source_url: document.url,
      title: document.title,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      embedding: chunk.embedding,
      metadata_json: safeJson(chunk.metadata),
      created_at: now,
    }));
    if (chunkRows.length > 0) {
      await client.dataset(BQ_DATASET).table(BQ_CHUNKS_TABLE).insert(chunkRows, { ignoreUnknownValues: true } as any);
    }

    const graphRows = buildGraphRows(document, documentId, graphData);
    if (graphRows.length > 0) {
      await client.dataset(BQ_DATASET).table(BQ_GRAPH_TABLE).insert(graphRows, { ignoreUnknownValues: true } as any);
    }

    return "SUCCESS";
  } catch (err: any) {
    console.error("BigQuery knowledge write failed:", err.message);
    return "FAILED";
  }
}

function yamlString(value: string): string {
  return `"${String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function exportMetadataAsCode(document: CrawledDocument, documentId: string, graphData: GraphExtraction, gcsUri?: string): Promise<{ status: GcpPipelineStatus; path?: string }> {
  try {
    const entriesDir = path.join(MDCODE_EXPORT_DIR, "entries");
    await fs.promises.mkdir(entriesDir, { recursive: true });

    const entryPath = path.join(entriesDir, `${documentId}.md`);
    const frontmatter = [
      "---",
      `id: ${yamlString(documentId)}`,
      `type: ${yamlString("mursyid-knowledge-entry")}`,
      `title: ${yamlString(document.title)}`,
      `source_url: ${yamlString(document.url)}`,
      `source_name: ${yamlString(document.sourceName || "")}`,
      `category: ${yamlString(document.category || "")}`,
      `gcs_uri: ${yamlString(gcsUri || "")}`,
      `nodes_count: ${graphData.nodes?.length || 0}`,
      `links_count: ${graphData.links?.length || 0}`,
      "---",
      "",
      `# ${document.title}`,
      "",
      `Source: ${document.url}`,
      "",
      "## Extracted Graph",
      "",
      ...(graphData.links || []).slice(0, 50).map(link => `- ${link.source} --${link.relation}--> ${link.target}`),
      "",
      "## Content",
      "",
      document.content,
      "",
    ].join("\n");

    await fs.promises.writeFile(entryPath, frontmatter, "utf8");

    const files = (await fs.promises.readdir(entriesDir))
      .filter(file => file.endsWith(".md"))
      .sort();
    const catalogYaml = [
      "# Metadata-as-code export inspired by Google Knowledge Catalog mdcode demos.",
      "catalog:",
      `  project: ${yamlString(GCP_PROJECT_ID || "local")}`,
      `  location: ${yamlString(GCP_LOCATION)}`,
      `  entry_group: ${yamlString(KNOWLEDGE_CATALOG_ENTRY_GROUP)}`,
      "entries:",
      ...files.map(file => `  - path: ${yamlString(`entries/${file}`)}`),
      "",
    ].join("\n");

    const catalogPath = path.join(MDCODE_EXPORT_DIR, "catalog.yaml");
    await fs.promises.writeFile(catalogPath, catalogYaml, "utf8");
    return { status: "SUCCESS", path: catalogPath };
  } catch (err: any) {
    console.error("Metadata-as-code export failed:", err.message);
    return { status: "FAILED" };
  }
}

async function dataplexRequest(method: string, resourcePath: string, body?: any): Promise<any> {
  const auth = getGoogleAuth();
  if (!auth) throw new Error("Google Cloud project is not configured.");

  const url = `https://dataplex.googleapis.com/v1/${resourcePath}`;
  const authClient = await auth.getClient();
  const authHeaders = await authClient.getRequestHeaders(url);
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (typeof (authHeaders as Headers).forEach === "function") {
    (authHeaders as Headers).forEach((value, key) => {
      headers[key] = value;
    });
  } else {
    for (const [key, value] of Object.entries(authHeaders as Record<string, any>)) {
      headers[key] = String(value);
    }
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const message = payload.error?.message || payload.message || response.statusText;
    const error: any = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function ensureKnowledgeCatalogScaffold(): Promise<void> {
  const parent = `projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}`;

  try {
    await dataplexRequest("GET", `${parent}/aspectTypes/${KNOWLEDGE_CATALOG_ASPECT_TYPE}`);
  } catch (err: any) {
    if (err.status !== 404) throw err;
    await dataplexRequest("POST", `${parent}/aspectTypes?aspectTypeId=${encodeURIComponent(KNOWLEDGE_CATALOG_ASPECT_TYPE)}`, {
      displayName: "Mursyid Context",
      description: "Mursyid AI crawled source, fiqh graph, and grounding metadata.",
      metadataTemplate: {
        name: "mursyid_context",
        type: "record",
        recordFields: [
          { name: "title", index: 1, type: "string" },
          { name: "source_url", index: 2, type: "string" },
          { name: "gcs_uri", index: 3, type: "string" },
          { name: "nodes_count", index: 4, type: "int" },
          { name: "links_count", index: 5, type: "int" },
        ],
      },
    });
  }

  try {
    await dataplexRequest("GET", `${parent}/entryTypes/${KNOWLEDGE_CATALOG_ENTRY_TYPE}`);
  } catch (err: any) {
    if (err.status !== 404) throw err;
    await dataplexRequest("POST", `${parent}/entryTypes?entryTypeId=${encodeURIComponent(KNOWLEDGE_CATALOG_ENTRY_TYPE)}`, {
      displayName: "Mursyid Knowledge Entry",
      description: "Crawled Islamic jurisprudence source or extracted fiqh concept.",
      typeAliases: ["RESOURCE", "NODE"],
      platform: "mursyid-ai",
      system: "mursyid-ai",
      requiredAspects: [
        { type: `${parent}/aspectTypes/${KNOWLEDGE_CATALOG_ASPECT_TYPE}` },
      ],
    });
  }

  try {
    await dataplexRequest("GET", `${parent}/entryGroups/${KNOWLEDGE_CATALOG_ENTRY_GROUP}`);
  } catch (err: any) {
    if (err.status !== 404) throw err;
    await dataplexRequest("POST", `${parent}/entryGroups?entryGroupId=${encodeURIComponent(KNOWLEDGE_CATALOG_ENTRY_GROUP)}`, {
      displayName: "Mursyid Knowledge",
      description: "Governed context entries for Mursyid AI.",
    });
  }
}

async function createOrPatchCatalogEntry(entryId: string, body: any): Promise<void> {
  const entryGroupPath = `projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/entryGroups/${KNOWLEDGE_CATALOG_ENTRY_GROUP}`;
  try {
    await dataplexRequest("POST", `${entryGroupPath}/entries?entryId=${encodeURIComponent(entryId)}`, body);
  } catch (err: any) {
    if (err.status !== 409) throw err;
    await dataplexRequest("PATCH", `${entryGroupPath}/entries/${encodeURIComponent(entryId)}?updateMask=entrySource,aspects`, body);
  }
}

async function publishToKnowledgeCatalog(document: CrawledDocument, documentId: string, graphData: GraphExtraction, gcsUri?: string): Promise<GcpPipelineStatus> {
  if (!isGcpNativeConfigured()) return "SKIPPED_NOT_CONFIGURED";

  try {
    await ensureKnowledgeCatalogScaffold();
    const parent = `projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}`;
    const aspectKey = `${GCP_PROJECT_ID}.${GCP_LOCATION}.${KNOWLEDGE_CATALOG_ASPECT_TYPE}`;
    const entryType = `${parent}/entryTypes/${KNOWLEDGE_CATALOG_ENTRY_TYPE}`;
    const entryId = `source-${documentId}`.slice(0, 250);
    const aspectData = {
      title: document.title,
      source_url: document.url,
      gcs_uri: gcsUri || "",
      nodes_count: graphData.nodes?.length || 0,
      links_count: graphData.links?.length || 0,
    };

    await createOrPatchCatalogEntry(entryId, {
      entryType,
      fullyQualifiedName: catalogFqn("sources", documentId),
      entrySource: {
        resource: document.url,
        system: "mursyid-ai",
        platform: "web",
        displayName: truncateText(document.title, 500),
        description: truncateText(document.content, 2000),
        labels: {
          crawler: slugify(document.crawler, "crawler"),
          source: slugify(document.sourceName || "manual", "source"),
        },
        updateTime: new Date().toISOString(),
      },
      aspects: {
        [aspectKey]: {
          data: aspectData,
        },
      },
    });

    for (const node of (graphData.nodes || []).slice(0, 25)) {
      const nodeEntryId = `concept-${slugify(node.id, "entity")}`.slice(0, 250);
      await createOrPatchCatalogEntry(nodeEntryId, {
        entryType,
        fullyQualifiedName: catalogFqn("concepts", node.id),
        entrySource: {
          resource: `mursyid://concepts/${node.id}`,
          system: "mursyid-ai",
          platform: "knowledge-graph",
          displayName: truncateText(node.label || node.id, 500),
          description: truncateText(node.description || "", 2000),
          labels: {
            node_type: slugify(node.type || "entity", "entity"),
          },
          updateTime: new Date().toISOString(),
        },
        aspects: {
          [aspectKey]: {
            data: {
              title: node.label || node.id,
              source_url: document.url,
              gcs_uri: gcsUri || "",
              nodes_count: 1,
              links_count: (graphData.links || []).filter(link => link.source === node.id || link.target === node.id).length,
            },
          },
        },
      });
    }

    return "SUCCESS";
  } catch (err: any) {
    console.error("Knowledge Catalog publish failed:", err.message);
    return "FAILED";
  }
}

async function persistGcpNativeKnowledge(document: CrawledDocument, chunks: PreparedChunk[], graphData: GraphExtraction): Promise<{
  gcsStatus: GcpPipelineStatus;
  bigQueryStatus: GcpPipelineStatus;
  knowledgeCatalogStatus: GcpPipelineStatus;
  metadataCatalogPath?: string;
  gcsRawUri?: string;
}> {
  const documentId = chunks[0]?.documentId || documentIdFor(document);
  const gcsResult = await uploadRawMarkdownToGCS(document, documentId);
  const metadataResult = await exportMetadataAsCode(document, documentId, graphData, gcsResult.uri);
  const bigQueryStatus = await writeRowsToBigQuery(document, documentId, chunks, graphData, gcsResult.uri);
  const knowledgeCatalogStatus = await publishToKnowledgeCatalog(document, documentId, graphData, gcsResult.uri);

  return {
    gcsStatus: gcsResult.status,
    bigQueryStatus,
    knowledgeCatalogStatus,
    metadataCatalogPath: metadataResult.path,
    gcsRawUri: gcsResult.uri,
  };
}

function summarizePipelineStatus(statuses: GcpPipelineStatus[]): GcpPipelineStatus {
  const actionable = statuses.filter(status => status !== "SKIPPED_NOT_CONFIGURED");
  if (actionable.length === 0) return "SKIPPED_NOT_CONFIGURED";
  if (actionable.every(status => status === "SUCCESS")) return "SUCCESS";
  if (actionable.some(status => status === "SUCCESS")) return "PARTIAL";
  return "FAILED";
}

function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  const deduped: Citation[] = [];

  for (const citation of citations) {
    if (!citation.url) continue;
    const key = `${citation.url}::${citation.documentId || ""}::${citation.chunkIndex ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(citation);
  }

  return deduped;
}

function chunkCitation(chunk: RetrievedChunk): Citation {
  return {
    title: chunk.title || chunk.sourceUrl || "BigQuery source",
    url: chunk.sourceUrl,
    source: "bigquery-vector",
    documentId: chunk.documentId,
    chunkIndex: chunk.chunkIndex,
    snippet: truncateText(chunk.content, 240),
  };
}

function getTextKeywordMatches(text: string, keywords: string[]): string[] {
  const normalized = text.toLowerCase();
  return keywords.filter(keyword => {
    const escapedKeyword = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const keywordPattern = new RegExp(`(^|[^a-z0-9])${escapedKeyword}([^a-z0-9]|$)`, "i");
    return keywordPattern.test(normalized);
  });
}

function filterRelevantChunks(chunks: RetrievedChunk[], keywords: string[]): RetrievedChunk[] {
  if (keywords.length === 0) return chunks;

  return chunks.filter(chunk => {
    const haystack = `${chunk.title || ""}\n${chunk.sourceUrl || ""}\n${chunk.content || ""}`;
    const matches = getTextKeywordMatches(haystack, keywords);

    // One highly specific term is enough; otherwise require more overlap so
    // generic portal/navigation pages do not become false citations.
    return matches.some(match => match.length >= 8) || matches.length >= 2;
  });
}

function filterRelevantTriples(triples: RetrievedGraphTriple[], keywords: string[]): RetrievedGraphTriple[] {
  if (keywords.length === 0) return triples;

  return triples.filter(triple => {
    const haystack = `${triple.title || ""}\n${triple.sourceUrl || ""}\n${triple.text || ""}`;
    const matches = getTextKeywordMatches(haystack, keywords);
    return matches.some(match => match.length >= 8) || matches.length >= 2;
  });
}

async function searchBigQueryVectorChunks(ai: GoogleGenAI, message: string, limit: number = 3): Promise<RetrievedChunk[]> {
  if (!isGcpNativeConfigured()) return [];

  try {
    await ensureBigQueryKnowledgeStore();
    const queryEmbedding = await generateTextEmbedding(ai, message);
    if (queryEmbedding.length === 0) return [];

    try {
      const rows = await runBigQuery(`
        SELECT
          base.content,
          base.title,
          base.source_url,
          base.document_id,
          base.chunk_id,
          base.chunk_index,
          base.metadata_json,
          distance
        FROM VECTOR_SEARCH(
          TABLE ${bqTableRef(BQ_CHUNKS_TABLE)},
          'embedding',
          (SELECT @queryEmbedding AS embedding),
          top_k => @limit,
          distance_type => 'COSINE',
          options => '{"use_brute_force": true}'
        )
        WHERE ARRAY_LENGTH(base.embedding) > 0
        ORDER BY distance ASC
      `, { queryEmbedding, limit });

      return rows.map(row => ({
        content: row.content || "",
        title: row.title || row.source_url || "BigQuery source",
        sourceUrl: row.source_url || "",
        documentId: row.document_id || "",
        chunkId: row.chunk_id || "",
        chunkIndex: Number(row.chunk_index ?? 0),
        metadataJson: row.metadata_json,
        score: typeof row.distance === "number" ? row.distance : undefined,
      }));
    } catch (vectorErr: any) {
      console.warn("BigQuery VECTOR_SEARCH unavailable, using exact SQL cosine fallback:", vectorErr.message);
      const rows = await runBigQuery(`
        WITH query_vector AS (
          SELECT @queryEmbedding AS vector
        )
        SELECT
          c.content,
          c.title,
          c.source_url,
          c.document_id,
          c.chunk_id,
          c.chunk_index,
          c.metadata_json,
          (
            SELECT SAFE_DIVIDE(
              SUM(base_value * query_value),
              SQRT(SUM(base_value * base_value)) * SQRT(SUM(query_value * query_value))
            )
            FROM UNNEST(c.embedding) AS base_value WITH OFFSET AS pos
            JOIN UNNEST(q.vector) AS query_value WITH OFFSET AS pos2
            ON pos = pos2
          ) AS similarity
        FROM ${bqTableRef(BQ_CHUNKS_TABLE)} c
        CROSS JOIN query_vector q
        WHERE ARRAY_LENGTH(c.embedding) > 0
        ORDER BY similarity DESC
        LIMIT @limit
      `, { queryEmbedding, limit });

      return rows.map(row => ({
        content: row.content || "",
        title: row.title || row.source_url || "BigQuery source",
        sourceUrl: row.source_url || "",
        documentId: row.document_id || "",
        chunkId: row.chunk_id || "",
        chunkIndex: Number(row.chunk_index ?? 0),
        metadataJson: row.metadata_json,
        score: typeof row.similarity === "number" ? row.similarity : undefined,
      }));
    }
  } catch (err: any) {
    console.error("BigQuery vector retrieval failed:", err.message);
    return [];
  }
}

async function searchBigQueryGraphTriples(keywords: string[], limit: number = 10): Promise<RetrievedGraphTriple[]> {
  if (!isGcpNativeConfigured() || keywords.length === 0) return [];

  try {
    await ensureBigQueryKnowledgeStore();
    const selectedKeywords = keywords.slice(0, 4).map(keyword => keyword.toLowerCase());
    const rows = await runBigQuery(`
      SELECT DISTINCT
        source_label,
        relation,
        target_label,
        source_description,
        target_description,
        source_url,
        document_id,
        JSON_VALUE(metadata_json, '$.title') AS title
      FROM ${bqTableRef(BQ_GRAPH_TABLE)}
      WHERE EXISTS (
        SELECT 1
        FROM UNNEST(@keywords) AS keyword
        WHERE LOWER(source_id) LIKE CONCAT('%', keyword, '%')
           OR LOWER(source_label) LIKE CONCAT('%', keyword, '%')
           OR LOWER(target_id) LIKE CONCAT('%', keyword, '%')
           OR LOWER(target_label) LIKE CONCAT('%', keyword, '%')
           OR LOWER(relation) LIKE CONCAT('%', keyword, '%')
      )
      LIMIT @limit
    `, { keywords: selectedKeywords, limit });

    return rows.map(row => ({
      text: `[Knowledge Catalog/BigQuery Graph] ${row.source_label} -> ${row.relation} -> ${row.target_label} (${row.source_description || ""} | ${row.target_description || ""})`,
      title: row.title || row.source_url || "Knowledge Catalog graph source",
      sourceUrl: row.source_url || "",
      documentId: row.document_id || "",
    }));
  } catch (err: any) {
    console.error("BigQuery graph retrieval failed:", err.message);
    return [];
  }
}

async function getFullGraphFromBigQuery(): Promise<{ nodes: KnowledgeNode[]; links: KnowledgeLink[] } | null> {
  if (!isGcpNativeConfigured()) return null;

  try {
    await ensureBigQueryKnowledgeStore();
    const rows = await runBigQuery(`
      SELECT
        source_id,
        source_label,
        source_type,
        source_description,
        target_id,
        target_label,
        target_type,
        target_description,
        relation
      FROM ${bqTableRef(BQ_GRAPH_TABLE)}
      LIMIT 1000
    `);

    if (rows.length === 0) return null;

    const nodeMap = new Map<string, KnowledgeNode>();
    const links: KnowledgeLink[] = [];
    const linkKeys = new Set<string>();
    for (const row of rows) {
      if (row.source_id && !nodeMap.has(row.source_id)) {
        nodeMap.set(row.source_id, {
          id: row.source_id,
          type: row.source_type || "Entity",
          label: row.source_label || row.source_id,
          description: row.source_description || "",
        });
      }
      if (row.target_id && !nodeMap.has(row.target_id)) {
        nodeMap.set(row.target_id, {
          id: row.target_id,
          type: row.target_type || "Entity",
          label: row.target_label || row.target_id,
          description: row.target_description || "",
        });
      }
      if (row.source_id && row.target_id) {
        const relation = row.relation || "RELATION";
        const linkKey = `${row.source_id}::${relation}::${row.target_id}`;
        if (linkKeys.has(linkKey)) continue;
        linkKeys.add(linkKey);
        links.push({
          source: row.source_id,
          target: row.target_id,
          relation,
        });
      }
    }

    return { nodes: Array.from(nodeMap.values()), links };
  } catch (err: any) {
    console.error("BigQuery graph fetch failed:", err.message);
    return null;
  }
}

async function resetBigQueryGraph(): Promise<{ nodes: KnowledgeNode[]; links: KnowledgeLink[] } | null> {
  if (!isGcpNativeConfigured()) return null;

  try {
    await ensureBigQueryKnowledgeStore();
    await runBigQuery(`DELETE FROM ${bqTableRef(BQ_GRAPH_TABLE)} WHERE TRUE`);
    const baselineDocument: CrawledDocument = {
      url: "mursyid://baseline",
      title: "Pristine Islamic Ontology Baseline",
      content: "Baseline ontology seeded by Mursyid AI.",
      crawler: "baseline",
      sourceName: "Mursyid AI",
      category: "website",
    };
    const baselineGraph: GraphExtraction = {
      nodes: INITIAL_NODES as KnowledgeNode[],
      links: INITIAL_LINKS as KnowledgeLink[],
    };
    await writeRowsToBigQuery(baselineDocument, "baseline", [], baselineGraph, undefined);
    return { nodes: INITIAL_NODES as KnowledgeNode[], links: INITIAL_LINKS as KnowledgeLink[] };
  } catch (err: any) {
    console.error("BigQuery graph reset failed:", err.message);
    return null;
  }
}

// ==========================================
// CRAWLER & VECTOR HELPERS
// ==========================================
function getSourceMaxPages(source?: CrawlSource, override?: number): number {
  if (override && Number.isFinite(override)) {
    return Math.max(1, override);
  }

  const sourceDefault = source?.defaultMaxPages || CRAWL_MAX_PAGES_PER_SOURCE;
  return Math.max(1, Math.min(sourceDefault, CRAWL_MAX_PAGES_PER_SOURCE));
}

function getCrawlTimeString(): string {
  return new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Kuala_Lumpur" });
}

async function runCrawl4AiBridge(source: CrawlSource | undefined, url: string, maxPages: number): Promise<CrawledDocument[]> {
  if (INGESTION_CRAWLER !== "crawl4ai") {
    throw new Error(`Crawl4AI dinyahaktifkan melalui INGESTION_CRAWLER=${INGESTION_CRAWLER}.`);
  }

  if (!fs.existsSync(CRAWL4AI_BRIDGE_PATH)) {
    throw new Error(`Skrip Crawl4AI tidak ditemui di ${CRAWL4AI_BRIDGE_PATH}.`);
  }

  const args = [
    CRAWL4AI_BRIDGE_PATH,
    "--seed-url",
    url,
    "--source-name",
    source?.name || "Manual URL",
    "--category",
    source?.category || "website",
    "--max-pages",
    String(maxPages),
    "--max-depth",
    String(maxPages > 1 ? CRAWL_MAX_DEPTH : 0),
    "--min-chars",
    process.env.CRAWL_MIN_CHARS || "450"
  ];

  for (const pattern of source?.includePatterns || []) {
    args.push("--include-pattern", pattern);
  }

  const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    const child = spawn(PYTHON_BIN, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1"
      }
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Crawl4AI tamat masa selepas ${CRAWL4AI_TIMEOUT_MS}ms.`));
    }, CRAWL4AI_TIMEOUT_MS);

    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });
    child.on("error", err => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on("close", code => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, code });
    });
  });

  if (result.code !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(stderr || `Crawl4AI keluar dengan kod ${result.code}.`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(result.stdout.trim());
  } catch (err: any) {
    throw new Error(`Output Crawl4AI tidak sah: ${err.message}`);
  }

  if (!parsed.ok) {
    throw new Error(parsed.error || "Crawl4AI gagal tanpa mesej ralat.");
  }

  const documents = (parsed.documents || [])
    .map((doc: any) => ({
      url: doc.url || url,
      title: doc.title || source?.name || "Rujukan Kontemporari",
      content: doc.content || "",
      sourceName: source?.name,
      category: source?.category,
      crawler: "crawl4ai",
      depth: doc.depth
    }))
    .filter((doc: CrawledDocument) => doc.content.trim().length > 0);

  if (documents.length === 0) {
    throw new Error("Crawl4AI tidak memulangkan kandungan teks yang cukup untuk diindeks.");
  }

  return documents;
}

async function extractCleanContent(url: string, ai: GoogleGenAI): Promise<{ title: string; content: string; crawler: string }> {
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

    // Use dynamic CRAWLER_MODEL (default: gemini-3.1-flash-lite) for cost-optimal and fast HTML parsing
    const responseAi = await ai.models.generateContent({
      model: CRAWLER_MODEL,
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
      content: result.content || "",
      crawler: "gemini-html"
    };
  } catch (err: any) {
    console.error(`Crawler Error for ${url}:`, err.message);
    throw new Error(`Gagal melayari atau mengekstrak kandungan: ${err.message}`);
  }
}

async function crawlDocumentsForIngestion(url: string, ai: GoogleGenAI, source?: CrawlSource, maxPagesOverride?: number): Promise<CrawledDocument[]> {
  const maxPages = getSourceMaxPages(source, maxPagesOverride);

  try {
    return await runCrawl4AiBridge(source, url, maxPages);
  } catch (crawl4AiErr: any) {
    if (process.env.CRAWL4AI_FALLBACK_TO_GEMINI === "false") {
      throw crawl4AiErr;
    }

    console.warn(`Crawl4AI fallback activated for ${url}:`, crawl4AiErr.message);
    const fallbackDoc = await extractCleanContent(url, ai);
    return [{
      url,
      title: fallbackDoc.title,
      content: fallbackDoc.content,
      sourceName: source?.name,
      category: source?.category,
      crawler: fallbackDoc.crawler
    }];
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

// ==========================================
// GRAPHRAG KEYWORD SEARCH EXTRACTORS
// ==========================================
function extractKeywords(text: string): string[] {
  const stopwords = new Set([
    "dan", "di", "ke", "yang", "adalah", "pada", "untuk", "atau", "saya", "apa", 
    "apakah", "bagaimana", "ada", "tidak", "bila", "itu", "ini", "dengan", "oleh",
    "dari", "darihal", "tentang", "mengenai", "bagi", "seperti", "ia", "mereka", "kita",
    "kami", "kamu", "dia", "dalam", "sebagai", "akan", "telah", "sudah", "belum", "sedang",
    "boleh", "harus", "wajib", "hukum", "hukumnya", "status", "mengikut", "menurut", "keputusan",
    "fatwa", "kebangsaan", "malaysia", "pejabat", "mufti", "bagaimanakah", "apakah", "siapa", "siapakah",
    "jawab", "ringkas", "sertakan", "asas", "rujukan", "sumber", "rasmi", "katalog", "mursyid", "berdasarkan"
  ]);
  
  const cleaned = text.toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, " ")
    .replace(/\s+/g, " ");
    
  return cleaned.split(/\s+/)
    .map(word => word.trim())
    .filter(word => word.length > 3 && !stopwords.has(word));
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

function mergeGraphIntoMemory(graphData: GraphExtraction) {
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

// ==========================================
// END-TO-END INGESTION CONTROL PIPELINE
// ==========================================
async function ingestDocumentContent(document: CrawledDocument, ai: GoogleGenAI): Promise<IngestStats> {
  const { url, title, content } = document;
  
  if (!content || content.trim().length === 0) {
    throw new Error("Laman web tidak mengandungi sebarang kandungan teks rencana yang bermaklumat.");
  }
  
  let chunksCount = 0;
  let nodesCount = 0;
  let linksCount = 0;
  
  // 1. Prepare semantic chunks for BigQuery Vector Search.
  const chunks = chunkText(content, 1200, 200);
  chunksCount = chunks.length;
  const documentId = documentIdFor(document);
  const preparedChunks: PreparedChunk[] = [];

  for (const [index, chunk] of chunks.entries()) {
    let embedding: number[] = [];
    try {
      embedding = await generateTextEmbedding(ai, chunk);
    } catch (err: any) {
      console.error(`Embedding generation failed for chunk under ${url}:`, err.message);
    }

    const chunkId = hashId(`${documentId}:${index}:${chunk}`, 24);
    const metadata = { url, title, dateIndexed: new Date().toISOString(), documentId, chunkIndex: index };
    preparedChunks.push({
      chunkId,
      documentId,
      chunkIndex: index,
      content: chunk,
      embedding,
      metadata,
    });

  }

  // 2. Extract nodes and links for BigQuery/Knowledge Catalog.
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

  const prompt = `Analisis kandungan berikut daripada laman atau rencana "${title}" (${url}): "${content.substring(0, 9000)}". Kenalpasti entiti perundangan Islam dan kaitannya, kemudian bina graf pengetahuan.`;

  const response = await ai.models.generateContent({
    model: EXTRACTOR_MODEL,
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
  let graphData: GraphExtraction;
  try {
    const parsed = JSON.parse(textResult.trim());
    graphData = {
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
      links: Array.isArray(parsed.links) ? parsed.links : [],
    };
  } catch (parseErr) {
    console.error("JSON Parsing Error from Gemini output during ingestion:", textResult);
    throw new Error("Gagal mengurai Graf Pengetahuan daripada output model kecerdasan buatan.");
  }

  nodesCount = graphData.nodes?.length || 0;
  linksCount = graphData.links?.length || 0;

  const gcpStatus = await persistGcpNativeKnowledge(document, preparedChunks, graphData);
  mergeGraphIntoMemory(graphData);

  return {
    chunksCount,
    nodesCount,
    linksCount,
    title,
	    documentsCount: 1,
	    crawler: document.crawler,
	    gcsStatus: gcpStatus.gcsStatus,
	    bigQueryStatus: gcpStatus.bigQueryStatus,
	    knowledgeCatalogStatus: gcpStatus.knowledgeCatalogStatus,
	    metadataCatalogPath: gcpStatus.metadataCatalogPath,
	    gcsRawUris: gcpStatus.gcsRawUri ? [gcpStatus.gcsRawUri] : []
	  };
}

async function ingestURLContent(url: string, ai: GoogleGenAI, source?: CrawlSource, maxPagesOverride?: number): Promise<IngestStats> {
  const documents = await crawlDocumentsForIngestion(url, ai, source, maxPagesOverride);
  const aggregate: IngestStats = {
    title: documents[0]?.title || source?.name || "Rujukan Kontemporari",
    chunksCount: 0,
    nodesCount: 0,
    linksCount: 0,
    documentsCount: documents.length,
    crawler: documents[0]?.crawler || "unknown",
    gcsStatus: "SKIPPED_NOT_CONFIGURED",
    bigQueryStatus: "SKIPPED_NOT_CONFIGURED",
    knowledgeCatalogStatus: "SKIPPED_NOT_CONFIGURED",
    gcsRawUris: []
  };
  const gcsStatuses: GcpPipelineStatus[] = [];
  const bigQueryStatuses: GcpPipelineStatus[] = [];
  const knowledgeCatalogStatuses: GcpPipelineStatus[] = [];

  for (const document of documents) {
    const stats = await ingestDocumentContent(document, ai);
    aggregate.chunksCount += stats.chunksCount;
    aggregate.nodesCount += stats.nodesCount;
    aggregate.linksCount += stats.linksCount;
    aggregate.gcsRawUris.push(...stats.gcsRawUris);
    aggregate.metadataCatalogPath = stats.metadataCatalogPath || aggregate.metadataCatalogPath;
    gcsStatuses.push(stats.gcsStatus);
    bigQueryStatuses.push(stats.bigQueryStatus);
    knowledgeCatalogStatuses.push(stats.knowledgeCatalogStatus);
  }

  aggregate.gcsStatus = summarizePipelineStatus(gcsStatuses);
  aggregate.bigQueryStatus = summarizePipelineStatus(bigQueryStatuses);
  aggregate.knowledgeCatalogStatus = summarizePipelineStatus(knowledgeCatalogStatuses);
  aggregate.crawler = Array.from(new Set(documents.map(doc => doc.crawler))).join("+") || aggregate.crawler;

  return aggregate;
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

    const ai = getGeminiClient();

    const systemInstruction = 
      "Anda adalah seorang Ejen Kepakaran Syariah dan Fiqh Islam (Shafi'i) bertauliah di Malaysia. " +
      "Tugas anda adalah memberikan pandangan fekah, pemahaman hadis, fatwa, dan rujukan sejarah yang sahih. " +
      "Sentiasa utamakan pandangan Mazhab Syafi'i, keputusan Majlis Raja-Raja, fatwa JAKIM, e-Khutbah serta Jabatan Mufti Wilayah Persekutuan (muftiwp.gov.my). " +
      "Bahasa komunikasi mestilah Bahasa Melayu/Malaysia yang sopan, akademik, dan mudah difahami. " +
      "Cakap dengan sandaran dalil yang jelas dari Al-Quran dan Al-Sunnah jika bersesuaian, dan nyatakan sumber rujukan fatwa secara eksplisit. " +
      "Apabila pengguna bertanyakan isu semasa, gunakan hanya keputusan mufti yang sah di Malaysia apabila rujukannya wujud dalam katalog pengetahuan.";

	    // GCP-native grounded retrieval layer
		    let groundedContext = "";
		    let citations: Citation[] = [];
		    const keywords = extractKeywords(message);

		    if (isGcpNativeConfigured()) {
	      try {
	        console.log(`GCP Native Retrieval: BigQuery + Knowledge Catalog context search for: "${message}"`);
		        const vectorChunks = filterRelevantChunks(await searchBigQueryVectorChunks(ai, message, 5), keywords).slice(0, 3);
		        const graphTriples = filterRelevantTriples(await searchBigQueryGraphTriples(keywords), keywords);

		        if (vectorChunks.length > 0 || graphTriples.length > 0) {
		          groundedContext += "\n\nMAKLUMAT SAHIH DARIPADA BIGQUERY VECTOR SEARCH & KNOWLEDGE CATALOG MURSYID AI:\n";
	          groundedContext += "==========================================================================\n";
		          if (graphTriples.length > 0) {
		            groundedContext += "ENTITI & HUBUNGAN ONTOLOGI SYARAK (KNOWLEDGE CATALOG / BIGQUERY GRAPH):\n";
		            groundedContext += graphTriples.map(triple => triple.text).join("\n") + "\n\n";
		            citations.push(...graphTriples.map(triple => ({
		              title: triple.title || triple.sourceUrl || "Knowledge Catalog graph source",
		              url: triple.sourceUrl,
		              source: "knowledge-catalog-graph" as const,
		              documentId: triple.documentId,
		            })));
		          }
		          if (vectorChunks.length > 0) {
		            groundedContext += "KERATAN TEKS PECAHAN (BIGQUERY VECTOR SEARCH):\n";
		            groundedContext += vectorChunks.map((chunk, i) => {
		              const sourceLabel = `${chunk.title || chunk.sourceUrl} (${chunk.sourceUrl})`;
		              return `[Sumber Rencana ${i + 1} | ${sourceLabel} | document_id=${chunk.documentId} | chunk=${chunk.chunkIndex}]: ${chunk.content}`;
		            }).join("\n") + "\n";
		            citations.push(...vectorChunks.map(chunkCitation));
		          }
		        }
	      } catch (gcpErr: any) {
	        console.error("Failed to compile GCP-native grounding context:", gcpErr.message);
		      }
		    }

	    if (isGcpNativeConfigured() && !groundedContext) {
	      return res.json({
	        text:
	          "Katalog pengetahuan Mursyid (BigQuery/Knowledge Catalog) tidak memulangkan konteks yang cukup relevan untuk soalan ini. " +
	          "Saya tidak akan membuat kesimpulan hukum khusus atau mereka-reka rujukan di luar korpus yang telah diimbas. " +
	          "Sila imbas portal rasmi berkaitan dahulu, kemudian tanya semula supaya jawapan boleh disandarkan kepada sumber yang mempunyai metadata dan sitasi.",
	        citations: [],
	      });
	    }
	
	    // In-memory GraphRAG fallback for local/offline development.
		    if (!groundedContext && keywords.length > 0) {
		      const memoryTriples = searchFallbackGraph(keywords);
		      if (memoryTriples.length > 0) {
	        groundedContext += "\n\nMAKLUMAT GRAPHRAG ASAS DARIPADA MEMORI LOKAL MURSYID AI:\n";
	        groundedContext += "=========================================================\n";
	        groundedContext += "ENTITI & HUBUNGAN ONTOLOGI SYARAK (LOCAL MEMORY):\n";
	        groundedContext += memoryTriples.join("\n") + "\n";
	      }
	    }
	    citations = dedupeCitations(citations);

	    // Append our grounding context block directly into the Gemini instructions
	    const finalSystemInstruction = systemInstruction + (groundedContext ? `\n\nSila berikan keutamaan tertinggi kepada data rujukan di bawah untuk menyusun hujah jawapan anda. Jangan gunakan carian web umum sebagai sumber utama; gunakan hanya konteks BigQuery Vector Search dan Knowledge Catalog/BigQuery Graph di bawah apabila tersedia. Apabila merujuk sumber, sebut nama portal/tajuk yang muncul dalam konteks. Jika konteks tidak mengandungi jawapan khusus yang ditanya, nyatakan dengan jelas bahawa katalog pengetahuan Mursyid belum mempunyai rujukan mencukupi untuk isu tersebut dan jangan reka keputusan fatwa atau URL.\n${groundedContext}` : "\n\nKatalog pengetahuan BigQuery/Knowledge Catalog tidak memulangkan konteks yang cukup relevan untuk soalan ini. Jangan gunakan carian web umum. Jika menjawab, nyatakan batasan ini dengan jelas dan minta pengguna mengimbas portal rasmi berkaitan sebelum membuat kesimpulan hukum khusus.");

    const formattedHistory = (history || []).map((h: any) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }]
    }));

    const contents = [...formattedHistory, { role: "user", parts: [{ text: message }] }];

	    const response = await ai.models.generateContent({
	      model: CHAT_MODEL,
	      contents,
	      config: {
	        systemInstruction: finalSystemInstruction,
	        temperature: 0.15, // Extremely low temperature to enforce strict adherence to groundings
	      }
	    });
	
	    const text = response.text || "Maaf, tiada jawapan dijana.";
	
	    res.json({ text, citations });
  } catch (error: any) {
    console.error("Chat Error:", error);
    res.status(500).json({ 
      error: error.message || "An unexpected error occurred",
      needsAdc: !isAdcConfigured()
    });
  }
});

// 2. Query the unified mesh graph state
app.get("/api/get-graph", async (req, res) => {
  try {
    const nativeGraph = await getFullGraphFromBigQuery();
    if (nativeGraph) {
      return res.json(nativeGraph);
    }

    res.json({ nodes: fallbackNodes, links: fallbackLinks });
  } catch (error: any) {
    console.error("Get Graph Error:", error);
    res.json({ nodes: fallbackNodes, links: fallbackLinks }); // Fail-safe
  }
});

// 3. Reset the graph state in BigQuery or local memory fallback.
app.post("/api/reset-graph", async (req, res) => {
  try {
    const nativeGraph = await resetBigQueryGraph();
    if (nativeGraph) {
      fallbackNodes = JSON.parse(JSON.stringify(INITIAL_NODES));
      fallbackLinks = JSON.parse(JSON.stringify(INITIAL_LINKS));
      return res.json(nativeGraph);
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

    const ai = getGeminiClient();

    const stats = await ingestURLContent(url, ai, undefined, 1);
    res.json({
      success: true,
      message: `Berjaya mengindeks "${stats.title}" melalui ${stats.crawler}.`,
      stats
    });
  } catch (error: any) {
    console.error("Ingest URL Error:", error);
    res.status(500).json({ error: error.message || "Gagal melaksanakan proses crawler ke atas URL berkenaan." });
  }
});

app.get("/api/crawl-sources", (req, res) => {
  res.json({
    sources: SOURCE_PORTALS,
	    config: {
	      crawler: INGESTION_CRAWLER,
	      maxDepth: CRAWL_MAX_DEPTH,
	      maxPagesPerSource: CRAWL_MAX_PAGES_PER_SOURCE,
	      gcpNativeEnabled: isGcpNativeConfigured(),
	      gcpProjectId: GCP_PROJECT_ID,
	      gcpLocation: GCP_LOCATION,
	      bigQueryDataset: BQ_DATASET,
	      bigQueryCorpusTable: BQ_CORPUS_TABLE,
	      bigQueryChunksTable: BQ_CHUNKS_TABLE,
	      bigQueryGraphTable: BQ_GRAPH_TABLE,
	      bigQueryEmbeddingModel: BQ_EMBEDDING_MODEL,
	      cloudStorageRawBucket: GCS_RAW_BUCKET,
	      knowledgeCatalogEntryGroup: KNOWLEDGE_CATALOG_ENTRY_GROUP
	    }
	  });
});

app.get("/api/crawl-logs", (req, res) => {
  res.json({
    isCrawling: isBatchCrawling,
    logs: batchCrawlLogs,
    sources: SOURCE_PORTALS,
    total: SOURCE_PORTALS.length,
	    config: {
	      crawler: INGESTION_CRAWLER,
	      maxDepth: CRAWL_MAX_DEPTH,
	      maxPagesPerSource: CRAWL_MAX_PAGES_PER_SOURCE,
	      gcpNativeEnabled: isGcpNativeConfigured(),
	      gcpProjectId: GCP_PROJECT_ID,
	      gcpLocation: GCP_LOCATION,
	      bigQueryDataset: BQ_DATASET,
	      bigQueryCorpusTable: BQ_CORPUS_TABLE,
	      bigQueryChunksTable: BQ_CHUNKS_TABLE,
	      bigQueryGraphTable: BQ_GRAPH_TABLE,
	      bigQueryEmbeddingModel: BQ_EMBEDDING_MODEL,
	      cloudStorageRawBucket: GCS_RAW_BUCKET,
	      knowledgeCatalogEntryGroup: KNOWLEDGE_CATALOG_ENTRY_GROUP
	    }
	  });
});

app.post("/api/ingest-batch", async (req, res) => {
  if (isBatchCrawling) {
    return res.status(400).json({ error: "Proses merangkak (batch crawling) sedang berjalan." });
  }

  let ai;
  try {
    ai = getGeminiClient();
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }

  isBatchCrawling = true;
  batchCrawlLogs = [];

  // Fire-and-forget background crawling
  (async () => {
    for (const source of SOURCE_PORTALS) {
      const timeStr = getCrawlTimeString();
      const maxPages = getSourceMaxPages(source);
      const logEntry: CrawlLog = {
        sourceId: source.id,
        sourceName: source.name,
        url: source.url,
        title: "Penganalisisan Laman...",
        status: "RUNNING",
        log: `Memulakan Crawl4AI (${maxPages} halaman maks, kedalaman ${CRAWL_MAX_DEPTH}) untuk ${source.category}.`,
        time: timeStr
      };
      batchCrawlLogs.push(logEntry);

      try {
        console.log(`Crawler: Ingesting source: ${source.name} (${source.url})`);
        const stats = await ingestURLContent(source.url, ai, source);
        
        logEntry.title = stats.title;
        logEntry.status = "SUCCESS";
        logEntry.pagesCount = stats.documentsCount;
        logEntry.chunksCount = stats.chunksCount;
        logEntry.nodesCount = stats.nodesCount;
	        logEntry.linksCount = stats.linksCount;
	        logEntry.crawler = stats.crawler;
	        logEntry.gcsStatus = stats.gcsStatus;
	        logEntry.bigQueryStatus = stats.bigQueryStatus;
	        logEntry.knowledgeCatalogStatus = stats.knowledgeCatalogStatus;
	        logEntry.log = `Mengindeks ${stats.documentsCount} dokumen/${stats.chunksCount} chunks ke BigQuery Vector Search, mengekstrak ${stats.nodesCount} nod + ${stats.linksCount} hubungan, GCS: ${stats.gcsStatus}, Knowledge Catalog: ${stats.knowledgeCatalogStatus}.`;
      } catch (err: any) {
        console.error(`Crawler Error for ${source.url}:`, err.message);
        logEntry.status = "FAILED";
        logEntry.log = `Gagal diindeks: ${err.message}`;
      }

      logEntry.time = getCrawlTimeString();
    }
    isBatchCrawling = false;
  })();

	  res.json({ success: true, message: "Proses crawler Crawl4AI + BigQuery/Knowledge Catalog diaktifkan di latar belakang.", total: SOURCE_PORTALS.length });
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
