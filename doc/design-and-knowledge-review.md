# UI and knowledge pipeline review

Reviewed 2026-09-06 against the local checkout and the configured Google Cloud dataset.

## Verified findings

- `npm run lint` and `npm run build` pass.
- Local browser connected to the configured BigQuery data renders 19 nodes and 17 relationships. Node selection updates the detail panel; zoom works. This verifies the local checkout, not the deployed Cloud Run revision. Cloud Run service lookup was blocked by expired gcloud CLI login; Application Default Credentials still allowed BigQuery and GCS reads.
- BigQuery `my-rd-coe-demo-gen-ai.mursyid_knowledge.corpus` has 6,054 rows, representing 6,033 distinct document IDs, including the baseline record. Duplicate IDs exist.
- `chunks` has 48,661 rows. `graph_edges` has only 17 rows: 12 baseline relationships and five relationships belonging to one crawled document. Graph population is substantially behind corpus population.
- `crawl_attempts` has 12,050 rows; `crawl_runs` has one row. These counts do not establish complete crawl coverage.
- Every corpus row has nonempty content; 6,053 rows have a snapshot URI. The baseline record has no snapshot URI.
- Three raw Markdown objects were downloaded successfully from the configured bucket. This confirms sample retrievability, not an audit of every object.

## Current pipeline

The interactive ingestion path calls the Crawl4AI Python bridge, with optional Gemini HTML-cleaning fallback. It chunks cleaned content, generates embeddings, and calls Gemini directly to extract JSON nodes and relationships. It is an application prompt, not an installed LLM skill.

Persistence targets are:

| Data | Location |
| --- | --- |
| Cleaned crawl Markdown | `gs://my-rd-coe-demo-gen-ai-mursyid-raw/raw/` |
| Full cleaned content, source URL, title, snapshot pointer | BigQuery `mursyid_knowledge.corpus` |
| Text chunks and embeddings | BigQuery `mursyid_knowledge.chunks` |
| Extracted relationships and endpoint metadata | BigQuery `mursyid_knowledge.graph_edges` |
| Governed metadata | Knowledge Catalog publication path; publication state not audited here |
| Metadata-as-code plus content | Interactive path writes `catalog-export/entries/<documentId>.md` and `catalog.yaml`; process-local filesystem is not a durable Cloud Run archive |

This is not currently a formal OKF bundle implementation. The local metadata export has custom frontmatter and a catalogue YAML file. The standalone backfill job separately performs discovery, crawling, GCS staging, and BigQuery bulk loading/merges.

The interactive raw path is `raw/<source>/<documentId>.md` and overwrites that object on updates. The backfill path is `raw/<source>/<documentId>/<contentHash>.md`. Use each corpus row's `gcs_uri` instead of reconstructing a path. These snapshots are extracted Markdown, not guaranteed original HTML/PDF archives.

Example read-only retrieval query:

```sql
SELECT document_id, title, source_url, content, gcs_uri
FROM `my-rd-coe-demo-gen-ai.mursyid_knowledge.corpus`
WHERE document_id = @document_id;
```

## Graph gaps

1. `server.ts:resetBigQueryGraph` deletes all stored relationships and seeds the baseline. The graph toolbar exposes this as “Reset Graf,” beside ordinary viewport controls. Move this destructive operation to Administration; reset view should only change viewport/layout. Its existence is a plausible explanation for missing edges, not proof it was executed.
2. Both ingestion paths skip unchanged documents based on corpus content hash. Missing graph output therefore needs an explicit rebuild/repair path; recrawling identical text may not repair it.
3. Interactive extraction reads only the first 9,000 characters. Extract by section/chunk and deduplicate entities for fuller coverage.
4. Full-graph retrieval uses an unordered `LIMIT 1000`. Add a coverage indicator and deterministic, filtered neighborhood queries as the graph grows.
5. Graph reads silently fall back to baseline/in-memory data. Return provenance/status so users can distinguish real corpus data, sample data, loading, and failure.
6. The detail panel displays generic reference text even though stored edge rows include document provenance. Expose supporting article links and excerpts.
7. Duplicate entity spelling/case is visible (for example, two Al-Quran nodes). Establish canonical IDs and merge aliases without losing source provenance.

## Proposed interface

Use three reader destinations: **Sembang**, **Pustaka**, **Teroka**. Put source management/crawl runs, feedback review, and analytics under **Pentadbiran**.

- Chat: wide conversation area, suggestions in the empty state, compact citations beneath each answer, optional source detail drawer. Collapse the permanent instruction/sidebar area once conversation begins.
- Library: actual saved articles, search, source filter, indexed date, preview, original URL, and Markdown download. Source portals become a filter/management view within this library.
- Explore: one heading and toolbar, graph search/filter, readable labels, source-backed detail drawer. Separate reset-view from data administration.
- Visual system: retain restrained green identity, use a neutral background, readable sans-serif body copy, fewer nested bordered cards, consistent spacing, and less tiny uppercase text.
- Shared buttons: primary, secondary, ghost/icon, and destructive variants; common height, padding, radius, icon size, focus, disabled, and loading states. Use consistent Malay action labels.
- Remove user-facing implementation badges such as D3 and ADC, repeated graph headings, repeated institution descriptions, and mixed English/Malay navigation labels.

## OpenWiki assessment

Assumption: OpenWiki means https://github.com/langchain-ai/openwiki . Its current README describes a CLI for generating and maintaining linked Markdown knowledge, personal/code modes, a visualizer, and OKF v0.2 output. It is a candidate synthesis/portable-knowledge layer. It is not a drop-in replacement for this application's document retrieval, chat serving, operational state, or typed fiqh graph.

Recommended sequence:

1. Make the stored corpus browsable and downloadable; apply the smaller navigation/button design.
2. Repair graph generation from stored Markdown, with stage-specific status and resumable jobs. Audit duplicates before consolidation.
3. Trial OpenWiki against a small, representative set of saved source articles. Verify source attribution, update behavior, preservation of differing rulings, and mapping from wiki links to the application's typed relations.
4. If successful, use Crawl4AI → durable Markdown → OpenWiki/OKF → derived retrieval/graph indexes. Retain GCS and existing BigQuery retrieval initially; storage migration can be evaluated independently.

No UI, production data, or deployment changes were made as part of this review.
