# Crawl4AI and Knowledge Population QC Report

Date: 2026-06-21

## Scope

QC covered the 10 configured crawl sources, the Crawl4AI bridge, and the downstream population path into raw markdown, BigQuery corpus/chunks/graph rows, and Knowledge Catalog entries. The codebase does not contain an `OKF`-named module or pipeline; this report treats "OKF population" as the current knowledge population layer implemented through BigQuery, Cloud Storage, metadata-as-code export, and Knowledge Catalog.

## Executive Status

Current status: **not ready for complete nested-content population**.

The crawler is wired end to end, but the default settings only index **2-3 pages per source** and use **depth 1** traversal. Several sources expose tens to hundreds of nested article/detail pages. Therefore the current batch job can confirm source reachability and ingest samples, but it cannot claim all nested content has been crawled or populated.

Local environment status: `crawl4ai` is listed in `requirements-crawler.txt`, but local `python3` cannot import it. A local end-to-end Crawl4AI QC run is therefore blocked until the crawler Python dependencies and browser runtime are installed.

Implementation update: ingestion now uses stable URL-based document IDs plus content hashes. Unchanged documents are skipped before embedding/graph extraction, and changed documents are merged back into BigQuery with obsolete chunk/graph rows removed for that document. This improves repeated-crawl behavior, but it does not solve source discovery completeness by itself.

## Per-Source QC

| # | Source | Seed Status | Nested Evidence | Current Effective Cap | QC Status |
|---|---|---:|---:|---:|---|
| 1 | Waktu Solat Digital | 200 | 37 matching internal links; sitemap index exposes many post/page sitemaps | 2 pages | Partial only |
| 2 | Berita Harian - Agama | 200 | Static HTML exposed mostly section/pagination links, not article URLs | 3 pages | High risk partial |
| 3 | Harian Metro - Addin | 200 | Static HTML exposed mostly section/pagination links, not article URLs | 3 pages | High risk partial |
| 4 | Portal i-Fiqh JAKIM | 200 | At least 8 `view.php?id=...` detail links visible from seed | 3 pages | Partial only |
| 5 | Sistem MyHadith JAKIM | Reachable with `curl -k`; Python CA verification failed | Sitemap has 856 URLs, including 523 `/hadith/` URLs | 3 pages | Partial only; cert handling risk |
| 6 | e-Khutbah JAKIM | Reachable with `curl -k`; Python CA verification failed | Seed exposes 10 detail links; RSS feed exposes latest 10 | 3 pages | Partial only; cert handling risk |
| 7 | Mufti WP - Bayan Linnas | 200 | 36 matching links, 25 likely detail pages from first listing page | 3 pages | Partial only |
| 8 | Mufti WP - Irsyad Hukum | 200 | 34 matching links, 33 likely detail/subcategory pages from first listing page | 3 pages | Partial only |
| 9 | Mufti WP - Irsyad Al-Hadith | 200 | 36 matching links, 25 likely detail pages from first listing page | 3 pages | Partial only |
| 10 | Mufti WP - Al-Kafi li al-Fatawi | 200 | 36 matching links, 25 likely detail pages from first listing page; RSS includes latest 10 | 3 pages | Partial only |

## Key Findings

1. **Page limits prevent full coverage.** `getSourceMaxPages()` clamps each source default to `CRAWL_MAX_PAGES_PER_SOURCE`, currently defaulting to 3. Sources configured with `defaultMaxPages: 4` are still effectively capped at 3.

2. **Depth 1 is insufficient for nested content.** Mufti WP `Irsyad Hukum` includes subcategory paths such as `edisi-haji-korban` before detail pages. A depth-1 BFS can miss detail pages behind category/listing pages.

3. **BFS may spend page budget on listing pages.** The current Crawl4AI bridge accepts whatever BFS returns first after filters. It does not prioritize article/detail URLs over listing, category, or pagination URLs.

4. **Berita Harian and Harian Metro need special discovery.** Their static seed HTML did not expose useful article links during QC. Crawl4AI browser rendering may improve this, but a robust production pipeline should use sitemap/RSS/API discovery or source-specific extraction.

