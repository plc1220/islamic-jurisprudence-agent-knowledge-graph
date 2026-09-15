# Incremental knowledge updates

Implemented 2026-09-06; deployed 2026-09-07. The first saved-corpus Gemini extraction was started on 2026-09-07; see the run record below. The assistant builds the pipeline; Gemini `gemini-3.7-flash` generates the knowledge.

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

## Deployment verified — 2026-09-07

- App: https://mursyid-ai-heboslofda-as.a.run.app
- Deployment: https://github.com/plc1220/islamic-jurisprudence-agent-knowledge-graph/actions/runs/34063595684 (successful, image commit `a109320`).
- Background job: `mursyid-ai-knowledge-update`, deployed with no automatic retries and zero executions.
- Admin code: Secret Manager `mursyid-knowledge-admin`, version 1. Its value is not stored in the repository. Repository variable `KNOWLEDGE_ADMIN_SECRET` points to it.
- Runtime secret access and job-status permissions configured through authenticated Google Cloud APIs. The workflow configured job-scoped execution permission.
- Live checks: secure admin sign-in and authenticated status passed; anonymous update returned 403; library and Markdown download passed; graph returned the existing 19 nodes and 17 links.
- Browser verification remained blocked by the locked Mac. No crawl, extraction or publication was triggered.

Before a future Terraform apply, adopt the role and bindings created during deployment into the existing infrastructure state (do not recreate the role):

```sh
terraform import google_project_iam_custom_role.knowledge_job_status projects/my-rd-coe-demo-gen-ai/roles/mursyidKnowledgeJobStatus
terraform import google_project_iam_member.knowledge_job_status 'my-rd-coe-demo-gen-ai projects/my-rd-coe-demo-gen-ai/roles/mursyidKnowledgeJobStatus serviceAccount:mursyid-runtime@my-rd-coe-demo-gen-ai.iam.gserviceaccount.com'
terraform import -var='knowledge_admin_secret=mursyid-knowledge-admin' 'google_secret_manager_secret_iam_member.knowledge_admin_reader[0]' 'projects/my-rd-coe-demo-gen-ai/secrets/mursyid-knowledge-admin roles/secretmanager.secretAccessor serviceAccount:mursyid-runtime@my-rd-coe-demo-gen-ai.iam.gserviceaccount.com'
```

Run these from `infra/` with the project's normal backend and variable settings. Keep `knowledge_admin_secret=mursyid-knowledge-admin` in that deployment's variable configuration.

## First extraction started — 2026-09-07

User authorized Gemini extraction and graph publication from the saved corpus. No crawling was invoked.

The first run was cancelled after it exposed missing node-type constraints in the model schema. The corrected pipeline explicitly supplies the allowed types and exact-quote rules, with useful validation feedback. A saved article then produced seven validated claims across four sections. Those artifacts are reusable by the full run. Tests and TypeScript checks pass.

Corrected deployment: `8b4b253`, GitHub run `34066324850`.

Current saved-corpus run: `saved-880674f8-dc1d-4775-ba2d-ba96abc7f97a`.
Cloud Run execution: `mursyid-ai-knowledge-update-lcjr8`.
Frozen selection: 6,020 documents after ID/URL deduplication.
Status when recorded: extraction running; not yet published. The prior graph remains active until validation and atomic publication succeed.

The operator command `npx tsx scripts/start-saved-knowledge.ts --start` registers a single update and dispatches `scripts/saved-knowledge-worker.cjs` through the deployed job. It skips crawling, runs the existing extraction CLI, and publishes only after successful validation. Do not start a duplicate while this run is active. The normal admin action still includes discovery of new sources.

### Live progress and session context

The admin Ilmu page polls status every five seconds and displays the last successful check time. During crawling it reads the current execution's structured progress messages from Cloud Logging, with a ten-second process-local cache that also coalesces concurrent reads. The URL position means work has started on that list item; it is not a completed-document count. Last activity is shown separately so an unchanged worker timestamp remains visible. Missing log access degrades to the task phase with an explicit progress warning. Runtime access requires `logging.logEntries.list` in the existing knowledge job status role. Progress reads never dispatch or restart the job.

