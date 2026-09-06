import dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';
import { Storage } from '@google-cloud/storage';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MODEL, NODE_TYPES, PROMPT, fingerprint, hash, splitSections, validateExtraction, processDocument, graphRows, canActivate, EDGE_FIELDS, type Document, type Section } from './knowledge/core';
import { CloudStore, PREFIX, tableFor, validateRelease, type Release } from './knowledge/cloud';

dotenv.config({ quiet: true });
const project = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '';
const dataset = process.env.BQ_DATASET || 'mursyid_knowledge';
const corpus = process.env.BQ_CORPUS_TABLE || 'corpus';
const bucket = process.env.KNOWLEDGE_PIPELINE_BUCKET || process.env.GCS_RAW_BUCKET || '';
const location = process.env.GCP_LOCATION || 'asia-southeast1';
const region = process.env.GEMINI_LOCATION || 'global';
const [command = 'help', ...args] = process.argv.slice(2);
function option(name: string, fallback = '') { const index = args.indexOf(`--${name}`); if (index < 0) return fallback; const value = args[index + 1]; if (!value || value.startsWith('--')) throw new Error(`--${name} needs a value`); return value; }
const help = `Stored-corpus graph pipeline (Gemini ${MODEL}). No crawling.
  npm run graph:pipeline -- plan [--limit 50 | --all] [--source NAME]
  npm run graph:pipeline -- run --run-id NAME [--limit 50 | --all] [--source NAME]
  npm run graph:pipeline -- status --run-id NAME
  npm run graph:pipeline -- publish --run-id NAME --expected-active VERSION_OR_legacy
  npm run graph:pipeline -- activate --run-id PREVIOUS_NAME --expected-active CURRENT_VERSION

plan reads corpus only. run calls Gemini and stages a graph; it does not publish.
Repeat run with the SAME ID and options to resume. Use a NEW ID for changed inputs/config.
publish/activate require an explicit expected active version and never overwrite the legacy graph.
Default limit 50; --all is required for the full corpus. No knowledge generation runs on server startup.`;

