import dotenv from "dotenv";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { createHash, randomUUID } from "crypto";
import { BigQuery } from "@google-cloud/bigquery";
import { Storage } from "@google-cloud/storage";
import { GoogleAuth } from "google-auth-library";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

type SourceCategory = "website - internal" | "articles - internal" | "website";
type CrawlSource = {
  id: number;
  name: string;
  url: string;
  category: SourceCategory;
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
type PreparedChunk = {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
};
type ExistingDocumentRecord = {
  documentId: string;
  contentHash?: string;
};
type CandidateUrl = {
  run_id: string;
  source_id: number;
  source_name: string;
  url: string;
  normalized_url: string;
  document_id: string;
  discovered_via: string;
  created_at: string;
};
type AttemptRow = {
  run_id: string;
  source_id: number;
  source_name: string;
  url: string;
  normalized_url: string;
  document_id: string;
  content_hash: string;
  status: string;
  error: string;
  gcs_uri: string;
  crawler: string;
  created_at: string;
  updated_at: string;
};

const SOURCE_PORTALS: CrawlSource[] = [
  {
    id: 1,
    name: "Waktu Solat Digital",
    url: "https://www.waktusolat.digital",
    category: "website - internal",
    includePatterns: ["*waktusolat.digital*"],
    defaultMaxPages: 2,
  },
  {
    id: 2,
    name: "Berita Harian - Agama",
    url: "https://www.bharian.com.my/rencana/agama",
    category: "articles - internal",
    includePatterns: ["*bharian.com.my/rencana/agama*", "*bharian.com.my/berita/nasional*", "*bharian.com.my/rencana*"],
    defaultMaxPages: 4,
  },
  {
    id: 3,
    name: "Harian Metro - Addin",
    url: "https://www.hmetro.com.my/addin",
    category: "articles - internal",
    includePatterns: ["*hmetro.com.my/addin*"],
    defaultMaxPages: 4,
  },
  {
    id: 4,
    name: "Portal i-Fiqh JAKIM",
    url: "https://i-fiqh.islam.gov.my/portal/",
    category: "website",
    includePatterns: ["*i-fiqh.islam.gov.my/portal*"],
    defaultMaxPages: 3,
  },
  {
    id: 5,
    name: "Sistem MyHadith JAKIM",
    url: "https://myhadith.islam.gov.my",
    category: "website",
    includePatterns: ["*myhadith.islam.gov.my*"],
    defaultMaxPages: 3,
  },
  {
    id: 6,
    name: "e-Khutbah JAKIM",
    url: "https://www.islam.gov.my/ms/e-khutbah",
    category: "website",
    includePatterns: ["*islam.gov.my/ms/e-khutbah*", "*islam.gov.my/ms/khutbah*"],
    defaultMaxPages: 3,
  },
  {
    id: 7,
    name: "Mufti WP - Bayan Linnas",
    url: "https://muftiwp.gov.my/ms/artikel/bayan-linnas",
    category: "website",
    includePatterns: ["*muftiwp.gov.my/ms/artikel/bayan-linnas*"],
    defaultMaxPages: 4,
  },
  {
    id: 8,
    name: "Mufti WP - Irsyad Hukum",
    url: "https://muftiwp.gov.my/ms/artikel/irsyad-hukum",
    category: "website",
    includePatterns: ["*muftiwp.gov.my/ms/artikel/irsyad-hukum*"],
    defaultMaxPages: 4,
  },
  {
    id: 9,
    name: "Mufti WP - Irsyad Al-Hadith",
    url: "https://muftiwp.gov.my/ms/artikel/irsyad-al-hadith",
    category: "website",
    includePatterns: ["*muftiwp.gov.my/ms/artikel/irsyad-al-hadith*"],
    defaultMaxPages: 4,
  },
  {
    id: 10,
    name: "Mufti WP - Al-Kafi li al-Fatawi",
    url: "https://muftiwp.gov.my/ms/artikel/al-kafi-li-al-fatawi",
    category: "website",
    includePatterns: ["*muftiwp.gov.my/ms/artikel/al-kafi-li-al-fatawi*"],
    defaultMaxPages: 4,
  },
];

const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "";
const GCP_LOCATION = process.env.GCP_LOCATION || "asia-southeast1";
const GEMINI_LOCATION = process.env.GEMINI_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || "global";
const GCS_RAW_BUCKET = process.env.GCS_RAW_BUCKET || "";
const BQ_DATASET = process.env.BQ_DATASET || "mursyid_knowledge";
const BQ_CORPUS_TABLE = process.env.BQ_CORPUS_TABLE || "corpus";
const BQ_CHUNKS_TABLE = process.env.BQ_CHUNKS_TABLE || "chunks";
const BQ_GRAPH_TABLE = process.env.BQ_GRAPH_TABLE || "graph_edges";
const BQ_CRAWL_RUNS_TABLE = process.env.BQ_CRAWL_RUNS_TABLE || "crawl_runs";
const BQ_CRAWL_ATTEMPTS_TABLE = process.env.BQ_CRAWL_ATTEMPTS_TABLE || "crawl_attempts";
const BQ_EMBEDDING_MODEL = process.env.BQ_EMBEDDING_MODEL || "text-embedding-004";
const EXTRACTOR_MODEL = process.env.EXTRACTOR_MODEL || "gemini-3.5-flash";
const CRAWLER_MODEL = process.env.CRAWLER_MODEL || "gemini-3.1-flash-lite";
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const CRAWL4AI_BRIDGE_PATH = process.env.CRAWL4AI_BRIDGE_PATH || path.join(process.cwd(), "scripts", "crawl4ai_bridge.py");
const CRAWL4AI_TIMEOUT_MS = Math.max(30_000, parseInt(process.env.CRAWL4AI_TIMEOUT_MS || "180000", 10));
const KNOWLEDGE_CATALOG_ENTRY_GROUP = process.env.KNOWLEDGE_CATALOG_ENTRY_GROUP || "mursyid-knowledge";
const KNOWLEDGE_CATALOG_ENTRY_TYPE = process.env.KNOWLEDGE_CATALOG_ENTRY_TYPE || "mursyid-knowledge-entry";
const KNOWLEDGE_CATALOG_ASPECT_TYPE = process.env.KNOWLEDGE_CATALOG_ASPECT_TYPE || "mursyid-context";
const BACKFILL_SOURCE_IDS = process.env.BACKFILL_SOURCE_IDS || "all";
const BACKFILL_URL_LIMIT = Math.max(0, parseInt(process.env.BACKFILL_URL_LIMIT || "0", 10));
const BACKFILL_MAX_CONCURRENCY = Math.max(1, parseInt(process.env.BACKFILL_MAX_CONCURRENCY || "4", 10));
const BACKFILL_DISCOVERY_DEPTH = Math.max(1, parseInt(process.env.BACKFILL_DISCOVERY_DEPTH || "2", 10));
const BACKFILL_KEEP_STAGE = process.env.BACKFILL_KEEP_STAGE === "true";
const BACKFILL_DRY_RUN = process.env.BACKFILL_DRY_RUN === "true";
const BACKFILL_PUBLISH_CATALOG = process.env.BACKFILL_PUBLISH_CATALOG !== "false";
const BACKFILL_RUN_ID = process.env.BACKFILL_RESUME_RUN_ID || randomUUID();
const LOAD_ROWS_PER_SHARD = Math.max(1, parseInt(process.env.BACKFILL_LOAD_ROWS_PER_SHARD || "5000", 10));
const LOAD_BYTES_PER_SHARD = Math.max(1024 * 1024, parseInt(process.env.BACKFILL_LOAD_BYTES_PER_SHARD || String(100 * 1024 * 1024), 10));

const bigQuery = new BigQuery({ projectId: GCP_PROJECT_ID });
const storage = new Storage({ projectId: GCP_PROJECT_ID });
let googleAuth: GoogleAuth | null = null;
let knowledgeCatalogScaffoldPromise: Promise<void> | null = null;

function hashId(input: string, length: number = 16): string {
  return createHash("sha256").update(input).digest("hex").slice(0, length);
}

function normalizeDocumentUrl(value?: string): string {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.searchParams.sort();
    const normalized = parsed.toString();
    return normalized.endsWith("/") && parsed.pathname !== "/" ? normalized.slice(0, -1) : normalized;
  } catch {
    return String(value || "").trim().replace(/#.*$/, "").replace(/\/$/, "");
  }
}

function slugify(input: string, fallback = "item"): string {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function documentIdForUrl(url: string): string {
  return `web-${hashId(normalizeDocumentUrl(url) || url, 24)}`;
}

function contentHashForValues(url: string, title: string, content: string): string {
  return hashId(
    [
      normalizeDocumentUrl(url),
      String(title || "").trim(),
      String(content || "").replace(/\r\n?/g, "\n").trim(),
    ].join("\n"),
    64
  );
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function truncateText(value: string, maxLength: number): string {
  if (!value) return "";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function bqDatasetRef(): string {
  return `\`${GCP_PROJECT_ID}.${BQ_DATASET}\``;
}

function bqTableRef(table: string): string {
  return `\`${GCP_PROJECT_ID}.${BQ_DATASET}.${table}\``;
}

function nowIso(): string {
  return new Date().toISOString();
}

function getGeminiClient(): GoogleGenAI {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.API_KEY;

  return new GoogleGenAI({
    enterprise: true,
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT || GCP_PROJECT_ID || undefined,
    location: GEMINI_LOCATION,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function getGoogleAuth(): GoogleAuth {
  if (!googleAuth) {
    googleAuth = new GoogleAuth({
      projectId: GCP_PROJECT_ID,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
  }
  return googleAuth;
}

async function runBigQuery(query: string, params?: Record<string, unknown>): Promise<any[]> {
  const [rows] = await bigQuery.query({
    query,
    params,
    location: GCP_LOCATION,
  });
  return rows as any[];
}

async function ensureBigQueryStore(): Promise<void> {
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
      content_hash STRING,
      crawl_batch_id STRING,
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
      content_hash STRING,
      crawl_batch_id STRING,
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
      content_hash STRING,
      crawl_batch_id STRING,
      metadata_json STRING,
      created_at TIMESTAMP
    )
  `);
  await runBigQuery(`
    CREATE TABLE IF NOT EXISTS ${bqTableRef(BQ_CRAWL_RUNS_TABLE)} (
      event_id STRING NOT NULL,
      run_id STRING NOT NULL,
      source_id INT64,
      source_name STRING,
      url STRING,
      title STRING,
      status STRING,
      log STRING,
      display_time STRING,
      pages_count INT64,
      chunks_count INT64,
      nodes_count INT64,
      links_count INT64,
      crawler STRING,
      gcs_status STRING,
      bigquery_status STRING,
      knowledge_catalog_status STRING,
      created_at TIMESTAMP,
      updated_at TIMESTAMP
    )
  `);
  await runBigQuery(`
    CREATE TABLE IF NOT EXISTS ${bqTableRef(BQ_CRAWL_ATTEMPTS_TABLE)} (
      run_id STRING NOT NULL,
      source_id INT64,
      source_name STRING,
      url STRING,
      normalized_url STRING,
      document_id STRING,
      content_hash STRING,
      status STRING,
      error STRING,
      gcs_uri STRING,
      crawler STRING,
      created_at TIMESTAMP,
      updated_at TIMESTAMP
    )
  `);

  for (const table of [BQ_CORPUS_TABLE, BQ_CHUNKS_TABLE, BQ_GRAPH_TABLE]) {
    await runBigQuery(`ALTER TABLE ${bqTableRef(table)} ADD COLUMN IF NOT EXISTS content_hash STRING`);
    await runBigQuery(`ALTER TABLE ${bqTableRef(table)} ADD COLUMN IF NOT EXISTS crawl_batch_id STRING`);
  }
}

async function getExistingDocumentMap(): Promise<Map<string, ExistingDocumentRecord>> {
  const rows = await runBigQuery(`
    SELECT document_id, ANY_VALUE(content_hash) AS content_hash
    FROM ${bqTableRef(BQ_CORPUS_TABLE)}
    GROUP BY document_id
  `);
  return new Map(rows.map(row => [
    row.document_id,
    {
      documentId: row.document_id,
      contentHash: row.content_hash || "",
    },
  ]));
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function matchesSourcePattern(url: string, source: CrawlSource): boolean {
  return source.includePatterns.some(pattern => wildcardToRegExp(pattern).test(url));
}

function sameHost(url: string, seed: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === new URL(seed).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MursyidBackfill/1.0)",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ms,en;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

function absolutizeUrl(baseUrl: string, value: string): string {
  try {
    return normalizeDocumentUrl(new URL(value.replace(/&amp;/g, "&"), baseUrl).toString());
  } catch {
    return "";
  }
}

function extractXmlLocs(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)).map(match => match[1].trim());
}

function extractLinks(html: string, baseUrl: string): string[] {
  const hrefLinks = Array.from(html.matchAll(/href=["']([^"']+)["']/gi)).map(match => match[1]);
  const rssLinks = Array.from(html.matchAll(/<link>\s*([^<]+)\s*<\/link>/gi)).map(match => match[1]);
  return [...hrefLinks, ...rssLinks]
    .filter(link => !link.startsWith("#") && !link.startsWith("mailto:") && !link.startsWith("tel:") && !link.startsWith("javascript:"))
    .map(link => absolutizeUrl(baseUrl, link))
    .filter(Boolean);
}

async function discoverSitemapUrls(sitemapUrl: string, source: CrawlSource, seen = new Set<string>(), depth = 0): Promise<string[]> {
  if (seen.has(sitemapUrl) || depth > 3) return [];
  seen.add(sitemapUrl);

  try {
    const xml = await fetchText(sitemapUrl);
    const locs = extractXmlLocs(xml).map(loc => absolutizeUrl(sitemapUrl, loc)).filter(Boolean);
    const nestedSitemaps = locs.filter(loc => loc.endsWith(".xml") && sameHost(loc, sitemapUrl));
    const urls = locs.filter(loc => sameHost(loc, source.url) && matchesSourcePattern(loc, source));
    const nestedResults = await Promise.all(nestedSitemaps.map(loc => discoverSitemapUrls(loc, source, seen, depth + 1)));
    return [...urls, ...nestedResults.flat()];
  } catch (err: any) {
    console.warn(`Discovery warning: sitemap failed for ${sitemapUrl}: ${err.message}`);
    return [];
  }
}

async function discoverHtmlBfs(source: CrawlSource): Promise<string[]> {
  const queue: { url: string; depth: number }[] = [{ url: normalizeDocumentUrl(source.url), depth: 0 }];
  const seen = new Set<string>();
  const candidates = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current.url) || current.depth > BACKFILL_DISCOVERY_DEPTH) continue;
    seen.add(current.url);

    let html = "";
    try {
      html = await fetchText(current.url);
    } catch (err: any) {
      console.warn(`Discovery warning: HTML failed for ${current.url}: ${err.message}`);
      continue;
    }

    for (const link of extractLinks(html, current.url)) {
      if (!sameHost(link, source.url)) continue;
      if (!matchesSourcePattern(link, source)) continue;
      candidates.add(link);
      if (current.depth + 1 <= BACKFILL_DISCOVERY_DEPTH && !seen.has(link)) {
        queue.push({ url: link, depth: current.depth + 1 });
      }
    }
  }

  candidates.add(normalizeDocumentUrl(source.url));
  return Array.from(candidates);
}

async function discoverSourceUrls(source: CrawlSource): Promise<CandidateUrl[]> {
  const discovered = new Set<string>();
  const sitemapSeeds = [
    `${new URL(source.url).origin}/sitemap.xml`,
    `${new URL(source.url).origin}/sitemap_index.xml`,
  ];
  const rssSeeds = [
    `${source.url}${source.url.includes("?") ? "&" : "?"}format=feed&type=rss`,
    `${source.url}${source.url.includes("?") ? "&" : "?"}format=feed&type=atom`,
  ];

  if (source.id === 5) {
    for (const url of await discoverSitemapUrls("https://myhadith.islam.gov.my/sitemap.xml", source)) {
      if (url.includes("/hadith/")) discovered.add(url);
    }
  } else if (source.id === 1) {
    for (const url of await discoverSitemapUrls("https://www.waktusolat.digital/sitemap.xml", source)) {
      discovered.add(url);
    }
  } else {
    for (const seed of sitemapSeeds) {
      for (const url of await discoverSitemapUrls(seed, source)) {
        discovered.add(url);
      }
    }
  }

  for (const rssUrl of rssSeeds) {
    try {
      const rss = await fetchText(rssUrl);
      for (const link of extractLinks(rss, rssUrl)) {
        if (sameHost(link, source.url) && matchesSourcePattern(link, source)) {
          discovered.add(link);
        }
      }
    } catch {
      // RSS is optional. HTML BFS covers sources without feeds.
    }
  }

  for (const url of await discoverHtmlBfs(source)) {
    discovered.add(url);
  }

  const now = nowIso();
  return Array.from(discovered)
    .sort()
    .map(url => ({
      run_id: BACKFILL_RUN_ID,
      source_id: source.id,
      source_name: source.name,
      url,
      normalized_url: normalizeDocumentUrl(url),
      document_id: documentIdForUrl(url),
      discovered_via: "sitemap-rss-html",
      created_at: now,
    }));
}

async function runCrawl4AiBridge(source: CrawlSource, url: string): Promise<CrawledDocument[]> {
  if (!fs.existsSync(CRAWL4AI_BRIDGE_PATH)) {
    throw new Error(`Crawl4AI bridge not found at ${CRAWL4AI_BRIDGE_PATH}`);
  }

  const args = [
    CRAWL4AI_BRIDGE_PATH,
    "--seed-url",
    url,
    "--source-name",
    source.name,
    "--category",
    source.category,
    "--max-pages",
    "1",
    "--max-depth",
    "0",
    "--min-chars",
    process.env.CRAWL_MIN_CHARS || "450",
  ];

  const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    const child = spawn(PYTHON_BIN, args, {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Crawl4AI timed out after ${CRAWL4AI_TIMEOUT_MS}ms`));
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
    throw new Error(result.stderr.trim() || `Crawl4AI exited with code ${result.code}`);
  }

  const parsed = JSON.parse(result.stdout.trim());
  if (!parsed.ok) {
    throw new Error(parsed.error || "Crawl4AI returned no successful document");
  }

  return (parsed.documents || []).map((doc: any) => ({
    url: doc.url || url,
    title: doc.title || source.name,
    content: doc.content || "",
    sourceName: source.name,
    category: source.category,
    crawler: "crawl4ai",
    depth: doc.depth,
  })).filter((doc: CrawledDocument) => doc.content.trim());
}

async function extractCleanContent(url: string, ai: GoogleGenAI, source: CrawlSource): Promise<CrawledDocument> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MursyidBackfill/1.0)",
    },
  });
  if (!response.ok) throw new Error(`Fallback fetch failed with HTTP ${response.status}`);
  const html = await response.text();
  const cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  const responseAi = await ai.models.generateContent({
    model: CRAWLER_MODEL,
    contents: `Extract the main article title and clean body text from this HTML. Return JSON with "title" and "content".\n\nHTML:\n${cleanHtml.substring(0, 32000)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        required: ["title", "content"],
        properties: {
          title: { type: Type.STRING },
          content: { type: Type.STRING },
        },
      },
    },
  });
  const parsed = JSON.parse((responseAi.text || "{}").trim());
  return {
    url,
    title: parsed.title || source.name,
    content: parsed.content || "",
    sourceName: source.name,
    category: source.category,
    crawler: "gemini-html",
  };
}

async function crawlUrl(source: CrawlSource, url: string, ai: GoogleGenAI): Promise<CrawledDocument[]> {
  try {
    return await runCrawl4AiBridge(source, url);
  } catch (err: any) {
    if (process.env.CRAWL4AI_FALLBACK_TO_GEMINI === "false") {
      throw err;
    }
    console.warn(`Crawl4AI fallback for ${url}: ${err.message}`);
    const fallbackDoc = await extractCleanContent(url, ai, source);
    return fallbackDoc.content.trim() ? [fallbackDoc] : [];
  }
}

function chunkText(text: string, chunkSize = 1200): string[] {
  const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(p => p.length > 20);
  const chunks: string[] = [];
  let currentChunk = "";
  for (const paragraph of paragraphs) {
    if ((currentChunk + "\n" + paragraph).length <= chunkSize) {
      currentChunk = currentChunk ? `${currentChunk}\n${paragraph}` : paragraph;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = paragraph;
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
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

async function extractGraph(ai: GoogleGenAI, document: CrawledDocument): Promise<GraphExtraction> {
  const systemInstruction =
    "Anda adalah pakar pengekstrakan maklumat teologi dan entiti undang-undang Islam. " +
    "Ekstrak konsep Syariah, hukum fiqh, rujukan dalil, institusi autoriti, dan mazhab ke dalam nodes dan links. " +
    "Jenis node: Konsep, Hukum, Sumber, Mazhab, Institusi, Artikkel. Bahasa Melayu/Malaysia.";
  const response = await ai.models.generateContent({
    model: EXTRACTOR_MODEL,
    contents: `Analisis kandungan berikut daripada "${document.title}" (${document.url}): "${document.content.substring(0, 9000)}". Bina graf pengetahuan.`,
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
                description: { type: Type.STRING },
              },
            },
          },
          links: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ["source", "target", "relation"],
              properties: {
                source: { type: Type.STRING },
                target: { type: Type.STRING },
                relation: { type: Type.STRING },
              },
            },
          },
        },
      },
    },
  });
  const parsed = JSON.parse((response.text || "{}").trim());
  return {
    nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
    links: Array.isArray(parsed.links) ? parsed.links : [],
  };
}

function prepareChunks(document: CrawledDocument, documentId: string, contentHash: string, crawlBatchId: string, embeddings: number[][]): PreparedChunk[] {
  return chunkText(document.content).map((chunk, index) => ({
    chunkId: hashId(`${documentId}:${index}:${chunk}`, 24),
    documentId,
    chunkIndex: index,
    content: chunk,
    embedding: embeddings[index] || [],
    metadata: {
      url: document.url,
      title: document.title,
      dateIndexed: nowIso(),
      documentId,
      chunkIndex: index,
      contentHash,
      crawlBatchId,
    },
  }));
}

function buildCorpusRow(document: CrawledDocument, documentId: string, contentHash: string, crawlBatchId: string, gcsUri: string) {
  const now = nowIso();
  return {
    document_id: documentId,
    source_url: document.url,
    title: document.title,
    source_name: document.sourceName || "",
    category: document.category || "",
    crawler: document.crawler,
    gcs_uri: gcsUri,
    content_hash: contentHash,
    crawl_batch_id: crawlBatchId,
    content: document.content,
    metadata_json: safeJson({
      depth: document.depth,
      embeddingModel: BQ_EMBEDDING_MODEL,
      contentHash,
      crawlBatchId,
    }),
    created_at: now,
    updated_at: now,
  };
}

function buildChunkRows(document: CrawledDocument, chunks: PreparedChunk[], contentHash: string, crawlBatchId: string) {
  const now = nowIso();
  return chunks.map(chunk => ({
    chunk_id: chunk.chunkId,
    document_id: chunk.documentId,
    source_url: document.url,
    title: document.title,
    chunk_index: chunk.chunkIndex,
    content: chunk.content,
    embedding: chunk.embedding,
    content_hash: contentHash,
    crawl_batch_id: crawlBatchId,
    metadata_json: safeJson(chunk.metadata),
    created_at: now,
  }));
}

function buildGraphRows(document: CrawledDocument, documentId: string, graphData: GraphExtraction, contentHash: string, crawlBatchId: string) {
  const now = nowIso();
  const nodesById = new Map<string, KnowledgeNode>();
  for (const node of graphData.nodes || []) {
    nodesById.set(String(node.id).toLowerCase(), node);
  }
  return (graphData.links || []).map(link => {
    const sourceNode = nodesById.get(String(link.source).toLowerCase());
    const targetNode = nodesById.get(String(link.target).toLowerCase());
    return {
      edge_id: hashId(`${documentId}:${link.source}:${link.relation}:${link.target}`, 24),
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
      content_hash: contentHash,
      crawl_batch_id: crawlBatchId,
      metadata_json: safeJson({
        title: document.title,
        sourceName: document.sourceName,
        category: document.category,
        contentHash,
        crawlBatchId,
      }),
      created_at: now,
    };
  });
}

async function uploadRawMarkdown(document: CrawledDocument, documentId: string, contentHash: string, crawlBatchId: string): Promise<string> {
  const sourceSlug = slugify(document.sourceName || document.category || "manual");
  const objectName = `raw/${sourceSlug}/${documentId}/${contentHash}.md`;
  const file = storage.bucket(GCS_RAW_BUCKET).file(objectName);
  await file.save(document.content, {
    contentType: "text/markdown; charset=utf-8",
    metadata: {
      metadata: {
        title: document.title,
        sourceUrl: document.url,
        sourceName: document.sourceName || "",
        crawler: document.crawler,
        contentHash,
        crawlBatchId,
      },
    },
  });
  return `gs://${GCS_RAW_BUCKET}/${objectName}`;
}

class JsonlShardWriter {
  private shardIndex = 0;
  private rowCount = 0;
  private byteCount = 0;
  private localPath: string | null = null;
  private uploadedUris: string[] = [];
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly runId: string, private readonly kind: string) {}

  get uris(): string[] {
    return this.uploadedUris;
  }

  async append(row: Record<string, unknown>): Promise<void> {
    this.pending = this.pending.then(() => this.appendNow(row));
    return this.pending;
  }

  async flush(): Promise<void> {
    this.pending = this.pending.then(() => this.flushNow());
    return this.pending;
  }

  private async appendNow(row: Record<string, unknown>): Promise<void> {
    if (!this.localPath) {
      this.localPath = path.join(os.tmpdir(), `${this.runId}-${this.kind}-${this.shardIndex}.jsonl`);
      await fs.promises.rm(this.localPath, { force: true });
    }
    const line = `${JSON.stringify(row)}\n`;
    await fs.promises.appendFile(this.localPath, line, "utf8");
    this.rowCount += 1;
    this.byteCount += Buffer.byteLength(line);
    if (this.rowCount >= LOAD_ROWS_PER_SHARD || this.byteCount >= LOAD_BYTES_PER_SHARD) {
      await this.flushNow();
    }
  }

  private async flushNow(): Promise<void> {
    if (!this.localPath || this.rowCount === 0) return;
    const objectName = `backfills/${this.runId}/load/${this.kind}-${String(this.shardIndex).padStart(5, "0")}.jsonl`;
    await storage.bucket(GCS_RAW_BUCKET).upload(this.localPath, {
      destination: objectName,
      contentType: "application/x-ndjson",
    });
    this.uploadedUris.push(`gs://${GCS_RAW_BUCKET}/${objectName}`);
    await fs.promises.rm(this.localPath, { force: true });
    this.shardIndex += 1;
    this.rowCount = 0;
    this.byteCount = 0;
    this.localPath = null;
  }
}

async function uploadDiscoveryManifest(runId: string, candidates: CandidateUrl[]): Promise<string> {
  const localPath = path.join(os.tmpdir(), `${runId}-discovery.jsonl`);
  await fs.promises.writeFile(localPath, candidates.map(candidate => JSON.stringify(candidate)).join("\n") + "\n", "utf8");
  const objectName = `backfills/${runId}/discovery/discovered-urls.jsonl`;
  await storage.bucket(GCS_RAW_BUCKET).upload(localPath, {
    destination: objectName,
    contentType: "application/x-ndjson",
  });
  await fs.promises.rm(localPath, { force: true });
  return `gs://${GCS_RAW_BUCKET}/${objectName}`;
}

function attemptRow(source: CrawlSource, url: string, status: string, patch: Partial<AttemptRow> = {}): AttemptRow {
  const normalizedUrl = normalizeDocumentUrl(url);
  const now = nowIso();
  return {
    run_id: BACKFILL_RUN_ID,
    source_id: source.id,
    source_name: source.name,
    url,
    normalized_url: normalizedUrl,
    document_id: documentIdForUrl(normalizedUrl),
    content_hash: "",
    status,
    error: "",
    gcs_uri: "",
    crawler: "",
    created_at: now,
    updated_at: now,
    ...patch,
  };
}

async function dataplexRequest(method: string, resourcePath: string, body?: unknown): Promise<any> {
  const url = `https://dataplex.googleapis.com/v1/${resourcePath}`;
  const authClient = await getGoogleAuth().getClient();
  const authHeaders = await authClient.getRequestHeaders(url);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  for (const [key, value] of Object.entries(authHeaders as Record<string, any>)) {
    headers[key] = String(value);
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
    const error: any = new Error(payload.error?.message || payload.message || response.statusText);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function ensureKnowledgeCatalogScaffold(): Promise<void> {
  if (knowledgeCatalogScaffoldPromise) return knowledgeCatalogScaffoldPromise;
  knowledgeCatalogScaffoldPromise = ensureKnowledgeCatalogScaffoldNow().catch(err => {
    knowledgeCatalogScaffoldPromise = null;
    throw err;
  });
  return knowledgeCatalogScaffoldPromise;
}

async function ensureKnowledgeCatalogScaffoldNow(): Promise<void> {
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
      requiredAspects: [{ type: `${parent}/aspectTypes/${KNOWLEDGE_CATALOG_ASPECT_TYPE}` }],
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

function catalogFqn(kind: string, id: string): string {
  return `custom:mursyid-ai.${slugify(GCP_PROJECT_ID, "project")}.${slugify(GCP_LOCATION, "location")}.${slugify(KNOWLEDGE_CATALOG_ENTRY_GROUP)}.${slugify(kind)}.${slugify(id)}`;
}

async function createOrPatchCatalogEntry(entryId: string, body: unknown): Promise<void> {
  const entryGroupPath = `projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/entryGroups/${KNOWLEDGE_CATALOG_ENTRY_GROUP}`;
  try {
    await dataplexRequest("POST", `${entryGroupPath}/entries?entryId=${encodeURIComponent(entryId)}`, body);
  } catch (err: any) {
    if (err.status !== 409) throw err;
    await dataplexRequest("PATCH", `${entryGroupPath}/entries/${encodeURIComponent(entryId)}?updateMask=entrySource,aspects`, body);
  }
}

async function publishToKnowledgeCatalog(document: CrawledDocument, documentId: string, graphData: GraphExtraction, gcsUri: string): Promise<string> {
  if (!BACKFILL_PUBLISH_CATALOG) return "SKIPPED_DISABLED";
  await ensureKnowledgeCatalogScaffold();
  const parent = `projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}`;
  const aspectKey = `${GCP_PROJECT_ID}.${GCP_LOCATION}.${KNOWLEDGE_CATALOG_ASPECT_TYPE}`;
  const entryType = `${parent}/entryTypes/${KNOWLEDGE_CATALOG_ENTRY_TYPE}`;
  const entryId = `source-${documentId}`.slice(0, 250);
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
      updateTime: nowIso(),
    },
    aspects: {
      [aspectKey]: {
        data: {
          title: document.title,
          source_url: document.url,
          gcs_uri: gcsUri,
          nodes_count: graphData.nodes?.length || 0,
          links_count: graphData.links?.length || 0,
        },
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
        updateTime: nowIso(),
      },
      aspects: {
        [aspectKey]: {
          data: {
            title: node.label || node.id,
            source_url: document.url,
            gcs_uri: gcsUri,
            nodes_count: 1,
            links_count: (graphData.links || []).filter(link => link.source === node.id || link.target === node.id).length,
          },
        },
      },
    });
  }
  return "SUCCESS";
}

async function loadJsonlIntoTable(tableName: string, gcsUris: string[]): Promise<void> {
  if (gcsUris.length === 0) return;
  await (bigQuery.dataset(BQ_DATASET).table(tableName) as any).load(gcsUris, {
    sourceFormat: "NEWLINE_DELIMITED_JSON",
    writeDisposition: "WRITE_TRUNCATE",
  });
}

async function createStagingTables(runKey: string): Promise<Record<string, string>> {
  const tables = {
    corpus: `stg_corpus_${runKey}`,
    chunks: `stg_chunks_${runKey}`,
    graph: `stg_graph_edges_${runKey}`,
    attempts: `stg_attempts_${runKey}`,
  };
  await runBigQuery(`DROP TABLE IF EXISTS ${bqTableRef(tables.corpus)}`);
  await runBigQuery(`DROP TABLE IF EXISTS ${bqTableRef(tables.chunks)}`);
  await runBigQuery(`DROP TABLE IF EXISTS ${bqTableRef(tables.graph)}`);
  await runBigQuery(`DROP TABLE IF EXISTS ${bqTableRef(tables.attempts)}`);
  await runBigQuery(`CREATE TABLE ${bqTableRef(tables.corpus)} LIKE ${bqTableRef(BQ_CORPUS_TABLE)}`);
  await runBigQuery(`CREATE TABLE ${bqTableRef(tables.chunks)} LIKE ${bqTableRef(BQ_CHUNKS_TABLE)}`);
  await runBigQuery(`CREATE TABLE ${bqTableRef(tables.graph)} LIKE ${bqTableRef(BQ_GRAPH_TABLE)}`);
  await runBigQuery(`CREATE TABLE ${bqTableRef(tables.attempts)} LIKE ${bqTableRef(BQ_CRAWL_ATTEMPTS_TABLE)}`);
  return tables;
}

async function mergeStagingTables(tables: Record<string, string>): Promise<void> {
  await runBigQuery(`
    BEGIN TRANSACTION;

    MERGE ${bqTableRef(BQ_CORPUS_TABLE)} AS target
    USING (
      SELECT * FROM ${bqTableRef(tables.corpus)}
      QUALIFY ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY updated_at DESC) = 1
    ) AS source
    ON target.document_id = source.document_id
    WHEN MATCHED THEN UPDATE SET
      source_url = source.source_url,
      title = source.title,
      source_name = source.source_name,
      category = source.category,
      crawler = source.crawler,
      gcs_uri = source.gcs_uri,
      content_hash = source.content_hash,
      crawl_batch_id = source.crawl_batch_id,
      content = source.content,
      metadata_json = source.metadata_json,
      updated_at = source.updated_at
    WHEN NOT MATCHED THEN INSERT (
      document_id, source_url, title, source_name, category, crawler, gcs_uri, content_hash,
      crawl_batch_id, content, metadata_json, created_at, updated_at
    ) VALUES (
      source.document_id, source.source_url, source.title, source.source_name, source.category, source.crawler,
      source.gcs_uri, source.content_hash, source.crawl_batch_id, source.content, source.metadata_json,
      source.created_at, source.updated_at
    );

    MERGE ${bqTableRef(BQ_CHUNKS_TABLE)} AS target
    USING (
      SELECT * FROM ${bqTableRef(tables.chunks)}
      QUALIFY ROW_NUMBER() OVER (PARTITION BY chunk_id ORDER BY created_at DESC) = 1
    ) AS source
    ON target.chunk_id = source.chunk_id
    WHEN MATCHED THEN UPDATE SET
      document_id = source.document_id,
      source_url = source.source_url,
      title = source.title,
      chunk_index = source.chunk_index,
      content = source.content,
      embedding = source.embedding,
      content_hash = source.content_hash,
      crawl_batch_id = source.crawl_batch_id,
      metadata_json = source.metadata_json,
      created_at = source.created_at
    WHEN NOT MATCHED THEN INSERT (
      chunk_id, document_id, source_url, title, chunk_index, content, embedding, content_hash,
      crawl_batch_id, metadata_json, created_at
    ) VALUES (
      source.chunk_id, source.document_id, source.source_url, source.title, source.chunk_index,
      source.content, source.embedding, source.content_hash, source.crawl_batch_id, source.metadata_json, source.created_at
    );

    DELETE FROM ${bqTableRef(BQ_CHUNKS_TABLE)} AS target
    WHERE EXISTS (
      SELECT 1 FROM ${bqTableRef(tables.corpus)} AS staged
      WHERE staged.document_id = target.document_id
    )
      AND NOT EXISTS (
        SELECT 1 FROM ${bqTableRef(tables.corpus)} AS staged
        WHERE staged.document_id = target.document_id
          AND staged.content_hash = target.content_hash
      );

    MERGE ${bqTableRef(BQ_GRAPH_TABLE)} AS target
    USING (
      SELECT * FROM ${bqTableRef(tables.graph)}
      QUALIFY ROW_NUMBER() OVER (PARTITION BY edge_id ORDER BY created_at DESC) = 1
    ) AS source
    ON target.edge_id = source.edge_id
    WHEN MATCHED THEN UPDATE SET
      document_id = source.document_id,
      source_url = source.source_url,
      source_id = source.source_id,
      source_label = source.source_label,
      source_type = source.source_type,
      source_description = source.source_description,
      target_id = source.target_id,
      target_label = source.target_label,
      target_type = source.target_type,
      target_description = source.target_description,
      relation = source.relation,
      content_hash = source.content_hash,
      crawl_batch_id = source.crawl_batch_id,
      metadata_json = source.metadata_json,
      created_at = source.created_at
    WHEN NOT MATCHED THEN INSERT (
      edge_id, document_id, source_url, source_id, source_label, source_type, source_description,
      target_id, target_label, target_type, target_description, relation, content_hash, crawl_batch_id,
      metadata_json, created_at
    ) VALUES (
      source.edge_id, source.document_id, source.source_url, source.source_id, source.source_label,
      source.source_type, source.source_description, source.target_id, source.target_label, source.target_type,
      source.target_description, source.relation, source.content_hash, source.crawl_batch_id, source.metadata_json,
      source.created_at
    );

    DELETE FROM ${bqTableRef(BQ_GRAPH_TABLE)} AS target
    WHERE EXISTS (
      SELECT 1 FROM ${bqTableRef(tables.corpus)} AS staged
      WHERE staged.document_id = target.document_id
    )
      AND NOT EXISTS (
        SELECT 1 FROM ${bqTableRef(tables.corpus)} AS staged
        WHERE staged.document_id = target.document_id
          AND staged.content_hash = target.content_hash
      );

    INSERT INTO ${bqTableRef(BQ_CRAWL_ATTEMPTS_TABLE)}
    SELECT * FROM ${bqTableRef(tables.attempts)};

    COMMIT TRANSACTION;
  `);
}

async function dropStagingTables(tables: Record<string, string>): Promise<void> {
  if (BACKFILL_KEEP_STAGE) return;
  await Promise.all(Object.values(tables).map(table => runBigQuery(`DROP TABLE IF EXISTS ${bqTableRef(table)}`)));
}

async function mapLimit<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      await worker(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
}

function selectedSources(): CrawlSource[] {
  if (BACKFILL_SOURCE_IDS.trim().toLowerCase() === "all") return SOURCE_PORTALS;
  const ids = new Set(BACKFILL_SOURCE_IDS.split(",").map(value => Number(value.trim())).filter(Number.isFinite));
  return SOURCE_PORTALS.filter(source => ids.has(source.id));
}

async function processCandidate(
  candidate: CandidateUrl,
  source: CrawlSource,
  existingDocuments: Map<string, ExistingDocumentRecord>,
  ai: GoogleGenAI,
  writers: {
    corpus: JsonlShardWriter;
    chunks: JsonlShardWriter;
    graph: JsonlShardWriter;
    attempts: JsonlShardWriter;
  }
): Promise<void> {
  try {
    const documents = await crawlUrl(source, candidate.url, ai);
    if (documents.length === 0) {
      await writers.attempts.append(attemptRow(source, candidate.url, "FAILED", { error: "No crawlable document returned" }));
      return;
    }

    for (const document of documents) {
      const documentId = documentIdForUrl(document.url);
      const contentHash = contentHashForValues(document.url, document.title, document.content);
      const existing = existingDocuments.get(documentId);
      if (existing?.contentHash === contentHash) {
        await writers.attempts.append(attemptRow(source, document.url, "SKIPPED_UNCHANGED", {
          document_id: documentId,
          content_hash: contentHash,
          crawler: document.crawler,
        }));
        continue;
      }

      const gcsUri = await uploadRawMarkdown(document, documentId, contentHash, BACKFILL_RUN_ID);
      const chunkBodies = chunkText(document.content);
      const embeddings: number[][] = [];
      for (const chunk of chunkBodies) {
        try {
          embeddings.push(await generateTextEmbedding(ai, chunk));
        } catch (err: any) {
          console.warn(`Embedding warning for ${document.url}: ${err.message}`);
          embeddings.push([]);
        }
      }
      const preparedChunks = prepareChunks(document, documentId, contentHash, BACKFILL_RUN_ID, embeddings);
      const graphData = await extractGraph(ai, document);
      const catalogStatus = await publishToKnowledgeCatalog(document, documentId, graphData, gcsUri).catch((err: any) => {
        console.warn(`Catalog warning for ${document.url}: ${err.message}`);
        return "FAILED";
      });

      await writers.corpus.append(buildCorpusRow(document, documentId, contentHash, BACKFILL_RUN_ID, gcsUri));
      for (const row of buildChunkRows(document, preparedChunks, contentHash, BACKFILL_RUN_ID)) {
        await writers.chunks.append(row);
      }
      for (const row of buildGraphRows(document, documentId, graphData, contentHash, BACKFILL_RUN_ID)) {
        await writers.graph.append(row);
      }
      await writers.attempts.append(attemptRow(source, document.url, catalogStatus === "SUCCESS" ? "CATALOGED" : "PREPARED", {
        document_id: documentId,
        content_hash: contentHash,
        gcs_uri: gcsUri,
        crawler: document.crawler,
        error: catalogStatus === "FAILED" ? "Knowledge Catalog publish failed" : "",
      }));
      existingDocuments.set(documentId, { documentId, contentHash });
    }
  } catch (err: any) {
    await writers.attempts.append(attemptRow(source, candidate.url, "FAILED", { error: truncateText(err.message || String(err), 2000) }));
  }
}

async function main(): Promise<void> {
  if (!GCP_PROJECT_ID) throw new Error("GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT is required.");
  if (!GCS_RAW_BUCKET) throw new Error("GCS_RAW_BUCKET is required for large backfills.");

  const sources = selectedSources();
  if (sources.length === 0) throw new Error(`No sources selected by BACKFILL_SOURCE_IDS=${BACKFILL_SOURCE_IDS}`);

  console.log(`Backfill run ${BACKFILL_RUN_ID}: initializing BigQuery and discovery for ${sources.length} source(s).`);
  await ensureBigQueryStore();
  const ai = getGeminiClient();
  const existingDocuments = await getExistingDocumentMap();

  const candidatesBySource = new Map<number, CandidateUrl[]>();
  const allCandidates: CandidateUrl[] = [];
  for (const source of sources) {
    const candidates = await discoverSourceUrls(source);
    candidatesBySource.set(source.id, candidates);
    allCandidates.push(...candidates);
    console.log(`Discovered ${candidates.length} URL(s) for ${source.name}.`);
  }

  const uniqueCandidates = Array.from(new Map(allCandidates.map(candidate => [candidate.normalized_url, candidate])).values());
  const limitedCandidates = BACKFILL_URL_LIMIT > 0 ? uniqueCandidates.slice(0, BACKFILL_URL_LIMIT) : uniqueCandidates;
  const discoveryUri = await uploadDiscoveryManifest(BACKFILL_RUN_ID, limitedCandidates);
  console.log(`Discovery manifest written to ${discoveryUri}. URLs selected: ${limitedCandidates.length}.`);

  if (BACKFILL_DRY_RUN) {
    console.log("BACKFILL_DRY_RUN=true; stopping after discovery.");
    return;
  }

  const writers = {
    corpus: new JsonlShardWriter(BACKFILL_RUN_ID, "corpus"),
    chunks: new JsonlShardWriter(BACKFILL_RUN_ID, "chunks"),
    graph: new JsonlShardWriter(BACKFILL_RUN_ID, "graph_edges"),
    attempts: new JsonlShardWriter(BACKFILL_RUN_ID, "attempts"),
  };
  for (const candidate of limitedCandidates) {
    const source = SOURCE_PORTALS.find(item => item.id === candidate.source_id)!;
    await writers.attempts.append(attemptRow(source, candidate.url, "DISCOVERED"));
  }

  await mapLimit(limitedCandidates, BACKFILL_MAX_CONCURRENCY, async (candidate, index) => {
    const source = SOURCE_PORTALS.find(item => item.id === candidate.source_id)!;
    if ((index + 1) % 25 === 0 || index === 0) {
      console.log(`Processing ${index + 1}/${limitedCandidates.length}: ${candidate.url}`);
    }
    await processCandidate(candidate, source, existingDocuments, ai, writers);
  });

  await Promise.all(Object.values(writers).map(writer => writer.flush()));
  const runKey = BACKFILL_RUN_ID.replace(/[^A-Za-z0-9_]+/g, "_").slice(0, 40);
  const stagingTables = await createStagingTables(runKey);
  await loadJsonlIntoTable(stagingTables.corpus, writers.corpus.uris);
  await loadJsonlIntoTable(stagingTables.chunks, writers.chunks.uris);
  await loadJsonlIntoTable(stagingTables.graph, writers.graph.uris);
  await loadJsonlIntoTable(stagingTables.attempts, writers.attempts.uris);
  await mergeStagingTables(stagingTables);

  await runBigQuery(`
    INSERT INTO ${bqTableRef(BQ_CRAWL_RUNS_TABLE)} (
      event_id, run_id, source_id, source_name, url, title, status, log, display_time,
      pages_count, chunks_count, nodes_count, links_count, crawler, gcs_status,
      bigquery_status, knowledge_catalog_status, created_at, updated_at
    )
    SELECT
      GENERATE_UUID(),
      @runId,
      NULL,
      'large-backfill',
      @discoveryUri,
      'Large Backfill',
      'SUCCESS',
      CONCAT('Backfill completed. Discovered ', CAST(@candidateCount AS STRING), ' URL(s).'),
      FORMAT_TIMESTAMP('%H:%M', CURRENT_TIMESTAMP(), 'Asia/Kuala_Lumpur'),
      @candidateCount,
      (SELECT COUNT(*) FROM ${bqTableRef(stagingTables.chunks)}),
      NULL,
      (SELECT COUNT(*) FROM ${bqTableRef(stagingTables.graph)}),
      'crawl4ai-batch',
      'SUCCESS',
      'SUCCESS',
      IF(@publishCatalog, 'SUCCESS_OR_PARTIAL', 'SKIPPED_DISABLED'),
      CURRENT_TIMESTAMP(),
      CURRENT_TIMESTAMP()
  `, {
    runId: BACKFILL_RUN_ID,
    discoveryUri,
    candidateCount: limitedCandidates.length,
    publishCatalog: BACKFILL_PUBLISH_CATALOG,
  }).catch(err => {
    console.warn(`Run log warning: ${err.message}`);
  });

  await dropStagingTables(stagingTables);
  console.log(`Backfill run ${BACKFILL_RUN_ID} completed.`);
}

main().catch(err => {
  console.error("Backfill failed:", err);
  process.exitCode = 1;
});