5. **MyHadith and islam.gov.my certificate handling needs verification in runtime.** Python default SSL verification failed locally, while `curl -k` succeeded and returned content. Crawl4AI browser may be fine, but the fallback Gemini HTML fetch uses Node `fetch` and may fail on the same certificate chain.

6. **Content filtering may drop valid structured pages.** The bridge requires `min_chars` 450 and `word_count_threshold` 80. Short hadith records, prayer-time pages, and index/detail pages with structured data may be discarded even when they are valid knowledge records.

7. **Extractor only sees the first 9,000 characters per document.** Long khutbah or fatwa pages are fully chunked for vector search, but graph extraction ignores later sections, which can underpopulate the graph.

8. **Population is now document-level incremental, not source-level complete.** The previous append-only write path has been replaced with stable `document_id` + `content_hash` checks and BigQuery `MERGE` operations. This prevents unchanged pages from being re-embedded/re-extracted, but complete source coverage still depends on better URL discovery.

9. **Knowledge Catalog concept publication is capped.** `publishToKnowledgeCatalog()` only publishes the first 25 extracted nodes per document. This is acceptable as a guardrail, but it is not complete concept population for long documents.

10. **No durable job queue.** Batch crawling is fire-and-forget in process memory. Cloud Run single-instance configuration reduces risk, but a restart during crawl can leave incomplete runs.

## Recommendations

1. Add a discovery stage before Crawl4AI:
   - Prefer sitemap/RSS where available.
   - Use MyHadith sitemap for `/hadith/` URLs.
   - Use e-Khutbah and Mufti WP RSS feeds for latest content, plus pagination crawl for archive backfill.
   - Add source-specific discovery for BH/HMetro if their article links remain JS/API-driven.

2. Separate `maxDiscoveryUrls` from `maxIngestPages`.
   - Discovery should collect all candidate nested URLs.
   - Ingestion can then run in batches with checkpoints instead of silently limiting source coverage to 3 pages.

3. Prioritize article/detail URLs.
   - Rank detail URLs above category, tag, listing, pagination, login, and utility pages.
   - Store skipped URLs and reasons for audit.

4. Raise depth and page caps by source.
   - Mufti WP sections need at least depth 2.
   - MyHadith needs sitemap-driven crawl rather than BFS.
   - e-Khutbah can start with RSS/latest and archive pagination.

5. Add crawl completeness metrics.
   - Discovered URL count.
   - Attempted URL count.
   - Successful document count.
   - Filtered document count with reason.
   - Failed URL count with error.
   - Coverage percentage per source.

6. Fix local/runtime dependency validation.
   - Add a startup or CI check for `crawl4ai` importability and browser availability.
   - Make fallback status explicit: `crawl4ai`, `gemini-html`, or failed.

7. Keep improving population idempotency.
   - Current implementation uses BigQuery `MERGE` by `document_id`, `chunk_id`, and `edge_id`.
   - For large backfills, consider staged load tables plus a single transactional merge per source to reduce per-row DML jobs.
   - Keep crawl run status separate from corpus state.

8. Extract graph across all chunks for long documents.
   - Run graph extraction per chunk or per semantic section.
   - Merge and deduplicate nodes/links before publishing.

9. Revisit low-content thresholds by source type.
   - Hadith records and prayer-time/falak pages may be shorter but still valid.
   - Use source-specific thresholds or structured extractors.

10. Add a durable queue/job runner for production.
   - Cloud Tasks, Pub/Sub, Workflows, or a Cloud Run Job is better than in-process background crawl for long backfills.

## Suggested Completion Criteria

A source should be marked "complete" only when:

- All candidate nested URLs are discovered from sitemap/RSS/pagination/API or documented as unavailable.
- Every candidate URL has an attempt record.
- Each attempt has a terminal status: indexed, skipped with reason, or failed with error.
- Indexed documents have raw markdown, corpus row, chunks, graph extraction, and catalog status recorded.
- Re-running the same source is idempotent and does not inflate counts.
