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
