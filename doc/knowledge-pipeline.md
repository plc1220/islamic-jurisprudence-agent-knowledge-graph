# Incremental knowledge updates

Implemented 2026-09-06. Not deployed or run against Gemini. The assistant builds the pipeline; Gemini `gemini-3.7-flash` generates the knowledge.

## Admin flow

In **Urus → Ilmu**, sign in with the admin code and click **Kemas kini**. A background Cloud Run Job checks configured sources, saves new articles, extracts knowledge from the saved corpus, validates it, and publishes a new graph. The app shows progress. Only one update can be registered at a time.

Known article URLs are skipped before crawling. Feeds, sitemaps and index pages still need checking to discover new links. This default does not detect edits to previously saved articles; an operator must explicitly request a maintenance refresh for that. Crawl results are cached before embedding/loading, so a later failure does not require crawling them again.

Extraction uses saved BigQuery content, with the stored GCS raw snapshot as fallback. Sections are cached by document ID, content hash and model/prompt/schema fingerprint across runs. The first extraction processes the existing corpus; later updates reuse unchanged sections. Changing extraction rules deliberately invalidates their cache. Embeddings are also cached by model and text. Rebuilding a release still reads and assembles cached records; incremental does not mean no database reads.

Gemini classifies sections and returns claims with exact quotes, source references, conditions, school and authority. Validation rejects missing quotes and broken relationships. This checks evidence linkage, not scholarly correctness: output is recorded as `machine-extracted`. No human review workflow or OpenWiki/OKF export is implemented yet.

## Storage and publication

- Original content: existing BigQuery corpus/chunks and GCS `raw/` objects. Pustaka supports reading and downloading saved content.
- GCS `knowledge-pipeline/crawl-cache/` and `embedding-cache/`: reusable acquisition work.
- GCS `knowledge-pipeline/artifacts/`: reusable section extraction checkpoints.
- GCS `knowledge-pipeline/runs/<run-id>/`: frozen inputs, progress, failures and prepared release manifest.
- BigQuery `graph_input_<hash>` and `graph_release_<hash>`: frozen selection and separate graph tables.
- GCS `knowledge-pipeline/active.json`: active release pointer, changed with a generation precondition.

Incomplete, empty or invalid extraction cannot replace the active graph. Existing graph tables stay intact. Graph and chat reads use the active release, with versioned caches. The graph supports server search and shows source quotes on selected nodes. The destructive reset endpoint is retired (410), and its button is removed.

A failed admin update can be retried using **Cuba lagi**. New runs reuse shared artifacts. Automatic Cloud Run task retries are disabled; retries are explicit and visible. A failed request with an uncertain dispatch result is reconciled before accepting another job.

## Deploy

The GitHub Actions deployment builds and deploys the app plus the dedicated knowledge job. Deployment alone does not execute knowledge generation.

1. Create an admin code in Secret Manager outside source control. Set repository variable `KNOWLEDGE_ADMIN_SECRET` to that secret's name, and Terraform variable `knowledge_admin_secret` to the same name.
2. Apply the Terraform IAM additions: scoped secret access and the minimal job-status reader role for the runtime account. Existing BigQuery, GCS and Vertex AI permissions remain required.
3. Run the GitHub deployment workflow. It deploys `KNOWLEDGE_UPDATE_JOB` (default `mursyid-ai-knowledge-update`), grants the runtime account job-scoped execution with overrides, and configures the app's job name/admin secret.
4. Verify the packaged Crawl4AI bridge and model access before an admin update. The worker requires sufficient job runtime and memory for the corpus.

`KNOWLEDGE_PIPELINE_BUCKET` optionally overrides the release/checkpoint bucket; otherwise `GCS_RAW_BUCKET` is used. An unconfigured app displays “Kemas kini belum disediakan.” The legacy `cloudbuild.yaml` does not deploy this new job; use the GitHub workflow for this feature.

The old batch endpoint redirects to the protected update action. The old single-URL endpoint is retired; the app updates its configured source list.

## Operator commands

Read-only inventory (no crawling, model calls or publication):

```sh
npm run graph:pipeline -- plan --limit 50
```

Extract from the saved corpus only, then publish explicitly:

```sh
npm run graph:pipeline -- run --run-id YOUR_RUN --all
npm run graph:pipeline -- publish --run-id YOUR_RUN --expected-active legacy
```

Use the current active version instead of `legacy` for subsequent publication. Resume a CLI run with the same ID and identical options. Use a new ID if model/prompt/selection settings change. Do not run concurrent CLI writers for the same ID.

To restore a previous compatible prepared release, use `activate --run-id PREVIOUS_RUN --expected-active CURRENT_RUN`. Activation refuses to overwrite an unexpected active version. Releases from incompatible extraction fingerprints need migration rather than blind activation.

## Verification

Fourteen automated tests cover section coverage, exact evidence, stable IDs, cache invalidation, interrupted work, failed publication, storage preconditions, crawl reuse, orchestration, admin authentication, concurrent requests and graph evidence display. TypeScript and production builds pass. A live read-only inventory query confirmed access to stored corpus records. No real extraction, new crawling, publication or deployment was performed during implementation. Terraform validation requires Terraform, which is unavailable in this workspace.

Final local API checks returned the configured model and the unchanged legacy graph (19 nodes, 17 links). The final browser pass was blocked by the locked Mac.