async function main() {
  if (command === 'help' || args.includes('--help')) { console.log(help); return; }
  if (!['plan','run','status','publish','activate'].includes(command)) throw new Error('Unknown command; use help');
  const known = new Set(['--limit','--all','--source','--run-id','--expected-active']);
  for (let i = 0; i < args.length; i++) {
    if (!known.has(args[i])) throw new Error(`Unknown argument ${args[i]}`);
    if (args[i] !== '--all') { if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${args[i]}`); i++; }
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]+$/.test(project) || !/^[a-zA-Z_]\w*$/.test(dataset) || !/^[a-zA-Z_]\w*$/.test(corpus)) throw new Error('Configure a valid project, dataset and corpus table');
  if (!bucket) throw new Error('Configure KNOWLEDGE_PIPELINE_BUCKET or GCS_RAW_BUCKET');
  const all = args.includes('--all');
  if (all && args.includes('--limit')) throw new Error('Choose --all or --limit');
  const limit = Number(option('limit', '50'));
  if (!Number.isInteger(limit) || limit < 1 || limit > 100000) throw new Error('Invalid limit');
  const source = option('source');
  const runId = option('run-id');
  if (command !== 'plan' && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,79}$/.test(runId)) throw new Error('--run-id must be 3–80 letters, digits, underscores or hyphens');
  const bq = new BigQuery({ projectId: project });
  const storage = new Storage({ projectId: project });
  const root = new CloudStore(storage, bucket, PREFIX);
  const store = new CloudStore(storage, bucket, `${PREFIX}/runs/${runId}`);
  const artifacts = new CloudStore(storage, bucket, `${PREFIX}/artifacts`);
  const table = (name: string) => { if (!/^[a-zA-Z_]\w*$/.test(name)) throw new Error('Invalid table ID'); return `\`${project}.${dataset}.${name}\``; };
  const query = async (sql: string, params: Record<string, any> = {}) => (await bq.query({ query: sql, params, location }))[0];
  const inputTable = `graph_input_${hash(runId).slice(0, 24)}`;
  const selection = `WITH by_id AS (
    SELECT document_id, title, source_url, source_name, content, gcs_uri, content_hash, updated_at
    FROM ${table(corpus)} WHERE document_id != 'baseline' AND (@source = '' OR source_name = @source)
    QUALIFY ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY updated_at DESC, content_hash DESC, gcs_uri DESC) = 1
  ), by_url AS (
    SELECT * FROM by_id QUALIFY ROW_NUMBER() OVER (PARTITION BY COALESCE(NULLIF(REGEXP_REPLACE(REGEXP_REPLACE(source_url, r'#.*$', ''), r'/$',''), ''), document_id) ORDER BY updated_at DESC, document_id) = 1
  ) SELECT * FROM by_url
    ORDER BY ROW_NUMBER() OVER (PARTITION BY source_name ORDER BY document_id), source_name, document_id
    ${all ? '' : 'LIMIT @limit'}`;
  const selectionParams = all ? { source } : { source, limit };
  if (command === 'plan') {
    const rows = await query(`SELECT source_name, COUNT(*) AS documents, SUM(LENGTH(COALESCE(content,''))) AS characters,
      COUNTIF(content IS NULL OR TRIM(content) = '') AS needs_snapshot_read FROM (${selection}) GROUP BY source_name ORDER BY source_name`, selectionParams);
    console.log(JSON.stringify({ mode: 'read-only', model: MODEL, limit: all ? 'all' : limit, sources: rows }, null, 2)); return;
  }
  if (command === 'status') {
    console.log(JSON.stringify({ manifest: await store.read('manifest.json'), progress: await store.read('progress.json'), prepared: await store.read('prepared.json'), active: await root.read('active.json') }, null, 2)); return;
  }
  if (command === 'publish' || command === 'activate') {
    const expectedArg = option('expected-active');
    if (!expectedArg) throw new Error('--expected-active is required (use legacy if no pipeline release is active)');
    const release = await store.read<Release>('prepared.json');
    validateRelease(release);
    if (release.version !== runId) throw new Error('Release ID mismatch');
    const active = await root.readVersioned<Release>('active.json');
    if (active) validateRelease(active.value);
    const expected = expectedArg === 'legacy' ? null : expectedArg;
    canActivate(release, expected, active?.value.version ?? null);
    const [counts] = await query(`SELECT COUNT(*) AS n, COUNT(DISTINCT edge_id) AS unique_edges, COUNTIF(COALESCE(crawl_batch_id, '') != @run OR COALESCE(JSON_VALUE(metadata_json, '$.fingerprint'), '') != @fingerprint OR COALESCE(JSON_VALUE(metadata_json, '$.model'), '') != @model) AS wrong_run FROM ${table(release.table)}`, { run: runId, fingerprint: fingerprint(), model: MODEL });
    if (Number(counts.n) !== release.edges || Number(counts.unique_edges) !== release.edges || Number(counts.wrong_run) !== 0) throw new Error('Staged graph validation failed');
    // Only this atomic pointer changes. Legacy and previous version tables remain intact.
    await root.compareAndSwap('active.json', release, active?.generation ?? 0);
    console.log(JSON.stringify({ active: runId, previous: active?.value.version || 'legacy', edges: release.edges, reviewStatus: release.reviewStatus })); return;
  }

  const manifestConfig = { runId, project, dataset, inputTable, model: MODEL, fingerprint: fingerprint(), source, limit: all ? 0 : limit };
  const manifest = await store.once('manifest.json', { ...manifestConfig, createdAt: new Date().toISOString() });
  for (const key of Object.keys(manifestConfig)) if (manifest[key] !== manifestConfig[key]) throw new Error(`Run configuration changed (${key}); use a new run ID`);
  const prepared = await store.read<Release>('prepared.json');
  if (prepared) { validateRelease(prepared); console.log(JSON.stringify({ status: 'prepared', release: prepared })); return; }
  await query(`CREATE TABLE IF NOT EXISTS ${table(inputTable)} AS ${selection}`, selectionParams);
  const documents = await query(`SELECT document_id, title, source_url, source_name, content, gcs_uri FROM ${table(inputTable)} ORDER BY document_id`);
  if (!documents.length) throw new Error('No source documents selected');
  const ai = new GoogleGenAI({ vertexai: true, project, location: region, httpOptions: { timeout: 120000 } });
  const outputSchema = {
    type: Type.OBJECT, required: ['kind','reason','nodes','claims'], properties: {
      kind: { type: Type.STRING, enum: ['article','listing','unrelated','uncertain'] }, reason: { type: Type.STRING },
      nodes: { type: Type.ARRAY, items: { type: Type.OBJECT, required: ['id','type','label','description','scope'], properties: Object.fromEntries(['id','type','label','description','scope'].map(key => [key, key === 'type' ? { type: Type.STRING, enum: NODE_TYPES } : { type: Type.STRING }])) } },
      claims: { type: Type.ARRAY, items: { type: Type.OBJECT, required: ['source','target','relation','statement','quote','conditions','school','authority'], properties: Object.fromEntries(['source','target','relation','statement','quote','conditions','school','authority'].map(key => [key, { type: Type.STRING }])) } },
    },
  };
  const extract = async (document: Document, section: Section) => {
    let errorMessage = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await ai.models.generateContent({ model: MODEL,
          contents: JSON.stringify({ title: document.title, source: document.source_url, section: section.index, text: section.text, ...(errorMessage ? { validationErrorFromPreviousAttempt: errorMessage } : {}) }),
          config: { systemInstruction: PROMPT, responseMimeType: 'application/json', responseSchema: outputSchema, maxOutputTokens: 16384, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
        });
        const result = JSON.parse(response.text || '');
        validateExtraction(result, document, section);
        return result;
      } catch (error: any) {
        const code = Number(error.status || error.code);
        if ([400,401,403,404].includes(code) || attempt === 2) throw error;
        errorMessage = String(error.message || 'Invalid model response').slice(0, 300);
        await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
      }
    }
    throw new Error('Extraction attempts exhausted');
  };
  let completed = 0, failed = 0, sections = 0, excludedSections = 0, uncertainSections = 0;
  const edges: ReturnType<typeof graphRows> = [];
  // One Cloud Run task; document/section checkpoints make retries independent of corpus hashes.
  for (const row of documents) {
    try {
      const docKey = `source/${hash(row.document_id)}.json`;
      let document = await store.read<Document>(docKey);
      if (!document) {
        let content = row.content || '';
        if (!content.trim()) {
          const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(row.gcs_uri || '');
          const rawBucket = process.env.GCS_RAW_BUCKET || bucket;
          if (!match || match[1] !== rawBucket || !match[2].startsWith('raw/')) throw new Error('Missing stored content or allowed snapshot');
          content = (await storage.bucket(match[1]).file(match[2]).download())[0].toString('utf8');
        }
        document = await store.once(docKey, { document_id: row.document_id, title: row.title || '', source_url: row.source_url || '', source_name: row.source_name || '', content });
      }
      const results = await processDocument(document, artifacts, extract);
      edges.push(...graphRows(document, results, runId, manifest.createdAt));
      sections += results.length;
      excludedSections += results.filter(result => result.kind !== 'article').length;
      uncertainSections += results.filter(result => result.kind === 'uncertain').length;
      completed++;
    } catch (error: any) {
      failed++;
      const message = String(error.message || 'Document failed').slice(0, 1000);
      await store.once(`failures/${hash(row.document_id)}/${randomUUID()}.json`, { documentId: row.document_id, message, at: new Date().toISOString() });
      console.error(JSON.stringify({ documentId: row.document_id, error: message }));
    }
    const progress = { runId, model: MODEL, documents: documents.length, completed, failed, edges: edges.length, updatedAt: new Date().toISOString(), status: 'running' };
    const previous = await store.readVersioned('progress.json');
    try { await store.compareAndSwap('progress.json', progress, previous?.generation ?? 0); } catch (error: any) { if (Number(error.code) !== 412) throw error; }
    console.log(JSON.stringify({ completed, failed, total: documents.length }));
  }
  if (failed || !edges.length) {
    const previous = await store.readVersioned('progress.json');
    await store.compareAndSwap('progress.json', { runId, model: MODEL, documents: documents.length, completed, failed, edges: edges.length, status: 'incomplete', updatedAt: new Date().toISOString() }, previous?.generation ?? 0);
    throw new Error(`${failed} documents failed; ${edges.length} edges staged in checkpoints. Nothing published. Resume the same run to retry.`);
  }
  const releaseTable = tableFor(runId);
  const directory = await mkdtemp(path.join(tmpdir(), 'mursyid-graph-'));
  try {
    const file = path.join(directory, 'edges.jsonl');
    await writeFile(file, edges.map(edge => JSON.stringify(edge)).join('\n') + '\n');
    const [exists] = await bq.dataset(dataset).table(releaseTable).exists();
    const metadata = exists ? (await bq.dataset(dataset).table(releaseTable).getMetadata())[0] : null;
    if (!exists || Number(metadata?.numRows || 0) === 0) {
    const [job] = await bq.dataset(dataset).table(releaseTable).load(file, { sourceFormat: 'NEWLINE_DELIMITED_JSON', writeDisposition: 'WRITE_EMPTY', location,
      schema: { fields: EDGE_FIELDS.map(name => ({ name, type: name === 'created_at' ? 'TIMESTAMP' : 'STRING', mode: name === 'edge_id' ? 'REQUIRED' : 'NULLABLE' })) },
    });
    if (job.status?.errorResult) throw new Error('Graph staging load failed');
    }
    const [counts] = await query(`SELECT COUNT(*) AS n, COUNT(DISTINCT edge_id) AS unique_edges, COUNTIF(COALESCE(crawl_batch_id, '') != @run OR COALESCE(JSON_VALUE(metadata_json, '$.fingerprint'), '') != @fingerprint OR COALESCE(JSON_VALUE(metadata_json, '$.model'), '') != @model) AS invalid_rows FROM ${table(releaseTable)}`, { run: runId, fingerprint: fingerprint(), model: MODEL });
    if (Number(counts.n) !== edges.length || Number(counts.unique_edges) !== edges.length || Number(counts.invalid_rows) !== 0) throw new Error('Loaded graph count/uniqueness mismatch');
    const release: Release = { version: runId, table: releaseTable, model: MODEL, fingerprint: fingerprint(), documents: documents.length, completed, failed, edges: edges.length, sections, excludedSections, uncertainSections,
      createdAt: manifest.createdAt, preparedAt: new Date().toISOString(), inputTable, reviewStatus: 'machine-extracted' };
    validateRelease(release);
    await store.once('prepared.json', release);
    const previous = await store.readVersioned('progress.json');
    await store.compareAndSwap('progress.json', { ...release, status: 'prepared' }, previous?.generation ?? 0);
    console.log(JSON.stringify({ status: 'prepared', release, note: 'Not published. Review the run before the explicit publish command.' }, null, 2));
  } finally { await rm(directory, { recursive: true, force: true }); }
}
main().catch(error => { console.error(String(error.message || 'Graph pipeline failed')); process.exitCode = 1; });