Sessions use the existing Redis host/port when no explicit `REDIS_URL` is supplied. Sessions retain up to 80 messages plus UI context for the configured TTL (24 hours by default). Redis connection attempts have a bounded timeout and a 30-second retry backoff; the process-local fallback is capped at 200 sessions and does not survive instance replacement. Job state remains in Cloud Storage, independent of browser sessions and the progress cache.

### Gemini token usage

Graph extraction records the SDK's `usageMetadata` for every application-level call, before JSON parsing and evidence validation. Input, candidate output, thinking, cached input, tool input, and reported total are stored separately. Cached input is already part of input; totals are never reconstructed by adding overlapping categories. SDK retries are disabled in favour of the existing explicit three-attempt loop, so each retry is accounted for. Reusing a saved extraction checkpoint makes no Gemini call and adds no usage.

Each run stores immutable records in `knowledge-pipeline/runs/RUN_ID/usage/calls/`, a tracking start time in `usage/tracking.json`, and an aggregate `usage.json`. On resume, the aggregate is rebuilt from the call ledger before extraction, recovering a summary write interrupted after its call record was saved. Calls with missing metadata or request errors remain explicitly unknown rather than zero. This is recorded API usage, not a billing ledger: earlier uninstrumented executions and calls killed before their response record is persisted cannot be reconstructed. Only graph extraction is covered; chat, source cleaning, and embedding usage are excluded.

The admin status endpoint and Ilmu panel display the current run's token usage during execution and after completion/failure. No historical record shows as “not recorded,” not zero. Deploying this instrumentation does not modify an already running Cloud Run execution; that execution retains its original image. Token capture starts when an instrumented extraction worker runs.

### September 2026 staged-load recovery

The failed `update-0120f295-c7a3-41a2-ba5f-3c37a0d4da3e` run saved 1,299 corpus rows and 21,156 embedded chunks before its loader passed URI strings where the BigQuery SDK requires Storage File objects. Recovery loaded isolated `_recovery` tables, validated counts, unique IDs, content, document/hash joins and 768-dimensional embeddings, then transactionally merged only corpus, chunks and attempt records. The recovery helper no longer touches the legacy graph. `BACKFILL_STAGE_ONLY=true` validates without merging; unresolved article failures block a merge unless explicitly identified in `BACKFILL_RECOVERED_URLS`. The CSS and XML-RPC failures are excluded non-article targets. The sole article-source failure, i-Fiqh, was successfully retried as `ifiqh-retry-20260915` before recovery.

A durable `backfills/RUN/recovery.json` receipt records the merged counts and failure accounting. Corpus merges update `knowledge-pipeline/corpus-version.json`; API readers include that version in retrieval/response cache keys. Completed update stages are checkpointed, and retries reuse the run ID and skip completed stages. Loading is a distinct visible phase, and failure details are exposed only to admins. After verifying a recovery receipt and the active graph version, an operator may checkpoint `crawl` complete to resume the same update at extraction.

Short-query retrieval now permits a single informative keyword when it occurs in an article title. When vector candidates fail relevance checks, a keyword fallback searches stored chunks, excludes pagination URLs, and returns distinct documents. Keyword citations are labelled separately from vector citations. Ambiguous short questions should elicit clarification rather than a specific ruling.

## Demo from saved extractions (2026-09-15)

`run --run-id demo-2000-20260915 --limit 2000 --cached-from-run update-0120f295-c7a3-41a2-ba5f-3c37a0d4da3e`
selects exactly 2,000 fully checkpointed documents from the original frozen input table, round-robin across available sources. The selection and separate demo snapshot are persisted. All saved section evidence is revalidated; any invalid record blocks publication. Gemini calls are explicitly disabled in this mode. The original full-corpus run and its artifacts remain available.

The cache inventory contained 6,191 complete documents across earlier runs; the stopped execution's 1,849 counter only described documents visited in that execution, not the total reusable cache. A processed document can have excluded/listing sections and need not contribute an edge. Demo coverage is a selected subset, not a complete or representative scholarly corpus. The UI shows the release's document/edge totals; the graph viewport remains limited to 1,000 edge records and supports topic search.

OKF/OpenWiki remains unimplemented. This release uses the existing evidence graph, BigQuery, and GCS.
