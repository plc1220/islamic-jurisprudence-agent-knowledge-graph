<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/de4a7270-9e60-40de-aa49-bafc08d3b259

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Authenticate with Google Cloud ADC:
   `gcloud auth application-default login`
3. Set `GCP_PROJECT_ID`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_GENAI_USE_ENTERPRISE=true`, and `GOOGLE_GENAI_USE_VERTEXAI=true` in your local env
4. Run the app:
   `npm run dev`

## Public-facing cache controls

The server uses process-local TTL/LRU caches for repeated embedding calls, BigQuery retrieval results, graph lookups, and short-lived exact chat responses. When `SHARED_CACHE_ENABLED=true` and `REDIS_HOST` is set, it also uses Memorystore/Redis as a shared cache across warm Cloud Run instances. Query normalization is enabled by default with conservative Malay/fiqh canonicalization such as `feqah/fekah -> fiqh`, `hadith -> hadis`, and light Malay affix trimming for retrieval matching.

Key environment variables:

- `CACHE_ENABLED=true`
- `QUERY_NORMALIZATION_ENABLED=true`
- `EMBEDDING_CACHE_TTL_MS=86400000`
- `RETRIEVAL_CACHE_TTL_MS=900000`
- `CHAT_RESPONSE_CACHE_TTL_MS=300000`
- `SHARED_CACHE_ENABLED=true`
- `REDIS_HOST=<memorystore-private-ip>`

Check runtime counters at `/api/cache-status`. Terraform can provision Memorystore and the Serverless VPC Access connector under `infra/`.

## Response feedback collection

Model responses include thumbs up/down controls. Feedback is posted to `/api/feedback` and stored in BigQuery table `response_feedback` when `GCP_PROJECT_ID` is configured; local development keeps a bounded in-memory fallback.
