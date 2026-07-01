#!/usr/bin/env node

require("dotenv").config();

const { BigQuery } = require("@google-cloud/bigquery");
const { Storage } = require("@google-cloud/storage");

const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const GCP_LOCATION = process.env.GCP_LOCATION || "asia-southeast1";
const GCS_RAW_BUCKET = process.env.GCS_RAW_BUCKET;
const BQ_DATASET = process.env.BQ_DATASET || "mursyid_knowledge";
const BQ_CORPUS_TABLE = process.env.BQ_CORPUS_TABLE || "corpus";
const BQ_CHUNKS_TABLE = process.env.BQ_CHUNKS_TABLE || "chunks";
const BQ_GRAPH_TABLE = process.env.BQ_GRAPH_TABLE || "graph_edges";
const BQ_CRAWL_RUNS_TABLE = process.env.BQ_CRAWL_RUNS_TABLE || "crawl_runs";
const BQ_CRAWL_ATTEMPTS_TABLE = process.env.BQ_CRAWL_ATTEMPTS_TABLE || "crawl_attempts";
const BACKFILL_RUN_ID = process.env.BACKFILL_RUN_ID || process.argv[2];
const KEEP_STAGE = process.env.BACKFILL_KEEP_STAGE === "true";

if (!GCP_PROJECT_ID) throw new Error("GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT is required.");
if (!GCS_RAW_BUCKET) throw new Error("GCS_RAW_BUCKET is required.");
if (!BACKFILL_RUN_ID) throw new Error("BACKFILL_RUN_ID or argv[2] is required.");

const bigQuery = new BigQuery({ projectId: GCP_PROJECT_ID });
const storage = new Storage({ projectId: GCP_PROJECT_ID });

function bqDatasetRef() {
  return `\`${GCP_PROJECT_ID}.${BQ_DATASET}\``;
}

function bqTableRef(table) {
  return `\`${GCP_PROJECT_ID}.${BQ_DATASET}.${table}\``;
}

async function runBigQuery(query, params) {
  const [rows] = await bigQuery.query({ query, params, location: GCP_LOCATION });
  return rows;
}

async function ensureBigQueryStore() {
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
}

async function createStagingTables(runKey) {
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

async function listShardFiles(kind) {
  const prefix = `backfills/${BACKFILL_RUN_ID}/load/${kind}-`;
  const [files] = await storage.bucket(GCS_RAW_BUCKET).getFiles({ prefix });
  return files
    .filter((file) => file.name.endsWith(".jsonl"))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function loadJsonlIntoTable(tableName, files) {
  if (files.length === 0) {
    console.log(`No shards for ${tableName}; skipping load.`);
    return;
  }
  console.log(`Loading ${files.length} shard(s) into ${tableName}.`);
  await bigQuery.dataset(BQ_DATASET).table(tableName).load(files, {
    sourceFormat: "NEWLINE_DELIMITED_JSON",
    writeDisposition: "WRITE_TRUNCATE",
  });
}

async function mergeStagingTables(tables) {
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

async function dropStagingTables(tables) {
  if (KEEP_STAGE) return;
  await Promise.all(Object.values(tables).map((table) => runBigQuery(`DROP TABLE IF EXISTS ${bqTableRef(table)}`)));
}

async function countTable(table) {
  const rows = await runBigQuery(`SELECT COUNT(*) AS row_count FROM ${bqTableRef(table)}`);
  return Number(rows[0]?.row_count || 0);
}

async function main() {
  console.log(`Loading staged backfill ${BACKFILL_RUN_ID} without crawling.`);
  await ensureBigQueryStore();
  const runKey = BACKFILL_RUN_ID.replace(/[^A-Za-z0-9_]+/g, "_").slice(0, 40);
  const stagingTables = await createStagingTables(runKey);
  const files = {
    corpus: await listShardFiles("corpus"),
    chunks: await listShardFiles("chunks"),
    graph: await listShardFiles("graph_edges"),
    attempts: await listShardFiles("attempts"),
  };
  console.log({
    corpusShards: files.corpus.length,
    chunkShards: files.chunks.length,
    graphShards: files.graph.length,
    attemptShards: files.attempts.length,
  });

  await loadJsonlIntoTable(stagingTables.corpus, files.corpus);
  await loadJsonlIntoTable(stagingTables.chunks, files.chunks);
  await loadJsonlIntoTable(stagingTables.graph, files.graph);
  await loadJsonlIntoTable(stagingTables.attempts, files.attempts);

  const stagedCounts = {
    corpus: await countTable(stagingTables.corpus),
    chunks: await countTable(stagingTables.chunks),
    graph: await countTable(stagingTables.graph),
    attempts: await countTable(stagingTables.attempts),
  };
  console.log("Staged row counts:", stagedCounts);

  await mergeStagingTables(stagingTables);
  const discoveryUri = `gs://${GCS_RAW_BUCKET}/backfills/${BACKFILL_RUN_ID}/discovery/discovered-urls.jsonl`;
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
      'Large Backfill Staged Load',
      'SUCCESS',
      CONCAT('Staged backfill loaded without recrawling. Corpus rows ', CAST(@corpusRows AS STRING), '.'),
      FORMAT_TIMESTAMP('%H:%M', CURRENT_TIMESTAMP(), 'Asia/Kuala_Lumpur'),
      @corpusRows,
      @chunkRows,
      NULL,
      @graphRows,
      'staged-backfill-load',
      'SUCCESS',
      'SUCCESS',
      'SKIPPED_EXISTING_STAGED_DATA',
      CURRENT_TIMESTAMP(),
      CURRENT_TIMESTAMP()
  `, {
    runId: BACKFILL_RUN_ID,
    discoveryUri,
    corpusRows: stagedCounts.corpus,
    chunkRows: stagedCounts.chunks,
    graphRows: stagedCounts.graph,
  });

  await dropStagingTables(stagingTables);
  console.log("Staged backfill load completed.");
}

main().catch((err) => {
  console.error("Staged backfill load failed:", err);
  process.exitCode = 1;
});
