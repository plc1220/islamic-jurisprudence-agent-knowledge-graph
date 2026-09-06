# Curating the existing corpus and rebuilding the graph

Status: original design proposal, 2026-09-06. See [the implemented pipeline](knowledge-pipeline.md) for current behavior. Review queues, semantic alias merging and OpenWiki remain future work. The implemented admin flow publishes validated machine-extracted releases; it does not imply scholarly approval. No crawling or model extraction was run during implementation.

## Recommended flow

Saved source version → document selection → section extraction → evidence validation → entity resolution → review → versioned graph + search + optional wiki.

Keep the original content in GCS/BigQuery as the evidence layer. Treat statements, summaries, wiki pages and graph links as derived outputs which can be regenerated independently. A wiki page link is not automatically a fiqh relationship.

## 1. Inventory and select source versions

- Use `corpus.content` with its `gcs_uri`, source URL and content hash. Fall back to GCS when necessary; never fetch the original website in this workflow.
- Group duplicate document IDs and normalized URLs, retaining all original records. Choose a preferred version using timestamp, content completeness and source identity. Do not physically delete records during the pilot.
- Classify article/detail pages, category/listing pages, boilerplate, short structured records and unrelated content. The live Library already exposes numerous listing pages and a general-news homepage, so corpus size must not be equated with usable article count.
- Record selection status and reason. Do not blanket-remove short content; hadith records may be short and useful.

## 2. Extract claims with evidence

Process the whole article by section with bounded overlap. For each statement, store:

- Stable claim ID, document ID, content hash and section/span offsets.
- Exact evidence quote, original source URL and article title.
- Subject, predicate and object; preserve the original wording alongside canonical IDs.
- Where applicable: ruling, conditions, exceptions, school, attributed authority and historical/date context.
- Extractor model/version, prompt/schema version and run ID.
- Review status: draft, approved, rejected or superseded.

Validate that each quote occurs at the recorded source span. Retry malformed output separately. A quote match proves source linkage, not that the interpretation is correct. Do not label LLM confidence as scholarly approval.

## 3. Resolve entities without collapsing disagreement

Maintain an entity registry with canonical IDs and aliases, e.g. capitalization/spelling variants of Al-Quran. Use deterministic exact/alias matching first, then proposed merges for review. Preserve school-specific rulings and conditional disagreements as distinct claims, not competing values of one node.

Start with a small controlled relation vocabulary (for example cites, issued-by, discusses, has-ruling, applies-under-condition). Keep supporting document/claim IDs on every edge. Explicitly mark manually seeded ontology separately from extracted knowledge.

## 4. Run a stratified 50-article pilot

Sample across source organizations, topics, long and short documents, and documents expressing conditions or differing opinions. Establish a reviewer-checked evaluation set before measuring extraction quality.

Report quote/span validity, supported claims, unsupported interpretation, missed key statements, incorrect merges, duplicate claims, source coverage and review effort. Show denominators and examples. Require valid provenance for every published claim and no dangling graph endpoints. Set interpretation/coverage acceptance thresholds with reviewers after the first sample; do not invent an accuracy percentage.

## 5. Rebuild separately and publish atomically

Create staging outputs keyed by `graph_version`. Never delete the active graph as a prerequisite to rebuilding.

Suggested stores:

| Store | Purpose |
| --- | --- |
| document_curation | Preferred source version, document class, inclusion decision |
| extraction_runs | Run configuration, per-document stage status, retries, errors |
| entities / entity_aliases | Canonical concepts and reviewed identity mappings |
| claims / claim_evidence | Attributed statements and exact source spans |
| graph_edges_v2 | Versioned relationships referencing claims |
| knowledge_releases | Validated release manifest and active version |

Use a durable Cloud Run Job with per-document checkpoints and bounded concurrency. Idempotency key: `(document_id, content_hash, extractor_version, schema_version)`. A missing or failed graph stage must rerun even if raw content is unchanged. This fixes the current all-or-nothing unchanged-document skip.

Validate the entire staged version, publish by changing an active release pointer, and retain the previous version for rollback. Invalidate retrieval/graph caches after publication. Draft knowledge should remain visible only in a clearly labeled reviewer view; public answers should use the approved release and its original evidence.

## OpenWiki / OKF

Pilot OpenWiki after evidence extraction/review as a way to maintain readable topic pages and portable OKF bundles. Require stable claim/source references and preservation of differences in rulings. Retain BigQuery/GCS initially. Decide whether OpenWiki replaces custom synthesis only after comparing a representative output set; do not run two competing, untraceable extraction pipelines.

## UI delivered in this change

- Sembang / Pustaka / Teroka / Urus navigation.
- Read-only corpus Library with search, source filter, pagination, article view and Markdown download.
- Display-time deduplication by document ID; storage is unchanged.
- Shared button styles, simpler wording, less header/footer and card clutter.
- Graph search and explicit stored/example status. Destructive reset removed from the UI. The reset API is now retired (410).
- An admin update action under Urus → Ilmu, connected to the background pipeline when deployed and configured.

The saved-corpus extraction CLI and incremental admin update job are implemented. A reviewer-checked quality pilot remains recommended before relying on generated interpretations.

## Validation

TypeScript, production build and diff whitespace checks passed. Live read-only API checks covered pagination, ID deduplication, filtering, no-results, detail, exact Markdown download and missing document responses. Browser checks covered article search/read, graph search/selection, removal of reset controls, and a narrow layout (the browser reported a 500px viewport). No browser console errors were observed. Chat model generation and new crawling were not exercised.
